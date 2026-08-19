#!/bin/sh
# 친구용 독립 밤 runner 설치기 (Linux/systemd) — night-friend-setup.sh의 launchd 판을 그대로 옮긴 것.
# macOS에서는 night-friend-setup.sh를 쓴다. Orca는 어느 쪽도 사용하지 않는다.
#
# launchd -> systemd user 대응:
#   com.tale-studio.night-<actor>          -> tale-studio-night-<actor>.timer + .service
#   com.tale-studio.night-review-<actor>   -> tale-studio-night-review-<actor>.service (Restart=always)
#   com.tale-studio.night-morning-<actor>  -> tale-studio-night-morning-<actor>.timer + .service
#
# 계약 13차: 결과가 전부 로컬이라 actor 전용 결과 branch는 없다. main에서 실행한다.
set -eu

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "저장소 루트에서 실행하라" >&2
  exit 1
}
RUNNER="$PROJECT_ROOT/.claude/vault/backlog/night-launchd.sh"
ACTOR_ID="${NIGHT_ACTOR_ID:-friend}"
HOUR="${NIGHT_HOUR:-1}"
MINUTE="${NIGHT_MINUTE:-30}"
REVIEW_PORT="${NIGHT_REVIEW_PORT:-8377}"
NIGHT_UNIT="tale-studio-night-${ACTOR_ID}"
REVIEW_UNIT="tale-studio-night-review-${ACTOR_ID}"
MORNING_UNIT="tale-studio-night-morning-${ACTOR_ID}"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/tale-studio-night-${ACTOR_ID}"
PATH_VALUE="${PATH:-/usr/local/bin:/usr/bin:/bin}"

fail() {
  echo "[friend-setup] FAIL: $*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "git이 없다"
command -v python3 >/dev/null 2>&1 || fail "python3이 없다"
command -v claude >/dev/null 2>&1 || fail "native claude CLI가 없다"
command -v systemctl >/dev/null 2>&1 || fail "systemctl이 없다 — macOS라면 night-friend-setup.sh를 써라"
systemctl --user show-environment >/dev/null 2>&1 || fail "systemd user 인스턴스에 붙을 수 없다"
[ -f "$RUNNER" ] || fail "night-launchd.sh가 없다: $RUNNER"
grep -q 'NIGHT_ACTOR_ID' "$RUNNER" || fail "runner가 구버전이다. git pull로 최신을 받아라"
if grep -q '/private/tmp' "$RUNNER"; then
  fail "runner에 macOS 전용 경로(/private/tmp)가 남아 있다"
fi

case "$ACTOR_ID" in ''|*[!a-z0-9-]*) fail "NIGHT_ACTOR_ID는 소문자·숫자·하이픈만 허용한다";; esac
case "$HOUR" in ''|*[!0-9]*) fail "NIGHT_HOUR가 숫자가 아니다";; esac
case "$MINUTE" in ''|*[!0-9]*) fail "NIGHT_MINUTE가 숫자가 아니다";; esac
[ "$HOUR" -ge 0 ] && [ "$HOUR" -le 23 ] || fail "NIGHT_HOUR는 0~23이어야 한다"
[ "$MINUTE" -ge 0 ] && [ "$MINUTE" -le 59 ] || fail "NIGHT_MINUTE는 0~59이어야 한다"

[ -z "$(git status --porcelain)" ] || fail "작업 트리가 더럽다. 변경을 먼저 commit하거나 보관하라"

mkdir -p "$UNIT_DIR" "$LOG_DIR"

# 아침 보고서를 브라우저로 띄우려면 user 인스턴스에 그래픽 세션 값이 있어야 한다.
# 지금 셸에 있는 값만 유닛에 굽는다 (없으면 보고서는 로그로만 남는다).
GUI_ENV=""
for v in DISPLAY WAYLAND_DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS; do
  eval "value=\${$v:-}"
  if [ -n "$value" ]; then
    GUI_ENV="${GUI_ENV}Environment=$v=$value
"
  fi
done

TIME_SPEC="$(printf '%02d:%02d:00' "$HOUR" "$MINUTE")"

cat > "$UNIT_DIR/${NIGHT_UNIT}.service" <<UNIT
[Unit]
Description=Tale-Studio 밤 runner (actor=$ACTOR_ID)

[Service]
Type=oneshot
WorkingDirectory=$PROJECT_ROOT
ExecStart=/bin/sh $RUNNER run
Environment=PATH=$PATH_VALUE
Environment=NIGHT_ACTOR_ID=$ACTOR_ID
Environment=NIGHT_REVIEW_PORT=$REVIEW_PORT
# 밤 실행은 몇 시간이 걸린다. oneshot 기본 90초 타임아웃을 반드시 푼다.
TimeoutStartSec=infinity
StandardOutput=append:$LOG_DIR/night.log
StandardError=append:$LOG_DIR/night.err.log
UNIT

cat > "$UNIT_DIR/${NIGHT_UNIT}.timer" <<UNIT
[Unit]
Description=Tale-Studio 밤 runner 예약 (actor=$ACTOR_ID, $TIME_SPEC)

[Timer]
OnCalendar=*-*-* $TIME_SPEC
AccuracySec=1min
# 머신이 꺼져 있어 놓친 밤은 낮에 따라잡지 않는다 (launchd RunAtLoad=false와 같은 뜻).
Persistent=false
Unit=${NIGHT_UNIT}.service

[Install]
WantedBy=timers.target
UNIT

# 리뷰 서버 — 아침 HTML의 merge/reject/feedback 버튼이 feedback/<actor>/에 기록한다.
cat > "$UNIT_DIR/${REVIEW_UNIT}.service" <<UNIT
[Unit]
Description=Tale-Studio 밤 리뷰 서버 (actor=$ACTOR_ID, port=$REVIEW_PORT)

[Service]
Type=simple
WorkingDirectory=$PROJECT_ROOT
ExecStart=/bin/sh $RUNNER review-server
Environment=PATH=$PATH_VALUE
Environment=NIGHT_ACTOR_ID=$ACTOR_ID
Environment=NIGHT_REVIEW_PORT=$REVIEW_PORT
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/review.log
StandardError=append:$LOG_DIR/review.err.log

[Install]
WantedBy=default.target
UNIT

# 아침 보고서 자동 열기 — 08:30에 최신 report를 기본 브라우저로 띄운다.
cat > "$UNIT_DIR/${MORNING_UNIT}.service" <<UNIT
[Unit]
Description=Tale-Studio 아침 보고서 열기 (actor=$ACTOR_ID)

[Service]
Type=oneshot
WorkingDirectory=$PROJECT_ROOT
ExecStart=/bin/sh $RUNNER open-report
Environment=PATH=$PATH_VALUE
Environment=NIGHT_ACTOR_ID=$ACTOR_ID
Environment=NIGHT_REVIEW_PORT=$REVIEW_PORT
${GUI_ENV}StandardOutput=append:$LOG_DIR/morning.log
StandardError=append:$LOG_DIR/morning.err.log
UNIT

cat > "$UNIT_DIR/${MORNING_UNIT}.timer" <<UNIT
[Unit]
Description=Tale-Studio 아침 보고서 예약 (actor=$ACTOR_ID, 08:30)

[Timer]
OnCalendar=*-*-* 08:30:00
AccuracySec=1min
Persistent=false
Unit=${MORNING_UNIT}.service

[Install]
WantedBy=timers.target
UNIT

if command -v systemd-analyze >/dev/null 2>&1; then
  for unit in "${NIGHT_UNIT}.service" "${NIGHT_UNIT}.timer" \
    "${REVIEW_UNIT}.service" "${MORNING_UNIT}.service" "${MORNING_UNIT}.timer"; do
    systemd-analyze --user verify "$UNIT_DIR/$unit" >/dev/null 2>&1 ||
      fail "생성한 systemd 유닛이 올바르지 않다: $unit"
  done
fi

systemctl --user daemon-reload
systemctl --user enable --now "${NIGHT_UNIT}.timer" >/dev/null
systemctl --user enable --now "${MORNING_UNIT}.timer" >/dev/null
systemctl --user enable "${REVIEW_UNIT}.service" >/dev/null
systemctl --user restart "${REVIEW_UNIT}.service"

# 로그아웃 상태에서도 타이머가 깨어나려면 linger가 필요하다.
if command -v loginctl >/dev/null 2>&1; then
  if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || echo no)" != "yes" ]; then
    loginctl enable-linger "$(id -un)" 2>/dev/null ||
      echo "[friend-setup] 경고: linger를 켜지 못했다. 로그아웃 중에는 밤 실행이 건너뛴다" >&2
  fi
fi

NIGHT_ACTOR_ID="$ACTOR_ID" NIGHT_REVIEW_PORT="$REVIEW_PORT" sh "$RUNNER" dry-run

echo "친구 독립 runner 설치 완료: $NIGHT_UNIT (리뷰 서버: http://127.0.0.1:$REVIEW_PORT/)"
echo "actor=$ACTOR_ID schedule=$(printf '%02d:%02d' "$HOUR" "$MINUTE")"
echo "log=$LOG_DIR/night.log"
