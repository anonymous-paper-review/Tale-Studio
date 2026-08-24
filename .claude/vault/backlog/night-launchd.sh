#!/bin/sh
# 밤 실행 진입점 — launchd(또는 사람 손)가 부른다. Orca 없이도 동작한다.
#
# 사용법:
#   sh night-launchd.sh run            # 실제 밤 실행: claim → 네이티브 claude 실행 → 종료 기록
#   sh night-launchd.sh dry-run        # 원장에 아무것도 쓰지 않고 파이프라인 전체를 검증
#   sh night-launchd.sh open-report    # 이 actor의 가장 최신 밤 보고서를 연다 (아침용)
#   sh night-launchd.sh resume-session # 최신 밤 실행 세션을 Orca 터미널로 이어받는다 (아침용)
#   sh night-launchd.sh morning        # 리포트 html + 밤 세션 터미널 둘 다 (launchd 아침 진입점)
#   sh night-launchd.sh review-server  # 127.0.0.1 리뷰 서버 (HTML 버튼 → feedback 기록)
#
# 환경변수:
#   NIGHT_ACTOR_ID     실행 주체 (기본 jh; 친구 머신은 hs)
#   NIGHT_REVIEW_PORT  리뷰 서버 포트 (기본 8377)
#
# 밤 실행은 공유 inbox의 메모와 이 머신의 세션을 읽는다. inbox 동기화 실패는 기록 후 계속한다.
# dry-run은 임시 상태 디렉터리를 쓰므로 진짜 밤 claim과 충돌하지 않는다.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GATE="$SCRIPT_DIR/provider-gate.py"
TICKET_RUNTIME="$SCRIPT_DIR/ticket-runtime.py"
CONTRACT="$SCRIPT_DIR/_NIGHT.md"
REVIEW_SERVER="$SCRIPT_DIR/night-review-server.py"
MODE="${1:-run}"

ACTOR="${NIGHT_ACTOR_ID:-jh}"

# 실제 밤 실행이 쓸 provider-state 위치. run-night 래퍼가 지정하면 그 값, 아니면 이 기본값.
# run·dry-run이 같은 경로를 참조해 dry-run이 실제 상태를 검사할 수 있게 한다.
: "${ORCA_PROVIDER_GATE_STATE_DIR:=$HOME/Library/Logs/tale-studio-night/provider-state}"
export ORCA_PROVIDER_GATE_STATE_DIR
REAL_STATE_DIR="$ORCA_PROVIDER_GATE_STATE_DIR"
REVIEW_PORT="${NIGHT_REVIEW_PORT:-8377}"
TICKET_LEASE_SECONDS=1800
TICKET_HEARTBEAT_SECONDS=300

case "$TICKET_LEASE_SECONDS:$TICKET_HEARTBEAT_SECONDS" in
*[!0-9:]*|:*|*:)
  echo "고정 ticket lease/heartbeat는 양의 정수 초여야 한다" >&2
  exit 1
  ;;
esac
if ! TICKET_LEASE_SECONDS="$TICKET_LEASE_SECONDS" \
  TICKET_HEARTBEAT_SECONDS="$TICKET_HEARTBEAT_SECONDS" python3 - <<'PY'
import math
import os

lease = float(os.environ["TICKET_LEASE_SECONDS"])
heartbeat = float(os.environ["TICKET_HEARTBEAT_SECONDS"])
if (not math.isfinite(lease) or not math.isfinite(heartbeat)
        or lease != int(lease) or heartbeat != int(heartbeat)
        or not 60 <= lease <= 86400
        or not 1 <= heartbeat < lease):
    raise SystemExit("ticket lease/heartbeat must be finite integer seconds: "
                     "60 <= lease <= 86400 and 1 <= heartbeat < lease")
PY
then
  echo "고정 ticket lease/heartbeat 값이 유효하지 않다" >&2
  exit 1
fi
export TICKET_LEASE_SECONDS TICKET_HEARTBEAT_SECONDS

case "$ACTOR" in
''|*[!a-z0-9-]*)
  echo "NIGHT_ACTOR_ID는 소문자·숫자·하이픈만 허용한다: $ACTOR" >&2
  exit 1
  ;;
esac
case "$ACTOR" in
jh|hs) ;;
*)
  echo "NIGHT_ACTOR_ID는 provider actor(jh 또는 hs)여야 한다: $ACTOR" >&2
  exit 1
  ;;
esac

# 오너 지시: fable 모델 금지 — 주 실행·subagent 어느 쪽으로도 스며들지 못하게 한다.
for v in "${NIGHT_CLAUDE_MODEL:-}" "${ANTHROPIC_MODEL:-}" "${CLAUDE_CODE_SUBAGENT_MODEL:-}"; do
  case "$v" in
  *fable*)
    echo "금지 모델(fable)이 환경에 지정되어 있어 실행을 거부한다: $v" >&2
    exit 1
    ;;
  esac
done
MODEL_ARGS=""
[ -n "${NIGHT_CLAUDE_MODEL:-}" ] && MODEL_ARGS="--model ${NIGHT_CLAUDE_MODEL}"

jget() { python3 -c 'import json,sys
value=json.load(sys.stdin)
for key in sys.argv[1].split("."):
    value=value[int(key)] if key.isdigit() else value[key]
print(value)' "$1"; }

night_start_phase() {
  python3 - <<'PY'
import datetime as dt
from zoneinfo import ZoneInfo

hour = dt.datetime.now(ZoneInfo("Asia/Seoul")).hour
print("day" if 8 <= hour < 20 else "night")
PY
}

# inbox는 공유 디렉터리다 — 각자 자기 파일(inbox/<actor>.md)에만 쓴다.
# 티켓 원장은 로컬 상태다. 새 checkout이면 빈 채로 시작한다.
INBOX_DIR="$PROJECT_ROOT/.claude/vault/inbox"
MY_INBOX="$INBOX_DIR/$ACTOR.md"
RECEIPT_DIR="$PROJECT_ROOT/.claude/vault/backlog/tickets/receipts"
PEER_ACTOR="hs"
[ "$ACTOR" = "hs" ] && PEER_ACTOR="jh"
PEER_INBOX="$INBOX_DIR/$PEER_ACTOR.md"

require_inboxes() {
  [ -f "$MY_INBOX" ] || { echo "필수 inbox가 없다: $MY_INBOX" >&2; return 1; }
  [ -f "$PEER_INBOX" ] || { echo "필수 inbox가 없다: $PEER_INBOX" >&2; return 1; }
}

# inbox 동기화 — 어떤 실패도 밤을 막지 않는다. 내 밤은 항상 로컬 내용으로 돈다.
# 순서: fetch → [push 모드만] 내 메모 파일만 커밋 → push (경합이면 rebase 재시도 1회).
# 옆에 다른 미푸시 commit이 있어도 내 메모는 나간다 — 이 컴퓨터의 유일한 사람은
# 자기 자신이라 push되는 것은 자기 작업뿐이다(2026-08-23 오너 결정). 상대 메모를
# 받아오는 ff 단계는 두지 않는다 — 각자 로컬로 실행하고 메모를 서로 받지 않는다.
sync_inbox() {
  push_mode="${1:-fetch-only}"
  if ! git -C "$PROJECT_ROOT" fetch origin main >/dev/null 2>&1; then
    echo "[inbox] fetch 실패 — 로컬에 있는 내용으로 계속한다"
    return 0
  fi
  # 옆에 비-inbox 미푸시 커밋이 있어도 건너뛰지 않는다. 내 메모만 자동으로 내보낸다.
  [ "$push_mode" = "push" ] || return 0
  # 내 메모 파일 하나만 커밋한다. 다른 변경은 건드리지 않는다.
  if git -C "$PROJECT_ROOT" ls-files --error-unmatch "$MY_INBOX" >/dev/null 2>&1     && git -C "$PROJECT_ROOT" diff --quiet -- "$MY_INBOX" 2>/dev/null; then
    echo "[inbox] 내 메모에 새 내용 없음"
    return 0
  fi
  git -C "$PROJECT_ROOT" add -- "$MY_INBOX"
  git -C "$PROJECT_ROOT" commit -q --only "$MY_INBOX" -m "inbox($ACTOR): 밤 메모" || return 0
  if git -C "$PROJECT_ROOT" push -q origin main 2>/dev/null; then
    echo "[inbox] 내 메모 push OK"
    return 0
  fi
  # 경합: 상대가 그 사이 push했다. 파일이 갈라져 있어 rebase는 항상 깨끗하다.
  if git -C "$PROJECT_ROOT" pull --rebase origin main >/dev/null 2>&1     && git -C "$PROJECT_ROOT" push -q origin main 2>/dev/null; then
    echo "[inbox] 내 메모 push OK (경합 재시도)"
  else
    git -C "$PROJECT_ROOT" rebase --abort >/dev/null 2>&1 || true
    echo "[inbox] push 실패 — 메모는 로컬에 안전하고 다음 기회에 나간다"
  fi
}

start_claude_watchdog() {
  lease_until="$1"
  NIGHT_PROMPT="$2" NIGHT_PROJECT_ROOT="$PROJECT_ROOT" NIGHT_LEASE_UNTIL="$lease_until" \
    NIGHT_MODEL="${NIGHT_CLAUDE_MODEL:-}" NIGHT_SESSION_ID="${3:-}" python3 - <<'PY' &
import datetime as dt
import os
import signal
import subprocess
import sys
import time
from zoneinfo import ZoneInfo

lease_until = float(os.environ["NIGHT_LEASE_UNTIL"])
now = dt.datetime.now(ZoneInfo("Asia/Seoul"))
morning = now.replace(hour=8, minute=0, second=0, microsecond=0)
if now >= morning:
    morning += dt.timedelta(days=1)
deadline = min(lease_until, morning.timestamp())
command = ["claude", "--dangerously-skip-permissions"]
if os.environ.get("NIGHT_SESSION_ID"):
    command.extend(["--session-id", os.environ["NIGHT_SESSION_ID"]])
if os.environ["NIGHT_MODEL"]:
    command.extend(["--model", os.environ["NIGHT_MODEL"]])
command.extend(["-p", os.environ["NIGHT_PROMPT"]])
child = subprocess.Popen(command, cwd=os.environ["NIGHT_PROJECT_ROOT"],
                         start_new_session=True)

def stop_child():
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()

def stop_child_on_signal(_signum, _frame):
    stop_child()
    sys.exit(124)

signal.signal(signal.SIGINT, stop_child_on_signal)
signal.signal(signal.SIGTERM, stop_child_on_signal)
while child.poll() is None:
    if time.time() >= deadline:
        stop_child()
        sys.exit(124)
    time.sleep(min(1, max(0.05, deadline - time.time())))
sys.exit(child.returncode)
PY
  WATCHDOG_PID=$!
}

provider_state() {
  python3 "$GATE" state sweep --contract-path "$CONTRACT" --actor "$ACTOR" \
    --project-root "$PROJECT_ROOT"
}

read_existing_sweep_state() {
  state_error_file="$(mktemp "${TMPDIR:-/tmp}/night-provider-state.XXXXXX")"
  if RECOVERY_STATE="$(provider_state 2>"$state_error_file")"; then
    rm -f "$state_error_file"
    return 0
  fi
  RECOVERY_ERROR="$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).read_text())' "$state_error_file")"
  rm -f "$state_error_file"
  case "$RECOVERY_ERROR" in
  *"provider 상태가 없다"*)
    RECOVERY_STATE=""
    return 0
    ;;
  *)
    echo "기존 provider state를 읽을 수 없어 새 primary를 시작하지 않는다: $RECOVERY_ERROR" >&2
    return 1
    ;;
  esac
}

recover_committing_sweep() {
  recovery_contract_hash="$(shasum -a 256 "$CONTRACT" | awk '{print $1}')"
  if ! recovery="$(printf '%s' "$RECOVERY_STATE" | python3 -c '
import json
import os
import re
import sys

state = json.load(sys.stdin)
project, actor, contract_hash = sys.argv[1:]
proof = state.get("completion_proof")
run_id = state.get("run_id")
expected_manifest = f"runs/{actor}/{run_id}/manifest.json"
expected_harvest = os.path.join(project, "runs", actor, run_id, "harvest")
expected_stamp = os.path.join(project, ".claude", "vault", "backlog", "sweep", ".last-success")
required = (
    "project_root", "run_manifest", "run_manifest_sha256", "snapshot_path", "snapshot_sha256",
    "snapshot_id", "snapshot_fingerprint", "snapshot_set_path", "snapshot_set_id",
    "actionable_content_sha256", "harvest_out", "stamp_path",
)
if (state.get("status") != "committing" or state.get("actor") != actor
        or state.get("project_root") != project or state.get("contract_hash") != contract_hash
        or not isinstance(run_id, str) or not run_id or not isinstance(proof, dict)
        or any(not isinstance(proof.get(key), str) or not proof[key] for key in required)
        or proof["project_root"] != project or proof["run_manifest"] != expected_manifest
        or proof["harvest_out"] != expected_harvest or proof["stamp_path"] != expected_stamp
        or proof["snapshot_path"] != state.get("actionable_snapshot_path")
        or proof["snapshot_id"] != state.get("actionable_snapshot_id")
        or proof["snapshot_fingerprint"] != state.get("actionable_snapshot_fingerprint")
        or proof["snapshot_set_path"] != state.get("snapshot_set_path")
        or proof["snapshot_set_id"] != state.get("snapshot_set_id")
        or proof["actionable_content_sha256"] != state.get("actionable_content_sha256")
        or any(not re.fullmatch(r"[0-9a-f]{64}", proof[key]) for key in (
            "run_manifest_sha256", "snapshot_sha256", "snapshot_fingerprint",
            "actionable_content_sha256"))):
    raise SystemExit("committing completion_proof가 canonical recovery 요건과 다르다")
print(json.dumps({
    "run_id": run_id, "token": state.get("owner_token"), "fencing": state.get("fencing"),
    "contract_hash": contract_hash, "run_manifest": proof["run_manifest"],
    "snapshot_path": proof["snapshot_path"], "snapshot_id": proof["snapshot_id"],
    "snapshot_fingerprint": proof["snapshot_fingerprint"], "harvest_out": proof["harvest_out"],
    "stamp_path": proof["stamp_path"],
}))
' "$PROJECT_ROOT" "$ACTOR" "$recovery_contract_hash")"; then
    echo "committing recovery proof 검증 실패 — 새 primary를 시작하지 않는다" >&2
    return 1
  fi
  recovery_run_id="$(printf '%s' "$recovery" | jget run_id)"
  recovery_token="$(printf '%s' "$recovery" | jget token)"
  recovery_fencing="$(printf '%s' "$recovery" | jget fencing)"
  recovery_manifest="$(printf '%s' "$recovery" | jget run_manifest)"
  recovery_snapshot_path="$(printf '%s' "$recovery" | jget snapshot_path)"
  recovery_snapshot_id="$(printf '%s' "$recovery" | jget snapshot_id)"
  recovery_snapshot_fingerprint="$(printf '%s' "$recovery" | jget snapshot_fingerprint)"
  recovery_harvest_out="$(printf '%s' "$recovery" | jget harvest_out)"
  recovery_stamp_path="$(printf '%s' "$recovery" | jget stamp_path)"
  if ! python3 "$GATE" complete sweep success --contract-path "$CONTRACT" \
    --run-id "$recovery_run_id" --token="$recovery_token" --fencing "$recovery_fencing" \
    --contract-hash "$recovery_contract_hash" --actor "$ACTOR" \
    --project-root "$PROJECT_ROOT" --harvest-project "$PROJECT_ROOT" \
    --harvest-out "$recovery_harvest_out" --stamp-path "$recovery_stamp_path" \
    --run-manifest "$recovery_manifest" --snapshot-path "$recovery_snapshot_path" \
    --snapshot-id "$recovery_snapshot_id" --snapshot-fingerprint "$recovery_snapshot_fingerprint"; then
    echo "committing recovery finalize 실패 — 새 primary를 시작하지 않는다" >&2
    return 1
  fi
  echo "committing recovery finalized"
}

complete_terminal_or_verify() {
  outcome="$1"
  if python3 "$GATE" complete sweep "$outcome" --run-id "$run_id" --token="$token" \
    --fencing "$fencing" --contract-hash "$contract_hash" --actor "$ACTOR" \
    --project-root "$PROJECT_ROOT" >/dev/null; then
    return 0
  fi
  echo "provider complete $outcome 실패 — terminal state를 다시 확인한다" >&2
  if refreshed="$(provider_state)" \
    && refreshed_status="$(printf '%s' "$refreshed" | jget status)" \
    && { [ "$refreshed_status" = "timeout" ] || [ "$refreshed_status" = "failed" ]; }; then
    return 0
  fi
  echo "provider complete $outcome 실패 후 terminal state가 아니다 (status=${refreshed_status:-unreadable}, run_id=$run_id)" >&2
  return 1
}

write_ticket_inventory() {
  inventory_path="$1"
  python3 -c 'import json, os, sys, tempfile
path = os.path.abspath(sys.argv[1])
value = json.load(sys.stdin)
if not isinstance(value, dict) or not isinstance(value.get("tickets"), list):
    raise SystemExit("ticket inventory must be a JSON object with tickets")
directory = os.path.dirname(path)
os.makedirs(directory, mode=0o700, exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix=".ticket-handoffs.", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    directory_fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
except BaseException:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise' "$inventory_path"
}

stop_watchdog_on_signal() {
  trap - INT TERM
  if [ -n "${WATCHDOG_PID:-}" ]; then
    kill -TERM "$WATCHDOG_PID" 2>/dev/null || true
    set +e
    wait "$WATCHDOG_PID"
    watchdog_exit=$?
    set -e
    WATCHDOG_PID=""
  fi
  complete_terminal_or_verify timeout || exit 1
  exit 130
}

case "$MODE" in
run)
  if ! read_existing_sweep_state; then
    exit 1
  fi
  if [ -n "$RECOVERY_STATE" ]; then
    recovery_status="$(printf '%s' "$RECOVERY_STATE" | jget status)"
    if [ "$recovery_status" = "committing" ]; then
      if recover_committing_sweep; then
        exit 0
      fi
      # recover 실패 = completion_proof 불완전(밤이 성공 직전 죽음). lease가 하루 넘게
      # 만료됐으면 죽은 밤으로 보고 그 state를 치우고 새로 시작한다(무한 블록 방지).
      # 최근이면 진짜 진행 중일 수 있으니 막아 사람 개입을 요구한다.
      stale_lease="$(printf '%s' "$RECOVERY_STATE" | jget lease_until)"
      stale_date="$(printf '%s' "$RECOVERY_STATE" | jget claim_date)"
      if [ "$(date +%s)" -gt "$(( ${stale_lease%.*} + 86400 ))" ]; then
        echo "committing이 하루 넘게 만료됨 — 죽은 밤으로 보고 state를 치우고 새로 시작한다" >&2
        rm -f "$REAL_STATE_DIR/sweep-$stale_date.json" "$REAL_STATE_DIR/sweep-$stale_date.json.lock"
      else
        exit 1
      fi
    fi
  fi

  if ! sh "$SCRIPT_DIR/preflight.sh"; then
    echo "preflight 점검 경고 — provider claim 후에도 실행을 계속한다" >&2
  fi
  require_inboxes
  start_phase="$(night_start_phase)"
  day_run_override="0"
  if [ "$start_phase" = "day" ]; then
    if [ "${NIGHT_ALLOW_DAY_RUN:-}" != "1" ]; then
      echo "KST 08:00 이상 20:00 미만에는 night run을 시작하지 않는다 (명시적 NIGHT_ALLOW_DAY_RUN=1만 예외)." >&2
      exit 1
    fi
    day_run_override="1"
    echo "NIGHT_ALLOW_DAY_RUN=1 낮 실행 예외를 기록한다." >&2
  fi
  mkdir -p "$SCRIPT_DIR/tickets"
  mkdir -p "$RECEIPT_DIR"
  sync_inbox push

  # 1. 실행 잠금 — 같은 날짜 이중 실행만 막는다. probe/preflight 경고는
  #    claim에 기록될 뿐 실행을 막지 않는다.
  claim="$(python3 "$GATE" primary sweep --contract-path "$CONTRACT" --actor "$ACTOR" \
    --project-root "$PROJECT_ROOT" --preflight "$SCRIPT_DIR/preflight.sh")"
  status="$(printf '%s' "$claim" | jget status)"
  provider="$(printf '%s' "$claim" | jget provider)"
  run_id="$(printf '%s' "$claim" | jget run_id)"
  token="$(printf '%s' "$claim" | jget owner_token)"
  provider_state="$(printf '%s' "$claim" | jget state_path)"
  fencing="$(printf '%s' "$claim" | jget fencing)"
  state_actor="$(printf '%s' "$claim" | jget actor)"
  if [ "$status" != "claimed" ] || [ "$provider" != "claude" ] || [ "$state_actor" != "$ACTOR" ]; then
    echo "primary claim not usable (status=$status provider=$provider actor=$state_actor); 이 머신은 Codex fallback을 처리하지 않는다" >&2
    exit 1
  fi

  contract_hash="$(shasum -a 256 "$CONTRACT" | awk '{print $1}')"
  # claim 직후 현재 actor의 canonical receipt만 정산한다. malformed/manual_review는
  # runtime이 기록하되 닫지 않으며, authority/path 실패는 provider failed로 끝낸다.
  if ! reconciliation="$(python3 "$SCRIPT_DIR/night-runtime.py" reconcile-inbox \
    --provider-state "$provider_state" --provider-job sweep --owner-token="$token" \
    --fencing "$fencing" --run-id "$run_id" --contract-hash "$contract_hash" \
    --actor "$ACTOR" --path "$MY_INBOX" --receipt-dir "$RECEIPT_DIR")"; then
    complete_terminal_or_verify failed || exit 1
    exit 1
  fi
  echo "[reconcile] current actor receipts reconciled: $reconciliation"

  # receipt 정산 뒤 두 inbox를 같은 run/contract/read-time으로 정확히 한 번 고정한다.
  run_dir="runs/$ACTOR/$run_id"
  if ! snapshot_set="$(python3 "$SCRIPT_DIR/night-runtime.py" snapshot-inbox-set \
    --provider-state "$provider_state" --owner-token="$token" --fencing "$fencing" \
    --run-id "$run_id" --contract-hash "$contract_hash" --provider-job sweep \
    --actor "$ACTOR" --actors jh,hs)"; then
    complete_terminal_or_verify failed || exit 1
    exit 1
  fi
  if ! printf '%s' "$snapshot_set" | ACTOR="$ACTOR" RUN_ID="$run_id" CONTRACT_HASH="$contract_hash" \
    python3 -c 'import json,os,sys
s=json.load(sys.stdin)
assert s["run_id"] == os.environ["RUN_ID"] and s["contract_hash"] == os.environ["CONTRACT_HASH"]
rows=s["snapshots"]
assert len(rows) == 2 and {x["actor"] for x in rows} == {"jh","hs"}
mine=[x for x in rows if x["actor"] == os.environ["ACTOR"]]
peer=[x for x in rows if x["actor"] != os.environ["ACTOR"]]
assert len(mine) == len(peer) == 1 and mine[0]["role"] == "actionable" and peer[0]["role"] == "reference"
assert all(x["snapshot"] and x["snapshot_id"] and x["snapshot_fingerprint"] for x in rows)'; then
    complete_terminal_or_verify failed || exit 1
    exit 1
  fi
  snapshot_manifest="$(printf '%s' "$snapshot_set" | jget manifest)"
  snapshot_set_id="$(printf '%s' "$snapshot_set" | jget set_id)"
  snapshot_path="$(printf '%s' "$snapshot_set" | jget "snapshots.$([ "$ACTOR" = jh ] && echo 0 || echo 1).snapshot")"
  snapshot_id="$(printf '%s' "$snapshot_set" | jget "snapshots.$([ "$ACTOR" = jh ] && echo 0 || echo 1).snapshot_id")"
  snapshot_fingerprint="$(printf '%s' "$snapshot_set" | jget "snapshots.$([ "$ACTOR" = jh ] && echo 0 || echo 1).snapshot_fingerprint")"
  reference_path="$(printf '%s' "$snapshot_set" | jget "snapshots.$([ "$ACTOR" = jh ] && echo 1 || echo 0).snapshot")"
  reference_id="$(printf '%s' "$snapshot_set" | jget "snapshots.$([ "$ACTOR" = jh ] && echo 1 || echo 0).snapshot_id")"
  reference_fingerprint="$(printf '%s' "$snapshot_set" | jget "snapshots.$([ "$ACTOR" = jh ] && echo 1 || echo 0).snapshot_fingerprint")"
  snapshot_directory="$PROJECT_ROOT/.claude/vault/backlog/night-runtime/snapshots"
  case "$snapshot_manifest" in
  "$snapshot_directory"/snapshot-set-*.json)
    snapshot_manifest_relative="${snapshot_manifest#"$PROJECT_ROOT"/}"
    ;;
  *)
    echo "snapshot set이 canonical runtime snapshot directory 안에 없다: $snapshot_manifest" >&2
    complete_terminal_or_verify failed || exit 1
    exit 1
    ;;
  esac
  if ! bound_snapshot="$(python3 "$GATE" bind-snapshot sweep --contract-path "$CONTRACT" \
    --actor "$ACTOR" --project-root "$PROJECT_ROOT" --run-id "$run_id" --token="$token" \
    --fencing "$fencing" --snapshot-set "$snapshot_manifest_relative")"; then
    complete_terminal_or_verify failed || exit 1
    exit 1
  fi
  if ! printf '%s' "$bound_snapshot" | SNAPSHOT_SET="$snapshot_manifest_relative" \
    SNAPSHOT_SET_ID="$snapshot_set_id" SNAPSHOT_ID="$snapshot_id" SNAPSHOT_PATH="$snapshot_path" SNAPSHOT_FINGERPRINT="$snapshot_fingerprint" \
    python3 -c 'import json,os,sys
s=json.load(sys.stdin)
assert s["snapshot_set_path"] == os.environ["SNAPSHOT_SET"]
assert s["snapshot_set_id"] == os.environ["SNAPSHOT_SET_ID"]
assert s["actionable_snapshot_path"] == os.environ["SNAPSHOT_PATH"]
assert s["actionable_snapshot_id"] == os.environ["SNAPSHOT_ID"]
assert s["actionable_snapshot_fingerprint"] == os.environ["SNAPSHOT_FINGERPRINT"]'; then
    echo "provider bind 결과가 launcher actionable snapshot identity와 다르다" >&2
    complete_terminal_or_verify failed || exit 1
    exit 1
  fi
  ticket_inventory_path="$PROJECT_ROOT/$run_dir/ticket-handoffs.json"
  if ! ticket_inventory="$(python3 "$TICKET_RUNTIME" list --project "$PROJECT_ROOT" --actor "$ACTOR")"; then
    echo "ticket inventory를 읽지 못해 Claude를 시작하지 않는다" >&2
    complete_terminal_or_verify failed || exit 1
    exit 1
  fi
  if ! printf '%s' "$ticket_inventory" | write_ticket_inventory "$ticket_inventory_path"; then
    echo "ticket inventory artifact 저장 실패로 Claude를 시작하지 않는다" >&2
    complete_terminal_or_verify failed || exit 1
    exit 1
  fi
  NIGHT_SNAPSHOT_SET="$snapshot_manifest"
  NIGHT_ACTIONABLE_SNAPSHOT="$snapshot_path"
  NIGHT_ACTIONABLE_SNAPSHOT_ID="$snapshot_id"
  NIGHT_ACTIONABLE_SNAPSHOT_FINGERPRINT="$snapshot_fingerprint"
  NIGHT_REFERENCE_SNAPSHOT="$reference_path"
  NIGHT_REFERENCE_SNAPSHOT_ID="$reference_id"
  NIGHT_REFERENCE_SNAPSHOT_FINGERPRINT="$reference_fingerprint"
  NIGHT_PROVIDER_STATE="$provider_state"
  NIGHT_OWNER_TOKEN="$token"
  NIGHT_FENCING="$fencing"
  NIGHT_TICKET_RUNTIME="$TICKET_RUNTIME"
  NIGHT_TICKET_INVENTORY="$ticket_inventory_path"
  NIGHT_TICKET_SESSION_ID="night-$run_id"
  NIGHT_TICKET_LEASE_SECONDS="$TICKET_LEASE_SECONDS"
  NIGHT_TICKET_HEARTBEAT_SECONDS="$TICKET_HEARTBEAT_SECONDS"
  export NIGHT_SNAPSHOT_SET NIGHT_ACTIONABLE_SNAPSHOT NIGHT_ACTIONABLE_SNAPSHOT_ID \
    NIGHT_ACTIONABLE_SNAPSHOT_FINGERPRINT NIGHT_REFERENCE_SNAPSHOT NIGHT_REFERENCE_SNAPSHOT_ID \
    NIGHT_REFERENCE_SNAPSHOT_FINGERPRINT NIGHT_PROVIDER_STATE NIGHT_OWNER_TOKEN NIGHT_FENCING \
    NIGHT_TICKET_RUNTIME NIGHT_TICKET_INVENTORY NIGHT_TICKET_SESSION_ID \
    NIGHT_TICKET_LEASE_SECONDS NIGHT_TICKET_HEARTBEAT_SECONDS

  # 네이티브 Claude Code 헤드리스 실행 — 계약 문서가 정본이다.
  prompt=".claude/vault/backlog/_NIGHT.md를 읽고 오늘 밤 실행을 계약 그대로 수행하라. runner가 이미 primary claim, canonical snapshot set, provider bind-snapshot, read-only ticket inventory 저장을 마쳤다. 계약 본문에서 primary 또는 snapshot-inbox/snapshot-inbox-set을 다시 호출하지 말라. "
  prompt="${prompt}고정 값: actor_id=$ACTOR, run_id=$run_id, 결과 디렉터리=$run_dir, provider_state=$provider_state, provider_job=sweep, owner_token=$token, fencing=$fencing, contract_hash=$contract_hash, snapshot_set=$snapshot_manifest, actionable_snapshot=$snapshot_path, actionable_snapshot_id=$snapshot_id, actionable_snapshot_fingerprint=$snapshot_fingerprint, reference_snapshot=$reference_path, reference_snapshot_id=$reference_id, reference_snapshot_fingerprint=$reference_fingerprint. "
  prompt="${prompt}provider-bound actionable snapshot set만 success proof로 쓰고 reference snapshot은 immutable read-only다. canonical harvest-out=$PROJECT_ROOT/runs/$ACTOR/$run_id/harvest, default stamp=$PROJECT_ROOT/.claude/vault/backlog/sweep/.last-success, --run-manifest $run_dir/manifest.json을 바꾸지 말라. "
  prompt="${prompt}ticket_runtime=$TICKET_RUNTIME, ticket_inventory=$ticket_inventory_path, night_session_id=night-$run_id, ticket_lease_seconds=$TICKET_LEASE_SECONDS, ticket_heartbeat_seconds=$TICKET_HEARTBEAT_SECONDS다. 각 unit 직전 live ticket list를 재조회해 classification을 재검증하라. active는 건너뛰고, takeover_ready만 exact checkpoint/worktree로 takeover한 JSON에서 owner_token, fencing, session_id, worktree를 추출한 뒤 실행하라. runtime state 없는 tracked ticket은 isolated registered ticket worktree를 만든 뒤 claim JSON proof를 추출한 뒤 실행하라. checkpoint 없는 stale, worktree drift, reference_only 및 manual_review는 수정하지 말라. "
  prompt="${prompt}day_run_override=$day_run_override. day_run_override=1이면 보고서에 NIGHT_ALLOW_DAY_RUN=1 낮 실행 예외를 남겨라."
  lease_until="$(printf '%s' "$claim" | jget lease_until)"
  WATCHDOG_PID=""
  # 아침에 Orca 터미널로 이어받을 수 있도록 밤 세션에 고정 id를 붙이고 기록한다.
  mkdir -p "$run_dir"
  night_session_id="$(uuidgen | tr 'A-Z' 'a-z')"
  printf '%s' "$night_session_id" > "$run_dir/session-id.txt"
  trap 'stop_watchdog_on_signal' INT TERM
  set +e
  start_claude_watchdog "$lease_until" "$prompt" "$night_session_id"
  wait "$WATCHDOG_PID"
  claude_exit=$?
  set -e
  WATCHDOG_PID=""
  trap - INT TERM

  # 계약이 스스로 상태를 닫지 못했으면 실패/시간초과로 기록한다. 성공은 provider가 검증한 경우만 허용한다.
  if ! final="$(provider_state)"; then
    complete_terminal_or_verify failed || exit 1
    exit 1
  fi
  final_status="$(printf '%s' "$final" | jget status)"
  case "$final_status" in
  claimed | running)
    outcome="failed"
    [ "$claude_exit" = "124" ] && outcome="timeout"
    complete_terminal_or_verify "$outcome" || exit 1
    final="$(provider_state)" || exit 1
    final_status="$(printf '%s' "$final" | jget status)"
    ;;
  committing)
    echo "provider가 committing 상태다; same owner success resume가 필요하다 (status=$final_status run_id=$run_id)" >&2
    exit 1
    ;;
  esac
  [ "$claude_exit" = "0" ] && [ "$final_status" = "success" ] && exit 0
  exit 1
  ;;

dry-run)
  sh "$SCRIPT_DIR/preflight.sh"
  require_inboxes
  # [state-check] dry-run이 '실제' provider-state를 읽어, 계약 개정 뒤 다음 밤이 막힐지 미리 본다.
  # (아래 파이프라인 시뮬레이션은 임시 폴더로 격리되지만, 이 검사만은 실제 상태를 본다.)
  echo "[state-check] 실제 provider-state: $REAL_STATE_DIR"
  real_state="$(python3 "$GATE" state sweep --contract-path "$CONTRACT" --actor "$ACTOR" --project-root "$PROJECT_ROOT" 2>&1 || true)"
  case "$real_state" in
    *"provider 상태가 없다"*)
      echo "[state-check] OK — 깨끗하거나 옛 계약 완료분은 자동 무시된다(다음 밤이 새로 시작)" ;;
    *"contract_hash가 현재 계약과 다르다"*)
      echo "[state-check] ⚠ 실제 state에 '진행 중' 옛 계약 잔재 — 다음 실제 밤이 막힌다. 사람 개입 필요" >&2 ;;
    *)
      real_status="$(printf '%s' "$real_state" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("status",""))
except Exception: print("")' 2>/dev/null)"
      if [ "$real_status" = "committing" ]; then
        echo "[state-check] ⚠ 실제 state가 committing — 다음 밤이 완료 복구를 시도한다. proof 불완전이고 하루+ 만료면 자동으로 치우고 새로 시작한다" >&2
      else
        echo "[state-check] 실제 state에 활성/정상 claim 존재 (status=$real_status)"
      fi ;;
  esac
  TMP="$(mktemp -d /tmp/night-dryrun.XXXXXX)"
  trap 'rm -rf "$TMP"' EXIT
  PROVIDER_STATE_ROOT="$TMP/gate"
  export ORCA_PROVIDER_GATE_STATE_DIR="$PROVIDER_STATE_ROOT"
  echo "[1/7] preflight OK (actor=$ACTOR, 내 inbox=$MY_INBOX)"

  claim="$(python3 "$GATE" primary sweep --state-dir "$PROVIDER_STATE_ROOT" \
    --contract-path "$CONTRACT" --probe-timeout 30 --actor "$ACTOR" \
    --project-root "$PROJECT_ROOT")"
  status="$(printf '%s' "$claim" | jget status)"
  provider="$(printf '%s' "$claim" | jget provider)"
  run_id="$(printf '%s' "$claim" | jget run_id)"
  token="$(printf '%s' "$claim" | jget owner_token)"
  provider_state="$(printf '%s' "$claim" | jget state_path)"
  fencing="$(printf '%s' "$claim" | jget fencing)"
  state_actor="$(printf '%s' "$claim" | jget actor)"
  if [ "$status" != "claimed" ] || [ "$provider" != "claude" ] || [ "$state_actor" != "$ACTOR" ]; then
    echo "FAIL: primary claim (status=$status provider=$provider actor=$state_actor) — claude CLI 로그인/설치를 확인하라" >&2
    exit 1
  fi
  probe_warn="$(printf '%s' "$claim" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("probe_warning",""))')"
  [ -n "$probe_warn" ] && echo "      warn: $probe_warn"
  echo "[2/7] provider gate claim OK (run_id=$run_id)"
  echo "[dry-run] receipt reconciliation skipped (actual inbox mutation is forbidden)"

  contract_hash="$(shasum -a 256 "$CONTRACT" | awk '{print $1}')"
  snapshot_set="$(python3 "$SCRIPT_DIR/night-runtime.py" snapshot-inbox-set \
    --provider-state "$provider_state" --owner-token="$token" --fencing "$fencing" \
    --run-id "$run_id" --contract-hash "$contract_hash" --provider-job sweep \
    --actor "$ACTOR" --actors jh,hs \
    --out-dir "$PROVIDER_STATE_ROOT/snapshots")"
  snapshot_id="$(printf '%s' "$snapshot_set" | jget "snapshots.$([ "$ACTOR" = jh ] && echo 0 || echo 1).snapshot_id")"
  snapshot_fingerprint="$(printf '%s' "$snapshot_set" | jget "snapshots.$([ "$ACTOR" = jh ] && echo 0 || echo 1).snapshot_fingerprint")"
  snapshot_roles="$(printf '%s' "$snapshot_set" | ACTOR="$ACTOR" RUN_ID="$run_id" CONTRACT_HASH="$contract_hash" python3 -c 'import json,os,sys
s=json.load(sys.stdin)
assert s["run_id"] == os.environ["RUN_ID"] and s["contract_hash"] == os.environ["CONTRACT_HASH"]
rows=s["snapshots"]
assert len(rows) == 2 and {x["actor"] for x in rows} == {"jh","hs"}
mine=[x for x in rows if x["actor"] == os.environ["ACTOR"]]
peer=[x for x in rows if x["actor"] != os.environ["ACTOR"]]
assert len(mine) == len(peer) == 1 and mine[0]["role"] == "actionable" and peer[0]["role"] == "reference"
assert all(x["snapshot_id"] and x["snapshot_fingerprint"] and x["content_sha256"] and x["size"] >= 0 for x in rows)
print("OK")')"
  [ "$snapshot_roles" = "OK" ] || exit 1
  echo "[3/7] temporary inbox snapshot set runtime role/hash/generation validation OK (fingerprint=$snapshot_fingerprint; provider bind 생략, success proof 아님)"

  python3 "$SCRIPT_DIR/harvest.py" --dry-run --project "$PROJECT_ROOT" \
    --actor "$ACTOR" --contract-hash "$contract_hash" --snapshot-id "$snapshot_id" \
    --snapshot-fingerprint "$snapshot_fingerprint" >"$TMP/harvest.txt"
  echo "[4/7] harvest dry-run OK ($(wc -l <"$TMP/harvest.txt" | tr -d ' ')줄 출력)"

  if ! ticket_inventory="$(python3 "$TICKET_RUNTIME" list --project "$PROJECT_ROOT" --actor "$ACTOR")"; then
    echo "FAIL: read-only ticket inventory" >&2
    exit 1
  fi
  if ! printf '%s' "$ticket_inventory" | python3 -c 'import json,sys
value=json.load(sys.stdin)
assert isinstance(value,dict) and isinstance(value.get("tickets"),list)
print(len(value["tickets"]))' >"$TMP/ticket-count.txt"; then
    echo "FAIL: ticket inventory JSON" >&2
    exit 1
  fi
  echo "[5/8] read-only ticket inventory OK ($(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).read_text().strip())' "$TMP/ticket-count.txt") tickets; no run artifact)"

  # 결과 경로가 run 단위로 비어 있는지, 버튼 기록이 동작하는지 확인한다.
  run_dir="$PROJECT_ROOT/runs/$ACTOR/$run_id"
  if [ -e "$run_dir" ]; then
    echo "FAIL: run 디렉터리가 이미 존재한다: $run_dir" >&2
    exit 1
  fi
  python3 "$REVIEW_SERVER" --self-test --actor "$ACTOR" >"$TMP/review.txt"
  echo "[6/8] 결과 경로·리뷰 서버 OK (report=runs/$ACTOR/$run_id/report.html)"

  # 임시 cwd에서 절대경로로 읽는다 — 프로젝트 Stop 훅(typecheck-gate 등)이
  # headless 응답을 막으면 이 단계가 무관한 typecheck 상태에 인질로 잡힌다.
  answer="$(cd /private/tmp && claude -p \
    "읽기 전용 확인: $CONTRACT 파일의 첫 줄 제목을 그대로 한 줄만 출력하라." \
    --allowedTools "Read" --max-turns 8)"
  echo "[7/8] native claude contract read OK → $answer"

  python3 "$GATE" complete sweep failed --state-dir "$PROVIDER_STATE_ROOT" \
    --run-id "$run_id" --token="$token" --fencing "$fencing" \
    --contract-hash "$contract_hash" --actor "$ACTOR" \
    --project-root "$PROJECT_ROOT" >/dev/null
  echo "[8/8] provider gate close OK"
  echo "DRY-RUN PASS — 이 머신에서 actor=$ACTOR 밤 실행이 동작한다."
  ;;

open-report)
  # 아침용: 이 actor의 가장 최신 run 보고서를 기본 브라우저로 연다.
  latest="$(ls -td "$PROJECT_ROOT/runs/$ACTOR"/*/ 2>/dev/null | head -n 1 || true)"
  if [ -z "$latest" ] || [ ! -f "$latest/report.html" ]; then
    echo "열 보고서가 없다: $PROJECT_ROOT/runs/$ACTOR/" >&2
    exit 1
  fi
  run_name="$(basename "$latest")"
  # 리뷰 서버가 떠 있으면 버튼이 동작하는 http 주소로 연다.
  if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$REVIEW_PORT/health', timeout=1)" 2>/dev/null; then
    open "http://127.0.0.1:$REVIEW_PORT/runs/$ACTOR/$run_name/report.html"
    echo "opened: http://127.0.0.1:$REVIEW_PORT/runs/$ACTOR/$run_name/report.html"
  else
    open "$latest/report.html"
    echo "opened: $latest/report.html (리뷰 서버가 꺼져 있어 버튼은 동작하지 않는다 — sh night-launchd.sh review-server)"
  fi
  ;;

resume-session)
  # 아침용: 최신 밤 실행의 세션을 Orca 새 터미널 탭으로 이어받는다.
  latest="$(ls -td "$PROJECT_ROOT/runs/$ACTOR"/*/ 2>/dev/null | head -n 1 || true)"
  sid_file="$latest/session-id.txt"
  if [ -z "$latest" ] || [ ! -f "$sid_file" ]; then
    echo "이어받을 밤 세션이 없다 (옛 실행이거나 session-id 미기록)" >&2
    exit 0
  fi
  sid="$(cat "$sid_file")"
  ORCA_BIN="$HOME/.local/bin/orca"
  [ -x "$ORCA_BIN" ] || ORCA_BIN="orca"
  "$ORCA_BIN" open >/dev/null 2>&1 || true
  if "$ORCA_BIN" terminal create --worktree active \
       --title "밤 세션 $(basename "$latest")" \
       --command "claude --resume $sid" --focus; then
    echo "밤 세션을 Orca 터미널로 열었다: $sid"
  else
    echo "Orca 터미널 열기 실패 — 수동으로: claude --resume $sid" >&2
  fi
  ;;

morning)
  # 아침용(launchd): 리포트 html을 열고 밤 세션을 Orca 터미널로 되살린다.
  sh "$0" open-report || true
  sh "$0" resume-session || true
  ;;

push-inbox)
  # 자기 전에 손으로: 내 메모를 커밋·push해서 상대 밤에도 보이게 한다.
  require_inboxes
  sync_inbox push
  ;;

review-server)
  exec python3 "$REVIEW_SERVER" --project "$PROJECT_ROOT" --actor "$ACTOR" --port "$REVIEW_PORT"
  ;;

*)
  echo "usage: sh night-launchd.sh [run|dry-run|open-report|resume-session|morning|review-server|push-inbox]" >&2
  exit 2
  ;;
esac
