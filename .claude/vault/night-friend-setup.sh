#!/bin/sh
# 친구용 독립 밤 runner 설치기 — Orca를 사용하지 않는다.
set -eu

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "저장소 루트에서 실행하라" >&2
  exit 1
}
RUNNER="$PROJECT_ROOT/.claude/vault/backlog/night-launchd.sh"
ACTOR_ID="${NIGHT_ACTOR_ID:-friend}"
BRANCH="${NIGHT_GIT_BRANCH:-night/friend}"
HOUR="${NIGHT_HOUR:-1}"
MINUTE="${NIGHT_MINUTE:-30}"
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
grep -q 'NIGHT_RUN_PROFILE' "$RUNNER" || fail "독립 실행 프로필이 아직 설치되지 않았다. migration prompt를 먼저 실행하라"
grep -q 'NIGHT_ACTOR_ID' "$RUNNER" || fail "actor_id 지원이 아직 설치되지 않았다. migration prompt를 먼저 실행하라"

case "$HOUR" in ''|*[!0-9]*) fail "NIGHT_HOUR가 숫자가 아니다";; esac
case "$MINUTE" in ''|*[!0-9]*) fail "NIGHT_MINUTE가 숫자가 아니다";; esac
[ "$HOUR" -ge 0 ] && [ "$HOUR" -le 23 ] || fail "NIGHT_HOUR는 0~23이어야 한다"
[ "$MINUTE" -ge 0 ] && [ "$MINUTE" -le 59 ] || fail "NIGHT_MINUTE는 0~59이어야 한다"

[ -z "$(git status --porcelain)" ] || fail "작업 트리가 더럽다. 변경을 먼저 commit하거나 보관하라"
current_branch="$(git branch --show-current)"
if [ "$current_branch" != "$BRANCH" ]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git switch "$BRANCH"
  elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    git switch --track -c "$BRANCH" "origin/$BRANCH"
  else
    git switch -c "$BRANCH"
  fi
fi

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
    <key>NIGHT_RUN_PROFILE</key><string>independent</string>
    <key>NIGHT_GIT_BRANCH</key><string>$BRANCH</string>
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

NIGHT_ACTOR_ID="$ACTOR_ID" NIGHT_RUN_PROFILE=independent NIGHT_GIT_BRANCH="$BRANCH" \
  sh "$RUNNER" dry-run

echo "친구 독립 runner 설치 완료: $LABEL"
echo "branch=$BRANCH actor=$ACTOR_ID schedule=$(printf '%02d:%02d' "$HOUR" "$MINUTE")"
echo "log=$LOG_DIR/night.log"
