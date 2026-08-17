#!/bin/sh
# Orca precheck: 검증만 한다. 사용자 셸 설정이나 lock 파일을 수정하지 않는다.
# 실패는 0으로 숨기지 않고 호출자에게 돌려보낸다.
set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BACKLOG_ROOT="$PROJECT_ROOT/.claude/vault/backlog"
CONTRACT="$BACKLOG_ROOT/_NIGHT.md"
HARVEST="$BACKLOG_ROOT/harvest.py"
SNAPSHOT_RUNTIME="$BACKLOG_ROOT/night-runtime.py"
PROVIDER_GATE="$BACKLOG_ROOT/provider-gate.py"
INBOX="$PROJECT_ROOT/.claude/vault/_INBOX.md"
TICKETS_ROOT="$BACKLOG_ROOT/tickets"
REPORTS_ROOT="$BACKLOG_ROOT/reports"
OLD_SWEEP="$BACKLOG_ROOT/_SWEEP.md"
OLD_NOW="$PROJECT_ROOT/.claude/vault/destination/_NOW.md"
OLD_MORNING="$BACKLOG_ROOT/_MORNING.md"

fail() {
  echo "[preflight] FAIL: $*" >&2
  exit 1
}

[ -d "$PROJECT_ROOT" ] || fail "project root missing: $PROJECT_ROOT"
[ -d "$BACKLOG_ROOT" ] || fail "backlog root missing: $BACKLOG_ROOT"
[ -f "$CONTRACT" ] || fail "night contract missing: $CONTRACT"
[ -f "$HARVEST" ] || fail "harvest script missing: $HARVEST"
[ -f "$SNAPSHOT_RUNTIME" ] || fail "snapshot runtime missing: $SNAPSHOT_RUNTIME"
[ -f "$PROVIDER_GATE" ] || fail "provider gate helper missing: $PROVIDER_GATE"
[ -f "$INBOX" ] || fail "owner inbox missing: $INBOX"
[ -d "$TICKETS_ROOT" ] || fail "tickets directory missing: $TICKETS_ROOT"
[ -d "$REPORTS_ROOT" ] || fail "reports directory missing: $REPORTS_ROOT"
[ ! -e "$OLD_SWEEP" ] || fail "obsolete live sweep contract still exists: $OLD_SWEEP"
[ ! -e "$OLD_NOW" ] || fail "obsolete live destination still exists: $OLD_NOW"
[ ! -e "$OLD_MORNING" ] || fail "obsolete live morning review still exists: $OLD_MORNING"
# 티켓이 backlog 루트에 다시 평평하게 쌓이면 계약 위반이다 (_NIGHT.md만 허용).
stray_md="$(find "$BACKLOG_ROOT" -maxdepth 1 -name '*.md' ! -name '_NIGHT.md' | wc -l | tr -d ' ')"
[ "$stray_md" = "0" ] || fail "stray ticket markdown at backlog root; move into $TICKETS_ROOT"

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
