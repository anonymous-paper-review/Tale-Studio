# 밤 루프 계약 — 결과 우선 자율 실행

> 이 문서가 밤 자동화의 유일한 live 계약이다. 자동화는 매일 새 실행을 시작할 때 이 문서와 `.claude/vault/inbox/`의 메모 파일들을 읽는다.
> 오너는 자고 있으므로 질문에 답하지 않는다. 밤은 해석하고, 쪼개고, 실행하고, 결과를 남긴다.

## 1. 목적과 원칙

목표는 메모와 대화를 대기열로 쌓는 것이 아니라, 밤이 실제 결과를 만들어 아침에 사람이 판단할 수 있게 하는 것이다.

- 사람은 자기 메모 파일(`inbox/<자기 actor>.md`)에 형식 없는 메모를 쓴다. 순서·길이·문장 완성 여부는 중요하지 않다.
- 밤은 메모를 읽고 뜻을 해석한 뒤, 가장 작고 검증 가능한 실행 단위로 나눈다.
- 사전 승인은 실행 조건이 아니다. 해석이 갈리면 안전한 한 가지를 골라 실행하고, 틀린 실행도 결과와 학습 자료로 남긴다.
- 조사, 모델 실험, 수리, 제품 기능 개발을 모두 실행 대상으로 삼는다. 제품 기능 변경도 격리와 검증을 거쳐 실행하며 실행 단위의 수에는 상한을 두지 않는다.
- 최종 판단이 필요한 그림·영상은 밤이 맞다/틀리다를 판정하지 않는다. 밤은 입력, 산출물, 측정표와 비교 자료를 만들고 사람의 판단을 기다린다.
- 밤 루프의 안전상 `hard-stop`은 비가역 행동과 예산 한도 초과뿐이다. 모호함·도구 실패·테스트 실패는 해당 실행 단위를 안전하게 기록하고 복구하거나 아침 검토로 넘긴다.
- 기록에는 소비자와 소비 시점을 붙인다. 결과 카드·티켓·실험 기록은 함께 닫히며, 소비자가 없는 원본 대화 더미를 새로 만들지 않는다.

## 1.5 자율성 레벨 — 단계적 해금

밤의 허용 범위는 레벨로 정한다. **이 절은 이 문서의 다른 모든 조항보다 우선한다** — 다른 조항이 더 넓은 권한을 허용해도 현재 레벨이 막으면 실행하지 않는다. 판정 기준이 코드·데이터·실행 결과 안에 있으면 밤이 닫을 수 있고, 오너 머릿속이나 외부 제품 안에 있으면 닫을 수 없다는 관측 가능성 원칙이 레벨 설계의 기준이다.

**현재 레벨: 1**

### 레벨 1 — 사실 기계

허용:
- 읽기 전용 조사 전부 — 사실 지도, 코드 추적, 세션 수확, 메모 맥락 보강 검색(§4.0).
- 내부 모순(주석≠코드)·형식 위반·테스트로 반증되는 결함의 수리 — 격리 worktree에서 하고 `awaiting-merge-review`로 올린다. **단 하나의 예외: 동작이 바뀌지 않는 수리(타입·린트·빌드 복구, 죽은 코드 제거)는 §6a 조건을 전부 충족하면 밤이 자가 머지한다.** 동작이 바뀌는 수정(기능·버그 수정)은 예외 없이 사람 머지로 올린다(§6.5의 폭넓은 자가 머지는 레벨 2부터).
- 비교 재료의 준비(발주문 초안·대조표·채점표)까지. **유료 생성 발주 0건** — §7.2의 $50 한도는 레벨 3 조항이다.
- 판정형 메모(비교·품질·취향·미결정 어휘: "잘 된다", "퀄리티", "차이", "이상함", "어렵다", "모르겠다")는 실행 단위로 만들지 않는다. 대신 (1) §4.0 맥락 보강을 먼저 돌리고 (2) 아침 질문 카드로 "닫는 데 필요한 오너 입력"을 3개 이내로 구체적으로 청구하고 (3) 판정 기준이 코드 안에 있는 밑작업만 사실 지도로 깔아둔다.

레벨 2 승급 조건 — 전부 충족되면 아침 카드로 승급을 제안한다. **승급은 오너의 계약 개정으로만 발효**되며 지표 충족만으로 자동 발효되지 않는다:
- 정식 밤 실행 누적 10회 이상.
- `reviewed_merge_rate` ≥ 0.8 (reviewed_total 15건 이상 기준).
- 경계 위반(비가역·예산·레벨 범위 침범이 사유인 reject) 0건.
- 질문 카드에 오너가 답해 후속 조사가 닫힌 사례 3건 이상.

### 레벨 2 — 검증 닫힘 수리 기계

레벨 1에 추가로:
- 테스트·타입·스모크가 닫아주는 수리의 자가 머지(§6의 조건 전부 충족 시).
- 오너가 사전 승인한 실험 틀 안의 소액 유료 재료 생산 — 실험당 $5, 밤당 $15 상한.
- 판정형 메모도 오너가 비교 축을 한 줄이라도 준 경우 가설 2개까지 조사 실행.

레벨 3 승급 조건 (동일하게 오너 개정으로만 발효):
- 자가 머지 연속 20건 revert 0건.
- 유료 재료가 오너 판정으로 실제 소비된 비율 ≥ 0.7 (만들어놓고 안 본 재료가 아닐 것).
- `reviewed_merge_rate` ≥ 0.8 유지.

### 레벨 3 — 전면 자율

이 문서의 나머지 전문이 제한 없이 적용된다 — 기능 개발, 자가 머지, §7.2 유료 한도 포함.

어느 레벨에서든 영구 불변: 산출물의 좋고 나쁨 판정은 오너만 한다. 비가역 행동·예산 한도는 hard-stop이다.

## 2. 실행 시작 — 한 번만 읽고 고정하기

실행마다 다음 값을 **runner가 Claude를 시작하기 전에** 만들고 환경·headless prompt로 고정해
전달한다. 계약 본문은 이를 검증·소비할 뿐 `primary`나 `snapshot-inbox`/`snapshot-inbox-set`을
다시 호출하지 않는다.

- `run_id`: provider gate가 발급한 `night-YYYY-MM-DD-<uuid>` 실행 식별자.
- `provider_state`: primary claim JSON의 canonical `state_path`. runtime의 모든 쓰기는 이
  파일의 같은 lock 아래에서 검증한다.
- `provider_token`, `fencing`: primary claim JSON의 `owner_token`과 fencing 세대 번호.
  `run_id`, `contract_hash`와 함께 한 세대의 owner proof를 이룬다.
- Claude 환경에는 위 값을 각각 `NIGHT_PROVIDER_STATE`, `NIGHT_OWNER_TOKEN`,
  `NIGHT_FENCING`으로도 전달한다. prompt에 적힌 값과 환경 값이 다르면
  `contract-mismatch`로 기록하고 쓰지 않는다.
- `actor_id`: `NIGHT_ACTOR_ID`가 정한 실행 주체(`jh`/`hs`). 로컬 결과 경로
  `runs/<actor>/<run_id>/`·`feedback/<actor>/<run_id>/`와, 공유되는 유일한 이름인
  수리 worktree branch `night/<actor>/<run_id>/<unit-id>`에 들어간다.
- `contract_id`, `contract_version`, 이 문서의 정규화된 해시.
- 시작 시각과 기준 시각(KST), 실행 주체(`claude` 또는 `codex`), 작업 루트.
- 읽기 전용 입력 목록, 격리 작업 사본 목록, 결과 보고서 경로.

이 값은 실행 기록과 모든 결과 카드에 이어 붙인다. 실행 중 계약 문서를 다시 읽어 규칙을 바꾸지 않는다. 계약 해시나 필수 입력이 서로 다르면 추측하지 말고 `contract-mismatch`로 진단·기록한 뒤 해당 실행을 시작하지 않는다.

실행 시작 전에 launcher가 반드시 `primary sweep --contract-path "$CONTRACT" --actor "$actor_id"
--project-root "$PROJECT_ROOT"` claim을 만든다. 이 claim이 없거나
`state sweep`가 실패하면 실행을 시작하지 않는다. 계약 본문에서 `primary`를 다시 호출하지
않아 이중 claim을 만들지 않는다. **실제 run**에서 claim 직후 launcher는 current actor의 exact
`inbox/<actor>.md`와 canonical `.claude/vault/backlog/tickets/receipts`에 대해 정확히 한 번
`reconcile-inbox`를 실행한다. `--provider-state`, `--provider-job sweep`, `--owner-token`,
`--fencing`, `--run-id`, `--contract-hash`, `--actor`, `--path`, `--receipt-dir`는 모두 같은
claim의 값이어야 한다. malformed receipt/marker와 `manual_review` 결과는 기록만 하고 자동
close하지 않는다. authority 또는 canonical path 검증 실패는 Claude와 snapshot 전에 provider를
`failed`로 닫고 실행을 중단한다. **dry-run은 actual inbox mutation이 금지되므로 reconcile을
호출하지 않고 `receipt reconciliation skipped`를 명시한다.** 정산 뒤 launcher는 정확히 한 번
`snapshot-inbox-set --provider-state "$provider_state" --owner-token="$provider_token"
--fencing "$fencing" --run-id "$run_id" --contract-hash "$contract_hash" --actor "$NIGHT_ACTOR"
--actors jh,hs`를 실행한다. set의 두 항목은 같은 `run_id`·계약 해시·read-time을 공유하며, current actor는 `actionable`, 상대 actor는
`reference`다. set manifest 경로와 양쪽 snapshot path/id/fingerprint는 runner가 제공한
값만 쓴다. 스냅샷 도구는 inbox 파일을 수정하지 않는다.

snapshot set은 두 파일을 같은 generation으로 다시 검증한다. 둘 중 하나라도 generation
재검증에 실패하면 set manifest를 만들지 않고 실행을 실패로 기록한다. 한 항목만 새
snapshot으로 바꾸거나 이전 manifest를 성공 근거로 재사용하지 않는다.
실제 run은 Claude를 시작하기 전에 provider `bind-snapshot`이 set 파일명·set ID,
두 member, content artifact hash, fingerprint, snapshot ID와 binding digest를 다시 계산한다.
검증된 set과 current actor의 actionable member identity는 provider state에 원자 저장된다.
이 binding과 다른 standalone snapshot JSON이나 reference member는 success 근거가 아니다.
dry-run의 state-root 임시 snapshot은 역할·hash·generation만 검사하고 bind하지 않으므로
success proof가 아니다.

jh와 hs는 각자 자기 컴퓨터에서 이 계약을 실행한다. 두 사람이 git으로 나누는 것은
둘이다: **코드**(계약·도구와 밤이 만든 수리 branch `night/<actor>/<run_id>/<unit-id>`)와
**메모**(`.claude/vault/inbox/` — 사람마다 자기 파일 `inbox/<actor>.md` 하나, 자기 파일에만
쓴다. 파일이 갈라져 있어 git 충돌이 나지 않는다).

실행 시작에 inbox 동기화를 한 번 시도한다: fetch → 내 메모 파일(`inbox/<actor>.md`)만 따로
커밋해 push. push 경합이면 `pull --rebase` 후 재시도 1회 — 파일이 갈라져 있어 항상
깨끗하다. **옆에 다른 미푸시 commit이 있어도 내 메모는 나간다** — 이 컴퓨터의 유일한 사람은
자기 자신이라 push되는 것은 자기 작업뿐이다(예전의 `inbox_only_ahead` 전체 skip은
자기 메모까지 3일간 못 내보내 폐지했다, 2026-08-23 오너 결정). 상대 메모를 받아오는 별도
ff 단계는 두지 않는다 — 지금 두 사람은 각자 로컬로 실행하고 메모를 서로 받지 않는다.
**어떤 실패도 밤을 막지 않는다** — 기록하고 로컬에 있는 내용으로 계속한다. 자기 전에
손으로 보내려면 `sh night-launchd.sh push-inbox`. 소비 책임은 자기 메모 파일에만
있고, 상대 메모는 읽기 전용 참고 입력이다(§4.0). 리포트·티켓·피드백·세션 수확은 자기
디스크의 로컬 상태로 남아 git에 올라가지 않으며, 리포트는 자기 아침과 자기 다음 실행만
소비한다. branch 이름의 `NIGHT_ACTOR_ID`(기본 `jh`)는 어느 컴퓨터의 밤이 만든 수리인지
구분한다.

```sh
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"
GATE="$PROJECT_ROOT/.claude/vault/backlog/provider-gate.py"
# runner-provided: provider_state (canonical state_path only), provider_run_id, provider_token,
# provider fencing, contract_hash, run_id, actor_id.
# snapshot_set, snapshot_path/snapshot_id/snapshot_fingerprint (actionable),
# reference_snapshot_path/reference_snapshot_id/reference_snapshot_fingerprint.
# provider state JSON은 actor/state_path/state_root/project_root/run_id/owner_token/fencing/contract_hash가 고정된
# 한 owner identity임을 설명한다. state sweep도 반드시
# `state sweep --contract-path "$CONTRACT" --actor "$actor_id" --project-root "$PROJECT_ROOT"`로 읽는다.
# `provider_state`에는 이 JSON 전체를 넣지 않고 canonical state_path만 둔다.
# state_root의 mode 0600 `.authority-key`로 위 immutable identity의 `authority_hmac`을
# 검증한다. key/HMAC 누락·변조·다른 root로 복사된 state는 authority가 아니다.
state_json="$(python3 "$GATE" state sweep \
  --contract-path "$PROJECT_ROOT/.claude/vault/backlog/_NIGHT.md" --actor "$actor_id" \
  --project-root "$PROJECT_ROOT")"
# state_json의 state_path/state_root/project_root/actor/run_id/owner_token/fencing/contract_hash가
# runner-provided provider_state/PROJECT_ROOT/actor_id/run_id/provider_token/fencing/contract_hash와
# 모두 같은지 확인한다.
# state_json의 snapshot_set_path/set_id와 actionable snapshot path/id/fingerprint/content hash도
# runner가 bind한 값과 같아야 한다.
# set manifest을 읽어 actionable의 actor/role/id/fingerprint가 prompt 값과 일치하고
# status가 reported인지 검증한다. reference를 actionable로 바꾸지 않으며,
# 불일치하면 contract-mismatch로 기록하고 어떤 inbox도 수정하지 않는다.
```

### 단일 실행 가정

- 같은 날짜에는 주 실행 하나만 `claimed → running`이 될 수 있다.
- Claude 주 실행은 한 번만 시작한다. Codex는 주 실행이 명시적으로 `failed`이거나 시간 초과로 만료되었다는 기록이 있을 때만 같은 `run_id`의 대체 실행으로 한 번 시작한다.
- 상태가 `running`, `unknown`, `reported` 또는 성공 기록 미완성인 경우 Codex는 대체 실행을 시작하지 않는다. 두 실행이 동시에 같은 메모·티켓·예산을 소비하지 않게 한다.
- 실행 소유권은 만료 시각과 단조 증가하는 fencing token(오래된 실행의 늦은 쓰기를 거부하는 번호)으로 확인한다. 만료한 실행은 결과 카드·예산·보관 표식을 쓰지 못한다.
- runtime의 mutating 명령(`reconcile-inbox`, `snapshot-inbox`, `snapshot-inbox-set`, `snapshot-status`,
  `track-inbox`, `archive-inbox`, `append-units`)은 반드시 동일한 `--provider-state`,
  `--provider-job`, `--owner-token`, `--fencing`, `--run-id`, `--contract-hash` proof를 준다. `scan-inbox`는
  읽기 전용이므로 proof를 붙이지 않는다.
- provider 상태가 `fallback`, terminal 또는 `expired`가 된 뒤에는 기존 runtime 호출을
  재시도하거나 파일 직접 쓰기로 우회하지 않는다. proof 검증 오류는 `late-owner` 또는
  `claim-conflict`로 기록하고, 다른 token을 추측하거나 새 owner 세대를 대신 사용하지 않는다.
- runtime은 state의 `authority_hmac`을 state-root key로 검증한 뒤에만 root와 owner proof를
  신뢰한다. state 파일과 root 문자열을 함께 복사해도 유효한 authority가 되지 않는다.
- 주 실행이나 대체 실행이 실패해도 성공으로 도장을 찍지 않는다. 결과 보고와 확인 가능한 종료 표식이 모두 남은 뒤에만 성공으로 기록한다.
- provider 상태가 `committing`이면 새 `primary`, `fallback`, `failed`로 덮지 않는다. 같은
  owner proof와 동일한 actionable snapshot 및 run manifest로 `complete success`를 멱등
  재호출해 journal을 끝낸다. 이 재호출도 `--actor "$actor_id"`와
  `--fencing "$fencing"`을 포함하며, proof나 manifest/snapshot이 없으면 성공을 만들지
  않고 복구 실패로 기록한다.

## 3. 메모 원문과 스냅샷 수명

`inbox/`의 사람 원문 바이트는 불변이다. night-runtime만 current actor 파일의
`<!-- vault-inbox-item:start ... -->`/`<!-- vault-inbox-item:end -->` marker metadata와 closed
표시를 CAS(기대 hash·byte range 비교), file lock, provider owner proof로 변경할 수 있다.
모델과 일반 agent의 자유 편집·직접 파일 쓰기는 금지한다. marker 밖의 사람 원문은 추가·수정·삭제하지
않으며 malformed 또는 drifted marker는 manual review로 보존한다.
스냅샷 set의 actionable 항목만 소비 표식·상태 전이·archive·harvest·provider success의
대상이다. reference 항목은 immutable read-only 맥락이며 인용 시 출처만 기록한다. 상대
파일은 소비 관리 대상이 아니다 — 상대의 밤이 자기 컴퓨터에서 직접 소비한다.
실행 시작 전 기존 줄을 보존하는 추가 전용 동기화가 필요할 때만 양쪽 추가 내용을
보존한 동기화 commit을 만들 수 있다. 실행 결과의 보관은 원문을 지우는 이동이 아니라 snapshot content를
`_archive/inbox/`에 복사하고 소비 manifest를 쓰는 방식이다.

1. 시작할 때 UTF-8 원본 바이트의 범위 `[start, end)`와 읽은 시각, 범위의 내용 해시를 저장한다.
2. `snapshot_fingerprint`는 경로·범위·내용 해시로 만들고, `snapshot_id`는 fingerprint·run_id·contract_hash binding으로 만든다. 같은 범위와 같은 내용은 같은 fingerprint로 알아보되, 실행이나 계약이 달라지면 새 binding으로 취급한다.
3. fingerprint별 상태를 `unclaimed → claimed → decomposed → executed → reported`로 기록한다. `failed`와 `blocked`는 안전한 종단 상태다.
4. 분해 기록에는 원문 인용, 스냅샷 식별자, 해석, 실행 단위, 수용 기준을 함께 적는다. 이 기록이 메모의 소비 표식이다. 소비 표식이 있는 스냅샷은 다시 분해하지 않는다.
5. 오너가 내용을 고치면 새 내용 해시와 새 snapshot으로 취급한다. 이전 스냅샷을 덮어쓰지 않는다.
6. 스냅샷 기록 중 실패하면 임시 파일에 쓰고 동기화한 뒤 원자적으로 이름을 바꾼다. 중간 표식이 없으면 소비 완료로 간주하지 않고 다음 실행이 안전하게 재청구한다.
7. 메모의 바이트 범위가 겹치거나 경계가 불명확하면 전체 스냅샷의 결정론적 범위 목록을 먼저 만들고, 겹친 범위는 하나만 청구한다. 겹침을 조용히 합치지 않는다.
8. 모든 실행 단위가 `reported`가 된 snapshot은 아래처럼 `night-runtime.py archive-inbox
   --approval-state awaiting-owner-review`로 보관할 수 있다. `blocked`, `needs-owner`,
   `waiting` 단위가 남아 있으면 전체 snapshot을 archive하지 않는다.
   이것은 실행 완료 기록일 뿐 승인 완료가 아니다. 아침 HTML에서
   오너가 `merge` 또는 `reject`를 남길 때까지 사람 승인 대기 상태로 둔다. `blocked`,
   `needs-owner`, `waiting` 입력은 소비하지 않고 다음 실행에 남긴다.

```sh
python3 "$PROJECT_ROOT/.claude/vault/backlog/night-runtime.py" archive-inbox \
  --provider-state "$provider_state" --owner-token="$provider_token" \
  --fencing "$fencing" --run-id "$run_id" --contract-hash "$contract_hash" \
  --snapshot-path "$snapshot_path" \
  --archive-root "$PROJECT_ROOT/.claude/vault/_archive/inbox" \
  --approval-state awaiting-owner-review
```

### 3.1 actionable inbox ticket lifecycle

현재 actor의 live 파일만 다음 CAS(비교 후 교체) helper로 다룬다. reference snapshot이나
상대 inbox에는 `scan`·`track`·`close`·archive를 실행하지 않는다.

1. `scan-inbox --actor "$actor_id" --path "$MY_INBOX"`로 읽는다. unmarked candidate의
   `proposed_item_id`를 먼저 티켓의 `operation_key`로 저장하고, 같은 ID의 티켓을 검색해
   없을 때만 만든다. 따라서 이전 `tracked`/`closed` 원문에서 새 티켓을 만들지 않는다.
2. 티켓과 operation key가 저장된 뒤에만 `track-inbox --item-id ...`를 호출한다. marker를 한
   번 쓸 때마다 즉시 다시 scan한다. `tracked` 항목은 기존 unit을 재개하고, 로컬 원장이
   유실됐어도 marker의 같은 unit ID로 복구한다. `closed`는 후보에서 제외한다.
3. 단순 Markdown 취소선은 제외 근거가 아니다. malformed·drifted marker는 fail-open으로
   후보와 함께 보존하고 manual review로 올린다. 추측으로 닫거나 원문을 고치지 않는다.
4. 실제 inbox 편집은 current actor 파일에 한정하고 `--expected-hash`, byte range,
   `--item-id`와 동일 owner proof를 모두 전달하는 runtime CAS helper만 사용한다.

`proposed_item_id`는 marker wrapper를 제거한 논리 원문의 raw byte range와 그 내용 hash로
만드는 stable ID다. 파일 전체 hash는 CAS 비교 전용이며 item ID에 넣지 않는다. malformed 또는
drifted marker는 `manual_review`로만 남기고 자동 ticket 후보로 만들지 않는다.

```sh
# 읽기 전용: provider proof를 붙이지 않는다.
python3 "$PROJECT_ROOT/.claude/vault/backlog/night-runtime.py" scan-inbox \
  --actor "$actor_id" --path "$MY_INBOX" --project-root "$PROJECT_ROOT"

# 상태 조회와 marker 쓰기: 모두 runner-provided 동일 proof를 쓴다.
python3 "$PROJECT_ROOT/.claude/vault/backlog/night-runtime.py" snapshot-status \
  --provider-state "$provider_state" --owner-token="$provider_token" \
  --fencing "$fencing" --run-id "$run_id" --contract-hash "$contract_hash" \
  --snapshot-fingerprint "$snapshot_fingerprint" --snapshot-id "$snapshot_id" \
  --status claimed
python3 "$PROJECT_ROOT/.claude/vault/backlog/night-runtime.py" track-inbox \
  --provider-state "$provider_state" --owner-token="$provider_token" \
  --fencing "$fencing" --run-id "$run_id" --contract-hash "$contract_hash" \
  --path "$MY_INBOX" --actor "$actor_id" --expected-hash "$expected_hash" \
  --snapshot-id "$snapshot_id" --item-id "$item_id" --start "$start" --end "$end" \
  --unit "$unit_id"
python3 "$PROJECT_ROOT/.claude/vault/backlog/night-runtime.py" reconcile-inbox \
  --provider-state "$provider_state" --owner-token="$provider_token" \
  --fencing "$fencing" --run-id "$run_id" --contract-hash "$contract_hash" \
  --actor "$actor_id" --path "$MY_INBOX" \
  --receipt-dir "$PROJECT_ROOT/.claude/vault/backlog/tickets/receipts"
```

공개 direct close 명령은 없다. 닫힘은 canonical receipt를 검증하는 `reconcile-inbox`만
만든다. `code`는 실제 target branch integration, `research`는 owner의
accepted/rejected/no-action, `needs-owner`는 답변과 그 답변의 descendant 종료를 확인한
receipt가 있어야 `closed`와 사람용 취소선 처리를 한다. 일부 unit만 끝났으면 `tracked`를
유지한다. receipt 없는 종료와 취소선만으로는 close하지 않는다. closed marker에는 검증한
receipt raw bytes의 `close_proof_sha256`과 content-addressed `close_proof_path`를 저장한다.
최종 proof 경로는 `.claude/vault/backlog/tickets/receipts/.proofs/<sha256>.json`이다.
동일 raw bytes는 같은 `.proofs/` directory fd의 임시 파일에 완전히
write·chmod 0444·fsync한 뒤 hard-link로 `<sha256>.json` 이름을 create-only 원자 게시하고
directory를 fsync한다. 중단돼 남은 임시 파일은 다음 정산을 막지 않는다. receipt와 evidence는 project/receipt
directory fd를 고정한 openat 방식으로 모든 상위 경로의 symlink를 거부하고 같은 file
descriptor에서 읽으며, inbox 교체 직전에 stat과 hash를 다시 검증한다.

### 3.2 session·ticket·source·receipt 정산

티켓을 만들고 저장을 확인한 즉시 source item은 `tracked`다. 같은 unit/ticket은 밤과 낮 session이 이어서 처리하며, 낮 session은 canonical
`.claude/vault/backlog/tickets/receipts/<receipt_id>.json`에만 receipt를 남긴다. 다음 **실제**
night run은 snapshot보다 먼저 `reconcile-inbox`로 그 receipt를 정산한다. `tracked`는 새 티켓 후보에서 제외되고 기존 unit을 재개하며, `closed`는 기본 입력에서 제외된다.

linked unit 모두가 terminal receipt proof를 가진 경우에만 source item을 `closed`로 바꾼다.
부분 receipt는 검증 결과를 `partial`로 남기지만 source item을 닫지 않으므로 `tracked`가 유지된다.
`reconcile-inbox`는 부분 receipt를 검증한 뒤 닫지 않은 채 다음 unit과 다른 marker를 계속 처리한다.
`awaiting-merge-review`는 해당 code unit만 보류하는 상태이며 다른 unit/marker의 실행·receipt
정산·inbox 후보 처리를 막지 않는다. 사람 feedback이 기존 작업의 continuation이면 새 source item도 같은 ticket에 `tracked`로
연결한다. 별도 요구일 때만 새 ticket을 만든다. manual_review,
partial completion, receipt 없는 결과는 `tracked`를 유지하며 자동 close하지 않는다.

receipt는 canonical directory의 정확히 `<receipt_id>.json` 파일이며 schema는 다음 필수 필드다.
`{ "schema": 1, "receipt_id": "...", "actor": "...", "item_id": "...", "units": [...],
"disposition": "...", "evidence": [...] }`. `actor`, `item_id`는 current tracked marker와 같아야
하며, `units`는 비어 있지 않은 marker units의 중복 없는 부분집합이어야 한다. marker의 전체
units와 정확히 같은 receipt만 terminal receipt로 source item을 닫는다. 각 evidence는
`{kind,path,sha256}` 및 kind별 필수 필드를 가지며, `path`는
canonical project-relative 실제 파일이고 SHA-256이 일치해야 한다.

- `integrated`는 `kind: "origin-main"` evidence의 40자리 hex `commit`, ticket 또는 current actor
  run manifest/result-card path, 그리고 `git merge-base --is-ancestor <commit> origin/main` 성공이
  필요하다.
- `accepted`, `rejected`, `no-action`, `cancelled`, `superseded`는 `kind: "owner-decision"` evidence와
  `feedback/<actor>/` 아래 path가 필요하다.
- `completed`, `failed`는 `kind: "result-card"` evidence와
  `.claude/vault/backlog/tickets/` 아래 path가 필요하다.

각 disposition에는 위 terminal evidence가 하나 이상 있어야 한다. 다른 actor receipt, 손상된
schema/hash/path/evidence, marker와 맞지 않는 item/unit은 manual review 또는 skipped로 기록하며
사람 원문과 marker를 자동으로 닫지 않는다.

### 3.3 ticket runtime 인수 계약

`ticket-runtime.py`의 상태는 ticket별 작업 소유권이고, provider lease는 밤 실행 자체의
소유권일 뿐 ticket claim을 대신하지 않는다. link는 **완전 일치하는 session ID**만 인정한다.
night session ID는 항상 `night-<run_id>`이다. launcher는 provider `bind-snapshot` 뒤 Claude를
시작하기 전에 다음 읽기 전용 inventory를 `runs/<actor>/<run_id>/ticket-handoffs.json`에
temp write·file fsync·replace·directory fsync 순서로 저장한다.

```sh
python3 "$PROJECT_ROOT/.claude/vault/backlog/ticket-runtime.py" list \
  --project "$PROJECT_ROOT" --actor "$actor_id"
```

상태 분류와 처리 규칙은 다음으로 고정한다.

- `active`: fresh day claim은 건드리거나 중복 실행하지 않는다. 다른 unit을 처리한 뒤 매 loop에서
  live `list`를 다시 읽는다. day ticket이 밤중에 lease expiry 또는 `paused`가 되어
  `takeover_ready`가 될 때만 그 시점에 인수할 수 있다.
- `awaiting-merge-review`: 해당 code unit만 보류한다. 다른 unit/marker의 실행과 receipt 정산,
  `reconcile-inbox`의 다음 inbox 후보 처리는 계속한다.
- `takeover_ready`: valid checkpoint와 **정확히 같은 ticket worktree**가 있을 때만
  `takeover --owner-kind night`를 쓴다. runtime이 fencing을 증가시킨 결과의 owner token/fencing으로
  이후 동작한다. checkpoint 없는 stale claim과 checkpoint/worktree drift는 인수하지 않는다.
- `reference_only`, `manual_review`: 수정·claim·takeover를 금지한다. session harvest의 읽기 전용
  참고로만 쓴다. 특히 main에서 시작한 session은 ticket runtime에서
  `claim --reference-only-main`으로 기록되며 night가 작업 대상으로 바꾸지 않는다.
- `released`: 새 tracked ticket이면 ticket-owned worktree를 먼저 만들고 그 worktree에서
  `claim --owner-kind night`한다. main worktree는 ticket 작업 사본이 아니다.

```sh
# launcher-provided fixed values; provider lease와 별개의 ticket lease다.
lease_seconds="$NIGHT_TICKET_LEASE_SECONDS"          # 1800
heartbeat_seconds="$NIGHT_TICKET_HEARTBEAT_SECONDS"  # 300

# 각 unit 직전과 다른 unit 종료 뒤 loop마다 initial inventory가 아닌 live state를 다시 읽는다.
live_inventory="$(python3 "$PROJECT_ROOT/.claude/vault/backlog/ticket-runtime.py" list \
  --project "$PROJECT_ROOT" --actor "$actor_id")"
# active는 즉시 skip한다. paused/expired ticket도 이 live list에서 takeover_ready로
# 재분류된 경우에만 다음 takeover를 검토한다.

# takeover는 live inventory의 ticket_id/worktree/checkpoint가 모두 정확히 일치할 때만 허용된다.
takeover_json="$(python3 "$PROJECT_ROOT/.claude/vault/backlog/ticket-runtime.py" takeover \
  --project "$PROJECT_ROOT" --ticket-id "$ticket_id" --actor "$actor_id" \
  --session-id "night-$run_id" --owner-kind night --worktree "$ticket_worktree" \
  --lease-seconds "$lease_seconds")"
```

`takeover` 출력 JSON에서 `owner_token`, `fencing`, `session_id`, `worktree`를 추출하고,
모두 존재하며 session이 `night-$run_id`, worktree가 live inventory의 exact worktree와 같을
때에만 subagent를 실행한다. provider owner token이나 provider lease를 ticket proof로
대체하지 않는다.

```sh
ticket_owner_token="$(printf '%s' "$takeover_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["owner_token"])')"
ticket_fencing="$(printf '%s' "$takeover_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["fencing"])')"
ticket_session_id="$(printf '%s' "$takeover_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["owner_session_id"])')"
ticket_worktree="$(printf '%s' "$takeover_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["worktree"])')"
test -n "$ticket_owner_token" && test -n "$ticket_fencing" && \
  test "$ticket_session_id" = "night-$run_id" && test -n "$ticket_worktree"

# runtime state가 없는 tracked ticket은 등록된 격리 ticket worktree를 먼저 만든다.
ticket_worktree="$PROJECT_ROOT/.claude/worktrees/$ticket_id"
git -C "$PROJECT_ROOT" worktree add "$ticket_worktree" -b "night/$actor_id/$run_id/$ticket_id"
claim_json="$(python3 "$PROJECT_ROOT/.claude/vault/backlog/ticket-runtime.py" claim \
  --project "$PROJECT_ROOT" --ticket-id "$ticket_id" --actor "$actor_id" \
  --session-id "night-$run_id" --owner-kind night --worktree "$ticket_worktree" \
  --lease-seconds "$lease_seconds")"
ticket_owner_token="$(printf '%s' "$claim_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["owner_token"])')"
ticket_fencing="$(printf '%s' "$claim_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["fencing"])')"
ticket_session_id="$(printf '%s' "$claim_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["owner_session_id"])')"
claimed_worktree="$(printf '%s' "$claim_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["worktree"])')"
# claim JSON의 owner_token/fencing/owner_session_id/worktree proof가 모두 검증되기 전에는 subagent를 실행하지 않는다.
test -n "$ticket_owner_token" && test -n "$ticket_fencing" && \
  test "$ticket_session_id" = "night-$run_id" && test "$claimed_worktree" = "$ticket_worktree"
```

night가 ticket proof를 얻은 뒤에만 subagent를 실행한다. mutation 뒤에는 최대
`heartbeat_seconds` 이내에 heartbeat를 남기고, 시작·위임 전후·의미 있는 변경·결과 경계마다
`checkpoint --status running`을 남긴다. terminal receipt 없이 실행을 끝낼 때는 반드시
`checkpoint --status paused`를 먼저 남기고 멱등 `release --status paused`한다. release는
inbox를 닫지 않으며, terminal canonical receipt를 다음 실제 run의 `reconcile-inbox`가
정산할 때만 closed가 된다. `session_history`는 harvest linkage의 일부이므로 current owner와
이전 owner history를 보존한다. ticket 상태와 checkpoint 없이 subagent에 실행을 위임하지 않는다.

```sh
python3 "$PROJECT_ROOT/.claude/vault/backlog/ticket-runtime.py" heartbeat \
  --project "$PROJECT_ROOT" --ticket-id "$ticket_id" --session-id "$ticket_session_id" \
  --owner-token "$ticket_owner_token" --fencing "$ticket_fencing" --lease-seconds "$lease_seconds"
python3 "$PROJECT_ROOT/.claude/vault/backlog/ticket-runtime.py" checkpoint \
  --project "$PROJECT_ROOT" --ticket-id "$ticket_id" --session-id "$ticket_session_id" \
  --owner-token "$ticket_owner_token" --fencing "$ticket_fencing" --input "$checkpoint_input" \
  --status running --lease-seconds "$lease_seconds"
# terminal canonical receipt가 없을 때만 pause/release한다.
python3 "$PROJECT_ROOT/.claude/vault/backlog/ticket-runtime.py" checkpoint \
  --project "$PROJECT_ROOT" --ticket-id "$ticket_id" --session-id "$ticket_session_id" \
  --owner-token "$ticket_owner_token" --fencing "$ticket_fencing" --input "$checkpoint_input" \
  --status paused --lease-seconds "$lease_seconds"
python3 "$PROJECT_ROOT/.claude/vault/backlog/ticket-runtime.py" release \
  --project "$PROJECT_ROOT" --ticket-id "$ticket_id" --session-id "$ticket_session_id" \
  --owner-token "$ticket_owner_token" --fencing "$ticket_fencing" --status paused
```

낮 session도 실제 session ID로 `claim`하고 ticket-owned worktree에서 작업한다. main에서
시작된 기존 session은 `--reference-only-main`으로만 claim한다. 의미 있는 mutation마다
checkpoint와 heartbeat를 남기며, 미완료 종료는 `paused` checkpoint로 끝낸다. 세션 원문은 보조 증거이고 재개 정본은 checkpoint다.

## 4. 해석과 분해

메모, 최근 결과, 열린 티켓, 정리되지 않은 세션, 코드의 실제 상태를 읽되 원문을 대화에 대량으로 복사하지 않는다. 세션 수확은 제공된 `harvest.py`를 거친다.

### 4.0 메모 맥락 보강 — 분해보다 먼저

메모는 오너 머릿속 맥락이 잘린 채 도착한다. 분해 전에 메모의 핵심어로 다음을 검색해 "이 메모와 관련된 기존 흔적"을 먼저 수집한다. 검색은 읽기 전용이며 `.claude/agents/night-investigator.md` 백지 작업자에게 위임할 수 있다.

1. 원장 — `tickets/`의 열린·닫힌 티켓, 과거 run 보고서, 판정 기록.
1.5 상대의 메모 — `inbox/`의 다른 actor 파일. 같은 주제를 상대가 어떻게 적었는지 읽기
   전용으로 참고하고, 리포트 카드에 어느 파일에서 왔는지 출처를 표시한다. 소비 표식은
   만들지 않는다.
2. 실험 기록 — `research/experiments/`.
3. 수확 다이제스트와 최근 세션 원문 — harvest가 보는 세션 저장소에서 메모 핵심어를 읽기 전용으로 검색한다. 오너가 낮 세션에서 같은 주제로 말한 대화가 바로 메모의 잘린 맥락이다.

수집한 흔적은 분해 기록에 연결한다. 흔적이 0건이면 "맥락 없음"을 기록하고, 판정형 메모라면 질문 카드에 그 사실을 함께 적는다(§1.5).

### 4.1 정리되지 않은 세션 수확

```sh
python3 "$PROJECT_ROOT/.claude/vault/backlog/harvest.py" --dry-run \
  --project "$PROJECT_ROOT" --actor "$actor_id" --contract-hash "$contract_hash" \
  --snapshot-id "$snapshot_id" --snapshot-fingerprint "$snapshot_fingerprint"
python3 "$PROJECT_ROOT/.claude/vault/backlog/harvest.py" --run-id "$run_id" \
  --project "$PROJECT_ROOT" --actor "$actor_id" \
  --out "$PROJECT_ROOT/runs/$actor_id/$run_id/harvest" \
  --contract-hash "$contract_hash" --snapshot-id "$snapshot_id" \
  --snapshot-fingerprint "$snapshot_fingerprint" \
  --snapshot-path "$snapshot_path"
```

- 먼저 드라이런 표를 보고, 쓰기 실행은 결과 산출을 끝낼 수 있을 때만 한다.
- Claude Code 저장소와 gjc 저장소를 모두 본다. gjc는 디렉터리 이름이 아니라 파일 안의 `cwd`로 프로젝트를 판별하고, `type: message`와 `message.role` 구조를 읽는다.
- 정리 명령의 이름을 포함한다는 느슨한 문자열만으로 정리 완료를 판정하지 않는다. 실제 스킬 호출 구조만 인정해 자기참조 오탐을 막는다.
- user 역할에는 훅·스킬 본문·압축 주입도 섞인다. 긴 주입 텍스트를 사람 발화로 세지 말고, 짧은 실제 발화를 우선한다.
- 마지막 성공 시각은 유한한 0 이상 epoch만 허용한다. 비어 있음, 음수, `NaN`, `Inf`, 미래 시각, 오래된 창은 기본값으로 바꾸지 말고 오류로 기록한다. `--now`를 주는 드라이런도 저장된 시각을 검증한다.
- 50KB를 넘는 원문은 경로와 요약 위임 표식만 결과에 남긴다. 모델 원출력을 대화에 대량으로 붓지 않는다.
- 기각 기록을 후보 목록보다 먼저 읽는다. 사람이 제안을 되돌린 이유가 무인 판단의 우선 기준이며, 단순 동의나 재질문은 판단 근거로 세지 않는다.
- 수확 창이 중간에 끊기면 성공 표식을 남기지 않는다. 다음 실행은 마지막 성공 이후의 창을 다시 읽어 누락을 복구한다.
- 모든 결과 카드·티켓·기계 보고서가 저장되고 `run_id`의 완료 표식을 미리 확인한 뒤에만
  ```sh
  python3 "$PROJECT_ROOT/.claude/vault/backlog/harvest.py" --validate-complete --run-id "$run_id" \
  --project "$PROJECT_ROOT" --actor "$actor_id" \
  --out "$PROJECT_ROOT/runs/$actor_id/$run_id/harvest" \
  --contract-hash "$contract_hash" --snapshot-id "$snapshot_id" \
  --snapshot-fingerprint "$snapshot_fingerprint" \
  --snapshot-path "$snapshot_path"
  ```
  완료 표식은 정확히 `runs/<actor>/<run>/harvest/.run-complete.json`이고, 완료 표식이 없거나
  산출물 hash가 바뀌면 provider `complete success`를 호출하지 않는다.
  harvest에는 공개 성공 도장 명령이 없다. 실제 도장은 provider `complete success`가 canonical
  state lock 안에서 owner token·fencing·completion proof와 stamp candidate/run-complete hash를
  다시 확인한 뒤 `.last-success`와 provider success를 함께 확정한다.

수확된 세션마다 다음을 짧게 기록한다.

- 세션이 한 일 3~5줄.
- 열린 것 후보를 `미결`(결론이 없음), `미착수`(결론은 있으나 실행하지 않음), `검증 대기`(실행했으나 확인하지 않음)로 구분.
- 관련 티켓·실험·결정의 연결.
- 코드·커밋으로 닫힌 것은 열린 후보로 다시 만들지 않는다.
- 이 실행은 이 머신의 로컬 세션만 수확한다. 상대 컴퓨터의 세션·harvest·inbox는 이
  디스크에 없으므로 읽을 일 자체가 없다. 원본 세션 JSONL과 로컬 절대경로는 공유
  산출물(`runs/<actor>/`)로 내보내지 않는다 — 파일:줄, session id, branch, commit, 요약만.
- 수확 후보는 `confirmed`, `candidate`, `needs-owner`, `duplicate`, `closed` 중 하나로
  분류한다. 수확기가 모호함을 해결했다고 가정하지 않는다. `candidate`와 `needs-owner`는
  HTML에 남기고, 레벨 1에서는 자동 실행하지 않는다.

### 4.2 실행 단위 만들기

열린 항목마다 “무엇이 참이어야 닫히는가?”를 한 문장으로 쓴다. 하나의 실행 단위는 하나의 관측으로 반증 가능해야 한다.

1. 가장 싼 관측부터 둔다. DB 읽기, 검색, 코드 추적처럼 비용 없는 사실 확인을 유료 생성보다 앞세운다.
2. 실제 데이터에 있는 이름·값·경로인지 먼저 확인한다. 확인 결과가 0건이면 억지 티켓을 만들지 않고 아침 보고에 이유를 남긴다.
3. 같은 관측을 하는 열린 티켓이 있는지 먼저 대조한다. 같으면 새 티켓을 만들지 않고 연결만 기록한다. 주제는 같아도 관측이 다르면 겹치지 않는 이유를 적는다.
4. 닫히는 조건을 쓸 수 없는 큰 논의는 실행 단위로 만들지 않는다. 오너가 선택해야 하는 취향·방법·일정은 아침 판단 카드로 보내고, 그 선택에 필요한 사실 조각만 조사 단위로 만든다.
5. 도구를 새로 만드는 일이 결과가 아니라 동작하는 물건 자체라면, 필요한 조사와 수용 기준을 분리해 기록한다. 기능 구현이 실제 산출물이라면 격리 작업 사본에서 수행한다.
6. 실행 전에 수용 기준을 선기입한다. 실행 중 기준이 무효임을 발견하면 기준을 소급 수정하지 말고 그 단위를 중단·보고한다.
7. 분해 기록은 `interpretation`, `observation`, `acceptance`, `snapshot_id`, `operation_key`, `status`를 포함한다.

### 4.3 상태는 실행을 막는 승인 관문이 아니다

`status`는 현재 위치를 설명하는 값이며, 사람의 사전 승인을 기다리는 장치가 아니다.

| 상태 | 밤의 처리 |
|---|---|
| `ready` | 수용 기준과 안전 경계를 확인하고 즉시 실행 |
| `waiting` | 조건을 확인한다. 확인 가능한 사실은 진행하고, 확인 불가능한 부분은 이유와 다음 관측을 기록 |
| `needs-owner` | 오너에게만 가능한 선택은 아침 카드로 보낸다. 안전한 사실 조사·준비 작업은 멈추지 않는다 |
| `draft` | 닫히는 조건을 채워 실행 단위로 바꾸고 즉시 실행. 조건을 쓸 수 없으면 만들지 않고 기록만 남김 |
| `blocked` | 비가역 행동, 예산 초과, 또는 확인 불가능한 안전 경계의 사유를 적고 다른 단위로 진행 |
| `awaiting-merge-review` | 격리 작업 사본의 결과와 검증 명령을 아침 검토에 올림 |

## 5. 실행 순서와 백지 작업자

실행 단위는 메모와 연결된 것, 목적에 가까운 것, 싼 것, 위험이 낮은 것 순으로 정렬한다. 목록을 비우는 것이 목표가 아니며, 목록이 비어도 아래 코드 신호를 점검한다.

- 최근 자주 바뀐 파일, 코드에 남은 미완성 표시, 30일 넘은 판단 근거만 신호로 삼는다. 신호 없이 “더 나은 점”을 찾는 무한 탐색은 하지 않는다.
- 코드 신호의 출처는 공유 git 히스토리라 두 컴퓨터가 같은 신호를 잡을 수 있다. 대조는 자기 티켓 원장과만 한다 — 상대 티켓은 로컬이라 보이지 않고, 겹쳐도 막지 않는다. 조사는 읽기 전용이라 잃는 것이 토큰뿐이고, 수리가 겹치면 worktree branch에 actor가 들어가 충돌하지 않으며 어느 쪽을 살릴지 사람이 merge에서 고른다.
- 서로 다른 주제는 병렬로 실행할 수 있으나 같은 파일·같은 작업 사본을 두 실행이 동시에 쓰지 않는다.
- 조사 백지 작업자는 `.claude/agents/night-investigator.md` 정의를 사용한다 — 도구는 읽기 전용, 모델은 정의 파일에 고정(fable 금지 집행 지점). 낮 디버그 실행 절차는 `.claude/skills/night-debug-run/SKILL.md`가 정본이다.
- 티켓을 백지 subagent에게 줄 때는 티켓 경로만 전달한다. 실행자가 티켓만 읽고 닫을 수 있는지 확인하는 품질 검사이며, 머릿속 맥락을 덧붙이지 않는다.
- 백지 실행자가 범위를 이해하지 못하면 해당 단위를 `blocked`로 기록하고, 내용을 대신 지어내어 실행하지 않는다.
- 모든 결과에는 입력, 명령, 실행 시각, 실행 주체, worktree, 커밋, 산출물 경로를 연결한다.
- **모델 금지: `fable`.** 모델 id나 별칭에 `fable`이 들어간 모델로는 어떤 실행도 하지 않는다 — 주 실행, 백지 subagent, 격리 worktree 안의 위임 실행 전부 해당한다. subagent를 띄울 때 모델을 지정할 수 있으면 fable이 아닌 모델을 명시하고, 환경이 fable을 강제하면 그 단위를 실행하지 말고 `blocked`(`tool-unavailable`)로 기록한다.

## 6. 작업 사본 격리와 기능 변경

기능 변경과 수리는 별도 작업 사본에서 한다. 메인 체크아웃에서 브랜치를 바꾸거나 오너의 커밋되지 않은 변경을 덮지 않는다.

```sh
git worktree add <isolated-path> -b night/<actor>/<run-id>/<unit-id>
```

worktree와 branch 이름에 actor가 들어가므로 두 actor가 같은 원격에 push해도 충돌하지
않는다. launcher는 새 primary·낮 실행 차단·inbox sync보다 먼저 기존 sweep state를 읽고,
`committing`이면 state에 저장된 completion proof로 finalize한 뒤 exit 0한다. proof가
불완전하거나 finalize가 실패하면 새 작업을 시작하지 않는다.
경로(`night/<actor>/…`)의 상위가 되지 않는 이름(예: `night-runs/<actor>`)을 쓴다 — 같은
이름의 branch와 하위 경로 branch는 Git ref 구조상 공존할 수 없다.

작업 사본마다 다음을 지킨다.

1. 실행 전 대상 기준 커밋과 허용 경로를 기록한다.
2. 최신 기준을 가져와 충돌 여부를 확인하고, 충돌이 나면 자동 병합하지 않는다.
3. 변경 경로를 티켓의 허용 목록과 전역 금지 목록에 대조한다. `src/` 변경 자체는 금지가 아니지만, `.env*`, 비밀·자격 증명, 운영 스키마, 마이그레이션, 운영 데이터 쓰기는 거부한다.
4. 최신 기준으로 검증을 다시 실행하고 명령·결과 해시를 기록한다.
5. 충돌 0, 검증 통과, 허용 경로, 기준 커밋의 비교·교환 확인이 모두 맞으면 밤이 자가 머지할 수 있다. 하나라도 빠지면 `awaiting-merge-review`로 올리고 사람 머지로 남긴다.
6. 자가 머지와 사람 머지는 결과 지표에서 별도로 세며, 작업 사본 경로와 커밋을 아침 카드에 적는다.

### 6a. 동작 불변 자가 머지 — 레벨 1의 유일한 예외

동작이 바뀌지 않는 수리는 신뢰를 쌓는 승급 절차 없이 밤이 자가 머지한다. 되돌릴 일이
거의 없기 때문이다. 아래를 **전부** 충족할 때만 자가 머지하고, 하나라도 어긋나면
`awaiting-merge-review`로 내린다.

1. §6의 1~4단계(기준 커밋 기록, 충돌 0, 허용 경로 대조, 최신 기준 재검증)를 모두 통과한다.
2. 변경 전 빨갛던 `pnpm typecheck`·`pnpm lint`가 초록이 되거나, 원래 초록이면 초록을 유지한다.
3. **기준 커밋 대비 새 시험 실패가 0이다.** 머지 대상 커밋에서 이미 실패하던 시험(예: 상대가
   진행 중인 i18n 사전화 게이트)은 이 판정에서 제외한다 — 내 변경이 만든 실패만 센다.
   `pnpm test` 전체 초록을 요구하지 않는다. 상대 작업 때문에 상시 빨간 게이트가 있어도
   내 자가 머지를 막지 않는다.
4. `pnpm test`·`pnpm smoke`의 통과 집합이 줄지 않는다(늘거나 그대로여야 한다). 이것이 "동작
   불변"의 기계적 정의다 — 관측 가능한 동작이 하나도 사라지지 않았다는 뜻이다.
5. 화면(`src/app/**`·`src/components/**`)을 건드렸으면 `pnpm smoke`가 통과한다.

이 조건은 밤이 "이건 순수 기술 수정"이라고 선언하는 것을 허용하지 않는다. 관문이 통과를
증명해야 하고, 증명하지 못하면 자동으로 사람 머지로 내려간다. 동작이 바뀌는 수정(기능 추가,
버그 수정, 사양 변경)은 조건 4에서 통과 집합이 달라지므로 여기 해당하지 않는다 — 그것은
레벨 2 이상에서만, 재현 시험과 함께 다룬다.

## 7. 유일한 안전상 hard-stop 두 가지

아래 두 경우만 실행을 발사하지 않는다. 둘 다 해당 단위만 차단하고, 다른 안전한 단위는 계속한다.

### 7.1 비가역 행동

다음은 오너의 명시적 후속 작업 없이는 실행하지 않는다.

- 운영 데이터베이스 `INSERT`, `UPDATE`, `DELETE`, 운영 데이터 쓰기와 마이그레이션·데이터 정의 변경.
- 외부 계약, 구매, 결제, 배포, 운영 서비스 설정 변경.
- `.env*`, 비밀, 자격 증명, 접근 권한 변경.
- 되돌릴 방법이 문서화되지 않은 외부 부작용과 금지 목록에 없는 불명확한 부작용.

데이터베이스는 읽기 전용으로 조사한다. 차단에는 `irreversible`, 구체적인 명령, 대상, 복구에 필요한 오너 행동을 기록한다. 자동 재시도하지 않는다.

### 7.2 예산 한도 초과

모델 호출과 도구 사용은 실행 전에 비용을 추정하고, 제공자·티켓·실행별로 공유 원장에 예약한다.

- 생성 도구의 일일 한도는 **$50**이다. 다른 명시된 프로젝트 한도도 같은 원장에 합산한다.
- 예약액과 누적 청구액을 원자적으로 계산한다. 예약·청구·해제·차단 상태와 제공자 영수증을 각각 기록한다.
- 비용·영수증·제공자를 확인할 수 없으면 `budget-unknown`으로 차단한다. 추측한 비용으로 발사하지 않는다.
- 한도 초과 시 해당 단위만 `blocked`로 두고 남은 예산과 초과 사유를 보고한다. 예약을 몰래 쪼개거나 대체 제공자로 우회하지 않는다.
- 이미 실행한 비용은 결과 카드와 아침 보고에 실제 청구액으로 남긴다.

이 두 예외 외의 실패는 안전상 hard-stop으로 분류하지 않는다. 진단·복구 절차를 거쳐 계속하거나, 해당 단위를 아침 검토로 넘긴다.

## 8. 실패 진단·복구·기록

### 8.1 진단 분류

모든 실패는 다음 중 하나 이상으로 분류한다: `input-invalid`, `contract-mismatch`, `claim-conflict`, `tool-unavailable`, `timeout`, `test-failed`, `merge-conflict`, `missing-evidence`, `irreversible`, `budget-unknown`, `budget-exceeded`.

실패 보고에는 언제, 어느 `run_id`·`snapshot_fingerprint`·`operation_key`·worktree에서, 어떤 명령이, 어떤 입력으로, 어디까지 성공했는지와 오류 원문 요약을 남긴다. 비밀과 모델 원출력 전체는 복사하지 않는다.

### 8.2 안전한 복구

1. 같은 `operation_key`와 같은 입력을 재사용할 수 있는지 먼저 확인한다. 이미 성공 표식이 있으면 재실행하지 않고 그 결과를 연결한다.
2. 임시 기록은 동기화 후 원자 교체한다. 표식이 없으면 완료로 추정하지 않는다.
3. 표식이 `claimed`에서 끊겼고 lease가 만료되었다면 새 소유자가 그 단계부터 재개한다. `decomposed`, `executed`, `reported` 표식이 있으면 앞 단계를 반복하지 않는다.
4. 외부 도구가 실패해도 시도 자체를 막지 않는다. 재시도 횟수 상한은 없다 — 단 매 재시도는 무엇을 바꿨는지 save(§8.4)에 남기고, 같은 명령·같은 입력의 단순 반복은 하지 않는다. 바꿀 것이 더 없으면 `tool-unavailable`로 기록하고 다음 단위로 간다.
5. 충돌, 테스트 실패, 입력 부족은 격리 사본을 보존하고 `awaiting-merge-review` 또는 아침 카드로 보낸다. 기준을 낮추거나 오류를 숨기지 않는다.
6. primary의 상태가 `unknown`이면 fallback을 추측해서 띄우지 않는다. 운영자가 상태를 확인한 뒤 resume 기록을 남겨야 한다.
7. 실행이 중단되면 그때까지의 decomposition, result, cost, artifact 경로를 먼저 기록한다. 수확 성공 표식과 아침 요약은 모든 산출이 저장된 뒤에만 쓴다.

### 8.3 결과 기록

각 단위가 끝날 때마다 결과 카드를 즉시 추가한다. 한꺼번에 몰아서 쓰지 않는다.

- 무엇을 확인·변경·생성했는가.
- 선기입 수용 기준과 실제 관측값.
- `pass`, `fail`, `inconclusive`, `blocked` 중 하나와 그 근거.
- 사용한 메모 스냅샷·티켓·작업 사본·커밋·명령·산출물.
- 비용 예약액·실제 청구액·잔액.
- 다음 조치와 사람이 봐야 할 질문.

`inconclusive`는 실패를 성공으로 포장하지 않는 정상 결과다. 연결이 불확실하면 추측하지 말고 `확인 못 함`으로 남긴다.

### 8.4 save — 중간 저장 지점

밤은 지켜보는 사람이 없으므로, 막히거나 방향을 바꾸는 순간마다
`runs/<actor>/<run_id>/saves/<unit-id>.md`에 저장 지점을 남긴다. 내용은 세 가지다.

- **어디까지 갔나**: 확인한 사실, 실행한 명령, 마지막으로 참이었던 상태.
- **왜 멈췄나**: 막힌 지점과 이유 (§8.1 진단 분류 코드).
- **어디로 갔나**: 버린 길과 그 이유, 바꾼 접근. 종료라면 "여기서 종료"와 남은 질문.

save는 결과 카드가 아니다 — 결론이 없어도 쓴다. 같은 단위를 다시 잡을 때(같은 밤이든
다음 밤이든) 이전 save에서 이어가고, 같은 길을 처음부터 다시 걷지 않는다. save가 있는
한 "결론 없음"은 손실이 아니라 다음 실행의 출발점이다.

## 9. 수용 기준, 측정, 판정선

- 수용 기준은 실행 전에 기록하고 결과가 나온 뒤 소급 수정하지 않는다. 틀린 기준을 발견하면 그 사실을 결과 카드에 적고 다음 기준을 새 버전으로 만든다.
- 흔들리는 벽시계 지표는 갈래마다 세 번 이상 재고, 값이 ±30% 안에 들어오는지 확인한 뒤 사용한다.
- 모델은 지각·분류 자료를 만들 수 있지만 최종 판정은 정의된 채점 방법과 사람 검토에 둔다. 모델·코드·사람이 맡은 판단을 한 점수로 합치지 않는다.
- 그림·영상의 결과에는 사람이 비교할 수 있는 원본, 입력, 시점, 설정, 채점표를 남긴다. 밤은 “좋다/나쁘다” 결론을 기록하지 않는다.
- 기능 변경의 성공은 실행 가능한 검증 명령과 결과로 닫는다. 테스트 통과가 없으면 자가 머지하지 않는다.
- 화면(`src/app/**`, `src/components/**`)을 고쳤으면 `pnpm smoke` 를 함께 돌린다. `pnpm test` 는 브라우저를 못 열어 렌더·콘솔 에러·인증 리다이렉트를 못 본다. 밤 루프는 Orca automation 으로 돌므로 전제가 이미 충족돼 있고, 전제가 없으면 실패가 아니라 skip 으로 빠지니 그냥 돌려도 안전하다. 스모크 통과는 완료가 아니라 오너가 볼 재료가 준비됐다는 뜻이므로, 결과 카드에 스크린샷 경로를 남기고 “좋다/나쁘다”는 쓰지 않는다.

## 10. 아침 결과 리뷰 — budget, carryover, expiry

아침은 사전 승인 창구가 아니라 밤 결과를 소비하는 리뷰 세션이다. 각 사람이 읽는 것은 자기 컴퓨터가 만든 **run 단위 사람 보고서 HTML**(`runs/<actor>/<run_id>/report.html`)이다. 로컬 리뷰 서버(`sh night-launchd.sh review-server`, `http://127.0.0.1:<NIGHT_REVIEW_PORT>/`)로 열면 HTML의 `merge`·`reject`·`feedback` 버튼이 `feedback/<actor>/<run_id>/`에 append-only 이벤트를 남긴다. 버튼 결과는 로컬 기록이다 — git에 올리지 않고, 자기 다음 밤 실행만 읽는다. 형식 없는 판정 메모를 자기 메모 파일(`inbox/<자기 actor>.md`)에 적는 통로도 그대로 유효하다.

판정 규칙은 두 줄이다:

- 다음 밤 실행은 자기 컴퓨터의 `feedback/<자기 actor>/`만 읽어 이전 결과 카드에 판정을 기록한다.
- 코드 수리 branch의 merge는 사람이 Git에서 한다. 밤 runner는 어떤 branch도 merge하지 않는다.

report.html의 버튼은 아래 형태를 그대로 쓴다. 포트는 생성 시점의 `NIGHT_REVIEW_PORT`
값(기본 8377)을 박아 넣고, 새 문법을 지어내지 않는다:

```html
<script>
async function nightDecision(runId, cardId, decision, note) {
  try {
    const r = await fetch("http://127.0.0.1:8377/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId, card_id: cardId, decision: decision, note: note || null }),
    });
    alert(r.ok ? "기록됐다" : "기록 실패: " + (await r.text()));
  } catch (e) {
    alert("리뷰 서버가 꺼져 있다. 터미널에서: sh .claude/vault/backlog/night-launchd.sh review-server");
  }
}
</script>
<button onclick="nightDecision('RUN_ID', 'CARD_ID', 'merge')">merge</button>
<button onclick="nightDecision('RUN_ID', 'CARD_ID', 'reject')">reject</button>
```

카드 파일이나 원장을 직접 편집할 필요는 없다. 밤의 `reported`와 inbox archive는 승인과 다른 상태다. HTML을 읽고 판정하기 전에는 결과를 최종 승인으로 세지 않는다.

### 리뷰 예산

- 하루 리뷰 예산은 약 **10분**이다. 카드 개수가 아니라 실제 검토 시간과 읽을 분량으로 잰다.
- 카드에는 `estimated_review_min`, `reviewed_min`, `carryover_min`, `created_at`, `reviewed_at`을 기록한다.
- 당일 예산을 넘는 미검토 결과는 버리지 않고 다음 아침으로 이월한다. 이월분을 새 카드로 복제해 예산을 늘려 보이지 않게 하지 않는다.
- `ready` 티켓과 머지 대기 작업 사본은 리뷰 만료 대상이 아니며, 오래되면 경고와 이유를 보고한다.

### 만료

- `reviewed_at`이 없는 결과 카드는 만들어진 시각부터 **7일**이 지나면 `expired`로 표시한다. 비용 추정이 없더라도 만료를 막지 않는다.
- 만료 시 `expiry_reason`, 마지막 상태, 결과·근거 경로를 보존한다. 삭제하거나 성공으로 세지 않는다.
- 이미 리뷰된 카드와 오너가 명시적으로 보류한 판단은 만료시키지 않는다. 보류 사유와 다시 열 조건을 기록한다.
- 만료 계산은 기준 시각과 카드 생성 시각을 사용한다. 파일 수정 시각을 추측값으로 쓰지 않는다.

### 지표

기계 보고서에는 아래를 매일 누적한다.

```text
reviewed_total = reviewed_at이 있고 merge_decision이 merge 또는 reject인 카드 수
merged_reviewed = 위 카드 중 merge_decision이 merge인 수
reviewed_merge_rate = merged_reviewed / reviewed_total
self_merge_reviewed = 위 카드 중 merge_mode가 self인 수
human_merge_reviewed = 위 카드 중 merge_mode가 human인 수
```

`reviewed_total`이 0이면 비율은 `unknown`이다. `unknown`, `blocked`, `expired`, 미리뷰, ready 티켓, 머지 대기 사본은 분모에 넣지 않는다. `reviewed_merge_rate`는 자동 정책을 발동하는 문턱이 아니라 학습 지표이며, 자가 머지와 사람 머지를 섞지 않는다.

## 11. 두 단계 판단 증류

### 1단계 — 결과 카드에 판단을 붙인다

자기 `feedback/<actor>/`의 버튼 이벤트와 자기 메모 파일의 판정 메모를 다음 밤 실행이 해석해, `merge`·`reject`와 이유·피드백을 **그 결과 카드**에 기록한다. 상대 actor의 판정은 이 단계의 입력이 아니다. 어느 카드를 가리키는지 확실하지 않으면 추측하지 말고 확인 질문 카드를 아침 보고에 올린다. 카드에는 `judgment_key`, `judgment_version`, 메모 snapshot, 수용 기준 버전, 리뷰 시각과 머지 방식이 있어야 한다. 원본 대화를 새 파일로 복제하지 않는다.

### 2단계 — 반복된 판단만 계약 기준으로 올린다

서로 다른 실행과 서로 다른 메모에서 나온 독립 결과 카드가 같은 `judgment_key`를 갖고, 정확히 두 장 모두 리뷰되고 판정과 피드백이 있으면 `rule-candidate`를 만든다. 세 번째 카드가 생겼다고 자동으로 여러 규칙을 만들지 않는다.

오너가 후보를 확인하면 이전 계약 해시, 두 카드 식별자, 판단 키, 새 규칙 버전, 되돌림 정보를 함께 적어 이 문서의 **분해 기준** 섹션에 규칙 한 줄로 승격한다. 근거 카드가 부족하거나 충돌하면 승격하지 않는다. 승격은 다음 실행에 쓰는 계약 개정이며, 이미 실행된 결과를 소급해서 바꾸지 않는다.

## 12. 반복 루프와 종료

```text
A. runner가 제공한 snapshot set을 검증·고정한다(재촬영하지 않는다).
B. runner가 만든 실행 잠금을 확인한다.
C. 메모·최근 결과·세션·열린 티켓을 읽고 후보를 만든다.
D. 사실 확인 → 해석 → 분해 → 수용 기준 선기입을 한다.
E. 실행 단위를 백지 작업자·격리 worktree에 보내 조사·실험·기능 변경을 수행한다.
F. 결과 카드와 비용·실패·산출물을 즉시 기록한다.
G. `reported` 결과는 원문 삭제 없이 archive 복사와 소비 manifest를 남긴다.
H. 다음 실행 단위가 있으면 C로 돌아간다.
I. 아침 결과 리뷰가 merge/reject/feedback을 카드에 붙인다. 이것이 최종 승인이다.
J. 독립 판정 두 번이 모이면 분해 기준 승격 후보를 만든다.
```

자동화 provider 상태도 결과와 함께 닫는다. 모든 결과 카드·기계 보고서·수확
완료 표식이 저장된 정상 종료에는 먼저 project-relative
`runs/<actor>/<run_id>/manifest.json`을 만든다. schema는 `1`이고 `run_id`,
`actor`, `contract_hash`, `status: "reported"`, exact report artifact
`runs/<actor>/<run>/report.html` path/hash, exact harvest-complete artifact
`runs/<actor>/<run>/harvest/.run-complete.json` path/hash, 모든 unit의 unique `id`와
terminal status 및 result-card path/hash를 포함한다. result card는 반드시
`.claude/vault/backlog/tickets/` 아래에 있어야 하며, report·harvest complete·이 result
card 밖의 artifact만으로는 success를 만들 수 없다. 그 뒤에만 다음 명령을 실행한다.
actionable snapshot은 앞에서 provider에 bind된 set member와 path/id/fingerprint/content hash가
모두 같아야 한다. `--harvest-out`은 정확히 `runs/<actor>/<run-id>/harvest`, 성공 도장은
정확히 `.claude/vault/backlog/sweep/.last-success`에 고정하며 두 경로도 committing
`completion_proof`에 포함한다. journal 재호출에서 harvest/stamp 목적지를 바꾸지 않는다.
harvest에는 공개 성공 도장 명령이 없다. provider가 state lock 안에서 owner proof와
stamp candidate/run-complete hash를 다시 검증하고 도장과 success를 함께 확정한다.

```sh
# ... 결과 보고서와 harvest --validate-complete가 성공한 뒤 ...
python3 "$GATE" complete sweep success \
  --run-id "$provider_run_id" --token="$provider_token" --contract-hash "$contract_hash" \
  --fencing "$fencing" --actor "$actor_id" --harvest-project "$PROJECT_ROOT" \
  --project-root "$PROJECT_ROOT" \
  --harvest-out "$PROJECT_ROOT/runs/$actor_id/$run_id/harvest" \
  --snapshot-id "$snapshot_id" --snapshot-fingerprint "$snapshot_fingerprint" \
  --snapshot-path "$snapshot_path" \
  --run-manifest "runs/$actor_id/$run_id/manifest.json"
```

실행이 실패하거나 제한 시간에 끊기면 `success`를 호출하지 말고 `failed` 또는
`timeout`을 기록한다(같은 `--run-id`, `--token`, `--fencing`, `--actor "$actor_id"`를 전달한다). Claude 주 실행이
`failed` 또는 `timeout`으로 닫힌 경우에만 다음처럼 Codex 대체 claim을 한 번 허용한다.

```sh
# failure completion도 actor와 현재 fencing을 생략하지 않는다.
python3 "$GATE" complete sweep failed \
  --run-id "$provider_run_id" --token="$provider_token" \
  --fencing "$fencing" --contract-hash "$contract_hash" --actor "$actor_id" \
  --project-root "$PROJECT_ROOT"

# fallback은 같은 state_path/run_id에서 새 owner_token과 증가한 fencing을 발급한다.
previous_provider_state="$provider_state"
previous_fencing="$fencing"
fallback_claim="$(python3 "$GATE" fallback sweep \
  --run-id "$provider_run_id" --contract-hash "$contract_hash" --actor "$actor_id" \
  --project-root "$PROJECT_ROOT")"
provider_state="$(printf '%s' "$fallback_claim" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state_path"])')"
provider_run_id="$(printf '%s' "$fallback_claim" | python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])')"
provider_token="$(printf '%s' "$fallback_claim" | python3 -c 'import json,sys; print(json.load(sys.stdin)["owner_token"])')"
fencing="$(printf '%s' "$fallback_claim" | python3 -c 'import json,sys; print(json.load(sys.stdin)["fencing"])')"
fallback_actor="$(printf '%s' "$fallback_claim" | python3 -c 'import json,sys; print(json.load(sys.stdin)["actor"])')"
fallback_contract_hash="$(printf '%s' "$fallback_claim" | python3 -c 'import json,sys; print(json.load(sys.stdin)["contract_hash"])')"
fallback_state_root="$(printf '%s' "$fallback_claim" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state_root"])')"
fallback_project_root="$(printf '%s' "$fallback_claim" | python3 -c 'import json,sys; print(json.load(sys.stdin)["project_root"])')"
[ "$fallback_actor" = "$actor_id" ] &&
[ "$fallback_contract_hash" = "$contract_hash" ] &&
[ "$fallback_state_root" = "$(dirname "$provider_state")" ] &&
[ "$fallback_project_root" = "$PROJECT_ROOT" ] &&
[ "$provider_run_id" = "$run_id" ] &&
[ "$provider_state" = "$previous_provider_state" ] &&
[ "$fencing" -gt "$previous_fencing" ] ||
  { echo "fallback owner proof mismatch" >&2; exit 1; }
# 새 JSON에서 재추출한 provider_state/provider_token/fencing만 환경과 prompt proof로 교체한다.
# 이전 token/fencing으로는 runtime을 재시도하지 않는다.
```

`committing` recovery는 이 `complete success` 명령을 actor, token, fencing, actionable
snapshot, `--harvest-project`, `--harvest-out`, canonical `--run-manifest`까지 **완전히
같이** 다시 호출한다. 새 primary/fallback 또는 `complete failed`는 journal을 덮으므로
호출하지 않는다.

상태 전이는 현재 provider claim과 원자적으로 결속되며,
없는 claim·이미 닫힌 claim·알 수 없는 상태의 늦은 기록은 거부된다.

실행을 끝내는 일반적인 경계는 다음뿐이다.

- 단위가 결론 없이 끝나도 밤을 닫지 않는다. save(§8.4)를 남기고 접근을 바꿔 계속한다. 결론이 나올 때까지 도는 것이 기본이고, 금지는 "같은 접근의 단순 반복"뿐이다.
- 오전 **8시**가 되면 새 단위를 잡지 않고, 실행 중인 단위의 기록과 save를 마친다.
- 실행을 멈추는 안전상 hard-stop은 비가역 행동과 예산 초과 둘뿐이다(§7).

## 13. 산출물과 보존

각 실행은 다음을 만든다.

- 기계 보고서: 실행 상태, 단위별 한 줄 결과, 수용 기준, 지출 합계, 막힘·복구 사유, `reviewed_merge_rate`, 자가/사람 머지 수.
- 사람 보고서: 맥락 → 해석 → 분해 → 수용 기준 → 결과 → 다음 질문 순서의 결과 카드. 상세 로그는 접고 경로만 연결한다.
- 사람 보고서의 각 카드에는 입력 출처(어느 메모 파일인지 — `inbox/jh.md`/`inbox/hs.md` —, 자기 harvest, 자기 feedback),
  snapshot ID·fingerprint, 관련 티켓·코드 파일:줄 또는 세션 ID를 표시한다.
  로컬 절대경로와 세션 원문은 넣지 않는다 — 상대 컴퓨터에서도 열리는 상대 경로만.

### 사람 보고서의 읽기 순서

- 첫 화면은 짧은 브리프다: 이번 실행의 한 줄 결론, 확인된 사실, 막힌 것, 오너가 아침에
  결정할 것, 지출과 실행 상태를 먼저 보여준다.
- 본문은 어려운 용어와 축약어를 줄이고, 처음 나오는 용어는 쉬운 말로 풀어 쓴다.
- 각 결과 섹션의 첫 화면에는 결론만 둔다. `details/summary` 접힘 안에는 그 결론을 만든
  단계별 판단, 메인이 독단으로 정한 안전한 가정, 실제로 읽은 파일·세션·commit·줄 번호,
  서브에이전트 결과, 확인하지 못한 부분을 넣는다.
- 문제를 쪼갰다면 왜 그 단위로 나눴는지와 어떤 수용 기준을 먼저 적었는지도 접힘 안에
  남긴다. 출처 없는 결정은 사실처럼 쓰지 않고 `추정` 또는 `오너 판단 필요`로 표시한다.

저장 위치는 고정한다.

- 티켓·결과 카드: `.claude/vault/backlog/tickets/` — 새 티켓과 결과 카드는 이 디렉터리에만 만든다. backlog 루트에는 이 계약 문서와 실행 도구만 둔다.
- 실행 산출물: `runs/<actor>/<run_id>/` — 사람 보고서 `report.html`, 기계 요약 `manifest.json`, 세션 요약 `sessions/*.md`, worktree 목록 `worktrees.json`, 중간 저장 `saves/*.md`(§8.4). actor와 run이 경로에 들어가므로 같은 날짜에 두 사람이 실행해도 서로 덮어쓰지 않는다. 날짜 하나를 덮어쓰는 `reports/YYYY-MM-DD.html` 경로는 더 쓰지 않는다 (기존 `.claude/vault/backlog/reports/`는 이력으로만 남긴다). 사람 보고서 HTML은 readable-report 표준(`~/.claude/skills/readable-report/SKILL.md`)을 따르고 매 실행마다 반드시 만든다.
- 판정 기록: `feedback/<actor>/<run_id>/*.json` — append-only, 자기 다음 밤 실행만 소비.
- 각 사람의 접점은 셋이다: 쓰는 곳 자기 메모 파일 `inbox/<actor>.md`(commit·push하면 상대 밤에도 보인다), 읽는 곳 자기 최신 `runs/<actor>/<run_id>/report.html`, 그리고 아침에 Orca 터미널로 이어받는 그날 밤 세션(`runs/<actor>/<run_id>/session-id.txt`의 id를 `claude --resume`으로 되살려 대화를 잇는다). 메모는 여전히 비동기로 쌓이고, 세션 이어받기는 결과를 읽고 후속 결정을 잇는 통로를 넓힌 것이지 메모 입력 방식을 바꾸지 않는다. 다른 파일을 읽어야만 진행되는 절차를 만들지 않는다.
- git 공유 경계: 계약·실행 도구·설치 문서, 공유 메모 `inbox/`(각자 자기 파일에만 쓴다), 밤이 만든 코드 수리 branch. `backlog/sweep/`, `_archive/`, `tickets/`, `runs/`, `feedback/`은 이 컴퓨터의 로컬 상태다 — 결과와 판정은 각자의 것이다.
- 티켓 상태와 작업 사본 정보.
- 메모 스냅샷 fingerprint·범위·내용 해시·소비 상태.
- 필요한 실험 산출물과 결과표. raw 대화·모델 원출력은 소비 시점 없이 별도 보관하지 않는다.

결과 보고가 완전히 저장되기 전에는 수확 성공 표식, 아카이브 이동, 실행 성공 선언을 하지 않는다. 기록을 쓸 수 없으면 `logging-failed`로 진단하고 원문과 작업 사본을 보존한 뒤 아침에 복구를 요청한다.

## 14. 말과 기록의 기준

- 설명이 필요한 줄임말 대신 뜻을 풀어 쓴다. 경로·코드 이름·명령어·원문 식별자는 그대로 둔다.
- 오너가 읽을 결과에는 개발 용어보다 관측과 다음 판단을 먼저 쓴다.
- 사실, 해석, 추측, 사람 판단을 섞지 않는다. 추측이 필요하면 추측이라고 표시하고 결론으로 기록하지 않는다.
- 현재 결과와 역사 기록을 덮어쓰지 않는다. 새 판단은 새 버전과 연결된 결과 카드로 남긴다.

이 문서를 고쳐야 할 때는 변경 이유, 영향받는 분해 기준, 이전 계약 해시, 새 계약 해시를 기록한다. 밤 실행은 항상 이 문서 하나를 정본으로 사용한다.

## 15. 계약 개정 기록

- 2026-08-18 (16차) · 이전 계약 해시 `68bcf07452deecf5c1bf1828c4e35b850e7b6e067854d2fbe03cdada76e236e5` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — actor별 canonical proof와 stable logical inbox ID를 실행 계약으로 고정하고, committing journal과 signal/day-run 경계를 성공 기록보다 앞에 둔다.
  - 변경 내용: (1) 모든 provider 명령은 actor와 complete fencing을 같은 owner proof로 전달하며, state-root 0600 key의 HMAC으로 root identity를 검증한다. success는 provider가 bind한 reported actionable snapshot과 canonical manifest/report/harvest/result card만 인정한다. (2) fallback은 같은 state path/run에서 새 token·증가 fencing을 JSON으로 다시 추출하고 stale proof를 폐기한다. (3) marker wrapper를 뺀 logical raw byte range/content hash가 stable item ID이고 full-file hash는 CAS 전용이며 malformed/drifted는 `manual_review`다. (4) snapshot set은 두 파일 generation 재검증 실패 시 manifest 없이 실패하고, `committing`은 같은 completion proof와 canonical harvest/stamp 목적지의 idempotent success 재호출로만 복구한다. archive도 `.claude/vault/_archive/inbox`만 허용한다. (5) launcher는 lease·오전 8시와 `NIGHT_ALLOW_DAY_RUN=1` 기록 경계를 지키며, 코드 신호와 day-run은 별도 실행 경계다.
  - 영향받는 분해 기준: §2의 actor/canonical 입력 고정, §3의 stable ID, §4의 harvest 경로, §8의 fallback·committing 복구, §12의 provider success 검증이 새 proof와 artifact 경계를 따른다. reference snapshot은 출처 맥락일 뿐 소비·표식·archive 대상이 아니다.
- 2026-08-19 (16차) · 이전 계약 해시 `68bcf07452deecf5c1bf1828c4e35b850e7b6e067854d2fbe03cdada76e236e5` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 날짜·시각 기준을 KST 하나로 통일한다. 8/19 첫 실행에서 `run_id`가 UTC 날짜로 발급돼 01:30 KST 실행의 결과 디렉터리가 `night-2026-08-18-…`로 하루 밀린 것이 계기다(`claim_date`는 KST라 두 값이 어긋났다).
  - 변경 내용: (1) §2의 기준 시각 표기를 UTC에서 KST로 고쳤다. (2) `provider-gate.py`의 `run_id` 날짜를 `current_claim_date()`(KST)로 바꿔 `claim_date`와 같은 기준을 쓰게 했고, `state_paths`의 중복 KST 리터럴도 같은 함수로 합쳤다. (3) `harvest.py`의 sweep 디렉터리 날짜(`_output_root`)·`generated_for`·`generated_at`·`completed_at`·도장 주석·드라이런 표를 KST 표기로 바꿨다. (4) `night-runtime.py`의 `read_time`과 `night-review-server.py`의 `created_at`을 KST 표기로 바꿨다.
  - 영향받는 분해 기준: 없음. epoch 값(lease·도장·수확 창)은 타임존과 무관한 절대 시각이라 그대로 두었고, 비교·만료 계산은 바뀌지 않는다. 식별자와 파일명에는 `%z`(`+0900`)가 run_id 정규식을 깨므로 `KST` 리터럴을 쓴다.

- 2026-08-23 (17차) · 이전 계약 해시 `8904d1936d9978b3ebdc52f754bcd12b7f90a760896f5b898254c457258d7668` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 밤이 headless로 돌고 아침엔 리포트 html만 뜨는 비동기 구조에, 아침에 밤 세션을 이어받아 직접 논의하는 통로를 더한다. 메모 비동기성은 그대로 두고, 결과를 읽고 후속 결정하는 접점만 넓힌다.
  - 변경 내용: (1) 밤 실행이 `claude -p`에 고정 `--session-id`를 붙이고 그 id를 `runs/<actor>/<run_id>/session-id.txt`에 기록한다. (2) 새 커맨드 `resume-session`이 최신 run의 세션 id를 읽어 `orca terminal create --command "claude --resume <id>"`로 Orca 새 터미널 탭에 밤 세션을 되살린다. (3) launchd 아침 진입점을 `open-report`에서 `morning`(리포트 html + 세션 탭 둘 다)으로 바꿨다. (4) §13 접점을 둘에서 셋으로 넓혔다.
  - 영향받는 분해 기준: §13 오너 접점이 셋으로 넓어졌다. 메모 입력의 비동기성과 §1 결과 우선 원칙은 그대로다.

- 2026-08-23 (16차) · 이전 계약 해시 `65ff971c6fb802f629538e2c12923fc8e0bd094d8f7f87969566ea9e7f9b943f` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 밤이 오너의 머지만 기다리다 4일간 결과가 쌓이기만 한 병목을 푼다. 동작이 바뀌지 않는 기술 수리는 밤이 스스로 합치게 하고, 메모는 옆에 다른 커밋이 있어도 자동으로 내보내며, 결과물은 전부 로컬로 둔다.
  - 변경 내용: (1) §1.5 레벨 1에 "동작 불변 자가 머지" 예외를 신설하고 §6a에 판정 조건을 정의했다 — 레벨을 올리지 않고(승급 게이트 우회) 되돌릴 위험이 없는 수리만 연다. 판정은 "기준 커밋 대비 새 시험 실패 0"이라 상대의 i18n 게이트가 상시 빨개도 막지 않는다. (2) §2 inbox 동기화를 "내 메모만 자동 push"로 바꿨다 — 옆에 비-inbox 미푸시 커밋이 있어도 건너뛰지 않는다(`inbox_only_ahead` 전체 skip 제거). 상대 메모 수신 ff 단계는 뺐다(각자 로컬 실행). (3) §2 mutating 명령 목록에 `append-units`를 넣었다(구현·시험은 이미 있음). (4) 결과물 `runs/`는 전부 로컬로 둔다 — `.gitignore`의 `report.html` 공유 예외를 제거해 계약(로컬)과 맞췄다.
  - 영향받는 분해 기준: §6 자가 머지가 레벨 1에서 좁게 열렸다. `night-launchd.sh`의 `sync_inbox`와 계약 시험(`vault-night-contract.test.ts`)이 새 동기화 로직으로 갱신됐다.

- 2026-08-18 (15차) · 이전 계약 해시 `35826e690c9646b4f0efc40d64f4d2c90ffc4152a78dce13796b631bcc4b43c0` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — actor 이름을 역할명(owner/friend) 대신 실제 사용자 이름(jh/hs)으로 쓴다.
  - 변경 내용: 공유 inbox를 `inbox/jh.md`·`inbox/hs.md`로 이름 변경하고, 기본 actor를 오너 머신 `jh`, 친구 설치 `hs`로 맞췄다. 로컬 결과·feedback·수리 branch의 actor namespace도 같은 값을 쓴다.
  - 영향받는 분해 기준: 없음 — 이름만 바뀌고 소비·공유·동기화 규칙은 같다.

- 2026-08-19 (15차) · 부분 완료 정산과 머지 검토를 전역 실행 관문에서 분리한다.
  - 변경 이유: 한 source marker에 여러 unit이 묶였을 때 한 unit의 `awaiting-merge-review`가
    다른 완료 unit의 receipt 기록과 다음 inbox 실행까지 막히는 것처럼 보였다.
  - 변경 내용: marker 전체 unit의 terminal receipt가 모일 때만 `closed`로 바꾸되, 완료된
    일부 unit의 부분 receipt는 먼저 검증해 `partial`로 남긴다. 겹치는 부분 receipt는
    `manual_review`로 보낸다. `awaiting-merge-review`는 해당 code unit만 보류하고 다른
    unit·marker는 계속 실행한다.
  - 영향받는 분해 기준: 조사 완료, 코드 branch의 사람 머지, receipt 정산, source marker
    close를 서로 다른 상태로 판정한다.

- 2026-08-18 (14차) · 이전 계약 해시 `084ae665d956edba5d5537bd86055a17ee8fb9de1cd967908c3afbc278340839` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 메모만은 서로 보이게 한다. 단일 `_INBOX.md`를 섹션으로 나누는 방식은 8/18 새벽을 죽인 같은-파일 병합 충돌로 돌아가므로, 파일을 사람별로 갈라 충돌 자체를 없앤다.
  - 변경 내용: (1) `_INBOX.md` → `.claude/vault/inbox/<actor>.md` — 사람마다 자기 파일 하나, 자기 파일에만 쓴다. git 추적으로 복귀해 push하면 상대 밤에도 보인다. (2) 실행 시작에 fetch·ff로 상대 메모를 받고 내 메모 파일만 커밋·push한다. 미푸시 사람 커밋이 있으면 건너뛰고, push 경합은 rebase 재시도 1회로 흡수하며, 어떤 실패도 기록 후 로컬 내용으로 계속한다(fail-open — 옛 inbox-sync의 fail-closed와 정반대). (3) 소비 책임은 자기 파일에만: 스냅샷·소비 표식·archive는 자기 메모만 만들고, 상대 메모는 §4.0의 읽기 전용 참고 입력으로 읽어 리포트에 출처를 표시한다. (4) 리포트·티켓·피드백·수확은 13차 그대로 로컬이다.
  - 영향받는 분해 기준: §4.0 맥락 보강 입력에 상대 메모가 추가됐다. 같은 메모를 두 밤이 각자 실행할 수 있으나 소비 표식이 갈라져 있어 서로 간섭하지 않는다.

- 2026-08-18 (13차) · 이전 계약 해시 `2e3faced1856a7de8463ea575a4cbfac03b0ce27969c60fa893c656bdc85a1ce` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 독립 실행을 끝까지 밀어붙인다. 각자 자기 리포트만 보면 되고, 서로의 리포트·티켓·피드백을 git으로 나눌 이유가 없다. 12차가 남겨둔 "결과·원장 공유"는 inbox 독립과 모순이었다.
  - 변경 내용: (1) `tickets/`·`runs/`·`feedback/`·기존 `reports/`를 전부 로컬 상태로 강등(untrack+ignore). git으로 나누는 것은 코드(계약·도구·설치 문서)와 밤이 만든 수리 worktree branch 뿐이다. (2) 결과를 쌓는 actor 전용 branch(`NIGHT_GIT_BRANCH`) 개념 삭제 — 결과가 로컬이면 결과 branch는 존재 이유가 없다. 각 컴퓨터는 main에서 실행한다. (3) §5 코드 신호 대조 범위를 자기 티켓 원장으로 되돌림 — 두 컴퓨터의 조사가 겹쳐도 막지 않는다. (4) 아침 피드백의 commit/push 절차 삭제 — 판정은 로컬 기록이고 자기 다음 밤만 읽는다.
  - 영향받는 분해 기준: §4.2 티켓 대조 범위가 자기 원장으로 돌아왔다. 사람 사이의 전달 통로는 코드 수리 branch 하나로 좁아졌다.

- 2026-08-18 (12차) · 이전 계약 해시 `b4e3bbba59ebf554f0b788e9260e7b5bbf6ea6d64a7d14ae713f81ba8db2c139` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 독립 실행에서 vault의 git 공유 경계를 자르고, 두 actor가 공유 코드베이스에서 같은 코드 신호를 잡는 중복을 정의한다.
  - 변경 내용: (1) `_INBOX.md`·`backlog/sweep/`·`_archive/`를 git 추적에서 빼 로컬 상태로 만들었다. 공유는 계약·도구·`tickets/`·`runs/`·`feedback/`만. 새 checkout에서 inbox가 없으면 실행 스크립트가 빈 파일로 시작한다. (2) §5에 코드 신호 중복 규칙 추가 — 단위를 만들기 전 티켓 원장 전체(상대 actor 포함)와 대조해 전날까지의 중복을 끊고, 같은 밤의 동시 중복은 허용한다(읽기 전용 조사, actor별 worktree branch, 사람 merge가 흡수).
  - 영향받는 분해 기준: §4.2의 티켓 대조 범위가 "자기 티켓"에서 "pull된 원장 전체"로 넓어졌다.

- 2026-08-18 (11차) · 이전 계약 해시 `e20c886348d10a1cc2abcedb4b1a3ca1ff65513c45d1d53481eb1e5e535eb18c` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 실행 자체를 막는 보험을 없앤다. 8/18 새벽 실행이 inbox 병합 판정 하나로 두 번 전멸한 것이 계기다. 밤에서 보험의 비용은 "아침에 결과 없음"인데, 시작 관문형 보험이 막는 실패의 비용도 대부분 같아서 보험이 손해다.
  - 변경 내용: (1) preflight와 claude 프로브를 관문에서 점검 기록으로 강등 — 실패해도 경고를 claim에 남기고 실행을 시도한다. probe 실패 시 즉시 Codex로 넘기던 fallback_pending 경로도 삭제하고, Codex 대체는 실제 실행이 failed/timeout으로 닫힌 뒤에만 남긴다. (2) 연속 3단위 결론 없음 중단을 삭제 — 결론이 나올 때까지 도는 것이 기본이다. (3) 외부 도구 재시도 1회 제한을 삭제 — 시도는 막지 않되 매 시도의 변경점을 기록한다. (4) §8.4 save 신설 — 막히거나 방향을 바꿀 때마다 어디까지 갔고, 왜 멈췄고, 어디로 갔는지를 `runs/<actor>/<run_id>/saves/`에 남기고, 다음 실행이 거기서 이어간다.
  - 영향받는 분해 기준: hard-stop은 비가역 행동과 예산 초과 둘만 남는다. 동시성 잠금(같은 날짜 이중 실행 방지)과 거짓 성공 방지(완료 검증·fencing)는 실행을 만드는 장치라 그대로 둔다.

- 2026-08-18 (10차) · 이전 계약 해시 `4ce259fb4b22aa9a473a9ff4d0c54fa550bde01aeccee09399c41d4ec512467f` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 지시 — 안 쓰는 것을 전부 뺀다. 상대 report에 대한 교차 검토 기록, shared-legacy 프로필, 원격 inbox 동기화 도구, 겹치는 설치 문서.
  - 변경 내용: (1) `night-inbox-sync.py`와 `NIGHT_RUN_PROFILE` 삭제 — 독립 실행이 유일한 모드다. (2) `review/` 교차 검토 경로와 리뷰 서버의 `/api/review` 삭제 — 상대에게 전할 말은 사람이 직접 한다. (3) `night-independent-runners-prompt.md`, `night-friend-setup.md`, `night-runner-guide.html` 삭제 — 설치 정본은 `night-runner-setup.md` 하나다. (4) report 버튼의 HTML 형태를 §10에 고정해 밤마다 새로 지어내지 않게 했다.
  - 영향받는 분해 기준: 없음 — 실행 절차·안전 경계는 그대로이고 죽은 경로만 사라졌다.

- 2026-08-18 (9차) · 이전 계약 해시 `86d3be3fdcb41ea622c18c53df1825a49574157723f122cd586a4c5d814f9b6c` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 밤 러너를 owner-only inbox 병합 구조에서 두 개발자가 각자 자기 컴퓨터에서 독립 실행하는 구조로 전환한다.
  - 변경 내용: (1) 실행 프로필 신설 — 기본 `independent`는 원격 inbox 동기화를 호출하지 않고 자기 checkout의 inbox·세션만 쓴다. 예전 병합 흐름은 명시적 `shared-legacy`로만 남는다. (2) 산출물 경로를 날짜 덮어쓰기(`reports/YYYY-MM-DD.html`)에서 run 단위 immutable 경로(`runs/<actor>/<run_id>/`)로 바꾸고, worktree branch에 actor를 넣는다(`night/<actor>/<run_id>/<unit-id>`). (3) 판정은 로컬 리뷰 서버가 `feedback/<actor>/<run_id>/`에 append-only로 기록하고 **자기 actor의 다음 실행만** 소비한다. 상대 report에 대한 의견은 `review/<actor>/on-<상대>/`에 별도 기록되며 자동 입력이 아니다. (4) 상대 branch·코드의 merge는 사람이 Git에서 한다.
  - 영향받는 분해 기준: 소유권을 코드로 검증하는 레이어는 만들지 않았다. 격리는 "각자 자기 컴퓨터"라는 물리적 사실이 전제로 제공하고, 계약은 공유 지점(git에 push되는 경로·branch 이름)의 겹침 방지 규약만 정한다.

- 2026-08-18 (8차) · 이전 계약 해시 `5be54f6111cd6464cb585de4fa882ce21bddd997063beffabd77950918b1aaed` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 02:00·02:30 실행이 `_INBOX.md` 앞부분에 추가된 메모를 기존 줄 수정으로 오인해 `merge-conflict`로 중단됐다.
  - 변경 내용: 기존 줄을 순서대로 모두 보존하는 삽입 전용 병합을 허용하고, 실제 수정·삭제만 차단한다. 같은 상황에서 친구 push가 없어도 오너 입력만 계속 처리한다.
  - 영향받는 분해 기준: inbox 동기화 경계만 넓어졌고, 원문 삭제·자동 의미 판단은 여전히 금지된다.

- 2026-08-18 (7차) · 이전 계약 해시 `036ad05dd066ef2943315067d1819c9b5556f5f851a7d0520db846e12492a5cd` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 요청 — 최종 보고서를 어려운 원문 나열이 아니라 짧은 브리프로 먼저 읽고, 단계별 독단·참고 자료·쪼갠 기준은 필요할 때만 펼쳐 보게 한다.
  - 변경 내용: 사람 보고서 첫 화면의 브리프 규칙과 각 섹션 접힘 안의 판단·가정·출처·미확인·분해 기준 필수 기록을 추가했다.
  - 영향받는 분해 기준: 실행 내용은 바꾸지 않고, 결과 보고의 읽기 순서와 출처 공개 수준만 바뀐다.

- 2026-08-17 (6차) · 이전 계약 해시 `68d7e28ac5d41535605e234846d4af7d1203d958799e037b2c9bb6e2844b5d46` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — 친구는 실행하지 않고 새벽에 `_INBOX.md`를 push하며, 오너 실행기는 원격 입력을 먼저 받아 내 입력과 함께 처리한다. 두 inbox의 우선순위는 같고, 친구 push가 없으면 오너 입력만 사용한다. 실행 완료와 아침 승인도 분리한다.
  - 변경 내용: claim 전 append-only inbox 동기화와 `merge-conflict` 경계 추가, 오너 harvest만 사용, `reported` snapshot의 archive 복사·소비 manifest·`awaiting-owner-review` 상태 추가.
  - 영향받는 분해 기준: 메모 snapshot은 동기화된 `_INBOX.md` 전체를 기준으로 하며, archive는 승인 완료가 아니다.

- 2026-08-17 (5차) · 이전 계약 해시 `bd39b56f8e836b81206122d33d1ca48b64379e22baac8f5fd7067d5da42cf741` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 결정 — "메모만 보고 알아서 해와라"의 범위가 과대했다. 판정 기준이 오너에게 있는 메모까지 자율 실행되던 것을 레벨 시스템으로 단계 해금한다.
  - 변경 내용: §1.5 자율성 레벨(현재 레벨 1 — 사실 기계, 자가 머지 금지·유료 발주 0·판정형 메모는 질문 카드로) 신설, 승급은 지표 충족 후 오너 개정으로만. §4.0 메모 맥락 보강(분해 전에 티켓·실험·과거 보고서·세션 원문에서 메모 관련 흔적 검색) 신설.
  - 영향받는 분해 기준: §4.2의 실행 단위 생성이 §1.5 관문과 §4.0 선행 단계의 구속을 받는다. 기존 §6 자가 머지·§7.2 예산 조항은 레벨 조건부로 재해석된다.

- 2026-08-17 (4차) · 이전 계약 해시 `91e273df7f4a29967d594470e19bd7a3039e63b614a159090c7f44df8a438898` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 데모 실행에서 드러난 도구 이탈(금지 모델로 subagent 실행, 수용 기준 선기입 순서 이탈)을 재발 방지 장치로 고정.
  - 변경 내용: §5에 백지 조사 작업자 정의(`.claude/agents/night-investigator.md` — 읽기 전용 도구·모델 고정)와 낮 디버그 절차 스킬(`.claude/skills/night-debug-run/SKILL.md`) 참조 추가. preflight가 두 파일의 존재를 검증한다.
  - 영향받는 분해 기준: 없음 — 위임 방식만 표준화되었다.

- 2026-08-17 · 이전 계약 해시 `a414257a45e1186012990e46fbfb68dcbdb80b2ce5c04d4a5ca5707e35bfdeea` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 요청 — backlog 루트에 티켓 104장이 평평하게 쌓여 구조가 안 보였고, 아침 리뷰 파일을 오너가 실제로 읽지 않았다.
  - 변경 내용: (1) 티켓·결과 카드를 `backlog/tickets/`로 이동하고 새 카드도 거기에만 만든다. (2) 아침 리뷰 파일을 `_archive/_MORNING.md`로 은퇴시키고, 오너 접점을 `_INBOX.md`(판정 쓰기)와 `reports/YYYY-MM-DD.html`(결과 읽기) 둘로 고정했다. 오너 판정은 다음 밤이 `_INBOX.md` 메모에서 해석해 결과 카드에 기록한다. (3) 비어 있던 `destination/` 디렉터리를 제거했다.
  - 영향받는 분해 기준: 없음 — 분해 규칙과 안전 경계는 그대로이고, 저장 경로와 아침 리뷰 통로만 바뀌었다.
- 2026-08-17 (3차) · 이전 계약 해시 `5aa511ca68e792cba6f268970e6de338dbae93f11efc1adaa79b96163c7bf42b` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: 오너 지시 — fable 모델 사용 금지.
  - 변경 내용: §5에 모델 금지 규칙 추가(주 실행·subagent·worktree 위임 전부). night-launchd.sh도 같은 가드를 셸 레벨에서 강제한다.
  - 영향받는 분해 기준: 없음.
- 2026-08-17 (2차) · 이전 계약 해시 `a00472f6c7bb59187f8640e950d04b07f0783d4a70f5b49d1c8c648afb151b03` · 새 계약 해시는 이 개정을 담은 커밋의 파일 해시로 확인한다.
  - 변경 이유: Orca가 없는 개발자 머신에서도 같은 계약이 그대로 돌게 하기 위한 이식성 개정.
  - 변경 내용: (1) `PROJECT_ROOT`를 하드코딩 경로 대신 `git rev-parse --show-toplevel`로 구한다. (2) 잠금 게이트 호출을 Orca 설치 경로의 래퍼 대신 저장소 안의 `provider-gate.py` 직접 호출(`python3 "$GATE"`)로 바꿨다 — Orca 래퍼도 같은 파일을 exec할 뿐이라 상태 기계는 동일하다. (3) 스케줄러 중립 진입점 `night-launchd.sh`(run/dry-run)를 추가했다. Orca 머신은 기존대로 Orca precheck가 primary claim을 만들고, Orca 없는 머신은 launchd가 이 진입점을 부른다. 설치 절차는 `.claude/vault/night-runner-setup.md`가 정본이다.
  - 영향받는 분해 기준: 없음 — 실행 절차·안전 경계·상태 기계는 동일하고 호출 경로만 이식 가능해졌다.
