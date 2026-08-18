# 밤 러너 setup — Orca 없는 macOS 머신 (launchd)

> 이 문서는 개발자 머신의 Claude Code가 읽고 **그대로 실행**하는 설치 절차다.
> 목적: 매일 밤 지정 시각에 macOS launchd(맥 기본 예약 실행기)가 이 저장소의
> `.claude/vault/backlog/_NIGHT.md` 계약대로 자율 실행을 깨우게 한다.
> Orca가 있는 머신(오너 머신)은 이 문서가 필요 없다 — Orca가 같은 일을 이미 한다.

## 0. 전제 확인 — 전부 통과해야 다음으로 간다

```sh
git --version        # git
python3 --version    # python3
pnpm --version       # pnpm
claude --version     # Claude Code CLI (없으면 https://claude.ai/download 참고 후 로그인)
claude -p "ok만 출력하라" --max-turns 1   # 로그인·응답 확인 (응답이 오면 통과)
```

- 이 저장소가 clone되어 있고 `pnpm install`이 끝나 있어야 한다.
- `.env.local`(모델·과금 키)이 없으면 밤 실행 자체는 돌되, 유료 생성 단위는
  `blocked`로 안전하게 기록되고 넘어간다. 실패가 아니다.

## 1. 설치 전 검증 — dry-run

저장소 루트에서:

```sh
sh .claude/vault/backlog/night-launchd.sh dry-run
```

마지막 줄에 `DRY-RUN PASS`가 나와야 한다. 다섯 단계가 각각 검증하는 것:

1. `preflight` — 계약·도구·디렉터리 구조가 온전한가
2. `provider gate claim` — 실행 잠금이 만들어지고, **네이티브 Claude 헤드리스 프로브**가 응답하는가
3. `inbox snapshot` — 오너 메모를 바이트 그대로 사진 찍을 수 있는가
4. `harvest dry-run` — 세션 수확기가 읽기 전용으로 도는가
5. `native claude contract read` — Claude Code가 계약 문서를 실제로 읽는가

dry-run은 임시 디렉터리만 쓰므로 진짜 밤 상태와 절대 충돌하지 않는다.
실패하면 그 단계의 메시지를 고치고 다시 돌린다. 통과 전에는 2단계로 가지 않는다.

## 1.5 다른 개발자의 inbox 입력

밤 실행은 오너 머신 하나만 담당한다. 다른 개발자는 새벽 실행 전에 자신의
`_INBOX.md`에 기존 줄을 지우거나 고치지 않고 메모를 추가한 뒤 commit/push만 한다.
오너의 `run`이 claim 전에 `night-inbox-sync.py`로 원격 `main`을 가져와 양쪽 추가 내용을
합친다.

- 친구 push가 없으면 오너의 현재 inbox만으로 계속한다.
- 기존 줄을 고치거나 지운 충돌은 자동으로 선택하지 않고 `merge-conflict`로 멈춘다.
- 실행 완료 archive는 원문 삭제가 아니라 snapshot 복사와 소비 manifest다.
- archive 상태는 `awaiting-owner-review`이며, 아침 HTML의 `merge` 또는 `reject`가
  최종 판정이다.

## 2. launchd 등록

이 절은 **밤 coordinator인 오너 머신에만** 적용한다. 친구 머신은 이 `run` LaunchAgent를
등록하지 않는다. 친구는 새벽에 아래처럼 inbox만 commit/push하거나 오너가 제공한 별도
입력 publish 명령만 실행한다.

```sh
git add .claude/vault/_INBOX.md
git commit -m "docs(inbox): publish nightly notes"
git push origin main
```

Claude Code는 아래 절차를 실행하되, 자리표시자를 먼저 실제 값으로 치환한다.

- `__PROJECT_ROOT__` ← `git rev-parse --show-toplevel` 결과
- `__CLAUDE_DIR__` ← `dirname "$(command -v claude)"` 결과
- `__PNPM_DIR__` ← `dirname "$(command -v pnpm)"` 결과
- 실행 시각은 기본 01:30(머신 로컬 시간). 개발자가 다른 시각을 원하면 그 값을 쓴다.

```sh
mkdir -p ~/Library/Logs/tale-studio-night
cat > ~/Library/LaunchAgents/com.tale-studio.night.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.tale-studio.night</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>__PROJECT_ROOT__/.claude/vault/backlog/night-launchd.sh</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key><string>__PROJECT_ROOT__</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>__CLAUDE_DIR__:__PNPM_DIR__:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>1</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>StandardOutPath</key><string>__HOME__/Library/Logs/tale-studio-night/night.log</string>
  <key>StandardErrorPath</key><string>__HOME__/Library/Logs/tale-studio-night/night.err.log</string>
</dict>
</plist>
PLIST
# (치환을 잊지 말 것: __PROJECT_ROOT__, __CLAUDE_DIR__, __PNPM_DIR__, __HOME__)

launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.tale-studio.night.plist
launchctl print "gui/$(id -u)/com.tale-studio.night" | head -5   # 등록 확인
```

## 3. 아침 보고서 자동 열기 — 브라우저 렌더까지

아침에 사용자가 아무것도 안 해도, 가장 최신 밤 보고서 HTML이 그 사용자의 기본
웹브라우저에 렌더된 채로 떠 있게 한다. 아래 plist도 같은 방식으로 치환 후 등록한다
(시각 기본 08:30 — 밤 실행이 오전 8시에 마감되므로 그 뒤가 안전하다).

```sh
cat > ~/Library/LaunchAgents/com.tale-studio.morning-report.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.tale-studio.morning-report</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>__PROJECT_ROOT__/.claude/vault/backlog/night-launchd.sh</string>
    <string>open-report</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>8</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>StandardOutPath</key><string>__HOME__/Library/Logs/tale-studio-night/morning.log</string>
  <key>StandardErrorPath</key><string>__HOME__/Library/Logs/tale-studio-night/morning.err.log</string>
</dict>
</plist>
PLIST
# (치환: __PROJECT_ROOT__, __HOME__)

launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.tale-studio.morning-report.plist
```

- `open` 명령은 macOS 기본 브라우저(그 사용자가 쓰는 브라우저)로 여므로 별도 설정이
  필요 없다. 지금 바로 확인하려면: `sh .claude/vault/backlog/night-launchd.sh open-report`
- 8:30에 맥이 자고 있었으면 깨어난 직후 한 번 실행된다 (launchd 기본 동작).

## 4. (선택) 자는 Mac 깨우기

launchd는 잠든 Mac을 깨우지 못한다. 밤에 뚜껑을 덮어두는 머신이면:

```sh
sudo pmset repeat wakeorpoweron MTWRFSU 01:25:00
```

전원이 연결된 데스크톱이거나 밤에 깨어 있는 머신이면 생략한다.

## 5. 운영 명령

```sh
# 지금 즉시 1회 실행 (테스트용 — 실제 밤 실행이 돌고 과금될 수 있다)
launchctl kickstart -k "gui/$(id -u)/com.tale-studio.night"

# 로그 보기
tail -f ~/Library/Logs/tale-studio-night/night.log

# 해제
launchctl bootout "gui/$(id -u)/com.tale-studio.night"
```

## 6. 설치가 끝나면 무엇이 달라지나

- 매일 밤 01:30에 실행 잠금이 만들어지고, 네이티브 Claude Code가
  `_NIGHT.md` 계약대로 메모 해석 → 분해 → 실행 → 기록을 수행한다.
- 이 머신은 inbox 입력을 publish하는 역할만 맡고 밤 실행은 하지 않는다. 오너 머신의
  `night-launchd.sh run`이 원격 inbox를 먼저 동기화한 뒤 유일하게 밤을 실행한다.
- 오너(사람) 접점은 두 개뿐이다:
  - 쓰기: `.claude/vault/_INBOX.md` — 형식 없는 메모와 아침 판정(merge/reject/feedback)
  - 읽기: `.claude/vault/backlog/reports/YYYY-MM-DD.html` — 날짜별 사람 보고서
- 화면 스모크 테스트(`pnpm smoke`)는 Orca 런타임 전제가 없으면 실패 대신 skip으로
  빠진다. 브라우저 렌더 증거가 필요한 밤 작업은 오너 머신 쪽 실행이 담당한다.
- 모델 규칙: `fable` 모델은 금지다 — 주 실행·subagent·worktree 위임 전부. 실행 스크립트가
  환경변수(`NIGHT_CLAUDE_MODEL`, `ANTHROPIC_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`)에서
  fable을 발견하면 시작 자체를 거부한다. 다른 모델을 쓰려면 `NIGHT_CLAUDE_MODEL=<모델명>`을
  plist의 EnvironmentVariables에 넣는다.
- 안전 경계는 계약 그대로다: 비가역 행동과 예산 한도($50/일 생성 도구)만 hard-stop,
  그림·영상의 좋고 나쁨 판정은 사람만 한다.

정본: 계약 `.claude/vault/backlog/_NIGHT.md` · 안내 `.claude/vault/night-runner-guide.html`
