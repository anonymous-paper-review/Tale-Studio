# 밤 러너 설치 — 이 macOS 머신은 launchd 사용

이 머신은 Orca 자동화가 아니라 macOS `launchd`가 이 저장소의 `_NIGHT.md` 계약대로
매일 밤 실행을 깨운다. 두 스케줄러를 동시에 켜면 같은 날 두 실행이 충돌하므로 Orca의
밤 루프 자동화와 Codex 대체 자동화는 꺼둔다.

각자 자기 컴퓨터에서 돈다. 메모는 `.claude/vault/inbox/<자기 이름>.md`에 쓴다 —
사람마다 파일이 따로라 git 충돌이 없고, push되면 상대 밤도 참고로 읽는다.
자기 전에 `sh .claude/vault/backlog/night-launchd.sh push-inbox` 한 줄이면 메모가
나가고, 안 해도 밤 실행이 시작할 때 알아서 시도한다(실패해도 밤은 로컬 내용으로 돈다).
결과(`runs/`)·판정(`feedback/`)·티켓·수확은 전부 로컬이다. 그 외에 git으로 나누는 것은
코드뿐이고, 밤이 만든 수리 branch의 merge는 사람이 한다.

## 1. 전제 확인

```sh
git --version
python3 --version
claude --version
claude -p "ok만 출력하라" --max-turns 1   # 로그인 확인
```

저장소가 clone되어 있고 `pnpm install`이 끝나 있어야 한다.
`.env.local`(과금 키)이 없어도 밤은 돌고, 유료 생성 단위만 `blocked`로 기록된다.

## 2. 현재 등록 상태

현재 오너 머신의 등록은 다음과 같다.

- label: `com.tale-studio.night-jh`
- 실행 시각: 매일 01:30 (`Asia/Seoul`)
- 실행 파일: `/Users/xcape/Library/Application Support/tale-studio-night/run-night-jh.sh`
- 로그: `~/Library/Logs/tale-studio-night/night-jh.log`
- 실행 잠금: `~/Library/Logs/tale-studio-night/provider-state/`
- actor: `jh`

등록 확인:

```sh
launchctl print "gui/$(id -u)/com.tale-studio.night-jh"
```

실행 엔진만 안전하게 점검하려면 실제 run 대신 다음을 쓴다.

```sh
sh .claude/vault/backlog/night-launchd.sh dry-run
```

## 3. 설치·재등록

이 머신에는 이미 등록되어 있다. 다른 macOS 머신에 설치할 때는 같은 구조로
`~/Library/LaunchAgents/com.tale-studio.night-<actor>.plist`와 실행 래퍼를 만들고,
`launchctl bootstrap "gui/$(id -u)" <plist>`를 실행한다. actor는 그 머신의
`jh` 또는 `hs`로 고정한다.

등록 전에 반드시 다음을 실행한다.

```sh
sh .claude/vault/backlog/night-launchd.sh dry-run
```

`DRY-RUN PASS`가 나오지 않으면 LaunchAgent를 등록하지 않는다.

## 4. 아침

08:30에 최신 `runs/<actor>/<run_id>/report.html`이 브라우저에 뜬다.
버튼(`merge`/`reject`/`feedback`)을 누르면 `feedback/<actor>/<run_id>/`에 기록되고,
자기 다음 밤 실행만 그 기록을 읽는다. 전부 로컬 파일이라 commit할 것이 없다.
밤이 만든 코드 수리 branch(`night/<actor>/…`)만 검토 후 merge·push 대상이다.

## 5. 운영 명령

```sh
sh .claude/vault/backlog/night-launchd.sh open-report        # 지금 보고서 열기
tail -f ~/Library/Logs/tale-studio-night/night-jh.log        # 밤 로그
launchctl kickstart -k "gui/$(id -u)/com.tale-studio.night-jh" # 즉시 1회 실행 (과금 가능)
launchctl bootout "gui/$(id -u)/com.tale-studio.night-jh"      # 해제
```

밤에 뚜껑을 덮어두는 노트북이면 잠든 Mac을 깨워야 한다:

```sh
sudo pmset repeat wakeorpoweron MTWRFSU 01:25:00
```

모델 규칙: `fable` 금지. 실행 스크립트가 환경변수에서 fable을 발견하면 시작을 거부한다.

정본: 계약 `.claude/vault/backlog/_NIGHT.md`
