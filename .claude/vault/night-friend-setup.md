# 친구용 독립 밤 러너 setup (Orca 없음)

이 setup은 친구 컴퓨터가 **자기 inbox·자기 harvest·자기 메인 세션**으로 밤을 실행하도록 한다. Orca는 설치하거나 사용하지 않는다.

> 주의: 저장소의 독립 실행 프로필이 먼저 구현되어 있어야 한다. setup script가 `NIGHT_RUN_PROFILE=independent` 지원을 확인하지 못하면 실행을 거부한다. owner-only inbox 병합 상태에서 억지로 실행하지 않는다.

## 1. 저장소 준비

```sh
git clone <Tale-Studio-원격주소>
cd tale-studio
git switch -c night-runs/friend
```

이미 clone이 있다면 작업 중인 변경을 먼저 보존하고:

```sh
git fetch origin
git switch night-runs/friend
```

친구는 자기 로컬 `.claude/vault/_INBOX.md`에만 메모를 쓴다. owner의 파일을 pull해서 합치지 않는다.

## 2. 설치

저장소 루트에서:

```sh
sh .claude/vault/night-friend-setup.sh
```

script가 확인하는 것:

- `git`, `python3`, native `claude` CLI
- 독립 실행 프로필 지원
- 현재 branch가 `night-runs/friend`
- 작업 트리가 코드 변경으로 더럽혀져 있지 않은지
- fable 모델 환경변수가 없는지

기본 예약 시각은 매일 01:30이다. 시간은 다음처럼 바꿀 수 있다.

```sh
NIGHT_HOUR=2 NIGHT_MINUTE=0 sh .claude/vault/night-friend-setup.sh
```

## 3. 실행 범위

친구 컴퓨터에서 읽는 것:

```text
친구의 `.claude/vault/_INBOX.md`
친구의 Claude/gjc 세션
친구 checkout의 코드
```

친구 컴퓨터에서 만드는 것:

```text
runs/friend/<run-id>/report.html
runs/friend/<run-id>/manifest.json
runs/friend/<run-id>/sessions/
feedback/friend/<run-id>/
```

결과는 friend branch에 commit/push한다. owner branch나 owner inbox를 자동으로 수정하지 않는다.

## 4. 오전 리뷰

```sh
git pull origin main
git pull origin night-runs/owner
open runs/owner/<run-id>/report.html
open runs/friend/<run-id>/report.html
```

브라우저에서 친구 report와 owner report를 각각 확인한다. setup이 등록한 로컬 리뷰
서버(`http://127.0.0.1:8377/`)로 열면 `merge`·`reject`·`feedback` 버튼이 동작한다.
버튼 피드백은 친구 namespace에 저장되고, **친구의 다음 밤 실행만** 읽는다.
owner report에 남길 의견은 버튼이 `review/friend/on-owner/`에 따로 기록한다 — owner
실행의 자동 입력이 아니고, owner가 직접 읽고 자기 inbox에 옮길 때만 반영된다.

```text
feedback/friend/<run-id>/
```

피드백을 확인한 뒤:

```sh
git add feedback/friend runs/friend
git commit -m "feedback(friend): review night run"
git push origin night-runs/friend
```

## 5. merge 규칙

- 친구 branch가 owner branch를 자동 merge하지 않는다.
- owner도 친구 inbox를 자기 inbox에 복사하지 않는다.
- 코드는 HTML과 결과 카드를 확인한 사람이 Git에서 merge한다.
- 같은 파일 충돌은 사람이 보고 해결한다. 밤 runner가 의미를 추측해 merge하지 않는다.
- 작업 결과가 merge 대상이 아니면 branch를 보존하고 HTML에 `awaiting-merge-review`로 남긴다.

## 6. 문제가 생겼을 때

```sh
launchctl print "gui/$(id -u)/com.tale-studio.night-friend"
tail -f ~/Library/Logs/tale-studio-night-friend/night.log
sh .claude/vault/backlog/night-launchd.sh dry-run
```

실행 전제나 독립 프로필이 없으면 실행하지 말고, owner에게 migration prompt 결과와 오류 원문을 전달한다.
