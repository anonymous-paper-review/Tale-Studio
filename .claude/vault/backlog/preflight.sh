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
[ -f "$BACKLOG_ROOT/provider-gate.py" ] || warn "provider gate helper missing"
[ -f "$BACKLOG_ROOT/night-review-server.py" ] || warn "review server missing"
[ -d "$PROJECT_ROOT/.claude/vault/inbox" ] || warn "shared inbox directory missing: .claude/vault/inbox/"
[ -f "$PROJECT_ROOT/.claude/agents/night-investigator.md" ] || warn "night investigator agent missing"
[ -f "$PROJECT_ROOT/.claude/skills/night-debug-run/SKILL.md" ] || warn "night debug-run skill missing"
[ -d "$BACKLOG_ROOT/tickets" ] || warn "tickets directory missing"

command -v python3 >/dev/null 2>&1 || warn "python3 is unavailable"
command -v git >/dev/null 2>&1 || warn "git is unavailable"
command -v claude >/dev/null 2>&1 || warn "claude CLI is unavailable"
git -C "$PROJECT_ROOT" rev-parse --show-toplevel >/dev/null 2>&1 || warn "project is not a git worktree"

# 계약 정합 — 어긋나면 알리되 막지 않는다.
if [ -f "$CONTRACT" ]; then
  grep -q '^# 밤 루프' "$CONTRACT" || warn "night contract header is invalid"
  grep -q 'inbox/' "$CONTRACT" || warn "night contract does not consume shared inbox"
fi
# 티켓이 backlog 루트에 평평하게 쌓이면 정리 대상이다 (_NIGHT.md만 허용).
stray_md="$(find "$BACKLOG_ROOT" -maxdepth 1 -name '*.md' ! -name '_NIGHT.md' 2>/dev/null | wc -l | tr -d ' ')"
[ "$stray_md" = "0" ] || warn "stray markdown at backlog root ($stray_md) — move into tickets/"

echo "[preflight] 점검 완료 — 경고 ${WARNINGS}건"
exit 0
