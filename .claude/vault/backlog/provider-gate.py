#!/usr/bin/env python3
"""Claude/Codex 밤 실행의 단일 소유권 상태 머신.

상태 파일과 잠금 파일은 외부 게이트가 지정한 디렉터리에 둔다. 상태 변경은
항상 flock을 잡고 최신 파일을 다시 읽은 뒤 원자 교체한다.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
import uuid
import glob
import re

UTC = dt.timezone.utc
SCHEMA = 1
DEFAULT_REPO = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DEFAULT_CONTRACT = os.path.join(DEFAULT_REPO, ".claude", "vault", "backlog", "_NIGHT.md")
VALID_JOBS = {"sweep", "runner"}
VALID_OUTCOMES = {"success", "failed", "timeout"}
ACTIVE = {"claimed", "running"}
KST = dt.timezone(dt.timedelta(hours=9))


def now_epoch():
    return time.time()


def iso_now(epoch=None):
    return dt.datetime.fromtimestamp(now_epoch() if epoch is None else epoch, UTC).isoformat(timespec="seconds")


def current_claim_date():
    return dt.datetime.now(KST).strftime("%Y-%m-%d")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def atomic_json(path, value):
    parent = os.path.dirname(path) or "."
    os.makedirs(parent, exist_ok=True)
    temporary = f"{path}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    try:
        with open(temporary, "w", encoding="utf-8") as fh:
            json.dump(value, fh, ensure_ascii=False, sort_keys=True, indent=2)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temporary, path)
        try:
            directory_fd = os.open(parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def state_paths(args, claim_date=None):
    state_dir = os.path.realpath(os.path.abspath(os.path.expanduser(
        args.state_dir or os.environ.get("ORCA_PROVIDER_GATE_STATE_DIR", os.path.join(
            os.path.expanduser("~"), "Library", "Application Support", "orca",
            "automation-provider-gate")))))
    date = claim_date or dt.datetime.now(
        dt.timezone(dt.timedelta(hours=9))).strftime("%Y-%m-%d")
    state_file = os.path.join(state_dir, f"{args.job}-{date}.json")
    return state_dir, state_file, state_file + ".lock", os.path.join(
        state_dir, f"{args.job}.lock")


def locate_latest_state(args, match_identity=True):
    state_dir, _, _, _ = state_paths(args)
    candidates = []
    for path in glob.glob(os.path.join(state_dir, f"{args.job}-*.json")):
        try:
            state = read_state(path)
        except RuntimeError as exc:
            raise RuntimeError(f"provider 상태를 검증할 수 없다: {path}") from exc
        if state.get("job") != args.job or not state.get("claim_date"):
            continue
        if match_identity and args.run_id and state.get("run_id") != args.run_id:
            continue
        if match_identity and args.token and state.get("owner_token") != args.token:
            continue
        candidates.append((state.get("updated_at", ""), state.get("claim_date", ""),
                           path, state))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    return candidates[0][2], candidates[0][3]


def lock_state(lock_path):
    os.makedirs(os.path.dirname(lock_path), exist_ok=True)
    fh = open(lock_path, "a+", encoding="utf-8")
    fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
    return fh


def read_state(path):
    try:
        with open(path, encoding="utf-8") as fh:
            value = json.load(fh)
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as exc:
        raise RuntimeError(f"상태 파일이 손상됐다: {path}") from exc
    if not isinstance(value, dict):
        raise RuntimeError("상태가 객체가 아니다")
    required = {"schema", "job", "provider", "status", "run_id", "owner_token",
                "lease_until", "fencing", "contract_hash"}
    if not required.issubset(value):
        raise RuntimeError("상태 필드가 부족하다")
    if value["schema"] != SCHEMA:
        raise RuntimeError("상태 schema가 다르다")
    if value["fencing"] < 1:
        raise RuntimeError("fencing counter가 올바르지 않다")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value.get("claim_date", ""))):
        raise RuntimeError("claim_date가 올바르지 않다")
    check_run_id(value.get("run_id"))
    return value


def current_contract_hash(args):
    path = args.contract_path or os.environ.get("NIGHT_CONTRACT_PATH", DEFAULT_CONTRACT)
    if not os.path.isfile(path):
        raise RuntimeError(f"현재 계약 파일이 없다: {path}")
    return sha256_file(path)


def requested_contract_hash(args):
    current = current_contract_hash(args)
    if args.contract_hash is not None and args.contract_hash.lower() != current:
        raise RuntimeError("contract_hash가 현재 _NIGHT.md와 다르다")
    return current


def check_job(args):
    if args.job not in VALID_JOBS:
        raise RuntimeError(f"invalid job: {args.job}")


def check_run_id(run_id):
    if not isinstance(run_id, str) or not run_id or len(run_id) > 128:
        raise RuntimeError("run-id가 올바르지 않다")
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-")
    if any(char not in allowed for char in run_id):
        raise RuntimeError("run-id가 올바르지 않다")


def emit(value):
    print(json.dumps(value, ensure_ascii=False, sort_keys=True))


def probe_claude(args):
    command = args.probe_command or os.environ.get("ORCA_PROVIDER_GATE_PROBE", "claude")
    try:
        completed = subprocess.run(
            [command, "--print", "--max-turns", "1", "--output-format", "json",
             "Reply with exactly OK."],
            cwd="/private/tmp", capture_output=True, text=True,
            timeout=max(1.0, min(float(args.probe_timeout), 30.0)), check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    if completed.returncode != 0:
        return False
    try:
        parsed = json.loads(completed.stdout.strip())
    except (ValueError, TypeError):
        return False
    # Claude's JSON output is an object with a result field. A bare JSON string
    # is accepted only when it is exactly "OK"; substring matches are rejected.
    if parsed == "OK":
        return True
    return isinstance(parsed, dict) and parsed.get("result") == "OK"


def run_preflight(args):
    path = args.preflight or os.environ.get(
        "ORCA_PROVIDER_GATE_PREFLIGHT", os.path.join(os.path.dirname(__file__), "preflight.sh"))
    if not os.path.isfile(path):
        return False
    try:
        result = subprocess.run(["sh", path], cwd=DEFAULT_REPO,
                                capture_output=True, text=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def lease_seconds(args):
    try:
        value = float(args.lease_seconds)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("lease-seconds가 숫자가 아니다") from exc
    if not 1 <= value <= 24 * 3600:
        raise RuntimeError("lease-seconds는 1초에서 24시간 사이여야 한다")
    return value


def state_view(state):
    return {
        "schema": state["schema"], "job": state["job"], "provider": state["provider"],
        "status": state["status"], "run_id": state["run_id"],
        "owner_token": state["owner_token"], "token": state["owner_token"],
        "lease_until": state["lease_until"],
        "fencing": state["fencing"], "fencing_counter": state["fencing"],
        "contract_hash": state["contract_hash"], "claim_date": state["claim_date"],
        "fallback_pending": bool(state.get("fallback_pending", False)),
    }


def show_state(args):
    state_dir, _, _, global_lock_file = state_paths(args)
    global_lock = lock_state(global_lock_file)
    located = locate_latest_state(args)
    if located is None:
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()
        raise RuntimeError("provider 상태가 없다")
    state_file, _ = located
    lock = lock_state(state_file + ".lock")
    try:
        state = read_state(state_file)
        if state is None:
            raise RuntimeError("provider 상태가 없다")
        if state["contract_hash"] != requested_contract_hash(args):
            raise RuntimeError("상태의 contract_hash가 현재 계약과 다르다")
        emit(state_view(state))
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()


def expire_if_stale(state):
    if state and state["status"] in ACTIVE and float(state["lease_until"]) <= now_epoch():
        state["status"] = "timeout"
        state["updated_at"] = iso_now()
        return True
    return False


def new_claim(job, provider, run_id, contract_hash, fencing, seconds, claim_date):
    check_run_id(run_id)
    token = secrets.token_urlsafe(32)
    return {
        "schema": SCHEMA, "job": job, "provider": provider, "status": "claimed",
        "run_id": run_id, "owner_token": token, "token": token,
        "lease_until": now_epoch() + seconds, "fencing": fencing,
        "fencing_counter": fencing,
        "contract_hash": contract_hash, "claim_date": claim_date,
        "updated_at": iso_now(),
    }


def primary(args):
    contract_hash = requested_contract_hash(args)
    run_id = args.run_id or f"night-{dt.datetime.now(UTC):%Y-%m-%d}-{uuid.uuid4().hex}"
    check_run_id(run_id)
    claim_date = current_claim_date()
    state_dir, state_file, lock_file, global_lock_file = state_paths(args, claim_date)
    os.makedirs(state_dir, exist_ok=True)
    global_lock = lock_state(global_lock_file)
    lock = lock_state(lock_file)
    try:
        # The lock is acquired before this read. Never use a pre-lock snapshot.
        state = read_state(state_file)
        if state is not None:
            if expire_if_stale(state):
                atomic_json(state_file, state)
            raise RuntimeError("primary claim이 이미 존재한다")
        previous = locate_latest_state(args, match_identity=False)
        if previous is not None:
            previous_file, previous_state = previous
            if (previous_file != state_file and previous_state["status"] in ACTIVE
                    and float(previous_state["lease_until"]) > now_epoch()):
                raise RuntimeError("이전 KST 날짜의 provider claim이 아직 유효하다")
        if not run_preflight(args):
            state = new_claim(args.job, "claude", run_id, contract_hash, 1,
                              lease_seconds(args), claim_date)
            state["status"] = "failed"
            atomic_json(state_file, state)
            emit(state_view(state))
            return 1
        if not probe_claude(args):
            # Probe failure is fail-closed: never launch an unverified Claude
            # owner; select Codex directly with a fenced claim.
            state = new_claim(args.job, "codex", run_id, contract_hash, 1,
                              lease_seconds(args), claim_date)
            state["failure_reason"] = "probe-failed"
            state["fallback_pending"] = True
            atomic_json(state_file, state)
            emit(state_view(state))
            return 1
        state = new_claim(args.job, "claude", run_id, contract_hash, 1,
                          lease_seconds(args), claim_date)
        atomic_json(state_file, state)
        emit(state_view(state))
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()


def fallback(args):
    contract_hash = requested_contract_hash(args)
    state_dir, _, _, global_lock_file = state_paths(args)
    os.makedirs(state_dir, exist_ok=True)
    global_lock = lock_state(global_lock_file)
    located = locate_latest_state(args)
    if located is None:
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()
        raise RuntimeError("primary 상태가 없어 fallback을 청구할 수 없다")
    state_file, _ = located
    lock = lock_state(state_file + ".lock")
    try:
        state = read_state(state_file)
        if state is None:
            raise RuntimeError("primary 상태가 없어 fallback을 청구할 수 없다")
        if expire_if_stale(state):
            atomic_json(state_file, state)
        if state["contract_hash"] != contract_hash:
            raise RuntimeError("상태의 contract_hash가 현재 계약과 다르다")
        if (state["provider"] == "codex" and state["status"] in ACTIVE
                and state.get("fallback_pending") is True):
            if not run_preflight(args):
                state["status"] = "failed"
                state["fallback_pending"] = False
                state["updated_at"] = iso_now()
                atomic_json(state_file, state)
                raise RuntimeError("fallback preflight가 실패했다")
            state["fallback_pending"] = False
            state["updated_at"] = iso_now()
            atomic_json(state_file, state)
            emit(state_view(state))
            return 0
        if state["provider"] != "claude" or state["status"] not in {
                "failed", "timeout", "claude:failed", "claude:timeout"}:
            raise RuntimeError("Codex fallback은 claude failed/timeout에서만 가능하다")
        run_id = args.run_id or state["run_id"]
        if args.run_id is not None and args.run_id != state["run_id"]:
            raise RuntimeError("fallback run-id가 primary와 다르다")
        if not run_preflight(args):
            raise RuntimeError("fallback preflight가 실패했다")
        # A failed/timeout primary is an explicit handoff; one fenced CAS under
        # this lock is the only place that can consume it.
        next_state = new_claim(args.job, "codex", run_id, contract_hash,
                               int(state["fencing"]) + 1, lease_seconds(args),
                               state["claim_date"])
        atomic_json(state_file, next_state)
        emit(state_view(next_state))
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()


def harvest_success(args, state, contract_hash, validate_only=False):
    harvest = args.harvest or os.path.join(os.path.dirname(__file__), "harvest.py")
    command = [sys.executable, harvest,
               "--validate-complete" if validate_only else "--commit-success",
               "--run-id", state["run_id"],
               "--contract-hash", contract_hash]
    command.extend(["--project", args.harvest_project or DEFAULT_REPO])
    if args.harvest_out:
        command.extend(["--out", args.harvest_out])
    if args.stamp_path:
        command.extend(["--stamp-path", args.stamp_path])
    if args.snapshot_id:
        command.extend(["--snapshot-id", args.snapshot_id])
    if args.snapshot_fingerprint:
        command.extend(["--snapshot-fingerprint", args.snapshot_fingerprint])
    if args.snapshot_path:
        command.extend(["--snapshot-path", args.snapshot_path])
    if args.snapshot_start is not None:
        command.extend(["--snapshot-start", str(args.snapshot_start)])
    if args.snapshot_end is not None:
        command.extend(["--snapshot-end", str(args.snapshot_end)])
    command.extend(["--lease-until", str(state["lease_until"])])
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                timeout=max(1.0, min(float(args.harvest_timeout), 120.0)), check=False)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def verify_owner_state(state, args, contract_hash, before=None):
    if state is None:
        raise RuntimeError("provider claim이 없다")
    if state.get("job") != args.job or not state.get("claim_date"):
        raise RuntimeError("provider claim identity가 올바르지 않다")
    if state["contract_hash"] != contract_hash:
        raise RuntimeError("상태의 contract_hash가 현재 계약과 다르다")
    if state["run_id"] != args.run_id or state["owner_token"] != args.token:
        raise RuntimeError("late owner 또는 다른 provider owner다")
    if state["status"] not in ACTIVE:
        raise RuntimeError("provider claim이 이미 닫혔거나 만료됐다")
    if float(state["lease_until"]) <= now_epoch():
        raise RuntimeError("provider lease가 만료됐다")
    if before is not None:
        for key in ("run_id", "owner_token", "fencing", "contract_hash", "claim_date"):
            if state.get(key) != before.get(key):
                raise RuntimeError("provider claim이 subprocess 중 변경됐다")


def complete(args):
    if args.outcome not in VALID_OUTCOMES:
        raise RuntimeError(f"invalid completion outcome: {args.outcome}")
    if not args.run_id or not args.token:
        raise RuntimeError("complete에는 --run-id와 --token이 필요하다")
    if args.outcome == "success":
        if not args.snapshot_path or not args.snapshot_id or not args.snapshot_fingerprint:
            raise RuntimeError("success complete에는 snapshot binding 전체가 필요하다")
        if not re.fullmatch(r"[0-9a-fA-F]{64}", args.snapshot_fingerprint):
            raise RuntimeError("snapshot-fingerprint가 올바르지 않다")
    check_run_id(args.run_id)
    contract_hash = requested_contract_hash(args)
    state_dir, _, _, global_lock_file = state_paths(args)
    global_lock = lock_state(global_lock_file)
    located = locate_latest_state(args)
    if located is None:
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()
        raise RuntimeError("provider claim이 없다")
    state_file, _ = located
    lock = lock_state(state_file + ".lock")
    try:
        state = read_state(state_file)
        verify_owner_state(state, args, contract_hash)
        before = dict(state)
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()

    # Harvest may be slow and must never run while the provider lock is held.
    if args.outcome == "success":
        if not harvest_success(args, before, contract_hash, validate_only=True):
            raise RuntimeError("완료된 harvest run 사전 검증이 실패했다")
        # Reacquire and re-read after the subprocess. A late owner cannot close
        # state, even if the marker was valid before another owner changed it.
        global_lock = lock_state(global_lock_file)
        lock = lock_state(state_file + ".lock")
        try:
            after = read_state(state_file)
            verify_owner_state(after, args, current_contract_hash(args), before)
            if not harvest_success(args, after, current_contract_hash(args),
                                   validate_only=False):
                raise RuntimeError("완료된 harvest 성공 도장 확정이 실패했다")
            after = read_state(state_file)
            verify_owner_state(after, args, current_contract_hash(args), before)
            after["status"] = "success"
            after["updated_at"] = iso_now()
            atomic_json(state_file, after)
            emit(state_view(after))
            return 0
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            lock.close()
            fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
            global_lock.close()

    global_lock = lock_state(global_lock_file)
    lock = lock_state(state_file + ".lock")
    try:
        after = read_state(state_file)
        verify_owner_state(after, args, contract_hash, before)
        after["status"] = args.outcome
        after["updated_at"] = iso_now()
        atomic_json(state_file, after)
        emit(state_view(after))
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()


def parser():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=("primary", "fallback", "complete", "state", "run-id"))
    ap.add_argument("job", nargs="?", choices=tuple(VALID_JOBS))
    ap.add_argument("outcome", nargs="?", choices=tuple(VALID_OUTCOMES))
    ap.add_argument("--run-id", dest="run_id", default=None)
    ap.add_argument("--token", "--owner-token", dest="token", default=None)
    ap.add_argument("--contract-hash", default=None)
    ap.add_argument("--contract-path", default=None)
    ap.add_argument("--state-dir", default=None)
    ap.add_argument("--lease-seconds", default="21600")
    ap.add_argument("--probe-timeout", default="8")
    ap.add_argument("--probe-command", default=None)
    ap.add_argument("--preflight", default=None)
    ap.add_argument("--harvest", default=None)
    ap.add_argument("--harvest-project", default=None)
    ap.add_argument("--harvest-out", default=None)
    ap.add_argument("--stamp-path", default=None)
    ap.add_argument("--snapshot-id", default=None)
    ap.add_argument("--snapshot-fingerprint", default=None)
    ap.add_argument("--snapshot-path", default=None)
    ap.add_argument("--snapshot-start", type=int, default=None)
    ap.add_argument("--snapshot-end", type=int, default=None)
    ap.add_argument("--harvest-timeout", default="30")
    return ap


def main():
    args = parser().parse_args()
    if args.mode in {"state", "run-id"}:
        if args.job is None:
            print("job가 필요하다", file=sys.stderr)
            return 2
        try:
            check_job(args)
            return show_state(args)
        except (OSError, RuntimeError, ValueError) as exc:
            print(f"✗ {exc}", file=sys.stderr)
            return 1
    if args.job is None:
        print("job가 필요하다", file=sys.stderr)
        return 2
    try:
        check_job(args)
        if args.mode == "primary":
            return primary(args)
        if args.mode == "fallback":
            return fallback(args)
        if args.outcome is None:
            raise RuntimeError("complete에는 outcome이 필요하다")
        return complete(args)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
