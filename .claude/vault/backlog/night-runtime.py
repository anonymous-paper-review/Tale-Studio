#!/usr/bin/env python3
"""결과 우선 밤 루프의 입력 스냅샷과 최소 상태 기록 도구."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
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
ARCHIVE_APPROVAL_STATES = {"reported", "awaiting-owner-review"}


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


def _path_inside(root, candidate):
    return candidate == root or candidate.startswith(root + os.sep)


def _archive_json(path, expected):
    if not os.path.exists(path):
        return False
    existing = _read_record(path)
    if existing != expected:
        raise ValueError("동일 archive/manifest 경로의 내용이 다르다")
    return True


def archive_inbox(args):
    """Archive immutable snapshot bytes without touching the live inbox."""
    binding = os.path.realpath(os.path.abspath(os.path.expanduser(args.snapshot_path)))
    if not os.path.isfile(binding):
        raise ValueError("snapshot binding 파일이 없다")
    archive_root = os.path.realpath(os.path.abspath(os.path.expanduser(args.archive_root)))
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
            atomic_write(archive_path, content)
            archive_existing = False
        metadata_existing = _archive_json(metadata_path, metadata)
        manifest_existing = _archive_json(manifest_path, manifest)
        if not metadata_existing:
            atomic_write(metadata_path, json.dumps(
                metadata, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
        if not manifest_existing:
            atomic_write(manifest_path, json.dumps(
                manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
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
    archive = sub.add_parser("archive-inbox")
    archive.add_argument("--snapshot-path", "--snapshot-binding", dest="snapshot_path", required=True)
    archive.add_argument("--run-id", required=True)
    archive.add_argument("--archive-root", required=True)
    archive.add_argument("--approval-state", "--status", dest="approval_state", required=True)
    args = parser.parse_args()
    try:
        if args.command == "snapshot-inbox":
            return snapshot_inbox(args)
        if args.command == "snapshot-status":
            return snapshot_status(args)
        return archive_inbox(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
