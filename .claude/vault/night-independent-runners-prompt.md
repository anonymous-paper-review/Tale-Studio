# 독립 실행형 밤 러너 전환 프롬프트

이 저장소의 밤 러너를 **두 개발자가 각자 자기 컴퓨터에서 독립 실행**하는 구조로 전환하라. 지금 코드를 그대로 설명하지 말고, 아래 요구사항을 구현하고 검증하라.

## 목표

- owner와 friend가 각자 로컬 Claude Code 메인 세션으로 밤 실행한다.
- 각자 자기 `.claude/vault/_INBOX.md`와 자기 로컬 harvest만 읽는다.
- 상대방 inbox를 pull해서 합치거나 덮어쓰지 않는다.
- 각자 subagent와 worktree를 사용한다.
- 각자 결과 HTML·세션 요약·feedback을 자기 actor namespace로 commit/push한다.
- 두 사람이 아침에 `git pull` 후 서로의 HTML을 볼 수 있다.
- 최종 merge는 사람이 Git에서 한다. 밤 runner가 상대 branch나 상대 코드를 자동 merge하지 않는다.

## 현재 코드에서 반드시 뒤집어야 하는 것

- `night-launchd.sh`가 `night-inbox-sync.py`로 원격 inbox를 합치는 owner-only 흐름을 `NIGHT_RUN_PROFILE=independent`에서는 끄고, shared 흐름은 명시적 legacy 프로필로만 남긴다.
- `_NIGHT.md`의 “친구 inbox 병합·오너 harvest만 사용·오너 머신 하나만 실행” 문장을 독립 실행 계약으로 바꾼다.
- 날짜 하나를 덮는 `reports/YYYY-MM-DD.html` 대신 actor와 run을 포함한 immutable 경로를 사용한다.
- 예: `runs/owner/2026-08-18-<run-id>/report.html`, `runs/friend/2026-08-18-<run-id>/report.html`.
- worktree와 branch 이름에 actor를 넣는다: `night/owner/<run-id>/<unit-id>`, `night/friend/<run-id>/<unit-id>`.
- provider state, snapshot, harvest 산출물, feedback에는 `actor_id`와 `run_id`를 넣는다. 기본 provider state가 `$HOME` 로컬이라는 사실을 이용해 두 컴퓨터의 실행을 독립시킨다.

## 입력·출력 계약

각 actor는 다음만 읽는다.

```text
local `.claude/vault/_INBOX.md`
local Claude/gjc session store
local code checkout
```

각 actor는 다음을 자기 branch에만 쓴다.

```text
runs/<actor>/<run-id>/manifest.json
runs/<actor>/<run-id>/report.html
runs/<actor>/<run-id>/sessions/*.md
runs/<actor>/<run-id>/worktrees.json
feedback/<actor>/<run-id>/*.json
```

원본 세션 JSONL과 로컬 worktree 절대경로는 공유하지 않는다. HTML에는 파일:줄, session id, branch, commit, 요약만 넣는다. 상대 컴퓨터에서도 열리는 상대 경로 또는 원격 commit 링크를 사용한다.

## 피드백

정적 HTML은 파일을 쓸 수 없으므로 각 컴퓨터에서 `127.0.0.1`에 작은 review server를 제공한다.

- HTML의 `merge`, `reject`, `feedback` 버튼은 현재 actor의 `feedback/<actor>/<run-id>/`에 append-only 이벤트를 쓴다.
- 버튼을 누른 결과는 자동 commit하지 말고 사용자가 확인 후 push한다.
- 다음 밤 실행은 **자기 actor의 feedback만** 읽어 자기 report와 자기 작업을 이어간다.
- 상대 actor의 report와 commit은 사람이 읽을 수 있는 참고 자료일 뿐 자동 입력이 아니다.
  상대 report에 남긴 검토 의견도 상대 실행으로 자동 전달하지 않는다. 상대에게 보낼
  의견은 상대 actor를 명시한 별도 review 기록으로 남기고, 상대가 직접 가져가기로
  결정한 경우에만 그 actor의 inbox에 다시 적는다.
- 중앙 서버는 만들지 않는다. 두 사람이 버튼 결과를 실시간으로 서로 봐야 한다는 요구가 생길 때만 별도 설계한다.

## 실행 프로필

- `NIGHT_ACTOR_ID`: `owner` 또는 `friend`처럼 안정적인 식별자
- `NIGHT_RUN_PROFILE=independent`: inbox remote sync 금지
- `NIGHT_GIT_BRANCH`: actor 전용 branch
- `NIGHT_REVIEW_PORT`: 로컬 review server port
- fable 모델은 계속 fail-closed 금지

`night-launchd.sh run`과 `dry-run`은 위 환경변수를 읽고, 독립 프로필에서는 다른 actor의 inbox를 읽지 않아야 한다. friend는 Orca를 사용하지 않으므로 native `claude -p`와 macOS launchd만 사용한다.

## 수용 기준

1. 두 임시 Git clone에서 actor `owner`와 `friend`가 동시에 `dry-run`을 수행해도 서로의 inbox를 읽지 않는다.
2. 두 run의 report, manifest, feedback 경로가 충돌하지 않는다.
3. 두 actor가 같은 날짜에 실행해도 로컬 provider state 충돌이 없다.
4. 친구 setup script가 Orca 없이 Claude CLI·Python·Git·launchd만 검사하고 설정한다.
5. 독립 프로필에서 원격 inbox merge가 호출되지 않는다.
6. HTML 첫 화면은 브리프이고, 접힘 안에 단계별 결정·가정·출처·분해 기준·worktree·commit·미확인을 담는다.
7. 유료 생성은 실행하지 않고, 기존 테스트·preflight·독립 프로필 임시 clone 검증을 수행한다.
8. 다른 actor의 branch나 코드를 자동 merge하지 않는다. 사람이 pull·review·merge한다.

## 작업 규칙

- 최대 3~5개 파일 단위로 나누고, 조사·구현·검증을 분리하지 말고 한 단위로 닫아라.
- 기존 owner-only sync를 조용히 유지한 채 friend setup만 추가하지 마라.
- 사용자 inbox, 세션 원문, worktree 변경을 삭제하거나 덮어쓰지 마라.
- 완료 전 `git diff`, `git status`, focused shell/Python checks와 두 임시 clone 시나리오를 남겨라.
