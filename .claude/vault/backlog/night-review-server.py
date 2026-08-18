#!/usr/bin/env python3
"""로컬 리뷰 서버 — report HTML의 merge/reject/feedback 버튼을 받아주는 127.0.0.1 전용 기록기.

- 서버 시작 시 actor가 고정되고, 버튼 이벤트는 `feedback/<actor>/<run-id>/`에
  append-only JSON으로만 쌓인다. 다음 밤 실행이 이 폴더를 읽는다.
- git commit/push는 하지 않는다. 사람이 확인 후 push한다.
- 127.0.0.1 고정. 원격 노출 없음.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ACTOR_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,31}")
RUN_ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
DECISIONS = {"merge", "reject", "feedback"}
STATIC_PREFIXES = ("runs", "feedback")


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def check_actor(value):
    if not isinstance(value, str) or not ACTOR_RE.fullmatch(value):
        raise ValueError("actor가 올바르지 않다 (소문자·숫자·하이픈, 32자 이하)")
    return value


def check_run_id(value):
    if not isinstance(value, str) or not RUN_ID_RE.fullmatch(value):
        raise ValueError("run_id가 올바르지 않다")
    return value


def append_event(directory, event):
    """append-only: 새 파일만 만든다. 기존 파일은 절대 수정·삭제하지 않는다."""
    os.makedirs(directory, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = os.path.join(directory, f"{stamp}-{uuid.uuid4().hex[:8]}.json")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(path, flags, 0o644)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(event, fh, ensure_ascii=False, sort_keys=True, indent=2)
        fh.write("\n")
        fh.flush()
        os.fsync(fh.fileno())
    return path


class ReviewHandler(BaseHTTPRequestHandler):
    server_version = "NightReview/1"
    # 서버 인스턴스가 채워준다.
    project = ROOT
    actor = "owner"

    def log_message(self, fmt, *args):  # 조용히 — launchd 로그를 더럽히지 않는다
        sys.stderr.write("[review] " + (fmt % args) + "\n")

    def _cors(self):
        # 정적 report는 file:// 로도 열린다(origin "null"). 로컬 전용 서버라 * 허용.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status, value):
        body = (json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ---- 읽기 ----

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/health":
            return self._json(200, {"ok": True, "actor_id": self.actor,
                                    "project": self.project})
        if path == "/" or path == "/index.html":
            return self._index()
        return self._static(path)

    def _index(self):
        rows = []
        runs_root = os.path.join(self.project, "runs")
        if os.path.isdir(runs_root):
            for actor in sorted(os.listdir(runs_root)):
                actor_dir = os.path.join(runs_root, actor)
                if not os.path.isdir(actor_dir):
                    continue
                for run in sorted(os.listdir(actor_dir), reverse=True):
                    report = os.path.join(actor_dir, run, "report.html")
                    if os.path.isfile(report):
                        rel = f"/runs/{actor}/{run}/report.html"
                        mine = " (내 실행)" if actor == self.actor else ""
                        rows.append(f'<li><a href="{rel}">{actor} · {run}</a>{mine}</li>')
        body = (
            "<!doctype html><meta charset=utf-8><title>밤 실행 리뷰</title>"
            f"<h1>밤 실행 리뷰 — 현재 actor: {self.actor}</h1>"
            "<p>버튼 판정은 feedback 폴더에 기록되고 다음 밤 실행이 읽는다.</p>"
            f"<ul>{''.join(rows) or '<li>아직 report가 없다</li>'}</ul>"
        ).encode("utf-8")
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _static(self, path):
        relative = path.lstrip("/")
        first = relative.split("/", 1)[0]
        if first not in STATIC_PREFIXES:
            return self._json(404, {"error": "not-found"})
        target = os.path.realpath(os.path.join(self.project, relative))
        allowed = os.path.realpath(os.path.join(self.project, first))
        if not (target == allowed or target.startswith(allowed + os.sep)):
            return self._json(403, {"error": "path-outside-project"})
        if not os.path.isfile(target):
            return self._json(404, {"error": "not-found"})
        content_type = "application/octet-stream"
        if target.endswith(".html"):
            content_type = "text/html; charset=utf-8"
        elif target.endswith(".json"):
            content_type = "application/json; charset=utf-8"
        elif target.endswith(".md"):
            content_type = "text/plain; charset=utf-8"
        with open(target, "rb") as fh:
            body = fh.read()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- 쓰기 ----

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 64 * 1024:
            raise ValueError("본문 길이가 올바르지 않다")
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("본문이 JSON 객체가 아니다")
        return payload

    def do_POST(self):
        try:
            if self.path == "/api/feedback":
                return self._post_feedback()
            return self._json(404, {"error": "not-found"})
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        except OSError as exc:
            return self._json(500, {"error": f"기록 실패: {exc}"})

    def _post_feedback(self):
        payload = self._read_body()
        run_id = check_run_id(payload.get("run_id"))
        decision = payload.get("decision")
        if decision not in DECISIONS:
            raise ValueError("decision은 merge/reject/feedback 중 하나다")
        target_actor = payload.get("actor_id")
        if target_actor is not None and target_actor != self.actor:
            raise ValueError(f"이 서버는 actor={self.actor}의 판정만 기록한다")
        event = {
            "schema": 1,
            "kind": "night-feedback",
            "actor_id": self.actor,
            "run_id": run_id,
            "card_id": payload.get("card_id"),
            "decision": decision,
            "note": payload.get("note"),
            "created_at": utc_now(),
        }
        directory = os.path.join(self.project, "feedback", self.actor, run_id)
        path = append_event(directory, event)
        return self._json(201, {"ok": True, "path": os.path.relpath(path, self.project),
                                "consumer": f"{self.actor}의 다음 밤 실행만 이 기록을 읽는다"})


def serve(project, actor, port):
    handler = type("BoundHandler", (ReviewHandler,), {"project": project, "actor": actor})
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    return server


def self_test(project, actor):
    """임시 프로젝트 루트에서 feedback 기록 경로를 검증한다. 네트워크는 loopback만."""
    import urllib.request

    ReviewHandler.log_message = lambda *a, **k: None  # 검증 출력에 요청 로그를 섞지 않는다
    server = serve(project, actor, 0)  # ephemeral port
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"
    try:
        def post(path, payload):
            data = json.dumps(payload).encode("utf-8")
            request = urllib.request.Request(
                base + path, data=data, headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    return response.status, json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                return exc.code, json.loads(exc.read().decode("utf-8"))

        with urllib.request.urlopen(base + "/health", timeout=5) as response:
            health = json.loads(response.read().decode("utf-8"))
        assert health["actor_id"] == actor, health

        run_id = "night-2026-01-01-selftest"
        status, body = post("/api/feedback", {"run_id": run_id, "decision": "merge",
                                              "card_id": "card-1", "note": "self-test"})
        assert status == 201, (status, body)
        feedback_path = os.path.join(project, body["path"])
        assert os.path.isfile(feedback_path), feedback_path
        assert f"feedback{os.sep}{actor}{os.sep}{run_id}" in feedback_path

        # 다른 actor의 run 판정은 거부되어야 한다 (자동 소비 금지 경계).
        other = "friend" if actor != "friend" else "owner"
        status, body = post("/api/feedback", {"run_id": run_id, "decision": "merge",
                                              "actor_id": other})
        assert status == 400, (status, body)

        print(json.dumps({"self_test": "pass", "actor_id": actor,
                          "feedback_event": os.path.relpath(feedback_path, project)},
                         ensure_ascii=False))
        return 0
    finally:
        server.shutdown()
        server.server_close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default=ROOT)
    parser.add_argument("--actor", "--actor-id", dest="actor", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--self-test", action="store_true",
                        help="임시 디렉터리에서 기록 경로를 검증하고 종료한다")
    args = parser.parse_args()
    actor = check_actor(args.actor or os.environ.get("NIGHT_ACTOR_ID") or "owner")
    project = os.path.realpath(os.path.abspath(os.path.expanduser(args.project)))
    if args.self_test:
        import tempfile
        with tempfile.TemporaryDirectory(prefix="night-review-selftest-") as tmp:
            return self_test(tmp, actor)
    port = args.port or int(os.environ.get("NIGHT_REVIEW_PORT") or 8377)
    server = serve(project, actor, port)
    print(f"[review] http://127.0.0.1:{port}/ actor={actor} project={project}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
