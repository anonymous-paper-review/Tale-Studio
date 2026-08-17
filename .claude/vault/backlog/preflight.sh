#!/bin/sh
# Orca precheck: 검증만 한다. 사용자 셸 설정이나 lock 파일을 수정하지 않는다.
# 실패는 0으로 숨기지 않고 호출자에게 돌려보낸다.
set -eu

PROJECT_ROOT="/Users/xcape/projects/tale-studio"
BACKLOG_ROOT="$PROJECT_ROOT/.claude/vault/backlog"
CONTRACT="$BACKLOG_ROOT/_NIGHT.md"
HARVEST="$BACKLOG_ROOT/harvest.py"
INBOX="$PROJECT_ROOT/.claude/vault/_INBOX.md"
OLD_SWEEP="$BACKLOG_ROOT/_SWEEP.md"
OLD_NOW="$PROJECT_ROOT/.claude/vault/destination/_NOW.md"

fail() {
  echo "[preflight] FAIL: $*" >&2
  exit 1
}

[ -d "$PROJECT_ROOT" ] || fail "project root missing: $PROJECT_ROOT"
[ -d "$BACKLOG_ROOT" ] || fail "backlog root missing: $BACKLOG_ROOT"
[ -f "$CONTRACT" ] || fail "night contract missing: $CONTRACT"
[ -f "$HARVEST" ] || fail "harvest script missing: $HARVEST"
[ -f "$INBOX" ] || fail "owner inbox missing: $INBOX"
[ ! -e "$OLD_SWEEP" ] || fail "obsolete live sweep contract still exists: $OLD_SWEEP"
[ ! -e "$OLD_NOW" ] || fail "obsolete live destination still exists: $OLD_NOW"

command -v python3 >/dev/null 2>&1 || fail "python3 is unavailable"
command -v git >/dev/null 2>&1 || fail "git is unavailable"
git -C "$PROJECT_ROOT" rev-parse --show-toplevel >/dev/null 2>&1 || fail "project is not a git worktree"

# The live runner reads this path. A stale or missing spec reference is a contract failure.
grep -q '^# 밤 루프' "$CONTRACT" || fail "night contract header is invalid"
grep -q '_INBOX.md' "$CONTRACT" || fail "night contract does not consume _INBOX.md"
if grep -Eq '(^|[[:space:]`])(_SWEEP|destination/_NOW|\.omc/specs)' "$CONTRACT"; then
  fail "night contract contains an obsolete live reference"
fi

exit 0
