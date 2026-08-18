#!/bin/sh
# 밤 실행 진입점 — launchd(또는 사람 손)가 부른다. Orca 없이도 동작한다.
#
# 사용법:
#   sh night-launchd.sh run            # 실제 밤 실행: claim → 네이티브 claude 실행 → 종료 기록
#   sh night-launchd.sh dry-run        # 원장에 아무것도 쓰지 않고 파이프라인 전체를 검증
#   sh night-launchd.sh open-report    # 이 actor의 가장 최신 밤 보고서를 연다 (아침용)
#   sh night-launchd.sh review-server  # 127.0.0.1 리뷰 서버 (HTML 버튼 → feedback 기록)
#
# 환경변수:
#   NIGHT_ACTOR_ID     실행 주체 (기본 owner; 친구 머신은 friend)
#   NIGHT_GIT_BRANCH   actor 전용 결과 branch. 지정하면 현재 branch와 일치해야 실행한다.
#   NIGHT_REVIEW_PORT  리뷰 서버 포트 (기본 8377)
#
# 밤 실행은 이 checkout의 _INBOX.md와 이 머신의 세션만 읽는다. 원격 동기화는 없다.
# dry-run은 임시 상태 디렉터리를 쓰므로 진짜 밤 claim과 충돌하지 않는다.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GATE="$SCRIPT_DIR/provider-gate.py"
CONTRACT="$SCRIPT_DIR/_NIGHT.md"
REVIEW_SERVER="$SCRIPT_DIR/night-review-server.py"
MODE="${1:-run}"

ACTOR="${NIGHT_ACTOR_ID:-owner}"
REVIEW_PORT="${NIGHT_REVIEW_PORT:-8377}"

case "$ACTOR" in
''|*[!a-z0-9-]*)
  echo "NIGHT_ACTOR_ID는 소문자·숫자·하이픈만 허용한다: $ACTOR" >&2
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

jget() { python3 -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }

# inbox는 git에 올라가지 않는 로컬 파일이다. 새 checkout이면 빈 파일로 시작한다.
INBOX="$PROJECT_ROOT/.claude/vault/_INBOX.md"
[ -f "$INBOX" ] || : > "$INBOX"

# NIGHT_GIT_BRANCH가 지정되면 현재 branch와 일치해야 한다 — 다른 branch 위에
# 결과를 쓰는 사고를 막는다.
require_branch() {
  if [ -n "${NIGHT_GIT_BRANCH:-}" ]; then
    current="$(git -C "$PROJECT_ROOT" branch --show-current)"
    if [ "$current" != "$NIGHT_GIT_BRANCH" ]; then
      echo "현재 branch($current)가 NIGHT_GIT_BRANCH($NIGHT_GIT_BRANCH)와 다르다. 실행을 거부한다" >&2
      exit 1
    fi
  fi
}

case "$MODE" in
run)
  sh "$SCRIPT_DIR/preflight.sh"
  require_branch

  # 1. 실행 잠금 — 같은 날짜 이중 실행만 막는다. probe/preflight 경고는
  #    claim에 기록될 뿐 실행을 막지 않는다.
  claim="$(python3 "$GATE" primary sweep --contract-path "$CONTRACT")"
  status="$(printf '%s' "$claim" | jget status)"
  provider="$(printf '%s' "$claim" | jget provider)"
  run_id="$(printf '%s' "$claim" | jget run_id)"
  token="$(printf '%s' "$claim" | jget owner_token)"
  if [ "$status" != "claimed" ] || [ "$provider" != "claude" ]; then
    echo "primary claim not usable (status=$status provider=$provider); 이 머신은 Codex fallback을 처리하지 않는다" >&2
    exit 1
  fi

  # 2. 네이티브 Claude Code 헤드리스 실행 — 계약 문서가 정본이다.
  run_dir="runs/$ACTOR/$run_id"
  set +e
  (cd "$PROJECT_ROOT" && claude --dangerously-skip-permissions ${MODEL_ARGS:+$MODEL_ARGS} -p \
    ".claude/vault/backlog/_NIGHT.md 를 읽고 오늘 밤 실행을 계약 그대로 수행하라. 시작 블록의 claim 조회부터 종료 기록(complete)까지 계약 문서가 유일한 정본이다. 이번 실행의 고정 값: actor_id=$ACTOR, run_id=$run_id, 결과 디렉터리=$run_dir/. 이 checkout의 _INBOX.md와 이 머신의 세션만 읽고, 이전 판정은 feedback/$ACTOR/ 만 소비한다. 모델 규칙: fable 모델은 주 실행·subagent 어디에도 쓰지 않는다.")
  claude_exit=$?
  set -e

  # 3. 계약이 스스로 상태를 닫지 못했으면 failed로 기록한다 (성공 도장은 계약만 찍는다).
  final="$(python3 "$GATE" state sweep --contract-path "$CONTRACT")"
  final_status="$(printf '%s' "$final" | jget status)"
  case "$final_status" in
  claimed | running)
    contract_hash="$(shasum -a 256 "$CONTRACT" | awk '{print $1}')"
    python3 "$GATE" complete sweep failed --run-id "$run_id" --token "$token" \
      --contract-hash "$contract_hash" || true
    ;;
  esac
  exit "$claude_exit"
  ;;

dry-run)
  sh "$SCRIPT_DIR/preflight.sh"
  require_branch
  TMP="$(mktemp -d /tmp/night-dryrun.XXXXXX)"
  trap 'rm -rf "$TMP"' EXIT
  echo "[1/6] preflight OK (actor=$ACTOR, inbox=$PROJECT_ROOT/.claude/vault/_INBOX.md)"

  claim="$(python3 "$GATE" primary sweep --state-dir "$TMP/gate" \
    --contract-path "$CONTRACT" --probe-timeout 30)"
  status="$(printf '%s' "$claim" | jget status)"
  provider="$(printf '%s' "$claim" | jget provider)"
  run_id="$(printf '%s' "$claim" | jget run_id)"
  token="$(printf '%s' "$claim" | jget owner_token)"
  if [ "$status" != "claimed" ] || [ "$provider" != "claude" ]; then
    echo "FAIL: primary claim (status=$status provider=$provider) — claude CLI 로그인/설치를 확인하라" >&2
    exit 1
  fi
  probe_warn="$(printf '%s' "$claim" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("probe_warning",""))')"
  [ -n "$probe_warn" ] && echo "      warn: $probe_warn"
  echo "[2/6] provider gate claim OK (run_id=$run_id)"

  contract_hash="$(shasum -a 256 "$CONTRACT" | awk '{print $1}')"
  snapshot_json="$(python3 "$SCRIPT_DIR/night-runtime.py" snapshot-inbox \
    --run-id "$run_id" --contract-hash "$contract_hash" --out-dir "$TMP/snapshots")"
  snapshot_id="$(printf '%s' "$snapshot_json" | jget snapshot_id)"
  snapshot_fingerprint="$(printf '%s' "$snapshot_json" | jget snapshot_fingerprint)"
  echo "[3/6] inbox snapshot OK (fingerprint=$snapshot_fingerprint)"

  python3 "$SCRIPT_DIR/harvest.py" --dry-run --project "$PROJECT_ROOT" \
    --contract-hash "$contract_hash" --snapshot-id "$snapshot_id" \
    --snapshot-fingerprint "$snapshot_fingerprint" >"$TMP/harvest.txt"
  echo "[4/6] harvest dry-run OK ($(wc -l <"$TMP/harvest.txt" | tr -d ' ')줄 출력)"

  # 결과 경로가 run 단위로 비어 있는지, 버튼 기록이 동작하는지 확인한다.
  run_dir="$PROJECT_ROOT/runs/$ACTOR/$run_id"
  if [ -e "$run_dir" ]; then
    echo "FAIL: run 디렉터리가 이미 존재한다: $run_dir" >&2
    exit 1
  fi
  python3 "$REVIEW_SERVER" --self-test --actor "$ACTOR" >"$TMP/review.txt"
  echo "[5/6] 결과 경로·리뷰 서버 OK (report=runs/$ACTOR/$run_id/report.html)"

  # 임시 cwd에서 절대경로로 읽는다 — 프로젝트 Stop 훅(typecheck-gate 등)이
  # headless 응답을 막으면 이 단계가 무관한 typecheck 상태에 인질로 잡힌다.
  answer="$(cd /private/tmp && claude -p \
    "읽기 전용 확인: $CONTRACT 파일의 첫 줄 제목을 그대로 한 줄만 출력하라." \
    --allowedTools "Read" --max-turns 8)"
  echo "[6/6] native claude contract read OK → $answer"

  python3 "$GATE" complete sweep failed --state-dir "$TMP/gate" \
    --run-id "$run_id" --token "$token" --contract-hash "$contract_hash" >/dev/null
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

review-server)
  exec python3 "$REVIEW_SERVER" --project "$PROJECT_ROOT" --actor "$ACTOR" --port "$REVIEW_PORT"
  ;;

*)
  echo "usage: sh night-launchd.sh [run|dry-run|open-report|review-server]" >&2
  exit 2
  ;;
esac
