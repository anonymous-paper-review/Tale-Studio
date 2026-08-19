#!/usr/bin/env python3
"""결과 우선 밤 루프의 입력 스냅샷과 최소 상태 기록 도구."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import os
import re
import stat
import subprocess
import sys
import uuid

UTC = dt.timezone.utc
ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
INBOX_DEFAULT = os.path.join(ROOT, ".claude", "vault", "inbox", "jh.md")
CONTRACT_DEFAULT = os.path.join(ROOT, ".claude", "vault", "backlog", "_NIGHT.md")
VALID_STATUSES = {
    "unclaimed", "claimed", "decomposed", "executed", "reported", "failed", "blocked",
}
TRANSITIONS = {
    "unclaimed": {"claimed", "failed", "blocked"},
    "claimed": {"decomposed", "failed", "blocked"},
    "decomposed": {"executed", "failed", "blocked"},
    "executed": {"reported", "failed", "blocked"},
    "reported": set(),
    "failed": set(),
    "blocked": set(),
}
ARCHIVE_APPROVAL_STATES = {"reported", "awaiting-owner-review"}
INBOX_ROLES = {"actionable", "reference"}
ITEM_STATES = {"tracked", "closed"}
TERMINAL_DISPOSITIONS = {
    "integrated", "accepted", "rejected", "cancelled", "no-action", "superseded",
    "failed", "completed",
}
MARKER_START = b"<!-- vault-inbox-item:start\n"
MARKER_END = b"<!-- vault-inbox-item:end -->"


def atomic_write(path, data, before_replace=None):
    parent = os.path.dirname(path) or "."
    os.makedirs(parent, exist_ok=True)
    temporary = f"{path}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    try:
        mode = "wb" if isinstance(data, bytes) else "w"
        kwargs = {} if mode == "wb" else {"encoding": "utf-8"}
        with open(temporary, mode, **kwargs) as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        if before_replace is not None:
            before_replace()
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _assert_lease(lease_until):
    if lease_until <= dt.datetime.now(UTC).timestamp():
        raise ValueError("provider lease가 작업 중 만료됐다")


def _canonical_path(value):
    return os.path.realpath(os.path.abspath(os.path.expanduser(value)))


def _state_path(state_root, job, claim_date):
    return os.path.join(state_root, f"{job}-{claim_date}.json")


def _authority_payload(state):
    fields = ("schema", "job", "run_id", "contract_hash", "claim_date", "actor",
              "state_root", "project_root")
    if not all(field in state for field in fields):
        raise ValueError("provider state authority identity가 올바르지 않다")
    return {field: state[field] for field in fields}


def _verify_authority(state):
    """Verify immutable provider identity before trusting state-provided roots."""
    authority_hmac = state.get("authority_hmac")
    state_root = state.get("state_root")
    if not isinstance(authority_hmac, str) or not isinstance(state_root, str):
        raise ValueError("provider state authority가 없다")
    key_path = os.path.join(_canonical_path(state_root), ".authority-key")
    try:
        key_stat = os.stat(key_path)
        if (key_stat.st_mode & 0o777) != 0o600 or key_stat.st_size != 32:
            raise ValueError("provider authority key mode 또는 길이가 올바르지 않다")
        with open(key_path, "rb") as fh:
            key = fh.read()
    except OSError as exc:
        raise ValueError("provider authority key를 읽을 수 없다") from exc
    payload = json.dumps(
        _authority_payload(state), ensure_ascii=False, sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    expected = hmac.new(key, payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(authority_hmac, expected):
        raise ValueError("provider state authority가 올바르지 않다")


def _state_owner_check(args, expected):
    """Revalidate the claim immediately before replacing a mutable target."""
    current = _read_record(_canonical_path(args.provider_state))
    _verify_authority(current)
    for key in ("job", "run_id", "owner_token", "fencing", "contract_hash", "claim_date",
                "actor", "state_root", "project_root"):
        if current.get(key) != expected.get(key):
            raise ValueError("late owner 또는 다른 provider owner다")
    if current.get("status") not in {"claimed", "running"}:
        raise ValueError("provider claim이 이미 닫혔거나 만료됐다")
    lease_until = current.get("lease_until")
    if (isinstance(lease_until, bool) or not isinstance(lease_until, (int, float))):
        raise ValueError("provider lease가 만료됐거나 올바르지 않다")
    _assert_lease(lease_until)


def _mutation_check(args, state):
    return lambda: _state_owner_check(args, state)


def _project_path(project_root, path, label):
    resolved = _canonical_path(path)
    if not _path_inside(project_root, resolved):
        raise ValueError(f"{label}가 state project_root 밖이다")
    return resolved


def _state_storage_path(state, path, label):
    resolved = _canonical_path(path)
    if (not _path_inside(state["project_root"], resolved)
            and not _path_inside(state["state_root"], resolved)):
        raise ValueError(f"{label}가 state project_root/state_root 밖이다")
    return resolved


def _actor_inbox(project_root, actor):
    if not isinstance(actor, str) or re.fullmatch(r"[a-z0-9-]+", actor) is None:
        raise ValueError("inbox actor 형식이 올바르지 않다")
    return os.path.join(project_root, ".claude", "vault", "inbox", f"{actor}.md")


def _validate_actor_source(source, actor, project_root=None):
    if (not isinstance(source, str) or not isinstance(actor, str)
            or re.fullmatch(r"[a-z0-9-]+", actor) is None):
        raise ValueError("inbox actor 형식이 올바르지 않다")
    if project_root is not None and source != _actor_inbox(project_root, actor):
        raise ValueError("actor는 state project_root의 자기 actionable inbox 파일만 처리할 수 있다")
    elif os.path.basename(source) != f"{actor}.md":
        raise ValueError("actor는 자기 inbox 파일만 처리할 수 있다")


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def contract_hash(path):
    with open(path, "rb") as fh:
        return sha256_bytes(fh.read())


def parse_read_time(value):
    if value is None:
        return dt.datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    normalized = value.replace("Z", "+00:00")
    parsed = dt.datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("read-time에 시간대가 없다")
    return parsed.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def snapshot_path(out_dir, fingerprint):
    return os.path.join(out_dir, f"snapshot-{fingerprint}.json")


def _binding_digest(fingerprint, run_id, contract):
    return sha256_bytes(json.dumps(
        {"snapshot_fingerprint": fingerprint, "run_id": run_id,
         "contract_hash": contract},
        sort_keys=True, separators=(",", ":"),
    ).encode("utf-8"))


def _flock_path(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    handle = open(f"{path}.lock", "a+", encoding="utf-8")
    fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
    return handle


@contextlib.contextmanager
def _provider_owner_lock(args):
    state_path = _canonical_path(args.provider_state)
    try:
        untrusted = _read_record(state_path)
    except (OSError, ValueError) as exc:
        raise ValueError("provider state를 읽을 수 없다") from exc
    _verify_authority(untrusted)
    state_root = untrusted.get("state_root") if isinstance(untrusted, dict) else None
    claim_date = untrusted.get("claim_date") if isinstance(untrusted, dict) else None
    if not isinstance(state_root, str) or not isinstance(claim_date, str):
        raise ValueError("provider state 계약이 올바르지 않다")
    canonical = _state_path(_canonical_path(state_root), args.provider_job, claim_date)
    if state_path != canonical:
        raise ValueError("provider state가 canonical provider claim이 아니다")
    lock = _flock_path(state_path)
    try:
        try:
            state = _read_record(state_path)
        except (OSError, ValueError) as exc:
            raise ValueError("provider state를 읽을 수 없다") from exc
        required = {"schema", "job", "status", "run_id", "owner_token", "lease_until",
                    "fencing", "contract_hash", "claim_date", "actor", "state_root",
                    "project_root", "authority_hmac"}
        if not required.issubset(state) or state.get("schema") != 1:
            raise ValueError("provider state 계약이 올바르지 않다")
        _verify_authority(state)
        if (not isinstance(state["job"], str) or not state["job"]
                or not isinstance(state["run_id"], str) or not state["run_id"]
                or not isinstance(state["owner_token"], str) or not state["owner_token"]
                or not isinstance(state["contract_hash"], str) or not state["contract_hash"]
                or isinstance(state["fencing"], bool)
                or not isinstance(state["fencing"], int) or state["fencing"] < 1
                or not isinstance(state["actor"], str)
                or re.fullmatch(r"[a-z0-9-]+", state["actor"]) is None
                or not isinstance(state["claim_date"], str)
                or re.fullmatch(r"\d{4}-\d{2}-\d{2}", state["claim_date"]) is None
                or not isinstance(state["state_root"], str)
                or not isinstance(state["project_root"], str)):
            raise ValueError("provider state 계약이 올바르지 않다")
        if (_canonical_path(state["state_root"]) != state["state_root"]
                or _canonical_path(state["project_root"]) != state["project_root"]):
            raise ValueError("provider state root가 canonical path가 아니다")
        canonical = _state_path(state["state_root"], args.provider_job, state["claim_date"])
        if state_path != canonical or state["job"] != args.provider_job:
            raise ValueError("provider state가 canonical provider claim이 아니다")
        if state.get("status") not in {"claimed", "running"}:
            raise ValueError("provider claim이 이미 닫혔거나 만료됐다")
        if (state.get("run_id") != args.run_id
                or state.get("owner_token") != args.owner_token
                or state.get("fencing") != args.fencing
                or state.get("contract_hash") != args.contract_hash):
            raise ValueError("late owner 또는 다른 provider owner다")
        if (isinstance(state["lease_until"], bool)
                or not isinstance(state["lease_until"], (int, float))
                or state["lease_until"] <= dt.datetime.now(UTC).timestamp()):
            raise ValueError("provider lease가 만료됐거나 올바르지 않다")
        yield state
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()


def _read_record(path):
    with open(path, encoding="utf-8") as fh:
        record = json.load(fh)
    if not isinstance(record, dict):
        raise ValueError("snapshot 기록이 객체가 아니다")
    return record


def _snapshot_record(args, state, actor, role, read_time=None):
    if not actor:
        raise ValueError("snapshot actor가 필요하다")
    if role not in INBOX_ROLES:
        raise ValueError("snapshot role이 올바르지 않다")
    source = _canonical_path(args.path)
    _validate_actor_source(source, actor, state["project_root"])
    with open(source, "rb") as fh:
        content = fh.read()
    start = 0 if args.start is None else args.start
    end = len(content) if args.end is None else args.end
    if start < 0 or end < start or end > len(content):
        raise ValueError(f"바이트 범위가 올바르지 않다: [{start}, {end}) / {len(content)}")
    selected = content[start:end]
    content_sha256 = sha256_bytes(selected)
    fingerprint_input = json.dumps(
        {"path": source, "start": start, "end": end, "content_sha256": content_sha256},
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")
    fingerprint = sha256_bytes(fingerprint_input)
    read_time = read_time or parse_read_time(args.read_time)
    if args.contract_hash:
        supplied_hash = args.contract_hash
    else:
        supplied_hash = contract_hash(args.contract_path)
    if not isinstance(supplied_hash, str) or not supplied_hash or len(supplied_hash) > 256:
        raise ValueError("contract-hash가 비어 있거나 너무 길다")
    contract_value = supplied_hash.lower()
    binding = _binding_digest(fingerprint, args.run_id, contract_value)
    out_dir = _state_storage_path(state, args.out_dir, "snapshot out-dir")
    content_dir = os.path.join(out_dir, "content")
    content_target = os.path.join(content_dir, f"{content_sha256}.bin")
    # The bytes are immutable and content-addressed independently from
    # run/contract metadata. A changed run or contract gets a new binding.
    content_lock = _flock_path(content_target)
    try:
        if os.path.exists(content_target):
            with open(content_target, "rb") as fh:
                if fh.read() != selected:
                    raise ValueError("동일 content hash 파일의 바이트가 다르다")
        else:
            atomic_write(content_target, selected, _mutation_check(args, state))
    finally:
        fcntl.flock(content_lock.fileno(), fcntl.LOCK_UN)
        content_lock.close()
    snapshot_id = sha256_bytes(
        f"{fingerprint}\n{args.run_id}\n{contract_value}".encode("utf-8")
    )
    record = {
        "schema": 1,
        "actor": actor,
        "role": role,
        "run_id": args.run_id,
        "contract_hash": contract_value,
        "path": source,
        "byte_range": {"start": start, "end": end},
        "start": start,
        "end": end,
        "content_sha256": content_sha256,
        "snapshot_fingerprint": fingerprint,
        "snapshot_id": snapshot_id,
        "read_time": read_time,
        "read_at": read_time,
        "content_artifact": os.path.relpath(content_target, out_dir),
        "binding_fingerprint": binding,
        "status": "unclaimed",
    }
    target = os.path.join(out_dir, f"snapshot-{fingerprint}-{binding}.json")
    binding_lock = _flock_path(target)
    try:
        # Same run + contract + bytes is idempotent. Keep the original read
        # timestamp and status rather than mutating an immutable binding.
        if os.path.exists(target):
            existing = _read_record(target)
            for key in ("actor", "role", "run_id", "contract_hash", "snapshot_fingerprint",
                        "content_sha256", "content_artifact", "path", "byte_range"):
                if existing.get(key) != record[key]:
                    raise ValueError("동일 binding 파일의 내용이 다르다")
            record = existing
        else:
            atomic_write(target, json.dumps(record, ensure_ascii=False, indent=2) + "\n",
                         _mutation_check(args, state))
    finally:
        fcntl.flock(binding_lock.fileno(), fcntl.LOCK_UN)
        binding_lock.close()
    return target, record


def _snapshot_inbox(args, state):
    if args.actor != state["actor"] or args.role != "actionable":
        raise ValueError("직접 snapshot은 state actor의 actionable inbox만 허용한다")
    target, record = _snapshot_record(args, state, args.actor, args.role)
    print(json.dumps({"snapshot": target, **record}, ensure_ascii=False, sort_keys=True))
    return 0


def _snapshot_inbox_set(args, state):
    actors = [actor.strip() for actor in args.actors.split(",") if actor.strip()]
    if not actors or len(set(actors)) != len(actors):
        raise ValueError("actors 목록이 비어 있거나 중복됐다")
    if args.actor != state["actor"] or args.actor not in actors:
        raise ValueError("현재 actor가 actors 목록에 없다")
    inbox_dir = _canonical_path(args.inbox_dir)
    expected_inbox_dir = os.path.join(state["project_root"], ".claude", "vault", "inbox")
    if inbox_dir != expected_inbox_dir:
        raise ValueError("snapshot set inbox-dir는 state project_root의 inbox여야 한다")
    for actor in actors:
        source = os.path.join(inbox_dir, f"{actor}.md")
        if not os.path.isfile(source):
            raise ValueError(f"inbox 파일이 없다: {source}")
    generations = {}
    for actor in actors:
        source = os.path.join(inbox_dir, f"{actor}.md")
        with open(source, "rb") as fh:
            content = fh.read()
        stat = os.stat(source)
        generations[actor] = (content, stat.st_size, stat.st_mtime_ns)
    read_time = parse_read_time(args.read_time)
    snapshots = []
    for actor in actors:
        copy = argparse.Namespace(**vars(args))
        copy.path = os.path.join(inbox_dir, f"{actor}.md")
        target, record = _snapshot_record(
            copy, state, actor, "actionable" if actor == args.actor else "reference", read_time)
        snapshots.append({
            "actor": actor,
            "role": record["role"],
            "snapshot": target,
            "snapshot_id": record["snapshot_id"],
            "snapshot_fingerprint": record["snapshot_fingerprint"],
            "content_sha256": record["content_sha256"],
            "byte_range": record["byte_range"],
            "size": generations[actor][1],
            "path": record["path"],
        })
    for actor in actors:
        source = os.path.join(inbox_dir, f"{actor}.md")
        with open(source, "rb") as fh:
            content = fh.read()
        stat = os.stat(source)
        initial, initial_size, initial_mtime = generations[actor]
        if (initial != content or initial_size != stat.st_size
                or initial_mtime != stat.st_mtime_ns):
            raise ValueError("snapshot set 도중 inbox 세대가 변경됐다")
        record = next(entry for entry in snapshots if entry["actor"] == actor)
        start = 0 if args.start is None else args.start
        end = len(initial) if args.end is None else args.end
        if (record["content_sha256"] != sha256_bytes(initial[start:end])
                or record["byte_range"] != {"start": start, "end": end}
                or record["size"] != initial_size or record["path"] != source):
            raise ValueError("snapshot record가 최초 또는 최종 inbox 세대와 다르다")
    set_input = {
        "run_id": args.run_id, "contract_hash": state["contract_hash"],
        "actor": args.actor, "actors": snapshots,
    }
    set_id = sha256_bytes(json.dumps(
        set_input, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    out_dir = _state_storage_path(state, args.out_dir, "snapshot out-dir")
    manifest = {
        "schema": 1, "kind": "inbox-snapshot-set", "set_id": set_id,
        "run_id": args.run_id, "contract_hash": state["contract_hash"],
        "actor": args.actor, "snapshots": snapshots,
    }
    target = os.path.join(out_dir, f"snapshot-set-{set_id}.json")
    lock = _flock_path(target)
    try:
        if os.path.exists(target):
            if _read_record(target) != manifest:
                raise ValueError("동일 snapshot set manifest의 내용이 다르다")
        else:
            atomic_write(target, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                         _mutation_check(args, state))
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
    print(json.dumps({"manifest": target, **manifest}, ensure_ascii=False, sort_keys=True))
    return 0


def _snapshot_status(args, state):
    fingerprint = args.snapshot_fingerprint
    out_dir = _state_storage_path(state, args.out_dir, "snapshot out-dir")
    if args.snapshot_path:
        target = _state_storage_path(state, args.snapshot_path, "snapshot path")
    elif args.snapshot_id:
        matches = []
        for candidate in os.listdir(out_dir):
            if not candidate.endswith(".json") or not candidate.startswith("snapshot-"):
                continue
            candidate_path = os.path.join(out_dir, candidate)
            try:
                if _read_record(candidate_path).get("snapshot_id") == args.snapshot_id:
                    matches.append(candidate_path)
            except (OSError, ValueError):
                continue
        if len(matches) != 1:
            raise ValueError("snapshot_id로 binding을 하나로 결정할 수 없다")
        target = matches[0]
    else:
        candidates = [
            os.path.join(out_dir, name) for name in os.listdir(out_dir)
            if name.startswith(f"snapshot-{fingerprint}-") and name.endswith(".json")
        ]
        if len(candidates) != 1:
            raise ValueError("snapshot binding을 하나로 결정할 수 없다")
        target = candidates[0]
    lock = _flock_path(target)
    try:
        record = _read_record(target)
        if record.get("snapshot_fingerprint") != fingerprint:
            raise ValueError("snapshot fingerprint가 경로와 다르다")
        if args.contract_hash and record.get("contract_hash") != args.contract_hash.lower():
            raise ValueError("snapshot contract_hash가 요청과 다르다")
        if record.get("actor") != state["actor"] or record.get("role") != "actionable":
            raise ValueError("state actor의 actionable snapshot만 상태를 바꿀 수 있다")
        _validate_actor_source(record.get("path"), state["actor"], state["project_root"])
        if record.get("path") != _actor_inbox(state["project_root"], state["actor"]):
            raise ValueError("state project_root의 actionable snapshot만 상태를 바꿀 수 있다")
        artifact = record.get("content_artifact")
        if not isinstance(artifact, str):
            raise ValueError("snapshot content artifact가 없다")
        artifact_path = os.path.realpath(os.path.join(os.path.dirname(target), artifact))
        root = os.path.realpath(os.path.dirname(target))
        if not artifact_path.startswith(root + os.sep):
            raise ValueError("snapshot content artifact가 binding 디렉터리 밖이다")
        with open(artifact_path, "rb") as fh:
            if sha256_bytes(fh.read()) != record.get("content_sha256"):
                raise ValueError("snapshot content artifact hash가 다르다")
    except (OSError, ValueError) as exc:
        raise ValueError("snapshot 기록을 읽을 수 없다") from exc
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
    lock = _flock_path(target)
    try:
        # Re-read under the per-record lock to avoid lost status updates.
        record = _read_record(target)
        if record.get("snapshot_fingerprint") != fingerprint:
            raise ValueError("snapshot fingerprint가 경로와 다르다")
        if args.run_id is not None and record.get("run_id") != args.run_id:
            raise ValueError("snapshot run_id가 요청과 다르다")
        if args.contract_hash and record.get("contract_hash") != args.contract_hash.lower():
            raise ValueError("snapshot contract_hash가 요청과 다르다")
        if record.get("actor") != state["actor"] or record.get("role") != "actionable":
            raise ValueError("state actor의 actionable snapshot만 상태를 바꿀 수 있다")
        _validate_actor_source(record.get("path"), state["actor"], state["project_root"])
        if record.get("path") != _actor_inbox(state["project_root"], state["actor"]):
            raise ValueError("state project_root의 actionable snapshot만 상태를 바꿀 수 있다")
        old = record.get("status")
        if old not in VALID_STATUSES or args.status not in VALID_STATUSES:
            raise ValueError("snapshot status가 올바르지 않다")
        if args.status != old and args.status not in TRANSITIONS[old]:
            raise ValueError(f"허용되지 않은 상태 전이: {old} -> {args.status}")
        record["status"] = args.status
        record["status_changed_at"] = parse_read_time(args.read_time)
        atomic_write(target, json.dumps(record, ensure_ascii=False, indent=2) + "\n",
                     _mutation_check(args, state))
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
    print(json.dumps({"snapshot": target, **record}, ensure_ascii=False, sort_keys=True))
    return 0


def _path_inside(root, candidate):
    return candidate == root or candidate.startswith(root + os.sep)


def _archive_json(path, expected):
    if not os.path.exists(path):
        return False
    existing = _read_record(path)
    if existing != expected:
        raise ValueError("동일 archive/manifest 경로의 내용이 다르다")
    return True


def _archive_inbox(args, state):
    """Archive immutable snapshot bytes without touching the live inbox."""
    binding = _project_path(state["project_root"], args.snapshot_path, "snapshot path")
    if not os.path.isfile(binding):
        raise ValueError("snapshot binding 파일이 없다")
    archive_root = _canonical_path(args.archive_root)
    expected_archive_root = os.path.join(
        state["project_root"], ".claude", "vault", "_archive", "inbox")
    if archive_root != expected_archive_root:
        raise ValueError("archive root는 state project_root의 canonical inbox archive여야 한다")
    os.makedirs(archive_root, exist_ok=True)
    if args.approval_state not in ARCHIVE_APPROVAL_STATES:
        raise ValueError("execution archive approval state가 올바르지 않다")

    lock = _flock_path(binding)
    try:
        record = _read_record(binding)
        if record.get("run_id") != args.run_id:
            raise ValueError("snapshot binding의 run_id가 현재 실행과 다르다")
        if record.get("status") != "reported":
            raise ValueError("reported 상태인 snapshot만 archive할 수 있다")
        if record.get("actor") != state["actor"] or record.get("role") != "actionable":
            raise ValueError("state actor의 actionable snapshot만 archive할 수 있다")
        _validate_actor_source(record.get("path"), state["actor"], state["project_root"])
        if record.get("path") != _actor_inbox(state["project_root"], state["actor"]):
            raise ValueError("state project_root의 actionable snapshot만 archive할 수 있다")
        snapshot_id = record.get("snapshot_id")
        fingerprint = record.get("snapshot_fingerprint")
        content_sha = record.get("content_sha256")
        artifact = record.get("content_artifact")
        if (not isinstance(snapshot_id, str)
                or not re.fullmatch(r"[0-9a-fA-F]{64}", snapshot_id)
                or not isinstance(fingerprint, str)
                or not re.fullmatch(r"[0-9a-fA-F]{64}", fingerprint)
                or not isinstance(content_sha, str)
                or not re.fullmatch(r"[0-9a-fA-F]{64}", content_sha)
                or not isinstance(artifact, str)):
            raise ValueError("snapshot binding 식별자 또는 content hash가 올바르지 않다")
        binding_root = os.path.realpath(os.path.dirname(binding))
        artifact_path = os.path.realpath(os.path.join(binding_root, artifact))
        if not _path_inside(binding_root, artifact_path):
            raise ValueError("snapshot content artifact가 binding 디렉터리 밖이다")
        try:
            with open(artifact_path, "rb") as fh:
                content = fh.read()
        except OSError as exc:
            raise ValueError("snapshot content artifact가 없다") from exc
        if sha256_bytes(content) != content_sha:
            raise ValueError("snapshot content artifact hash가 다르다")
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()

    key = f"{snapshot_id.lower()}-{content_sha.lower()}"
    archive_path = os.path.join(archive_root, f"inbox-{key}.md")
    metadata_path = os.path.join(archive_root, f"inbox-{key}.meta.json")
    manifest_path = os.path.join(archive_root, f"consumption-{key}.json")
    metadata = {
        "schema": 1,
        "kind": "inbox-execution-archive",
        "run_id": args.run_id,
        "snapshot_id": snapshot_id,
        "snapshot_fingerprint": fingerprint,
        "content_sha256": content_sha.lower(),
        "approval_state": args.approval_state,
        "source_snapshot": binding,
        "source_content_artifact": artifact_path,
        "archive_file": archive_path,
    }
    manifest = {
        "schema": 1,
        "kind": "inbox-consumption",
        "key": f"{snapshot_id.lower()}:{content_sha.lower()}",
        "run_id": args.run_id,
        "snapshot_id": snapshot_id,
        "snapshot_fingerprint": fingerprint,
        "content_sha256": content_sha.lower(),
        "approval_state": args.approval_state,
        "archive_file": archive_path,
        "metadata_file": metadata_path,
    }
    archive_lock = _flock_path(archive_path)
    try:
        if os.path.exists(archive_path):
            with open(archive_path, "rb") as fh:
                if fh.read() != content:
                    raise ValueError("동일 archive 경로의 content가 다르다")
            archive_existing = True
        else:
            atomic_write(archive_path, content, _mutation_check(args, state))
            archive_existing = False
        metadata_existing = _archive_json(metadata_path, metadata)
        manifest_existing = _archive_json(manifest_path, manifest)
        if not metadata_existing:
            atomic_write(metadata_path, json.dumps(
                metadata, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
                _mutation_check(args, state))
        if not manifest_existing:
            atomic_write(manifest_path, json.dumps(
                manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
                _mutation_check(args, state))
    finally:
        fcntl.flock(archive_lock.fileno(), fcntl.LOCK_UN)
        archive_lock.close()
    print(json.dumps({
        "archive": archive_path,
        "metadata": metadata_path,
        "manifest": manifest_path,
        "run_id": args.run_id,
        "snapshot_id": snapshot_id,
        "snapshot_fingerprint": fingerprint,
        "content_sha256": content_sha.lower(),
        "approval_state": args.approval_state,
        "idempotent": archive_existing and metadata_existing and manifest_existing,
    }, ensure_ascii=False, sort_keys=True))
    return 0


def _json_marker(raw, label):
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"{label} marker JSON이 올바르지 않다") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{label} marker JSON이 객체가 아니다")
    return value


def _marker_start(data, position):
    payload_start = position + len(MARKER_START)
    close = data.find(b"\n-->", payload_start)
    if close < 0:
        raise ValueError("start marker의 끝이 없다")
    payload = _json_marker(data[payload_start:close], "start")
    return close + len(b"\n-->"), payload


def _marker_payload(actor, snapshot_id, source_range, selected, units,
                    state="tracked", disposition=None, receipt_id=None,
                    close_proof_sha256=None, close_proof_path=None):
    item_input = _item_identity(actor, source_range, selected)
    item_id = _item_id(item_input)
    payload = {
        "schema": 1, "item_id": item_id, "state": state, **item_input,
        "byte_length": len(selected), "units": units, "snapshot_id": snapshot_id,
    }
    if disposition is not None:
        payload["disposition"] = disposition
        payload["receipt_id"] = receipt_id
    if close_proof_sha256 is not None:
        payload["close_proof_sha256"] = close_proof_sha256
        payload["close_proof_path"] = close_proof_path
    return payload


def _item_identity(actor, source_range, selected):
    return {
        "actor": actor, "source_key": f"inbox/{actor}.md",
        "source_range": source_range,
        "content_sha256": sha256_bytes(selected),
    }


def _item_id(identity):
    return sha256_bytes(json.dumps(
        identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def _encode_start(payload):
    return MARKER_START + json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n-->"


def _item_valid(payload):
    return (
        payload.get("schema") == 1
        and isinstance(payload.get("item_id"), str)
        and re.fullmatch(r"[0-9a-f]{64}", payload["item_id"]) is not None
        and payload.get("state") in ITEM_STATES
        and isinstance(payload.get("actor"), str) and payload["actor"]
        and isinstance(payload.get("snapshot_id"), str) and payload["snapshot_id"]
        and payload.get("source_key") == f"inbox/{payload['actor']}.md"
        and isinstance(payload.get("source_range"), dict)
        and isinstance(payload["source_range"].get("start"), int)
        and isinstance(payload["source_range"].get("end"), int)
        and isinstance(payload.get("content_sha256"), str)
        and re.fullmatch(r"[0-9a-f]{64}", payload["content_sha256"]) is not None
        and isinstance(payload.get("byte_length"), int) and payload["byte_length"] >= 0
        and isinstance(payload.get("units"), list) and payload["units"]
        and all(isinstance(unit, str) and unit for unit in payload["units"])
        and (payload.get("state") != "closed" or (
            isinstance(payload.get("close_proof_sha256"), str)
            and re.fullmatch(r"[0-9a-f]{64}", payload["close_proof_sha256"]) is not None
            and isinstance(payload.get("close_proof_path"), str)
            and payload["close_proof_path"] == (
                ".claude/vault/backlog/tickets/receipts/.proofs/"
                + payload["close_proof_sha256"] + ".json"
            )
        ))
    )


def _scan_bytes(data, source):
    """Return parsed items and all bytes that remain safe new-ticket candidates."""
    items, excluded, recovery = [], [], []
    position = 0
    while True:
        start = data.find(MARKER_START, position)
        unknown = data.find(b"<!-- vault-inbox-item:", position)
        if unknown >= 0 and (start < 0 or unknown < start):
            items.append({"state": "invalid", "reason": "unknown or malformed marker",
                          "byte_range": {"start": unknown, "end": len(data)}})
            recovery.append((unknown, len(data)))
            excluded.append((unknown, len(data)))
            break
        if start < 0:
            break
        try:
            content_start, payload = _marker_start(data, start)
            if data[content_start:content_start + 1] == b"\n":
                content_start += 1
            end = data.find(MARKER_END, content_start)
            nested = data.find(MARKER_START, content_start)
            if end < 0 or (nested >= 0 and nested < end):
                raise ValueError("end marker가 없거나 marker가 중첩됐다")
            content_end = end
            marker_end = end + len(MARKER_END)
            if data[marker_end:marker_end + 1] == b"\n":
                marker_end += 1
            item = {
                "item_id": payload.get("item_id"), "state": payload.get("state"),
                "marker_range": {"start": start, "end": marker_end},
                "payload": payload,
            }
            if not _item_valid(payload):
                raise ValueError("marker payload 계약이 올바르지 않다")
            inside = data[content_start:content_end]
            if payload["state"] == "closed":
                prefix = b"<del>\n"
                raw_start = len(prefix)
                raw_end = raw_start + payload["byte_length"]
                raw = inside[raw_start:raw_end]
                expected_tail = b"</del>\n" if raw.endswith(b"\n") else b"\n</del>\n"
                if not inside.startswith(prefix) or inside[raw_end:] != expected_tail:
                    raise ValueError("closed marker의 완료 표시가 없다")
                if payload.get("disposition") not in TERMINAL_DISPOSITIONS or not payload.get("receipt_id"):
                    raise ValueError("closed marker의 disposition 또는 receipt가 없다")
                raw_offset = raw_start
            else:
                raw = inside[:payload["byte_length"]]
                if inside[payload["byte_length"]:] not in (b"", b"\n"):
                    raise ValueError("tracked marker의 원문 뒤 바이트가 올바르지 않다")
                raw_offset = 0
            if len(raw) != payload["byte_length"] or sha256_bytes(raw) != payload["content_sha256"]:
                item["state"] = "drifted"
                item["reason"] = "marker content hash 또는 byte length가 다르다"
                item["content"] = raw.decode("utf-8", errors="replace")
                item["byte_range"] = {"start": content_start, "end": content_end}
                recovery.append((content_start, content_end))
            else:
                expected = _marker_payload(
                    payload["actor"], payload["snapshot_id"], payload["source_range"],
                    raw, payload["units"], payload["state"], payload.get("disposition"),
                    payload.get("receipt_id"), payload.get("close_proof_sha256"))["item_id"]
                if expected != payload["item_id"]:
                    item["state"] = "invalid"
                    item["reason"] = "item_id가 marker identity와 다르다"
                    recovery.append((content_start, content_end))
                else:
                    item["content"] = raw.decode("utf-8", errors="replace")
                    item["byte_range"] = {
                        "start": content_start + raw_offset,
                        "end": content_start + raw_offset + len(raw),
                    }
            items.append(item)
            excluded.append((start, marker_end))
            position = marker_end
        except ValueError as exc:
            next_start = start + len(MARKER_START)
            items.append({"state": "invalid", "reason": str(exc),
                          "marker_range": {"start": start, "end": next_start}})
            recovery.append((start, len(data)))
            excluded.append((start, len(data)))
            break
    seen = {}
    for item in items:
        item_id = item.get("item_id")
        if item_id and item.get("state") in ITEM_STATES:
            seen.setdefault(item_id, []).append(item)
    for duplicates in seen.values():
        if len(duplicates) > 1:
            for item in duplicates:
                item["state"] = "invalid"
                item["reason"] = "duplicate item_id"
                recovery.append((item["byte_range"]["start"], item["byte_range"]["end"]))
    unmarked_ranges, cursor = [], 0
    for start, end in sorted(excluded):
        if cursor < start:
            unmarked_ranges.append((cursor, start))
        cursor = max(cursor, end)
    if cursor < len(data):
        unmarked_ranges.append((cursor, len(data)))
    ignored_ranges = []
    human_start = len(data)
    offset = 0
    for line in data.splitlines(keepends=True):
        line_end = offset + len(line)
        if line.rstrip(b"\r\n").strip() == b"---":
            human_start = line_end
            ignored_ranges.append({
                "byte_range": {"start": 0, "end": line_end},
                "reason": "template-before-human-input",
            })
            break
        offset = line_end
    candidates = []
    for start, end in unmarked_ranges:
        start = max(start, human_start)
        if start >= end:
            continue
        block_start = start
        offset = start
        for line in data[start:end].splitlines(keepends=True):
            offset += len(line)
            if line.strip():
                continue
            separator_start = offset - len(line)
            _candidate_ranges(data, block_start, separator_start, candidates, ignored_ranges)
            block_start = offset
        _candidate_ranges(data, block_start, end, candidates, ignored_ranges)
    unique = []
    for start, end in sorted(set(candidates)):
        if start >= end:
            continue
        content = data[start:end]
        if content.strip():
            unique.append({"byte_range": {"start": start, "end": end},
                           "content": content.decode("utf-8", errors="replace"),
                           "content_sha256": sha256_bytes(content)})
    manual_review = [
        {"byte_range": {"start": start, "end": end},
         "content": data[start:end].decode("utf-8", errors="replace")}
        for start, end in sorted(set(recovery)) if start < end
    ]
    transformed_ranges = [
        (item["marker_range"]["start"], item["marker_range"]["end"],
         item["payload"]["byte_length"])
        for item in items if item.get("state") in ITEM_STATES
    ]
    transformed_ranges.extend(
        (entry["byte_range"]["start"], entry["byte_range"]["end"], 0)
        for entry in ignored_ranges
    )
    logical_segments, physical = [], 0
    for start, end, logical_length in sorted(transformed_ranges):
        if start < physical:
            raise ValueError("logical range 변환 구간이 겹친다")
        logical_segments.append((physical, start, start - physical))
        logical_segments.append((start, end, logical_length))
        physical = end
    logical_segments.append((physical, len(data), len(data) - physical))
    def logical_offset(position):
        logical = 0
        for start, end, length in logical_segments:
            if position >= end:
                logical += length
            elif position >= start:
                return logical + min(position - start, length)
            else:
                return logical
        return logical
    for candidate in unique:
        byte_range = candidate["byte_range"]
        candidate["logical_byte_range"] = {
            "start": logical_offset(byte_range["start"]),
            "end": logical_offset(byte_range["end"]),
        }
    return items, unique, manual_review, ignored_ranges


def _candidate_ranges(data, start, end, candidates, ignored_ranges):
    """Add non-heading lines from one blank-line-delimited human input block."""
    offset = start
    candidate_start = None
    for line in data[start:end].splitlines(keepends=True):
        line_end = offset + len(line)
        heading = re.match(rb"^[ \t]{0,3}#{1,6}(?:[ \t]+|[ \t]*\r?\n?$)", line) is not None
        if heading:
            if candidate_start is not None:
                candidates.append((candidate_start, offset))
                candidate_start = None
            ignored_ranges.append({
                "byte_range": {"start": offset, "end": line_end},
                "reason": "markdown-heading",
            })
        elif line.strip() and candidate_start is None:
            candidate_start = offset
        offset = line_end
    if candidate_start is not None:
        candidates.append((candidate_start, end))


def scan_inbox(args):
    project_root = _canonical_path(args.project_root)
    source = _canonical_path(args.path)
    _validate_actor_source(source, args.actor, project_root)
    with open(source, "rb") as fh:
        data = fh.read()
    items, candidates, manual_review, ignored_ranges = _scan_bytes(data, source)
    for candidate in candidates:
        byte_range = candidate["byte_range"]
        selected = data[byte_range["start"]:byte_range["end"]]
        candidate["proposed_item_id"] = _item_id(_item_identity(
            args.actor, candidate["logical_byte_range"], selected))
    print(json.dumps({"path": source, "full_file_sha256": sha256_bytes(data),
                      "markers": items, "unmarked_candidates": candidates,
                      "manual_review": manual_review, "ignored_ranges": ignored_ranges},
                     ensure_ascii=False, sort_keys=True))
    return 0


def _utf8_range(data, start, end):
    if start < 0 or end < start or end > len(data):
        raise ValueError("바이트 범위가 올바르지 않다")
    try:
        data[:start].decode("utf-8")
        data[:end].decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("바이트 범위가 UTF-8 문자 경계를 자른다") from exc


def _track_inbox(args, state):
    source = _canonical_path(args.path)
    if args.actor != state["actor"]:
        raise ValueError("track actor는 provider state actor와 같아야 한다")
    _validate_actor_source(source, args.actor, state["project_root"])
    units = args.unit
    if not units or len(set(units)) != len(units):
        raise ValueError("중복 없는 unit ID가 하나 이상 필요하다")
    lock = _flock_path(source)
    try:
        with open(source, "rb") as fh:
            data = fh.read()
        _utf8_range(data, args.start, args.end)
        items, candidates, _, _ = _scan_bytes(data, source)
        existing = next((
            item for item in items
            if item.get("state") == "tracked"
            and item["payload"].get("actor") == args.actor
            and item.get("item_id") == args.item_id
        ), None)
        if existing:
            if args.item_id != existing["item_id"]:
                raise ValueError("proposed item_id가 기존 tracked item과 다르다")
            if existing["payload"].get("units") == units:
                print(json.dumps({"path": source, "item_id": existing["item_id"], "idempotent": True},
                                 ensure_ascii=False, sort_keys=True))
                return 0
            raise ValueError("같은 item ID가 이미 다른 상태 또는 unit으로 존재한다")
        if sha256_bytes(data) != args.expected_hash.lower():
            raise ValueError("expected full-file hash CAS가 실패했다")
        selected = data[args.start:args.end]
        candidate = next((
            value for value in candidates
            if value["byte_range"] == {"start": args.start, "end": args.end}), None)
        if candidate is None:
            raise ValueError("track 범위는 자동 제안된 unmarked 후보 전체여야 한다")
        expected_item_id = _item_id(_item_identity(
            args.actor, candidate["logical_byte_range"], selected))
        if args.item_id != expected_item_id:
            raise ValueError("proposed item_id가 actor/source/range/content identity와 다르다")
        payload = _marker_payload(
            args.actor, args.snapshot_id, candidate["logical_byte_range"], selected, units)
        separator = b"" if selected.endswith(b"\n") else b"\n"
        wrapped = _encode_start(payload) + b"\n" + selected + separator + MARKER_END + b"\n"
        atomic_write(source, data[:args.start] + wrapped + data[args.end:],
                     _mutation_check(args, state))
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
    print(json.dumps({"path": source, "item_id": payload["item_id"], "state": "tracked",
                      "units": units, "idempotent": False}, ensure_ascii=False, sort_keys=True))
    return 0


def _directory_flags():
    flags = os.O_RDONLY | os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    return flags


def _open_directory(path, label):
    try:
        return os.open(path, _directory_flags())
    except OSError as exc:
        raise ValueError(f"{label} 디렉터리를 안전하게 열 수 없다") from exc


def _open_directory_at(parent_fd, name, label):
    try:
        return os.open(name, _directory_flags(), dir_fd=parent_fd)
    except OSError as exc:
        raise ValueError(f"{label} 디렉터리를 안전하게 열 수 없다") from exc


def _canonical_segments(value, label):
    if not isinstance(value, str) or not value or os.path.isabs(value):
        raise ValueError(f"{label} path가 project-relative canonical path가 아니다")
    segments = value.split(os.sep)
    if any(segment in {"", ".", ".."} for segment in segments):
        raise ValueError(f"{label} path가 canonical segment가 아니다")
    return segments


def _read_regular_file_at(parent_fd, name, label):
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(name, flags, dir_fd=parent_fd)
    except OSError as exc:
        raise ValueError(f"{label} 파일을 안전하게 열 수 없다") from exc
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError(f"{label} 파일이 regular file이 아니다")
        chunks = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        data = b"".join(chunks)
    finally:
        os.close(fd)
    return data, {
        "st_dev": info.st_dev, "st_ino": info.st_ino, "st_size": info.st_size,
        "st_mtime_ns": info.st_mtime_ns, "st_mode": info.st_mode,
        "sha256": sha256_bytes(data),
    }


def _read_project_regular_file(project_fd, value, label):
    segments = _canonical_segments(value, label)
    parents = []
    parent_fd = project_fd
    try:
        for segment in segments[:-1]:
            parent_fd = _open_directory_at(parent_fd, segment, label)
            parents.append(parent_fd)
        return _read_regular_file_at(parent_fd, segments[-1], label)
    finally:
        for fd in reversed(parents):
            os.close(fd)


def _same_file_proof(expected, actual):
    return expected == actual


def _receipt_evidence(receipt, project_fd, project_root, actor):
    evidence = receipt.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        raise ValueError("receipt evidence가 비어 있거나 목록이 아니다")
    valid_terminal = False
    disposition = receipt["disposition"]
    proofs = []
    for entry in evidence:
        if not isinstance(entry, dict):
            raise ValueError("receipt evidence 항목이 객체가 아니다")
        kind, path, digest = entry.get("kind"), entry.get("path"), entry.get("sha256")
        if (not isinstance(kind, str) or not isinstance(digest, str)
                or re.fullmatch(r"[0-9a-f]{64}", digest) is None):
            raise ValueError("receipt evidence 기본 필드가 올바르지 않다")
        _, file_proof = _read_project_regular_file(project_fd, path, "receipt evidence")
        if file_proof["sha256"] != digest:
            raise ValueError("receipt evidence hash가 다르다")
        proofs.append({"path": path, "proof": file_proof})
        if disposition == "integrated" and kind == "origin-main":
            commit = entry.get("commit")
            if not isinstance(commit, str) or re.fullmatch(r"[0-9a-f]{40}", commit) is None:
                raise ValueError("origin-main evidence commit이 올바르지 않다")
            if not (path.startswith(".claude/vault/backlog/tickets/")
                    or re.fullmatch(rf"runs/{re.escape(actor)}/[^/]+/(?:manifest|result-card[^/]*)\.json", path)):
                raise ValueError("origin-main evidence path가 run manifest/result-card 또는 ticket이 아니다")
            ancestor = subprocess.run(
                ["git", "-C", project_root, "merge-base",
                 "--is-ancestor", commit, "origin/main"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            if ancestor.returncode != 0:
                raise ValueError("origin-main evidence commit이 origin/main 조상이 아니다")
            valid_terminal = True
        elif disposition in {"accepted", "rejected", "no-action", "cancelled", "superseded"}:
            if kind == "owner-decision":
                if not path.startswith(f"feedback/{actor}/"):
                    raise ValueError("owner-decision evidence path가 actor feedback 아래가 아니다")
                valid_terminal = True
        elif disposition in {"completed", "failed"}:
            if kind == "result-card":
                if not path.startswith(".claude/vault/backlog/tickets/"):
                    raise ValueError("result-card evidence path가 tickets 아래가 아니다")
                valid_terminal = True
    if not valid_terminal:
        raise ValueError("receipt disposition에 맞는 terminal evidence가 없다")
    return proofs


def _receipt_valid(receipt, filename, project_fd, project_root, actor, item):
    if not isinstance(receipt, dict) or receipt.get("schema") != 1:
        raise ValueError("receipt schema가 올바르지 않다")
    receipt_id = receipt.get("receipt_id")
    if (not isinstance(receipt_id, str) or not receipt_id
            or filename != f"{receipt_id}.json" or os.path.basename(receipt_id) != receipt_id):
        raise ValueError("receipt_id와 파일명이 일치하지 않는다")
    if receipt.get("actor") != actor:
        return False
    if receipt.get("item_id") != item["item_id"]:
        raise ValueError("receipt item_id가 tracked marker와 다르다")
    units = receipt.get("units")
    marker_units = item["payload"]["units"]
    if not isinstance(units, list) or not units:
        raise ValueError("receipt units가 비어 있다")
    if any(not isinstance(unit, str) or not unit for unit in units):
        raise ValueError("receipt units에 올바르지 않은 unit이 있다")
    if len(set(units)) != len(units):
        raise ValueError("receipt units에 중복 unit이 있다")
    if not set(units).issubset(set(marker_units)):
        raise ValueError("receipt units에 marker 밖 unit이 있다")
    if receipt.get("disposition") not in TERMINAL_DISPOSITIONS:
        raise ValueError("receipt disposition이 올바르지 않다")
    return _receipt_evidence(receipt, project_fd, project_root, actor), units == marker_units


def _closed_replacement(item, receipt, receipt_proof, proof_path, raw):
    payload = item["payload"]
    closed = _marker_payload(
        payload["actor"], payload["snapshot_id"], payload["source_range"], raw,
        payload["units"], "closed", receipt["disposition"], receipt["receipt_id"],
        receipt_proof["sha256"], proof_path)
    separator = b"" if raw.endswith(b"\n") else b"\n"
    return (_encode_start(closed) + b"\n<del>\n" + raw + separator
            + b"</del>\n" + MARKER_END + b"\n")


def _receipt_directory(path, expected):
    if os.path.realpath(path) != expected:
        raise ValueError("receipt-dir는 canonical tickets/receipts 디렉터리여야 한다")


def _proof_path(receipt_sha256):
    return (f".claude/vault/backlog/tickets/receipts/.proofs/{receipt_sha256}.json",
            f".proofs/{receipt_sha256}.json")


def _preserve_receipt_proof(receipt_fd, receipt_sha256, raw):
    try:
        os.mkdir(".proofs", 0o755, dir_fd=receipt_fd)
    except FileExistsError:
        pass
    except OSError as exc:
        raise ValueError("receipt proof 디렉터리를 만들 수 없다") from exc
    proof_fd = _open_directory_at(receipt_fd, ".proofs", "receipt proof")
    filename = f"{receipt_sha256}.json"
    temporary = f".tmp-{receipt_sha256}-{os.getpid()}-{uuid.uuid4().hex}"
    try:
        try:
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                         | getattr(os, "O_NOFOLLOW", 0), 0o600, dir_fd=proof_fd)
            try:
                offset = 0
                while offset < len(raw):
                    offset += os.write(fd, raw[offset:])
                os.fchmod(fd, 0o444)
                os.fsync(fd)
            finally:
                os.close(fd)
            try:
                os.link(temporary, filename, src_dir_fd=proof_fd, dst_dir_fd=proof_fd,
                        follow_symlinks=False)
            except FileExistsError:
                existing, proof = _read_regular_file_at(proof_fd, filename, "receipt proof")
                if proof["sha256"] != receipt_sha256 or existing != raw:
                    raise ValueError("기존 receipt proof bytes가 다르다")
            except OSError as exc:
                raise ValueError("receipt proof를 원자 게시할 수 없다") from exc
            os.fsync(proof_fd)
        finally:
            try:
                os.unlink(temporary, dir_fd=proof_fd)
            except FileNotFoundError:
                pass
        persisted, proof = _read_regular_file_at(proof_fd, filename, "receipt proof")
        if (proof["sha256"] != receipt_sha256 or persisted != raw
                or stat.S_IMODE(proof["st_mode"]) != 0o444):
            raise ValueError("저장된 receipt proof bytes가 다르다")
        os.fsync(proof_fd)
        os.fsync(receipt_fd)
    finally:
        os.close(proof_fd)
    return _proof_path(receipt_sha256)


def _verify_receipt_proof(receipt_fd, receipt_sha256, proof_path):
    expected_path, relative = _proof_path(receipt_sha256)
    if proof_path != expected_path:
        raise ValueError("closed marker의 receipt proof path가 다르다")
    proof_fd = _open_directory_at(receipt_fd, ".proofs", "receipt proof")
    try:
        _, proof = _read_regular_file_at(proof_fd, relative.split("/", 1)[1], "receipt proof")
    finally:
        os.close(proof_fd)
    if proof["sha256"] != receipt_sha256 or stat.S_IMODE(proof["st_mode"]) != 0o444:
        raise ValueError("closed marker의 receipt proof hash가 다르다")


def _revalidate_receipt_inputs(applications, receipt_fd, project_fd):
    for application in applications:
        _, proof = _read_regular_file_at(receipt_fd, application["receipt_name"], "receipt")
        if not _same_file_proof(application["receipt_proof"], proof):
            raise ValueError("receipt가 검증 뒤 변경됐다")
        for evidence in application["evidence"]:
            _, proof = _read_project_regular_file(project_fd, evidence["path"], "receipt evidence")
            if not _same_file_proof(evidence["proof"], proof):
                raise ValueError("receipt evidence가 검증 뒤 변경됐다")


def _reconcile_inbox(args, state):
    if args.actor != state["actor"]:
        raise ValueError("reconcile actor는 provider state actor와 같아야 한다")
    source = _canonical_path(args.path)
    _validate_actor_source(source, args.actor, state["project_root"])
    expected_dir = os.path.join(
        state["project_root"], ".claude", "vault", "backlog", "tickets", "receipts")
    receipt_dir = os.path.abspath(args.receipt_dir)
    _receipt_directory(receipt_dir, expected_dir)
    result = {"closed": [], "already_closed": [], "partial": [],
              "skipped": [], "manual_review": []}
    project_fd = None
    receipt_fd = None
    opened_receipt_parents = []
    lock = _flock_path(source)
    try:
        project_fd = _open_directory(state["project_root"], "project root")
        receipt_fd = project_fd
        for component in (".claude", "vault", "backlog", "tickets", "receipts"):
            receipt_fd = _open_directory_at(receipt_fd, component, "receipt")
            opened_receipt_parents.append(receipt_fd)
        with open(source, "rb") as fh:
            data = fh.read()
        items, _, scan_review, _ = _scan_bytes(data, source)
        result["manual_review"].extend(scan_review)
        tracked = {entry.get("item_id"): entry for entry in items if entry.get("state") == "tracked"}
        closed = {entry.get("item_id"): entry for entry in items if entry.get("state") == "closed"}
        replacements, applications = [], []
        receipt_entries = []
        for filename in sorted(name for name in os.listdir(receipt_fd) if name.endswith(".json")):
            try:
                receipt_bytes, receipt_proof = _read_regular_file_at(receipt_fd, filename, "receipt")
                receipt = json.loads(receipt_bytes.decode("utf-8"))
                receipt_id = receipt.get("receipt_id")
                receipt_actor = receipt.get("actor")
                if receipt_actor != args.actor:
                    result["skipped"].append(receipt_id if isinstance(receipt_id, str) else filename)
                    continue
                item_id = receipt.get("item_id")
                item = closed.get(item_id) or tracked.get(item_id)
                if item is None:
                    raise ValueError("receipt의 tracked item이 없다")
                evidence, full = _receipt_valid(
                    receipt, filename, project_fd, state["project_root"], args.actor, item)
                receipt_entries.append({
                    "filename": filename, "receipt": receipt, "bytes": receipt_bytes,
                    "proof": receipt_proof, "item": item, "item_id": item_id,
                    "evidence": evidence, "full": full, "closed": item_id in closed,
                })
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                result["manual_review"].append({"receipt": filename, "reason": str(exc)})

        partials_by_item = {}
        for entry in receipt_entries:
            if not entry["full"]:
                partials_by_item.setdefault(entry["item_id"], []).append(entry)
        partial_conflicts = {}
        for item_id, entries in partials_by_item.items():
            conflicted = set()
            for index, entry in enumerate(entries):
                units = set(entry["receipt"]["units"])
                for other in entries[index + 1:]:
                    if units & set(other["receipt"]["units"]):
                        conflicted.update((entry["filename"], other["filename"]))
            if conflicted:
                partial_conflicts[item_id] = conflicted

        for entry in receipt_entries:
            filename = entry["filename"]
            receipt = entry["receipt"]
            receipt_bytes = entry["bytes"]
            receipt_proof = entry["proof"]
            item = entry["item"]
            item_id = entry["item_id"]
            if not entry["full"]:
                if item_id in partial_conflicts:
                    result["manual_review"].append({
                        "receipt": filename,
                        "reason": "같은 item의 partial receipt units가 겹친다",
                    })
                else:
                    result["partial"].append({
                        "receipt_id": receipt["receipt_id"],
                        "item_id": item_id,
                        "units": receipt["units"],
                    })
                continue
            if item_id in tracked and item_id in partial_conflicts:
                result["manual_review"].append({
                    "receipt": filename,
                    "reason": "같은 item의 충돌하는 partial receipt가 있다",
                })
                continue
            if item_id in closed:
                try:
                    _verify_receipt_proof(
                        receipt_fd, closed[item_id]["payload"]["close_proof_sha256"],
                        closed[item_id]["payload"].get("close_proof_path"))
                    if (closed[item_id]["payload"].get("receipt_id") == receipt["receipt_id"]
                            and closed[item_id]["payload"].get("close_proof_sha256") == receipt_proof["sha256"]):
                        result["already_closed"].append(receipt["receipt_id"])
                    else:
                        raise ValueError("tracked item의 closed receipt 또는 proof가 다르다")
                except (OSError, ValueError, json.JSONDecodeError) as exc:
                    result["manual_review"].append({"receipt": filename, "reason": str(exc)})
                continue
            try:
                proof_path, _ = _preserve_receipt_proof(
                    receipt_fd, receipt_proof["sha256"], receipt_bytes)
                raw_range = item["byte_range"]
                raw = data[raw_range["start"]:raw_range["end"]]
                replacements.append((item["marker_range"]["start"], item["marker_range"]["end"],
                                     _closed_replacement(item, receipt, receipt_proof, proof_path, raw)))
                applications.append({
                    "receipt_name": filename, "receipt_proof": receipt_proof,
                    "evidence": entry["evidence"],
                })
                del tracked[item_id]
                closed[item_id] = {**item, "payload": {
                    **item["payload"], "receipt_id": receipt["receipt_id"],
                    "close_proof_sha256": receipt_proof["sha256"],
                    "close_proof_path": proof_path,
                }}
                result["closed"].append(receipt["receipt_id"])
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                result["manual_review"].append({"receipt": filename, "reason": str(exc)})
        if replacements:
            updated = data
            for start, end, replacement in sorted(replacements, reverse=True):
                updated = updated[:start] + replacement + updated[end:]
            atomic_write(source, updated, lambda: (
                _state_owner_check(args, state),
                _revalidate_receipt_inputs(applications, receipt_fd, project_fd),
            ))
    finally:
        if receipt_fd is not None:
            for fd in reversed(opened_receipt_parents):
                os.close(fd)
        if project_fd is not None:
            os.close(project_fd)
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


def snapshot_inbox(args):
    with _provider_owner_lock(args) as state:
        return _snapshot_inbox(args, state)


def snapshot_inbox_set(args):
    with _provider_owner_lock(args) as state:
        return _snapshot_inbox_set(args, state)


def snapshot_status(args):
    with _provider_owner_lock(args) as state:
        return _snapshot_status(args, state)


def archive_inbox(args):
    with _provider_owner_lock(args) as state:
        return _archive_inbox(args, state)


def track_inbox(args):
    with _provider_owner_lock(args) as state:
        return _track_inbox(args, state)


def reconcile_inbox(args):
    with _provider_owner_lock(args) as state:
        return _reconcile_inbox(args, state)


def _add_owner_proof(command):
    command.add_argument("--provider-state", required=True)
    command.add_argument("--provider-job", default="sweep")
    command.add_argument("--owner-token", required=True)
    command.add_argument("--fencing", required=True, type=int)
    command.add_argument("--run-id", required=True)
    command.add_argument("--contract-hash", required=True)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    snap = sub.add_parser("snapshot-inbox")
    _add_owner_proof(snap)
    snap.add_argument("--contract-path", default=CONTRACT_DEFAULT)
    snap.add_argument("--actor", required=True)
    snap.add_argument("--role", required=True, choices=sorted(INBOX_ROLES))
    snap.add_argument("--path", default=INBOX_DEFAULT)
    snap.add_argument("--start", type=int, default=None)
    snap.add_argument("--end", type=int, default=None)
    snap.add_argument("--read-time", default=None)
    snap.add_argument("--out-dir", "--snapshot-dir", dest="out_dir", default=os.path.join(
        ROOT, ".claude", "vault", "backlog", "night-runtime", "snapshots"))
    snap_set = sub.add_parser("snapshot-inbox-set")
    _add_owner_proof(snap_set)
    snap_set.add_argument("--contract-path", default=CONTRACT_DEFAULT)
    snap_set.add_argument("--actor", required=True)
    snap_set.add_argument("--actors", default="jh,hs")
    snap_set.add_argument("--inbox-dir", default=os.path.join(ROOT, ".claude", "vault", "inbox"))
    snap_set.add_argument("--start", type=int, default=None)
    snap_set.add_argument("--end", type=int, default=None)
    snap_set.add_argument("--read-time", default=None)
    snap_set.add_argument("--out-dir", "--snapshot-dir", dest="out_dir", default=os.path.join(
        ROOT, ".claude", "vault", "backlog", "night-runtime", "snapshots"))
    status = sub.add_parser("snapshot-status")
    _add_owner_proof(status)
    status.add_argument("--snapshot-fingerprint", required=True)
    status.add_argument("--snapshot-id", default=None)
    status.add_argument("--snapshot-path", default=None)
    status.add_argument("--status", required=True)
    status.add_argument("--read-time", default=None)
    status.add_argument("--out-dir", "--snapshot-dir", dest="out_dir", default=os.path.join(
        ROOT, ".claude", "vault", "backlog", "night-runtime", "snapshots"))
    archive = sub.add_parser("archive-inbox")
    _add_owner_proof(archive)
    archive.add_argument("--snapshot-path", "--snapshot-binding", dest="snapshot_path", required=True)
    archive.add_argument("--archive-root", required=True)
    archive.add_argument("--approval-state", "--status", dest="approval_state", required=True)
    scan = sub.add_parser("scan-inbox")
    scan.add_argument("--path", required=True)
    scan.add_argument("--actor", required=True)
    scan.add_argument("--project-root", default=ROOT)
    track = sub.add_parser("track-inbox")
    _add_owner_proof(track)
    track.add_argument("--path", required=True)
    track.add_argument("--actor", required=True)
    track.add_argument("--snapshot-id", required=True)
    track.add_argument("--item-id", required=True)
    track.add_argument("--expected-hash", required=True)
    track.add_argument("--start", required=True, type=int)
    track.add_argument("--end", required=True, type=int)
    track.add_argument("--unit", action="append", required=True)
    reconcile = sub.add_parser("reconcile-inbox")
    _add_owner_proof(reconcile)
    reconcile.add_argument("--actor", required=True)
    reconcile.add_argument("--path", required=True)
    reconcile.add_argument("--receipt-dir", required=True)
    args = parser.parse_args()
    try:
        if args.command == "snapshot-inbox":
            return snapshot_inbox(args)
        if args.command == "snapshot-inbox-set":
            return snapshot_inbox_set(args)
        if args.command == "snapshot-status":
            return snapshot_status(args)
        if args.command == "archive-inbox":
            return archive_inbox(args)
        if args.command == "scan-inbox":
            return scan_inbox(args)
        if args.command == "track-inbox":
            return track_inbox(args)
        return reconcile_inbox(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
