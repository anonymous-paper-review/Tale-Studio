#!/usr/bin/env python3
"""결과 우선 밤 루프의 입력 스냅샷과 최소 상태 기록 도구."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import sys
import uuid

UTC = dt.timezone.utc
ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
INBOX_DEFAULT = os.path.join(ROOT, ".claude", "vault", "_INBOX.md")
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


def atomic_write(path, data):
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
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


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


def _read_record(path):
    with open(path, encoding="utf-8") as fh:
        record = json.load(fh)
    if not isinstance(record, dict):
        raise ValueError("snapshot 기록이 객체가 아니다")
    return record


def snapshot_inbox(args):
    source = os.path.realpath(os.path.abspath(os.path.expanduser(args.path)))
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
    read_time = parse_read_time(args.read_time)
    if args.contract_hash:
        supplied_hash = args.contract_hash
    else:
        supplied_hash = contract_hash(args.contract_path)
    if not isinstance(supplied_hash, str) or not supplied_hash or len(supplied_hash) > 256:
        raise ValueError("contract-hash가 비어 있거나 너무 길다")
    contract_value = supplied_hash.lower()
    binding = _binding_digest(fingerprint, args.run_id, contract_value)
    out_dir = os.path.realpath(os.path.abspath(os.path.expanduser(args.out_dir)))
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
            atomic_write(content_target, selected)
    finally:
        fcntl.flock(content_lock.fileno(), fcntl.LOCK_UN)
        content_lock.close()
    snapshot_id = sha256_bytes(
        f"{fingerprint}\n{args.run_id}\n{contract_value}".encode("utf-8")
    )
    record = {
        "schema": 1,
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
            for key in ("run_id", "contract_hash", "snapshot_fingerprint",
                        "content_sha256", "content_artifact", "path", "byte_range"):
                if existing.get(key) != record[key]:
                    raise ValueError("동일 binding 파일의 내용이 다르다")
            record = existing
        else:
            atomic_write(target, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    finally:
        fcntl.flock(binding_lock.fileno(), fcntl.LOCK_UN)
        binding_lock.close()
    print(json.dumps({"snapshot": target, **record}, ensure_ascii=False, sort_keys=True))
    return 0


def snapshot_status(args):
    fingerprint = args.snapshot_fingerprint
    out_dir = os.path.realpath(os.path.abspath(os.path.expanduser(args.out_dir)))
    if args.snapshot_path:
        target = os.path.realpath(os.path.abspath(os.path.expanduser(args.snapshot_path)))
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
        old = record.get("status")
        if old not in VALID_STATUSES or args.status not in VALID_STATUSES:
            raise ValueError("snapshot status가 올바르지 않다")
        if args.status != old and args.status not in TRANSITIONS[old]:
            raise ValueError(f"허용되지 않은 상태 전이: {old} -> {args.status}")
        record["status"] = args.status
        record["status_changed_at"] = parse_read_time(args.read_time)
        atomic_write(target, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    finally:
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
    print(json.dumps({"snapshot": target, **record}, ensure_ascii=False, sort_keys=True))
    return 0


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    snap = sub.add_parser("snapshot-inbox")
    snap.add_argument("--run-id", required=True)
    snap.add_argument("--contract-hash", default=None)
    snap.add_argument("--contract-path", default=CONTRACT_DEFAULT)
    snap.add_argument("--path", default=INBOX_DEFAULT)
    snap.add_argument("--start", type=int, default=None)
    snap.add_argument("--end", type=int, default=None)
    snap.add_argument("--read-time", default=None)
    snap.add_argument("--out-dir", "--snapshot-dir", dest="out_dir", default=os.path.join(
        ROOT, ".claude", "vault", "backlog", "night-runtime", "snapshots"))
    status = sub.add_parser("snapshot-status")
    status.add_argument("--snapshot-fingerprint", required=True)
    status.add_argument("--snapshot-id", default=None)
    status.add_argument("--snapshot-path", default=None)
    status.add_argument("--run-id", default=None)
    status.add_argument("--contract-hash", default=None)
    status.add_argument("--status", required=True)
    status.add_argument("--read-time", default=None)
    status.add_argument("--out-dir", "--snapshot-dir", dest="out_dir", default=os.path.join(
        ROOT, ".claude", "vault", "backlog", "night-runtime", "snapshots"))
    args = parser.parse_args()
    try:
        if args.command == "snapshot-inbox":
            return snapshot_inbox(args)
        return snapshot_status(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
