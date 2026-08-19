#!/bin/sh
# 점검 보고 — 실행을 막지 않는다. 어긋난 것은 warn으로 남기고 밤이 스스로
# 고치거나 기록한다. 항상 exit 0. (도구가 아예 없으면 어차피 실행 단계가
# 실패하고 그 실패가 기록으로 남는다.)
set -u

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BACKLOG_ROOT="$PROJECT_ROOT/.claude/vault/backlog"
CONTRACT="$BACKLOG_ROOT/_NIGHT.md"
WARNINGS=0

warn() {
  echo "[preflight] warn: $*" >&2
  WARNINGS=$((WARNINGS + 1))
}

[ -f "$CONTRACT" ] || warn "night contract missing: $CONTRACT"
[ -f "$BACKLOG_ROOT/harvest.py" ] || warn "harvest script missing"
[ -f "$BACKLOG_ROOT/night-runtime.py" ] || warn "snapshot runtime missing"
[ -f "$BACKLOG_ROOT/ticket-runtime.py" ] || warn "ticket runtime missing"
[ -f "$BACKLOG_ROOT/provider-gate.py" ] || warn "provider gate helper missing"
[ -f "$BACKLOG_ROOT/night-review-server.py" ] || warn "night review server missing"
[ -d "$PROJECT_ROOT/.claude/vault/inbox" ] || warn "shared inbox directory missing: .claude/vault/inbox/"
[ -f "$PROJECT_ROOT/.claude/vault/inbox/jh.md" ] || warn "required jh inbox missing: launcher run refuses to claim without both jh.md and hs.md"
[ -f "$PROJECT_ROOT/.claude/vault/inbox/hs.md" ] || warn "required hs inbox missing: launcher run refuses to claim without both jh.md and hs.md"
[ -f "$PROJECT_ROOT/.claude/agents/night-investigator.md" ] || warn "night investigator agent missing"
[ -f "$PROJECT_ROOT/.claude/skills/night-debug-run/SKILL.md" ] || warn "night debug-run skill missing"
[ -d "$BACKLOG_ROOT/tickets" ] || warn "tickets directory missing"
RECEIPT_DIR="$BACKLOG_ROOT/tickets/receipts"
[ -d "$RECEIPT_DIR" ] || [ -w "$BACKLOG_ROOT/tickets" ] ||
  warn "canonical receipt directory is unavailable or cannot be created: $RECEIPT_DIR"

command -v python3 >/dev/null 2>&1 || warn "python3 is unavailable"
command -v git >/dev/null 2>&1 || warn "git is unavailable"
command -v claude >/dev/null 2>&1 || warn "claude CLI is unavailable"
git -C "$PROJECT_ROOT" rev-parse --show-toplevel >/dev/null 2>&1 || warn "project is not a git worktree"

# 새 runtime/provider 경계는 실행 전에 help로만 확인한다. 경고 정책은 유지한다.
if command -v python3 >/dev/null 2>&1 && [ -f "$BACKLOG_ROOT/night-runtime.py" ]; then
  python3 "$BACKLOG_ROOT/night-runtime.py" snapshot-inbox-set --help >/dev/null 2>&1 ||
    warn "night runtime lacks snapshot-inbox-set command"
  python3 "$BACKLOG_ROOT/night-runtime.py" scan-inbox --help >/dev/null 2>&1 ||
    warn "night runtime lacks scan-inbox command"
  python3 "$BACKLOG_ROOT/night-runtime.py" track-inbox --help >/dev/null 2>&1 ||
    warn "night runtime lacks track-inbox command"
  python3 "$BACKLOG_ROOT/night-runtime.py" reconcile-inbox --help >/dev/null 2>&1 ||
    warn "night runtime lacks reconcile-inbox command"
fi
if command -v python3 >/dev/null 2>&1 && [ -f "$BACKLOG_ROOT/ticket-runtime.py" ]; then
  for ticket_command in claim heartbeat checkpoint takeover release status list; do
    python3 "$BACKLOG_ROOT/ticket-runtime.py" "$ticket_command" --help >/dev/null 2>&1 ||
      warn "ticket runtime read-only help failed: $ticket_command"
  done
fi
if command -v python3 >/dev/null 2>&1 && [ -f "$BACKLOG_ROOT/provider-gate.py" ]; then
  python3 "$BACKLOG_ROOT/provider-gate.py" --help >/dev/null 2>&1 ||
    warn "provider gate help is unavailable"
fi

# 계약 정합 — 어긋나면 알리되 막지 않는다.
if [ -f "$CONTRACT" ]; then
  grep -q '^# 밤 루프' "$CONTRACT" || warn "night contract header is invalid"
  grep -q 'inbox/' "$CONTRACT" || warn "night contract does not consume shared inbox"
fi
# marker wrapper의 경계는 사람이 쓴 원문과 machine metadata를 분리한다. 읽기만 하며
# inbox를 고치지 않는다.
for inbox in "$PROJECT_ROOT/.claude/vault/inbox/jh.md" "$PROJECT_ROOT/.claude/vault/inbox/hs.md"; do
  [ -f "$inbox" ] && grep -q '^---$' "$inbox" ||
    warn "required inbox delimiter missing: $inbox"
done
# 티켓이 backlog 루트에 평평하게 쌓이면 정리 대상이다 (_NIGHT.md만 허용).
stray_md="$(find "$BACKLOG_ROOT" -maxdepth 1 -name '*.md' ! -name '_NIGHT.md' 2>/dev/null | wc -l | tr -d ' ')"
[ "$stray_md" = "0" ] || warn "stray markdown at backlog root ($stray_md) — move into tickets/"

echo "[preflight] 점검 완료 — 경고 ${WARNINGS}건"
exit 0
