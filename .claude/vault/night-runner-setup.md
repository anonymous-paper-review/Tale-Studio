# 밤 러너 설치 — Orca 없는 macOS 머신

밤마다 launchd가 이 저장소의 `_NIGHT.md` 계약대로 자율 실행을 깨운다.
Orca가 있는 오너 머신은 이 문서가 필요 없다. Orca가 같은 일을 이미 한다.

각자 자기 컴퓨터에서 돈다. 실행은 자기 `_INBOX.md`와 자기 세션만 읽고,
결과는 `runs/<actor>/<run_id>/`에 남아 자기 branch로 push된다.
아침에 서로 `git pull` 하면 상대 report를 열어볼 수 있다.
merge는 사람이 Git에서 한다.

## 1. 전제 확인

```sh
git --version
python3 --version
claude --version
claude -p "ok만 출력하라" --max-turns 1   # 로그인 확인
```

저장소가 clone되어 있고 `pnpm install`이 끝나 있어야 한다.
`.env.local`(과금 키)이 없어도 밤은 돌고, 유료 생성 단위만 `blocked`로 기록된다.

## 2. 설치

저장소 루트에서 한 줄:

```sh
sh .claude/vault/night-friend-setup.sh
```

script가 하는 일:

- git·python3·claude CLI·branch·깨끗한 작업 트리 확인
- LaunchAgent 3개 등록: 밤 실행(01:30), 리뷰 서버(상시), 아침 보고서 열기(08:30)
- 마지막에 `dry-run`을 돌려 6단계 검증 — `DRY-RUN PASS`가 나와야 설치 완료

기본 actor는 `friend`, 기본 branch는 `night-runs/friend`다. 다른 값이 필요하면:

```sh
NIGHT_ACTOR_ID=owner NIGHT_GIT_BRANCH=night-runs/owner NIGHT_HOUR=2 sh .claude/vault/night-friend-setup.sh
```

설치 없이 검증만 하려면:

```sh
sh .claude/vault/backlog/night-launchd.sh dry-run
```

## 3. 아침

08:30에 최신 `runs/<actor>/<run_id>/report.html`이 브라우저에 뜬다.
버튼(`merge`/`reject`/`feedback`)을 누르면 `feedback/<actor>/<run_id>/`에 기록되고,
자기 다음 밤 실행만 그 기록을 읽는다. 확인이 끝나면:

```sh
git add runs feedback && git commit -m "review(<actor>): 밤 결과 판정" && git push
```

상대 결과를 보려면 `git pull` 후 상대 report를 연다. 상대에게 전할 말은 직접 한다.

## 4. 운영 명령

```sh
sh .claude/vault/backlog/night-launchd.sh open-report        # 지금 보고서 열기
tail -f ~/Library/Logs/tale-studio-night-<actor>/night.log   # 밤 로그
launchctl kickstart -k "gui/$(id -u)/com.tale-studio.night-<actor>"   # 즉시 1회 실행 (과금 가능)
launchctl bootout "gui/$(id -u)/com.tale-studio.night-<actor>"        # 해제
```

밤에 뚜껑을 덮어두는 노트북이면 잠든 Mac을 깨워야 한다:

```sh
sudo pmset repeat wakeorpoweron MTWRFSU 01:25:00
```

모델 규칙: `fable` 금지. 실행 스크립트가 환경변수에서 fable을 발견하면 시작을 거부한다.

정본: 계약 `.claude/vault/backlog/_NIGHT.md`
