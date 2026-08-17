#!/bin/sh
# 밤 실행 진입점 — launchd(또는 사람 손)가 부른다. Orca 없이도 동작한다.
#
# 사용법:
#   sh night-launchd.sh run          # 실제 밤 실행: claim → 네이티브 claude 실행 → 종료 기록
#   sh night-launchd.sh dry-run      # 원장에 아무것도 쓰지 않고 파이프라인 전체를 검증
#   sh night-launchd.sh open-report  # 가장 최신 밤 보고서 HTML을 기본 브라우저로 연다 (아침용)
#
# dry-run은 임시 상태 디렉터리를 쓰므로 진짜 밤 claim과 절대 충돌하지 않는다.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GATE="$SCRIPT_DIR/provider-gate.py"
CONTRACT="$SCRIPT_DIR/_NIGHT.md"
MODE="${1:-run}"

jget() { python3 -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }

case "$MODE" in
run)
  sh "$SCRIPT_DIR/preflight.sh"
  # 1. 실행 잠금 (같은 날짜에 주 실행 하나만 허용; claude 프로브 실패 시 fail-closed)
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
  set +e
  (cd "$PROJECT_ROOT" && claude --dangerously-skip-permissions -p \
    ".claude/vault/backlog/_NIGHT.md 를 읽고 오늘 밤 실행을 계약 그대로 수행하라. 시작 블록의 claim 조회부터 종료 기록(complete)까지 계약 문서가 유일한 정본이다.")
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
  TMP="$(mktemp -d /tmp/night-dryrun.XXXXXX)"
  trap 'rm -rf "$TMP"' EXIT
  echo "[1/5] preflight OK"

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
  echo "[2/5] provider gate claim OK (claude 헤드리스 프로브 통과, run_id=$run_id)"

  contract_hash="$(shasum -a 256 "$CONTRACT" | awk '{print $1}')"
  snapshot_json="$(python3 "$SCRIPT_DIR/night-runtime.py" snapshot-inbox \
    --run-id "$run_id" --contract-hash "$contract_hash" --out-dir "$TMP/snapshots")"
  snapshot_id="$(printf '%s' "$snapshot_json" | jget snapshot_id)"
  snapshot_fingerprint="$(printf '%s' "$snapshot_json" | jget snapshot_fingerprint)"
  echo "[3/5] inbox snapshot OK (fingerprint=$snapshot_fingerprint)"

  python3 "$SCRIPT_DIR/harvest.py" --dry-run --project "$PROJECT_ROOT" \
    --contract-hash "$contract_hash" --snapshot-id "$snapshot_id" \
    --snapshot-fingerprint "$snapshot_fingerprint" >"$TMP/harvest.txt"
  echo "[4/5] harvest dry-run OK ($(wc -l <"$TMP/harvest.txt" | tr -d ' ')줄 출력)"

  answer="$(cd "$PROJECT_ROOT" && claude -p \
    "읽기 전용 확인: .claude/vault/backlog/_NIGHT.md 파일의 첫 줄 제목을 그대로 한 줄만 출력하라." \
    --allowedTools "Read" --max-turns 4)"
  echo "[5/5] native claude contract read OK → $answer"

  python3 "$GATE" complete sweep failed --state-dir "$TMP/gate" \
    --run-id "$run_id" --token "$token" --contract-hash "$contract_hash" >/dev/null
  echo "DRY-RUN PASS — 이 머신에서 밤 실행이 동작한다."
  ;;

open-report)
  # 아침용: 가장 최신 날짜 보고서를 사용자 기본 브라우저로 렌더한다.
  latest="$(ls -t "$SCRIPT_DIR/reports/"*.html 2>/dev/null | head -n 1 || true)"
  if [ -n "$latest" ]; then
    open "$latest"
    echo "opened: $latest"
  else
    echo "열 보고서가 없다: $SCRIPT_DIR/reports/" >&2
    exit 1
  fi
  ;;

*)
  echo "usage: sh night-launchd.sh [run|dry-run|open-report]" >&2
  exit 2
  ;;
esac
