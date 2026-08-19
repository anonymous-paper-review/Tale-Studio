#!/usr/bin/env python3
"""Claude/Codex 밤 실행의 단일 소유권 상태 머신.

상태 파일과 잠금 파일은 외부 게이트가 지정한 디렉터리에 둔다. 상태 변경은
항상 flock을 잡고 최신 파일을 다시 읽은 뒤 원자 교체한다.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import math
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
VALID_ACTORS = {"jh", "hs"}
LEASE_ACTIVE = {"claimed", "running"}
TERMINAL_GRACE_SECONDS = 300
FINALIZE_LEASE_SECONDS = 150
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


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_stamp(path, epoch):
    """Provider lock 아래에서만 호출한다."""
    parent = os.path.dirname(path)
    os.makedirs(parent, exist_ok=True)
    temporary = f"{path}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(f"{epoch}\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temporary, path)
        fsync_directory(parent)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def read_stamp(path):
    try:
        with open(path, encoding="utf-8") as fh:
            head = fh.read().split()[0]
        epoch = float(head)
    except (OSError, IndexError, ValueError) as exc:
        raise RuntimeError("성공 도장 epoch를 읽을 수 없다") from exc
    if not math.isfinite(epoch) or epoch < 0:
        raise RuntimeError("성공 도장 epoch가 유한한 0 이상 숫자가 아니다")
    return epoch


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def authority_identity(state):
    return {key: state[key] for key in (
        "schema", "job", "run_id", "contract_hash", "claim_date", "actor",
        "state_root", "project_root")}


def authority_key(state_root, create=False):
    path = os.path.join(state_root, ".authority-key")
    try:
        stat = os.stat(path)
        if not os.path.isfile(path) or stat.st_mode & 0o777 != 0o600:
            raise RuntimeError("provider authority key 권한이 올바르지 않다")
        with open(path, "rb") as fh:
            key = fh.read()
        if len(key) != 32:
            raise RuntimeError("provider authority key가 올바르지 않다")
        return key
    except FileNotFoundError:
        if not create:
            raise RuntimeError("provider authority key가 없다")
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return authority_key(state_root)
    try:
        key = secrets.token_bytes(32)
        os.write(fd, key)
        os.fsync(fd)
        return key
    finally:
        os.close(fd)


def authority_hmac(state, create_key=False):
    return hmac.new(authority_key(state["state_root"], create=create_key), canonical_json(authority_identity(state)),
                    hashlib.sha256).hexdigest()


def verify_authority(state):
    supplied = state.get("authority_hmac")
    if not isinstance(supplied, str) or not re.fullmatch(r"[0-9a-f]{64}", supplied):
        raise RuntimeError("provider authority HMAC이 올바르지 않다")
    if not hmac.compare_digest(supplied, authority_hmac(state)):
        raise RuntimeError("provider authority HMAC이 state identity와 다르다")


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


def canonical_directory(value, label):
    if not value:
        raise RuntimeError(f"{label}가 필요하다")
    path = os.path.realpath(os.path.abspath(os.path.expanduser(value)))
    if not os.path.isdir(path):
        raise RuntimeError(f"{label}가 디렉터리가 아니다")
    return path


def check_project_root(state, args):
    if args.project_root is not None:
        project_root = canonical_directory(args.project_root, "project-root")
        if project_root != state["project_root"]:
            raise RuntimeError("project-root가 provider state와 다르다")


def check_state_location(state, state_file):
    if state["state_root"] != os.path.realpath(os.path.dirname(state_file)):
        raise RuntimeError("state_root가 provider state 파일 위치와 다르다")


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
                "lease_until", "fencing", "contract_hash", "actor", "state_root",
                "project_root"}
    if not required.issubset(value):
        raise RuntimeError("상태 필드가 부족하다")
    if value["schema"] != SCHEMA:
        raise RuntimeError("상태 schema가 다르다")
    if value["fencing"] < 1:
        raise RuntimeError("fencing counter가 올바르지 않다")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value.get("claim_date", ""))):
        raise RuntimeError("claim_date가 올바르지 않다")
    check_run_id(value.get("run_id"))
    if value["actor"] not in VALID_ACTORS:
        raise RuntimeError("state actor가 올바르지 않다")
    for key in ("state_root", "project_root"):
        if not isinstance(value[key], str) or not os.path.isabs(value[key]):
            raise RuntimeError(f"state {key}가 올바르지 않다")
        if os.path.realpath(value[key]) != value[key]:
            raise RuntimeError(f"state {key}가 canonical path가 아니다")
    verify_authority(value)
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


def check_actor(actor, label="actor"):
    if actor not in VALID_ACTORS:
        raise RuntimeError(f"{label}는 jh 또는 hs여야 한다")


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


def state_view(state, state_path):
    view = {
        "schema": state["schema"], "job": state["job"], "provider": state["provider"],
        "actor": state["actor"],
        "state_path": os.path.realpath(state_path),
        "state_root": state["state_root"], "project_root": state["project_root"],
        "status": state["status"], "run_id": state["run_id"],
        "owner_token": state["owner_token"], "token": state["owner_token"],
        "lease_until": state["lease_until"],
        "fencing": state["fencing"], "fencing_counter": state["fencing"],
        "contract_hash": state["contract_hash"], "claim_date": state["claim_date"],
        "authority_hmac": state["authority_hmac"],
        **{key: state[key] for key in ("preflight_warning", "probe_warning")
           if key in state},
        **{key: state[key] for key in (
            "snapshot_set_path", "snapshot_set_id", "actionable_snapshot_path",
            "actionable_snapshot_id", "actionable_snapshot_fingerprint",
            "reference_snapshot_path", "reference_snapshot_id",
            "reference_snapshot_fingerprint") if key in state},
    }
    if state["status"] == "committing" and "completion_proof" in state:
        view["completion_proof"] = state["completion_proof"]
    return view


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
        check_state_location(state, state_file)
        check_project_root(state, args)
        if state["contract_hash"] != requested_contract_hash(args):
            raise RuntimeError("상태의 contract_hash가 현재 계약과 다르다")
        emit(state_view(state, state_file))
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()


def expire_if_stale(state):
    if state and state["status"] in LEASE_ACTIVE and float(state["lease_until"]) <= now_epoch():
        state["status"] = "timeout"
        state["updated_at"] = iso_now()
        return True
    return False


def new_claim(job, provider, actor, run_id, contract_hash, fencing, seconds, claim_date,
              state_root, project_root):
    check_run_id(run_id)
    check_actor(actor)
    # argparse treats a separate value beginning with "-" as another option.
    # Prefix capabilities so every caller can pass them safely.
    token = f"owner_{secrets.token_urlsafe(32)}"
    state = {
        "schema": SCHEMA, "job": job, "provider": provider, "status": "claimed",
        "run_id": run_id, "actor": actor, "owner_token": token, "token": token,
        "lease_until": now_epoch() + seconds, "fencing": fencing,
        "fencing_counter": fencing,
        "contract_hash": contract_hash, "claim_date": claim_date,
        "state_root": state_root, "project_root": project_root,
        "updated_at": iso_now(),
    }
    state["authority_hmac"] = authority_hmac(state, create_key=True)
    return state


def project_file(project, relative, label):
    if not isinstance(relative, str) or not relative or os.path.isabs(relative):
        raise RuntimeError(f"{label} 경로는 project 안의 상대 경로여야 한다")
    normalized = os.path.normpath(relative)
    if normalized != relative or normalized in {".", ".."} or normalized.startswith(f"..{os.sep}"):
        raise RuntimeError(f"{label} 경로가 project 밖을 가리킨다")
    root = os.path.realpath(os.path.abspath(os.path.expanduser(project)))
    resolved = os.path.realpath(os.path.join(root, normalized))
    if not resolved.startswith(root + os.sep):
        raise RuntimeError(f"{label} 경로가 project 밖을 가리킨다")
    if not os.path.isfile(resolved):
        raise RuntimeError(f"{label} 파일이 없다")
    return resolved


def verify_manifest_file(project, relative, expected_hash, label):
    if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", expected_hash):
        raise RuntimeError(f"{label} SHA-256이 올바르지 않다")
    path = project_file(project, relative, label)
    if sha256_file(path).lower() != expected_hash.lower():
        raise RuntimeError(f"{label} SHA-256이 실제 파일과 다르다")


def verify_run_manifest(args, state, contract_hash):
    if not args.run_manifest:
        raise RuntimeError("success complete에는 --run-manifest가 필요하다")
    project = state["project_root"]
    if args.harvest_project is not None:
        harvest_project = canonical_directory(args.harvest_project, "harvest-project")
        if harvest_project != project:
            raise RuntimeError("harvest-project가 provider state project_root와 다르다")
    expected_manifest = f"runs/{state['actor']}/{state['run_id']}/manifest.json"
    if args.run_manifest != expected_manifest:
        raise RuntimeError("run manifest 경로가 canonical runs/<actor>/<run_id>/manifest.json이 아니다")
    manifest_path = project_file(project, args.run_manifest, "run manifest")
    try:
        with open(manifest_path, encoding="utf-8") as fh:
            manifest = json.load(fh)
    except (OSError, ValueError) as exc:
        raise RuntimeError("run manifest가 올바른 JSON이 아니다") from exc
    if not isinstance(manifest, dict) or manifest.get("schema") != 1:
        raise RuntimeError("run manifest schema가 올바르지 않다")
    if manifest.get("run_id") != state["run_id"]:
        raise RuntimeError("run manifest run_id가 provider claim과 다르다")
    if manifest.get("actor") != state["actor"]:
        raise RuntimeError("run manifest actor가 provider claim과 다르다")
    if manifest.get("contract_hash") != contract_hash or manifest.get("status") != "reported":
        raise RuntimeError("run manifest contract/status가 올바르지 않다")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        raise RuntimeError("run manifest artifacts가 목록이 아니다")
    kinds = set()
    for artifact in artifacts:
        if not isinstance(artifact, dict) or not isinstance(artifact.get("kind"), str):
            raise RuntimeError("run manifest artifact 항목이 올바르지 않다")
        if artifact["kind"] in kinds:
            raise RuntimeError("run manifest artifact kind가 중복됐다")
        kinds.add(artifact["kind"])
        expected_paths = {
            "report": f"runs/{state['actor']}/{state['run_id']}/report.html",
            "harvest-complete": f"runs/{state['actor']}/{state['run_id']}/harvest/.run-complete.json",
        }
        if artifact["kind"] in expected_paths and artifact.get("path") != expected_paths[artifact["kind"]]:
            raise RuntimeError(f"artifact {artifact['kind']} 경로가 canonical 경로가 아니다")
        verify_manifest_file(project, artifact.get("path"), artifact.get("sha256"),
                             f"artifact {artifact['kind']}")
    if not {"report", "harvest-complete"}.issubset(kinds):
        raise RuntimeError("run manifest에 report와 harvest-complete artifact가 필요하다")
    units = manifest.get("units")
    if not isinstance(units, list):
        raise RuntimeError("run manifest units가 목록이 아니다")
    terminal_unit_statuses = {"reported", "success", "failed", "timeout", "closed"}
    unit_ids = set()
    result_card_prefix = ".claude/vault/backlog/tickets/"
    for unit in units:
        if not isinstance(unit, dict):
            raise RuntimeError("run manifest unit 항목이 객체가 아니다")
        if not isinstance(unit.get("id"), str) or not unit["id"]:
            raise RuntimeError("run manifest unit id가 없다")
        if unit["id"] in unit_ids:
            raise RuntimeError("run manifest unit id가 중복됐다")
        unit_ids.add(unit["id"])
        if unit.get("status") not in terminal_unit_statuses:
            raise RuntimeError("run manifest unit status가 terminal/reported 상태가 아니다")
        result_card = unit.get("result_card")
        if not isinstance(result_card, dict):
            raise RuntimeError("run manifest result-card가 객체가 아니다")
        if not isinstance(result_card.get("path"), str) or not result_card["path"].startswith(result_card_prefix):
            raise RuntimeError("result-card 경로는 .claude/vault/backlog/tickets/ 아래여야 한다")
        verify_manifest_file(project, result_card.get("path"), result_card.get("sha256"),
                             "result-card")


def snapshot_directory(project):
    return os.path.join(project, ".claude", "vault", "backlog", "night-runtime", "snapshots")


def snapshot_file(path, directory, label):
    if not isinstance(path, str) or not os.path.isabs(path):
        raise RuntimeError(f"{label} 경로가 absolute canonical path가 아니다")
    resolved = os.path.realpath(path)
    if resolved != path or not resolved.startswith(directory + os.sep) or not os.path.isfile(resolved):
        raise RuntimeError(f"{label} 경로가 canonical runtime snapshot directory 밖이다")
    return resolved


def snapshot_hash_input(path, start, end, content_sha256):
    return canonical_json({
        "path": path, "start": start, "end": end, "content_sha256": content_sha256,
    })


def binding_digest(fingerprint, run_id, contract_hash):
    return hashlib.sha256(canonical_json({
        "snapshot_fingerprint": fingerprint, "run_id": run_id,
        "contract_hash": contract_hash,
    })).hexdigest()


def snapshot_id(fingerprint, run_id, contract_hash):
    return hashlib.sha256(f"{fingerprint}\n{run_id}\n{contract_hash}".encode("utf-8")).hexdigest()


def read_snapshot_record(path, directory, state, contract_hash, member):
    record_path = snapshot_file(path, directory, "snapshot record")
    try:
        with open(record_path, encoding="utf-8") as fh:
            record = json.load(fh)
    except (OSError, ValueError) as exc:
        raise RuntimeError("snapshot record JSON을 읽을 수 없다") from exc
    if not isinstance(record, dict):
        raise RuntimeError("snapshot record가 객체가 아니다")
    actor, role = member["actor"], member["role"]
    required = {
        "schema": 1, "actor": actor, "role": role, "run_id": state["run_id"],
        "contract_hash": contract_hash,
    }
    for key, expected in required.items():
        if record.get(key) != expected:
            raise RuntimeError(f"snapshot record {key}가 snapshot set과 다르다")
    inbox_path = os.path.join(state["project_root"], ".claude", "vault", "inbox", f"{actor}.md")
    if record.get("path") != inbox_path:
        raise RuntimeError("snapshot record path가 actor inbox와 다르다")
    byte_range = record.get("byte_range")
    if not isinstance(byte_range, dict) or set(byte_range) != {"start", "end"}:
        raise RuntimeError("snapshot record byte_range가 올바르지 않다")
    start, end = byte_range["start"], byte_range["end"]
    if (isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, int)
            or not isinstance(end, int) or start < 0 or end < start
            or record.get("start") != start or record.get("end") != end):
        raise RuntimeError("snapshot record byte range가 올바르지 않다")
    content_sha256 = record.get("content_sha256")
    if not isinstance(content_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", content_sha256):
        raise RuntimeError("snapshot record content SHA-256이 올바르지 않다")
    artifact = record.get("content_artifact")
    if not isinstance(artifact, str) or os.path.isabs(artifact):
        raise RuntimeError("snapshot record content artifact가 올바르지 않다")
    content_path = os.path.realpath(os.path.join(directory, artifact))
    if content_path != os.path.join(directory, "content", f"{content_sha256}.bin") or not os.path.isfile(content_path):
        raise RuntimeError("snapshot record content artifact가 canonical content artifact가 아니다")
    content = open(content_path, "rb").read()
    if hashlib.sha256(content).hexdigest() != content_sha256 or len(content) != end - start:
        raise RuntimeError("snapshot record content artifact hash/range가 올바르지 않다")
    fingerprint = hashlib.sha256(snapshot_hash_input(record["path"], start, end, content_sha256)).hexdigest()
    if record.get("snapshot_fingerprint") != fingerprint:
        raise RuntimeError("snapshot record fingerprint가 올바르지 않다")
    expected_id = snapshot_id(fingerprint, state["run_id"], contract_hash)
    if record.get("snapshot_id") != expected_id or record.get("binding_fingerprint") != binding_digest(
            fingerprint, state["run_id"], contract_hash):
        raise RuntimeError("snapshot record binding identity가 올바르지 않다")
    for key in ("snapshot_id", "snapshot_fingerprint", "content_sha256", "byte_range", "path"):
        if member.get(key) != record.get(key):
            raise RuntimeError(f"snapshot set member {key}가 record와 다르다")
    if (isinstance(member.get("size"), bool) or not isinstance(member.get("size"), int)
            or member["size"] < end):
        raise RuntimeError("snapshot set member size가 올바르지 않다")
    return {
        "path": record_path, "id": expected_id, "fingerprint": fingerprint,
        "content_sha256": content_sha256, "binding_digest": record["binding_fingerprint"],
    }


def verify_snapshot_set(state, relative, expected_set_id=None):
    directory = snapshot_directory(state["project_root"])
    manifest_path = project_file(state["project_root"], relative, "snapshot set")
    if not manifest_path.startswith(directory + os.sep):
        raise RuntimeError("snapshot set 경로가 canonical runtime snapshot directory 밖이다")
    try:
        with open(manifest_path, encoding="utf-8") as fh:
            manifest = json.load(fh)
    except (OSError, ValueError) as exc:
        raise RuntimeError("snapshot set JSON을 읽을 수 없다") from exc
    contract_hash = state["contract_hash"]
    if not isinstance(manifest, dict) or {key: manifest.get(key) for key in
            ("schema", "kind", "run_id", "contract_hash", "actor")} != {
                "schema": 1, "kind": "inbox-snapshot-set", "run_id": state["run_id"],
                "contract_hash": contract_hash, "actor": state["actor"]}:
        raise RuntimeError("snapshot set identity가 provider claim과 다르다")
    members = manifest.get("snapshots")
    if not isinstance(members, list) or len(members) != 2:
        raise RuntimeError("snapshot set은 정확히 jh/hs 두 member여야 한다")
    expected_roles = {state["actor"]: "actionable",
                      next(actor for actor in VALID_ACTORS if actor != state["actor"]): "reference"}
    records = {}
    for member in members:
        if not isinstance(member, dict) or set(member) != {
                "actor", "role", "snapshot", "snapshot_id", "snapshot_fingerprint",
                "content_sha256", "byte_range", "size", "path"}:
            raise RuntimeError("snapshot set member가 canonical 형식이 아니다")
        actor = member.get("actor")
        if actor not in expected_roles or member.get("role") != expected_roles[actor] or actor in records:
            raise RuntimeError("snapshot set member actor/role이 올바르지 않다")
        records[actor] = read_snapshot_record(member.get("snapshot"), directory, state, contract_hash, member)
    if set(records) != VALID_ACTORS:
        raise RuntimeError("snapshot set은 현재 actionable과 peer reference를 모두 가져야 한다")
    set_input = {"run_id": state["run_id"], "contract_hash": contract_hash,
                 "actor": state["actor"], "actors": members}
    set_id = hashlib.sha256(canonical_json(set_input)).hexdigest()
    if manifest.get("set_id") != set_id or (expected_set_id is not None and expected_set_id != set_id):
        raise RuntimeError("snapshot set_id가 canonical member data와 다르다")
    if os.path.basename(manifest_path) != f"snapshot-set-{set_id}.json":
        raise RuntimeError("snapshot set 파일명이 set_id와 다르다")
    return manifest_path, set_id, records[state["actor"]], records[next(
        actor for actor in VALID_ACTORS if actor != state["actor"])]


def bind_snapshot(args):
    if not args.run_id or not args.token or args.fencing is None or not args.snapshot_set:
        raise RuntimeError("bind-snapshot에는 owner proof와 --snapshot-set이 필요하다")
    check_actor(args.actor)
    check_run_id(args.run_id)
    contract_hash = requested_contract_hash(args)
    state_dir, _, _, global_lock_file = state_paths(args)
    global_lock = lock_state(global_lock_file)
    located = locate_latest_state(args)
    if located is None:
        raise RuntimeError("provider claim이 없다")
    state_file, _ = located
    lock = lock_state(state_file + ".lock")
    try:
        state = read_state(state_file)
        check_state_location(state, state_file)
        check_project_root(state, args)
        verify_owner_state(state, args, contract_hash)
        set_path, set_id, actionable, reference = verify_snapshot_set(state, args.snapshot_set)
        state.update({
            "snapshot_set_path": os.path.relpath(set_path, state["project_root"]),
            "snapshot_set_id": set_id,
            "actionable_snapshot_path": actionable["path"],
            "actionable_snapshot_id": actionable["id"],
            "actionable_snapshot_fingerprint": actionable["fingerprint"],
            "actionable_content_sha256": actionable["content_sha256"],
            "reference_snapshot_path": reference["path"],
            "reference_snapshot_id": reference["id"],
            "reference_snapshot_fingerprint": reference["fingerprint"],
            "snapshot_binding_digest": actionable["binding_digest"],
            "updated_at": iso_now(),
        })
        atomic_json(state_file, state)
        emit(state_view(state, state_file))
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()


def verify_actionable_snapshot(args, state, contract_hash):
    required = ("snapshot_set_path", "snapshot_set_id", "actionable_snapshot_path",
                "actionable_snapshot_id", "actionable_snapshot_fingerprint",
                "actionable_content_sha256")
    if not all(state.get(key) for key in required):
        raise RuntimeError("success complete에는 verified snapshot set binding이 필요하다")
    if (os.path.realpath(os.path.abspath(os.path.expanduser(args.snapshot_path))) != state["actionable_snapshot_path"]
            or args.snapshot_id != state["actionable_snapshot_id"]
            or args.snapshot_fingerprint != state["actionable_snapshot_fingerprint"]):
        raise RuntimeError("success complete snapshot args가 state binding과 다르다")
    _, set_id, actionable, _ = verify_snapshot_set(state, state["snapshot_set_path"],
                                                    state["snapshot_set_id"])
    if (set_id != state["snapshot_set_id"] or actionable["path"] != state["actionable_snapshot_path"]
            or actionable["id"] != state["actionable_snapshot_id"]
            or actionable["fingerprint"] != state["actionable_snapshot_fingerprint"]
            or actionable["content_sha256"] != state["actionable_content_sha256"]):
        raise RuntimeError("verified snapshot set binding이 state와 다르다")


def primary(args):
    check_actor(args.actor)
    contract_hash = requested_contract_hash(args)
    project_root = canonical_directory(args.project_root, "project-root")
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
            raise RuntimeError("같은 KST 날짜의 provider state가 이미 존재한다")
        previous = locate_latest_state(args, match_identity=False)
        if previous is not None:
            previous_file, previous_state = previous
            if previous_file != state_file and previous_state["status"] == "committing":
                raise RuntimeError("이전 KST 날짜의 provider claim이 committing 상태다")
            if (previous_file != state_file and previous_state["status"] in LEASE_ACTIVE
                    and float(previous_state["lease_until"]) > now_epoch()):
                raise RuntimeError("이전 KST 날짜의 provider claim이 아직 유효하다")
        # preflight와 probe는 관문이 아니라 점검 기록이다. 실패해도 밤을 막지
        # 않는다 — 경고를 state에 남기고 claude 실행을 시도한다. 진짜 못 도는
        # 환경이면 실행 단계가 실패하고 그 기록이 아침에 남는다.
        state = new_claim(args.job, "claude", args.actor, run_id, contract_hash, 1,
                          lease_seconds(args), claim_date, state_dir, project_root)
        if not run_preflight(args):
            state["preflight_warning"] = "preflight 점검 경고 — 기록하고 계속한다"
        if not probe_claude(args):
            state["probe_warning"] = "claude 헤드리스 프로브 무응답 — 기록하고 실행을 시도한다"
        atomic_json(state_file, state)
        emit(state_view(state, state_file))
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
        check_state_location(state, state_file)
        check_project_root(state, args)
        if expire_if_stale(state):
            atomic_json(state_file, state)
        if state["contract_hash"] != contract_hash:
            raise RuntimeError("상태의 contract_hash가 현재 계약과 다르다")
        if state["provider"] != "claude" or state["status"] not in {
                "failed", "timeout", "claude:failed", "claude:timeout"}:
            raise RuntimeError("Codex fallback은 claude failed/timeout에서만 가능하다")
        if args.actor is not None and args.actor != state["actor"]:
            raise RuntimeError("fallback actor가 primary actor와 다르다")
        run_id = args.run_id or state["run_id"]
        if args.run_id is not None and args.run_id != state["run_id"]:
            raise RuntimeError("fallback run-id가 primary와 다르다")
        # A failed/timeout primary is an explicit handoff; one fenced CAS under
        # this lock is the only place that can consume it.
        next_state = new_claim(args.job, "codex", state["actor"], run_id, contract_hash,
                               int(state["fencing"]) + 1, lease_seconds(args),
                               state["claim_date"], state["state_root"], state["project_root"])
        for key in ("snapshot_set_path", "snapshot_set_id", "actionable_snapshot_path",
                    "actionable_snapshot_id", "actionable_snapshot_fingerprint",
                    "actionable_content_sha256", "reference_snapshot_path",
                    "reference_snapshot_id", "reference_snapshot_fingerprint",
                    "snapshot_binding_digest"):
            if key in state:
                next_state[key] = state[key]
        if not run_preflight(args):
            next_state["preflight_warning"] = "preflight 점검 경고 — 기록하고 계속한다"
        atomic_json(state_file, next_state)
        emit(state_view(next_state, state_file))
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()


def harvest_complete(args, state, contract_hash):
    expected_out = os.path.join(state["project_root"], "runs", state["actor"], state["run_id"], "harvest")
    expected_stamp = os.path.join(
        state["project_root"], ".claude", "vault", "backlog", "sweep", ".last-success")
    if args.harvest_out is not None and os.path.realpath(os.path.abspath(os.path.expanduser(
            args.harvest_out))) != expected_out:
        raise RuntimeError("harvest-out이 canonical runs/<actor>/<run_id>/harvest 경로가 아니다")
    if args.stamp_path is not None and os.path.realpath(os.path.abspath(os.path.expanduser(
            args.stamp_path))) != expected_stamp:
        raise RuntimeError("stamp-path가 canonical sweep/.last-success 경로가 아니다")
    harvest = args.harvest or os.path.join(os.path.dirname(__file__), "harvest.py")
    command = [sys.executable, harvest,
               "--validate-complete",
               "--run-id", state["run_id"],
               "--contract-hash", contract_hash, "--actor", state["actor"]]
    command.extend(["--project", state["project_root"]])
    command.extend(["--out", expected_out])
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
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                timeout=max(1.0, min(float(args.harvest_timeout), 120.0)), check=False)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def harvest_proof(args, state):
    """Validated harvest의 stamp 입력을 provider journal에 고정한다."""
    out = os.path.join(state["project_root"], "runs", state["actor"], state["run_id"], "harvest")
    candidate_path = os.path.join(out, ".stamp-candidate")
    complete_path = os.path.join(out, ".run-complete.json")
    try:
        candidate_epoch = read_stamp(candidate_path)
        with open(candidate_path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
        metadata_line = next(line for line in lines[1:] if line.startswith("# harvest-metadata: "))
        metadata = json.loads(metadata_line[len("# harvest-metadata: "):])
    except (OSError, StopIteration, ValueError, json.JSONDecodeError) as exc:
        raise RuntimeError("harvest stamp candidate를 읽을 수 없다") from exc
    if not isinstance(metadata, dict):
        raise RuntimeError("harvest stamp candidate metadata가 객체가 아니다")
    expected = {
        "run_id": state["run_id"], "actor": state["actor"], "source": state["project_root"],
        "contract_hash": state["contract_hash"], "snapshot_id": args.snapshot_id,
        "snapshot_fingerprint": args.snapshot_fingerprint,
        "binding_path": os.path.realpath(os.path.abspath(os.path.expanduser(args.snapshot_path))),
    }
    for key, value in expected.items():
        if metadata.get(key) != value:
            raise RuntimeError(f"harvest stamp candidate {key} binding이 다르다")
    if metadata.get("candidate_epoch") != candidate_epoch or metadata.get("status") != "ready":
        raise RuntimeError("harvest stamp candidate epoch/status가 올바르지 않다")
    snapshot = metadata.get("inbox_snapshot")
    snapshot_expected = {key: expected[key] for key in (
        "run_id", "contract_hash", "snapshot_id", "snapshot_fingerprint", "binding_path")}
    if not isinstance(snapshot, dict) or any(snapshot.get(key) != value for key, value in snapshot_expected.items()):
        raise RuntimeError("harvest stamp candidate snapshot binding이 다르다")
    return {
        "harvest_out": out,
        "stamp_path": os.path.join(state["project_root"], ".claude", "vault", "backlog", "sweep", ".last-success"),
        "stamp_candidate_path": candidate_path,
        "stamp_candidate_sha256": sha256_file(candidate_path),
        "stamp_candidate_epoch": candidate_epoch,
        "run_complete_path": complete_path,
        "run_complete_sha256": sha256_file(complete_path),
    }


def completion_proof(args, state):
    snapshot_path = os.path.realpath(os.path.abspath(os.path.expanduser(args.snapshot_path)))
    manifest_path = project_file(state["project_root"], args.run_manifest, "run manifest")
    return {
        "project_root": state["project_root"],
        "run_manifest": args.run_manifest,
        "run_manifest_sha256": sha256_file(manifest_path),
        "snapshot_path": snapshot_path,
        "snapshot_sha256": sha256_file(snapshot_path),
        "snapshot_id": args.snapshot_id,
        "snapshot_fingerprint": args.snapshot_fingerprint,
        "snapshot_set_path": state["snapshot_set_path"],
        "snapshot_set_id": state["snapshot_set_id"],
        "actionable_content_sha256": state["actionable_content_sha256"],
        **harvest_proof(args, state),
    }


def verify_completion_proof(state, args):
    if state["status"] != "committing":
        return
    if state.get("completion_proof") != completion_proof(args, state):
        raise RuntimeError("committing complete proof가 처음 기록과 다르다")


def verify_owner_state(state, args, contract_hash, before=None, allow_committing=False,
                       terminal_grace=False):
    if state is None:
        raise RuntimeError("provider claim이 없다")
    if state.get("job") != args.job or not state.get("claim_date"):
        raise RuntimeError("provider claim identity가 올바르지 않다")
    if state["contract_hash"] != contract_hash:
        raise RuntimeError("상태의 contract_hash가 현재 계약과 다르다")
    if (state["run_id"] != args.run_id or state["owner_token"] != args.token
            or state["actor"] != args.actor or int(state["fencing"]) != args.fencing):
        raise RuntimeError("late owner 또는 다른 provider owner다")
    allowed_states = LEASE_ACTIVE | ({"committing"} if allow_committing else set())
    if state["status"] not in allowed_states:
        raise RuntimeError("provider claim이 이미 닫혔거나 만료됐다")
    expiry = float(state["lease_until"])
    if (state["status"] in LEASE_ACTIVE and expiry <= now_epoch()
            and not (terminal_grace and now_epoch() <= expiry + TERMINAL_GRACE_SECONDS)):
        raise RuntimeError("provider lease가 만료됐다")
    if before is not None:
        for key in ("run_id", "owner_token", "fencing", "contract_hash", "claim_date", "actor"):
            if state.get(key) != before.get(key):
                raise RuntimeError("provider claim이 subprocess 중 변경됐다")


def complete(args):
    if args.outcome not in VALID_OUTCOMES:
        raise RuntimeError(f"invalid completion outcome: {args.outcome}")
    if not args.run_id or not args.token or args.fencing is None:
        raise RuntimeError("complete에는 --run-id와 --token과 --fencing이 필요하다")
    check_actor(args.actor)
    if args.outcome == "success":
        if not args.snapshot_path or not args.snapshot_id or not args.snapshot_fingerprint:
            raise RuntimeError("success complete에는 snapshot binding 전체가 필요하다")
        if not args.run_manifest:
            raise RuntimeError("success complete에는 --run-manifest가 필요하다")
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
        check_state_location(state, state_file)
        check_project_root(state, args)
        committing = args.outcome == "success" and state.get("status") == "committing"
        verify_owner_state(state, args, contract_hash, allow_committing=committing,
                           terminal_grace=args.outcome != "success")
        before = dict(state)
        if args.outcome == "success":
            verify_run_manifest(args, before, contract_hash)
            verify_actionable_snapshot(args, before, contract_hash)
            verify_completion_proof(before, args)
            proof = completion_proof(args, before)
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()

    # Harvest may be slow and must never run while the provider lock is held.
    if args.outcome == "success":
        if not harvest_complete(args, before, contract_hash):
            raise RuntimeError("완료된 harvest run 사전 검증이 실패했다")
        # Reacquire and persist the recovery point before any irreversible stamp.
        global_lock = lock_state(global_lock_file)
        lock = lock_state(state_file + ".lock")
        try:
            after = read_state(state_file)
            check_state_location(after, state_file)
            check_project_root(after, args)
            verify_owner_state(after, args, current_contract_hash(args), before,
                               allow_committing=committing)
            verify_run_manifest(args, after, current_contract_hash(args))
            verify_actionable_snapshot(args, after, current_contract_hash(args))
            if completion_proof(args, after) != proof:
                raise RuntimeError("success proof가 subprocess 중 변경됐다")
            if after["status"] != "committing":
                after["status"] = "committing"
                after["completion_proof"] = proof
                after["updated_at"] = iso_now()
                atomic_json(state_file, after)
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            lock.close()
            fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
            global_lock.close()

        # Journal이 디스크에 남은 뒤 다시 canonical harvest를 검증한다. 이 검증과
        # 도장 쓰기 사이에는 provider lock을 다시 잡아 모든 증거의 hash를 확인한다.
        if not harvest_complete(args, before, contract_hash):
            raise RuntimeError("committing harvest run 재검증이 실패했다")
        global_lock = lock_state(global_lock_file)
        lock = lock_state(state_file + ".lock")
        stamp_lock = None
        try:
            after = read_state(state_file)
            check_state_location(after, state_file)
            check_project_root(after, args)
            verify_owner_state(after, args, current_contract_hash(args), before,
                               allow_committing=True)
            verify_run_manifest(args, after, current_contract_hash(args))
            verify_actionable_snapshot(args, after, current_contract_hash(args))
            if after.get("completion_proof") != proof or completion_proof(args, after) != proof:
                raise RuntimeError("committing complete proof가 journal과 다르다")
            stamp_path = proof["stamp_path"]
            stamp_lock = lock_state(stamp_path + ".lock")
            if os.path.exists(stamp_path) and read_stamp(stamp_path) > proof["stamp_candidate_epoch"]:
                pass
            else:
                atomic_stamp(stamp_path, proof["stamp_candidate_epoch"])
            after["status"] = "success"
            after["updated_at"] = iso_now()
            atomic_json(state_file, after)
            emit(state_view(after, state_file))
            return 0
        finally:
            if stamp_lock is not None:
                fcntl.flock(stamp_lock.fileno(), fcntl.LOCK_UN)
                stamp_lock.close()
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            lock.close()
            fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
            global_lock.close()

    global_lock = lock_state(global_lock_file)
    lock = lock_state(state_file + ".lock")
    try:
        after = read_state(state_file)
        check_state_location(after, state_file)
        check_project_root(after, args)
        verify_owner_state(after, args, contract_hash, before,
                           terminal_grace=True)
        after["status"] = args.outcome
        after["updated_at"] = iso_now()
        atomic_json(state_file, after)
        emit(state_view(after, state_file))
        return 0
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
        fcntl.flock(global_lock.fileno(), fcntl.LOCK_UN)
        global_lock.close()


def parser():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=("primary", "fallback", "bind-snapshot", "complete", "state", "run-id"))
    ap.add_argument("job", nargs="?", choices=tuple(VALID_JOBS))
    ap.add_argument("outcome", nargs="?", choices=tuple(VALID_OUTCOMES))
    ap.add_argument("--run-id", dest="run_id", default=None)
    ap.add_argument("--actor", choices=tuple(VALID_ACTORS), default=None)
    ap.add_argument("--token", "--owner-token", dest="token", default=None)
    ap.add_argument("--fencing", type=int, default=None)
    ap.add_argument("--contract-hash", default=None)
    ap.add_argument("--contract-path", default=None)
    ap.add_argument("--state-dir", default=None)
    ap.add_argument("--project-root", default=None)
    ap.add_argument("--lease-seconds", default="21600")
    ap.add_argument("--probe-timeout", default="8")
    ap.add_argument("--probe-command", default=None)
    ap.add_argument("--preflight", default=None)
    ap.add_argument("--harvest", default=None)
    ap.add_argument("--harvest-project", default=None)
    ap.add_argument("--run-manifest", default=None)
    ap.add_argument("--harvest-out", default=None)
    ap.add_argument("--stamp-path", default=None)
    ap.add_argument("--snapshot-id", default=None)
    ap.add_argument("--snapshot-fingerprint", default=None)
    ap.add_argument("--snapshot-path", default=None)
    ap.add_argument("--snapshot-set", default=None)
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
            check_actor(args.actor)
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
        if args.mode == "bind-snapshot":
            return bind_snapshot(args)
        if args.outcome is None:
            raise RuntimeError("complete에는 outcome이 필요하다")
        return complete(args)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
