#!/usr/bin/env python3
"""티켓 완료 영수증 생성기. inbox를 수정하지 않는다."""
import argparse, hashlib, json, os, re, secrets, subprocess, sys

DISPOSITIONS = {"integrated","accepted","rejected","no-action","cancelled","superseded","completed","failed"}
ACTORS = ("jh","hs")

def sha256(path):
    with open(path,"rb") as f: return hashlib.sha256(f.read()).hexdigest()

def receipt_id(item_id, units):
    canonical = json.dumps({"item_id": item_id, "units": sorted(units)},
                           ensure_ascii=False, sort_keys=True, separators=(",",":"))
    suffix = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    return f"{item_id[:16]}-{suffix}"

def scan(project, actor):
    runtime = os.path.join(project, ".claude/vault/backlog/night-runtime.py")
    inbox = os.path.join(project, f".claude/vault/inbox/{actor}.md")
    return json.loads(subprocess.check_output(
        [sys.executable, runtime, "scan-inbox", "--actor", actor,
         "--path", inbox, "--project-root", project], text=True))

def freeze_evidence(project, receipt_dir, evidence):
    """근거 파일의 원문 바이트를 receipt 디렉터리 안 content-addressed 사본으로 얼려 둔다.
    재검증(night-runtime.py의 reconcile-inbox)이 살아 있는 원본 대신 이 사본과 대조하므로
    근거 파일이 이후 편집돼도(오너 판정 추가 등) 지문이 썩지 않는다."""
    frozen_dir = os.path.join(receipt_dir, ".evidence")
    os.makedirs(frozen_dir, 0o755, exist_ok=True)
    for entry in evidence:
        digest = entry["sha256"]
        target = os.path.join(frozen_dir, f"{digest}.bin")
        if os.path.exists(target):
            continue
        abs_path = os.path.join(project, entry["path"])
        with open(abs_path, "rb") as f:
            raw = f.read()
        if hashlib.sha256(raw).hexdigest() != digest:
            print(f"evidence 파일이 스캔 뒤 바뀌었다: {entry['path']}", file=sys.stderr)
            sys.exit(1)
        temp = os.path.join(frozen_dir, f".tmp-{digest}-{os.getpid()}-{secrets.token_hex(4)}")
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(raw); f.flush(); os.fsync(f.fileno())
            os.chmod(temp, 0o444)
            try:
                os.link(temp, target)
            except FileExistsError:
                pass
        finally:
            try:
                os.unlink(temp)
            except FileNotFoundError:
                pass


def main():
    p = argparse.ArgumentParser(description="canonical receipt 생성 (inbox 무변경)")
    p.add_argument("--project", default=os.getcwd())
    p.add_argument("--actor", required=True, choices=ACTORS)
    p.add_argument("--unit", required=True, action="append", dest="units",
                   help="완료된 ticket-id (반복 가능)")
    p.add_argument("--disposition", required=True, choices=sorted(DISPOSITIONS))
    p.add_argument("--commit", help="integrated용 40자리 hex commit")
    p.add_argument("--evidence", action="append", default=[],
                   help="project-relative evidence 경로 (반복 가능)")
    p.add_argument("--all-units-done", action="store_true",
                   help="marker의 모든 unit이 끝난 것으로 간주")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    project = os.path.realpath(a.project)
    unit_set = set(a.units)

    # scan으로 해당 unit을 포함하는 tracked marker 찾기
    data = scan(project, a.actor)
    targets = []
    available_units = set()
    for m in data["markers"]:
        if m["state"] != "tracked": continue
        marker_units = m["payload"]["units"]
        available_units.update(marker_units)
        if unit_set & set(marker_units):
            targets.append(m)

    unmatched = sorted(unit_set - available_units)
    if unmatched:
        print(f"marker와 겹치지 않는 unit이 있다: {', '.join(unmatched)}", file=sys.stderr)
        return 1
    if not targets:
        print(f"unit {a.units}를 포함하는 tracked marker가 없다", file=sys.stderr)
        return 1
    if a.all_units_done:
        incomplete = [
            m["item_id"] for m in targets
            if not set(m["payload"]["units"]).issubset(unit_set)
        ]
        if incomplete:
            print(
                "--all-units-done을 쓰려면 대상 marker의 모든 unit을 --unit으로 지정해야 한다: "
                + ", ".join(incomplete),
                file=sys.stderr,
            )
            return 1

    # evidence 구성
    evidence = []
    for path in a.evidence:
        abs_path = os.path.join(project, path)
        if not os.path.isfile(abs_path):
            print(f"evidence 파일이 없다: {path}", file=sys.stderr); return 1
        entry = {"kind": "result-card", "path": path, "sha256": sha256(abs_path)}
        if a.disposition == "integrated":
            if not a.commit:
                print("integrated는 --commit이 필요하다", file=sys.stderr); return 1
            entry["kind"] = "origin-main"
            entry["commit"] = a.commit
        elif a.disposition in {"accepted","rejected","no-action","cancelled","superseded"}:
            entry["kind"] = "owner-decision"
        evidence.append(entry)

    # commit 증거 자동 추가
    if a.disposition == "integrated" and a.commit:
        if not re.fullmatch(r"[0-9a-f]{40}", a.commit):
            print("commit은 40자리 hex여야 한다", file=sys.stderr); return 1
        r = subprocess.run(["git","-C",project,"merge-base","--is-ancestor",a.commit,"origin/main"],
                           capture_output=True)
        if r.returncode != 0:
            print(f"commit {a.commit}이 origin/main 조상이 아니다", file=sys.stderr); return 1
        if not any(e.get("kind") == "origin-main" for e in evidence):
            for u in a.units:
                ticket_path = f".claude/vault/backlog/tickets/{u}.md"
                abs_ticket = os.path.join(project, ticket_path)
                if os.path.isfile(abs_ticket):
                    evidence.append({"kind":"origin-main","commit":a.commit,
                                     "path":ticket_path,"sha256":sha256(abs_ticket)})
                    break
            else:
                print("origin-main evidence에 쓸 ticket/manifest 파일이 없다", file=sys.stderr); return 1

    if not evidence:
        print("evidence가 비어 있다 (--evidence 또는 --commit 필요)", file=sys.stderr); return 1

    # 각 marker에 대해 receipt 생성
    receipt_dir = os.path.join(project, ".claude/vault/backlog/tickets/receipts")
    os.makedirs(receipt_dir, exist_ok=True)
    if not a.dry_run:
        freeze_evidence(project, receipt_dir, evidence)
    written = []
    skipped = []
    for m in targets:
        payload = m["payload"]
        marker_units = payload["units"]
        receipt_units = marker_units if a.all_units_done else [
            unit for unit in marker_units if unit in unit_set
        ]
        receipt_id_value = receipt_id(payload["item_id"], receipt_units)
        receipt = {
            "schema": 1, "receipt_id": receipt_id_value, "actor": a.actor,
            "item_id": payload["item_id"], "units": receipt_units,
            "disposition": a.disposition, "evidence": evidence,
        }
        path = os.path.join(receipt_dir, f"{receipt_id_value}.json")
        raw = json.dumps(receipt, ensure_ascii=False, sort_keys=True, separators=(",",":")).encode()

        if a.dry_run:
            written.append({"receipt_id": receipt_id_value, "path": path, "dry_run": True})
            print(json.dumps(receipt, ensure_ascii=False, indent=2))
            continue

        if os.path.exists(path):
            existing = open(path, "rb").read()
            if existing == raw:
                written.append({"receipt_id": receipt_id_value, "path": path, "idempotent": True})
                continue
            print(f"같은 이름의 다른 receipt가 이미 있다: {path}", file=sys.stderr); return 1

        temp = path + f".tmp-{os.getpid()}-{secrets.token_hex(4)}"
        with open(temp, "wb") as f:
            f.write(raw); f.flush(); os.fsync(f.fileno())
        os.replace(temp, path)
        written.append({"receipt_id": receipt_id_value, "path": path})

    print(json.dumps({"written": written, "skipped": skipped}, ensure_ascii=False, indent=2))
    if not a.dry_run and written:
        print(f"\n실제 close는 다음 밤 실행의 reconcile-inbox가 수행한다. inbox는 수정하지 않았다.")
    return 0

if __name__ == "__main__": sys.exit(main() or 0)
