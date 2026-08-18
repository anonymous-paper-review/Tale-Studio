#!/bin/sh
# 친구용 독립 밤 runner 설치기 — Orca를 사용하지 않는다.
set -eu

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "저장소 루트에서 실행하라" >&2
  exit 1
}
RUNNER="$PROJECT_ROOT/.claude/vault/backlog/night-launchd.sh"
ACTOR_ID="${NIGHT_ACTOR_ID:-hs}"
HOUR="${NIGHT_HOUR:-1}"
MINUTE="${NIGHT_MINUTE:-30}"
REVIEW_PORT="${NIGHT_REVIEW_PORT:-8377}"
LABEL="com.tale-studio.night-${ACTOR_ID}"
LOG_DIR="$HOME/Library/Logs/tale-studio-night-${ACTOR_ID}"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
PATH_VALUE="${PATH:-/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin}"

fail() {
  echo "[friend-setup] FAIL: $*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "git이 없다"
command -v python3 >/dev/null 2>&1 || fail "python3이 없다"
command -v claude >/dev/null 2>&1 || fail "native claude CLI가 없다"
[ -f "$RUNNER" ] || fail "night-launchd.sh가 없다: $RUNNER"
grep -q 'NIGHT_ACTOR_ID' "$RUNNER" || fail "runner가 구버전이다. git pull로 최신을 받아라"

case "$HOUR" in ''|*[!0-9]*) fail "NIGHT_HOUR가 숫자가 아니다";; esac
case "$MINUTE" in ''|*[!0-9]*) fail "NIGHT_MINUTE가 숫자가 아니다";; esac
[ "$HOUR" -ge 0 ] && [ "$HOUR" -le 23 ] || fail "NIGHT_HOUR는 0~23이어야 한다"
[ "$MINUTE" -ge 0 ] && [ "$MINUTE" -le 59 ] || fail "NIGHT_MINUTE는 0~59이어야 한다"

[ -z "$(git status --porcelain)" ] || fail "작업 트리가 더럽다. 변경을 먼저 commit하거나 보관하라"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$RUNNER</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATH_VALUE</string>
    <key>NIGHT_ACTOR_ID</key><string>$ACTOR_ID</string>
    <key>NIGHT_REVIEW_PORT</key><string>$REVIEW_PORT</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>$MINUTE</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG_DIR/night.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/night.err.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null || fail "생성한 launchd plist가 올바르지 않다"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# 리뷰 서버 — 아침 HTML의 merge/reject/feedback 버튼이 feedback/<actor>/에 기록한다.
REVIEW_LABEL="com.tale-studio.night-review-${ACTOR_ID}"
REVIEW_PLIST="$HOME/Library/LaunchAgents/${REVIEW_LABEL}.plist"
cat > "$REVIEW_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$REVIEW_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$RUNNER</string>
    <string>review-server</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATH_VALUE</string>
    <key>NIGHT_ACTOR_ID</key><string>$ACTOR_ID</string>
    <key>NIGHT_REVIEW_PORT</key><string>$REVIEW_PORT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/review.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/review.err.log</string>
</dict>
</plist>
PLIST
plutil -lint "$REVIEW_PLIST" >/dev/null || fail "리뷰 서버 plist가 올바르지 않다"
launchctl bootout "gui/$(id -u)/$REVIEW_LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$REVIEW_PLIST"

# 아침 보고서 자동 열기 — 08:30에 최신 report를 기본 브라우저로 띄운다.
MORNING_LABEL="com.tale-studio.night-morning-${ACTOR_ID}"
MORNING_PLIST="$HOME/Library/LaunchAgents/${MORNING_LABEL}.plist"
cat > "$MORNING_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$MORNING_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$RUNNER</string>
    <string>open-report</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATH_VALUE</string>
    <key>NIGHT_ACTOR_ID</key><string>$ACTOR_ID</string>
    <key>NIGHT_REVIEW_PORT</key><string>$REVIEW_PORT</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>8</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/morning.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/morning.err.log</string>
</dict>
</plist>
PLIST
plutil -lint "$MORNING_PLIST" >/dev/null || fail "아침 보고서 plist가 올바르지 않다"
launchctl bootout "gui/$(id -u)/$MORNING_LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$MORNING_PLIST"

NIGHT_ACTOR_ID="$ACTOR_ID" NIGHT_REVIEW_PORT="$REVIEW_PORT" sh "$RUNNER" dry-run

echo "친구 독립 runner 설치 완료: $LABEL (리뷰 서버: http://127.0.0.1:$REVIEW_PORT/)"
echo "actor=$ACTOR_ID schedule=$(printf '%02d:%02d' "$HOUR" "$MINUTE")"
echo "log=$LOG_DIR/night.log"
