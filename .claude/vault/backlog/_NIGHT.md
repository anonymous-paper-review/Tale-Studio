# 밤 루프 계약 — 결과 우선 자율 실행

> 이 문서가 밤 자동화의 유일한 live 계약이다. 자동화는 매일 새 실행을 시작할 때 이 문서와 `.claude/vault/_INBOX.md`를 읽는다.
> 오너는 자고 있으므로 질문에 답하지 않는다. 밤은 해석하고, 쪼개고, 실행하고, 결과를 남긴다.

## 1. 목적과 원칙

목표는 메모와 대화를 대기열로 쌓는 것이 아니라, 밤이 실제 결과를 만들어 아침에 사람이 판단할 수 있게 하는 것이다.

- 오너는 `_INBOX.md`에 형식 없는 메모를 쓴다. 순서·길이·문장 완성 여부는 중요하지 않다.
- 밤은 메모를 읽고 뜻을 해석한 뒤, 가장 작고 검증 가능한 실행 단위로 나눈다.
- 사전 승인은 실행 조건이 아니다. 해석이 갈리면 안전한 한 가지를 골라 실행하고, 틀린 실행도 결과와 학습 자료로 남긴다.
- 조사, 모델 실험, 수리, 제품 기능 개발을 모두 실행 대상으로 삼는다. 제품 기능 변경도 격리와 검증을 거쳐 실행하며 실행 단위의 수에는 상한을 두지 않는다.
- 최종 판단이 필요한 그림·영상은 밤이 맞다/틀리다를 판정하지 않는다. 밤은 입력, 산출물, 측정표와 비교 자료를 만들고 사람의 판단을 기다린다.
- 밤 루프의 안전상 `hard-stop`은 비가역 행동과 예산 한도 초과뿐이다. 모호함·도구 실패·테스트 실패는 해당 실행 단위를 안전하게 기록하고 복구하거나 아침 검토로 넘긴다.
- 기록에는 소비자와 소비 시점을 붙인다. 결과 카드·티켓·실험 기록은 함께 닫히며, 소비자가 없는 원본 대화 더미를 새로 만들지 않는다.

## 2. 실행 시작 — 한 번만 읽고 고정하기

실행마다 다음 값을 먼저 만든다.

- `run_id`: provider gate가 발급한 `night-YYYY-MM-DD-<uuid>` 실행 식별자.
- `contract_id`, `contract_version`, 이 문서의 정규화된 해시.
- 시작 시각과 기준 시각(UTC), 실행 주체(`claude` 또는 `codex`), 작업 루트.
- 읽기 전용 입력 목록, 격리 작업 사본 목록, 결과 보고서 경로.

이 값은 실행 기록과 모든 결과 카드에 이어 붙인다. 실행 중 계약 문서를 다시 읽어 규칙을 바꾸지 않는다. 계약 해시나 필수 입력이 서로 다르면 추측하지 말고 `contract-mismatch`로 진단·기록한 뒤 해당 실행을 시작하지 않는다.

실행 시작 전에 Orca precheck가 반드시 `primary sweep` claim을 만든다. 이 claim이 없거나
`state sweep`가 실패하면 실행을 시작하지 않는다. 계약 본문에서 `primary`를 다시 호출하지
않아 이중 claim을 만들지 않는다. 실행 시작 시 계약 해시와 메모 스냅샷은 저장소 도구로
한 번에 고정한다. 스냅샷 도구는 `_INBOX.md`를 수정하지 않고, 출력 JSON의 `snapshot_id`와
`snapshot_fingerprint`를 이후 명령에 그대로 전달한다.

```sh
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"
GATE="$PROJECT_ROOT/.claude/vault/backlog/provider-gate.py"
# 스케줄러(Orca 또는 launchd 진입점 night-launchd.sh)가 이 계약 시작 전에
# `primary sweep`을 정확히 한 번 만든다. 여기서 primary를 다시 부르지 않고
# 필수 claim을 조회·검증만 한다.
provider_state="$(python3 "$GATE" state sweep \
  --contract-path "$PROJECT_ROOT/.claude/vault/backlog/_NIGHT.md")"
provider_status="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')"
provider="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["provider"])')"
fallback_pending="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("fallback_pending", False)).lower())')"
if [ "$fallback_pending" = "true" ] || \
   { [ "$provider" = "claude" ] && { [ "$provider_status" = "failed" ] || [ "$provider_status" = "timeout" ]; }; }; then
  provider_state="$(python3 "$GATE" fallback sweep \
    --run-id "$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])')" \
    --contract-path "$PROJECT_ROOT/.claude/vault/backlog/_NIGHT.md")" || {
      echo "Codex fallback claim failed" >&2
      exit 1
    }
  provider_status="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')"
  provider="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["provider"])')"
fi
[ "$provider_status" = "claimed" ] || [ "$provider_status" = "running" ] || {
  echo "provider primary claim is mandatory; state sweep is not active" >&2
  exit 1
}
[ "$provider" = "claude" ] || [ "$provider" = "codex" ] || {
  echo "provider state has no valid owner" >&2
  exit 1
}
run_id="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])')"
provider_run_id="$run_id"
provider_token="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["owner_token"])')"
contract_hash="$(shasum -a 256 "$PROJECT_ROOT/.claude/vault/backlog/_NIGHT.md" | awk '{print $1}')"
snapshot_json="$(python3 "$PROJECT_ROOT/.claude/vault/backlog/night-runtime.py" snapshot-inbox \
  --run-id "$run_id" --contract-hash "$contract_hash")"
snapshot_id="$(printf '%s' "$snapshot_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["snapshot_id"])')"
snapshot_fingerprint="$(printf '%s' "$snapshot_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["snapshot_fingerprint"])')"
snapshot_path="$(printf '%s' "$snapshot_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["snapshot"])')"
```

### 단일 실행 가정

- 같은 날짜에는 주 실행 하나만 `claimed → running`이 될 수 있다.
- Claude 주 실행은 한 번만 시작한다. Codex는 주 실행이 명시적으로 `failed`이거나 시간 초과로 만료되었다는 기록이 있을 때만 같은 `run_id`의 대체 실행으로 한 번 시작한다.
- 상태가 `running`, `unknown`, `reported` 또는 성공 기록 미완성인 경우 Codex는 대체 실행을 시작하지 않는다. 두 실행이 동시에 같은 메모·티켓·예산을 소비하지 않게 한다.
- 실행 소유권은 만료 시각과 단조 증가하는 fencing token(오래된 실행의 늦은 쓰기를 거부하는 번호)으로 확인한다. 만료한 실행은 결과 카드·예산·보관 표식을 쓰지 못한다.
- 주 실행이나 대체 실행이 실패해도 성공으로 도장을 찍지 않는다. 결과 보고와 확인 가능한 종료 표식이 모두 남은 뒤에만 성공으로 기록한다.

## 3. 메모 원문과 스냅샷 수명

`_INBOX.md`는 사람이 쓰는 원문이다. 밤은 이 파일을 수정·삭제·정리하지 않는다.

1. 시작할 때 UTF-8 원본 바이트의 범위 `[start, end)`와 읽은 시각, 범위의 내용 해시를 저장한다.
2. `snapshot_fingerprint`는 경로·범위·내용 해시로 만들고, `snapshot_id`는 fingerprint·run_id·contract_hash binding으로 만든다. 같은 범위와 같은 내용은 같은 fingerprint로 알아보되, 실행이나 계약이 달라지면 새 binding으로 취급한다.
3. fingerprint별 상태를 `unclaimed → claimed → decomposed → executed → reported`로 기록한다. `failed`와 `blocked`는 안전한 종단 상태다.
4. 분해 기록에는 원문 인용, 스냅샷 식별자, 해석, 실행 단위, 수용 기준을 함께 적는다. 이 기록이 메모의 소비 표식이다. 소비 표식이 있는 스냅샷은 다시 분해하지 않는다.
5. 오너가 내용을 고치면 새 내용 해시와 새 snapshot으로 취급한다. 이전 스냅샷을 덮어쓰지 않는다.
6. 스냅샷 기록 중 실패하면 임시 파일에 쓰고 동기화한 뒤 원자적으로 이름을 바꾼다. 중간 표식이 없으면 소비 완료로 간주하지 않고 다음 실행이 안전하게 재청구한다.
7. 메모의 바이트 범위가 겹치거나 경계가 불명확하면 전체 스냅샷의 결정론적 범위 목록을 먼저 만들고, 겹친 범위는 하나만 청구한다. 겹침을 조용히 합치지 않는다.

## 4. 해석과 분해

메모, 최근 결과, 열린 티켓, 정리되지 않은 세션, 코드의 실제 상태를 읽되 원문을 대화에 대량으로 복사하지 않는다. 세션 수확은 제공된 `harvest.py`를 거친다.

### 4.1 정리되지 않은 세션 수확

```sh
python3 "$PROJECT_ROOT/.claude/vault/backlog/harvest.py" --dry-run \
  --project "$PROJECT_ROOT" --contract-hash "$contract_hash" \
  --snapshot-id "$snapshot_id" --snapshot-fingerprint "$snapshot_fingerprint"
python3 "$PROJECT_ROOT/.claude/vault/backlog/harvest.py" --run-id "$run_id" \
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
  --contract-hash "$contract_hash" --snapshot-id "$snapshot_id" \
  --snapshot-fingerprint "$snapshot_fingerprint" \
  --snapshot-path "$snapshot_path"
  ```
  완료 표식이 없거나 산출물 hash가 바뀌면 provider `complete success`를 호출하지 않는다.
  실제 성공 도장 확정(`--commit-success`)은 provider gate가 현재 owner token·fencing·lease를
  재확인한 뒤에만 수행한다.

수확된 세션마다 다음을 짧게 기록한다.

- 세션이 한 일 3~5줄.
- 열린 것 후보를 `미결`(결론이 없음), `미착수`(결론은 있으나 실행하지 않음), `검증 대기`(실행했으나 확인하지 않음)로 구분.
- 관련 티켓·실험·결정의 연결.
- 코드·커밋으로 닫힌 것은 열린 후보로 다시 만들지 않는다.

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
- 서로 다른 주제는 병렬로 실행할 수 있으나 같은 파일·같은 작업 사본을 두 실행이 동시에 쓰지 않는다.
- 조사 백지 작업자는 `.claude/agents/night-investigator.md` 정의를 사용한다 — 도구는 읽기 전용, 모델은 정의 파일에 고정(fable 금지 집행 지점). 낮 디버그 실행 절차는 `.claude/skills/night-debug-run/SKILL.md`가 정본이다.
- 티켓을 백지 subagent에게 줄 때는 티켓 경로만 전달한다. 실행자가 티켓만 읽고 닫을 수 있는지 확인하는 품질 검사이며, 머릿속 맥락을 덧붙이지 않는다.
- 백지 실행자가 범위를 이해하지 못하면 해당 단위를 `blocked`로 기록하고, 내용을 대신 지어내어 실행하지 않는다.
- 모든 결과에는 입력, 명령, 실행 시각, 실행 주체, worktree, 커밋, 산출물 경로를 연결한다.
- **모델 금지: `fable`.** 모델 id나 별칭에 `fable`이 들어간 모델로는 어떤 실행도 하지 않는다 — 주 실행, 백지 subagent, 격리 worktree 안의 위임 실행 전부 해당한다. subagent를 띄울 때 모델을 지정할 수 있으면 fable이 아닌 모델을 명시하고, 환경이 fable을 강제하면 그 단위를 실행하지 말고 `blocked`(`tool-unavailable`)로 기록한다.

## 6. 작업 사본 격리와 기능 변경

기능 변경과 수리는 별도 작업 사본에서 한다. 메인 체크아웃에서 브랜치를 바꾸거나 오너의 커밋되지 않은 변경을 덮지 않는다.

```sh
git worktree add <isolated-path> -b night/<run-id>-<unit-id>
```

작업 사본마다 다음을 지킨다.

1. 실행 전 대상 기준 커밋과 허용 경로를 기록한다.
2. 최신 기준을 가져와 충돌 여부를 확인하고, 충돌이 나면 자동 병합하지 않는다.
3. 변경 경로를 티켓의 허용 목록과 전역 금지 목록에 대조한다. `src/` 변경 자체는 금지가 아니지만, `.env*`, 비밀·자격 증명, 운영 스키마, 마이그레이션, 운영 데이터 쓰기는 거부한다.
4. 최신 기준으로 검증을 다시 실행하고 명령·결과 해시를 기록한다.
5. 충돌 0, 검증 통과, 허용 경로, 기준 커밋의 비교·교환 확인이 모두 맞으면 밤이 자가 머지할 수 있다. 하나라도 빠지면 `awaiting-merge-review`로 올리고 사람 머지로 남긴다.
6. 자가 머지와 사람 머지는 결과 지표에서 별도로 세며, 작업 사본 경로와 커밋을 아침 카드에 적는다.

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
4. 외부 도구가 실패하면 짧은 재시도 한 번과 읽기 전용 대체 조사만 허용한다. 반복 실패는 `tool-unavailable`로 기록하고 다음 단위로 간다.
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

## 9. 수용 기준, 측정, 판정선

- 수용 기준은 실행 전에 기록하고 결과가 나온 뒤 소급 수정하지 않는다. 틀린 기준을 발견하면 그 사실을 결과 카드에 적고 다음 기준을 새 버전으로 만든다.
- 흔들리는 벽시계 지표는 갈래마다 세 번 이상 재고, 값이 ±30% 안에 들어오는지 확인한 뒤 사용한다.
- 모델은 지각·분류 자료를 만들 수 있지만 최종 판정은 정의된 채점 방법과 사람 검토에 둔다. 모델·코드·사람이 맡은 판단을 한 점수로 합치지 않는다.
- 그림·영상의 결과에는 사람이 비교할 수 있는 원본, 입력, 시점, 설정, 채점표를 남긴다. 밤은 “좋다/나쁘다” 결론을 기록하지 않는다.
- 기능 변경의 성공은 실행 가능한 검증 명령과 결과로 닫는다. 테스트 통과가 없으면 자가 머지하지 않는다.
- 화면(`src/app/**`, `src/components/**`)을 고쳤으면 `pnpm smoke` 를 함께 돌린다. `pnpm test` 는 브라우저를 못 열어 렌더·콘솔 에러·인증 리다이렉트를 못 본다. 밤 루프는 Orca automation 으로 돌므로 전제가 이미 충족돼 있고, 전제가 없으면 실패가 아니라 skip 으로 빠지니 그냥 돌려도 안전하다. 스모크 통과는 완료가 아니라 오너가 볼 재료가 준비됐다는 뜻이므로, 결과 카드에 스크린샷 경로를 남기고 “좋다/나쁘다”는 쓰지 않는다.

## 10. 아침 결과 리뷰 — budget, carryover, expiry

아침은 사전 승인 창구가 아니라 밤 결과를 소비하는 리뷰 세션이다. 오너가 읽는 것은 결과 카드 원본이 아니라 **날짜 기준 사람 보고서 HTML**(`.claude/vault/backlog/reports/YYYY-MM-DD.html`)이다. 오너는 판정(`merge`, `reject`, 다음 실행에 반영할 `feedback`)과 이유를 별도 형식 없이 `_INBOX.md`에 적는다. 다음 밤 실행이 그 메모를 해석해 해당 결과 카드에 판정으로 기록한다. 오너가 카드 파일이나 원장을 직접 편집할 필요는 없다.

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

오너가 `_INBOX.md`에 남긴 판정 메모를 다음 밤 실행이 해석해, 오너의 `merge`·`reject`와 이유·피드백을 **그 결과 카드**에 기록한다. 어느 카드를 가리키는지 확실하지 않으면 추측하지 말고 확인 질문 카드를 아침 보고에 올린다. 카드에는 `judgment_key`, `judgment_version`, 메모 snapshot, 수용 기준 버전, 리뷰 시각과 머지 방식이 있어야 한다. 원본 대화를 새 파일로 복제하지 않는다.

### 2단계 — 반복된 판단만 계약 기준으로 올린다

서로 다른 실행과 서로 다른 메모에서 나온 독립 결과 카드가 같은 `judgment_key`를 갖고, 정확히 두 장 모두 리뷰되고 판정과 피드백이 있으면 `rule-candidate`를 만든다. 세 번째 카드가 생겼다고 자동으로 여러 규칙을 만들지 않는다.

오너가 후보를 확인하면 이전 계약 해시, 두 카드 식별자, 판단 키, 새 규칙 버전, 되돌림 정보를 함께 적어 이 문서의 **분해 기준** 섹션에 규칙 한 줄로 승격한다. 근거 카드가 부족하거나 충돌하면 승격하지 않는다. 승격은 다음 실행에 쓰는 계약 개정이며, 이미 실행된 결과를 소급해서 바꾸지 않는다.

## 12. 반복 루프와 종료

```text
A. 실행 잠금과 입력 스냅샷을 만든다.
B. 메모·최근 결과·세션·열린 티켓을 읽고 후보를 만든다.
C. 사실 확인 → 해석 → 분해 → 수용 기준 선기입을 한다.
D. 실행 단위를 백지 작업자·격리 worktree에 보내 조사·실험·기능 변경을 수행한다.
E. 결과 카드와 비용·실패·산출물을 즉시 기록한다.
F. 다음 실행 단위가 있으면 B로 돌아간다.
G. 아침 결과 리뷰가 merge/reject/feedback을 카드에 붙인다.
H. 독립 판정 두 번이 모이면 분해 기준 승격 후보를 만든다.
```

자동화 provider 상태도 결과와 함께 닫는다. 모든 결과 카드·기계 보고서·수확
완료 표식이 저장된 정상 종료에는 다음 명령을 실행한다.

```sh
# ... 결과 보고서와 harvest --validate-complete가 성공한 뒤 ...
python3 "$GATE" complete sweep success \
  --run-id "$provider_run_id" --token "$provider_token" --contract-hash "$contract_hash" \
  --snapshot-id "$snapshot_id" --snapshot-fingerprint "$snapshot_fingerprint" \
  --snapshot-path "$snapshot_path"
```

실행이 실패하거나 제한 시간에 끊기면 `success`를 호출하지 말고 `failed` 또는
`timeout`을 기록한다(같은 `--run-id`와 `--token`을 전달한다). Claude 주 실행이
`failed` 또는 `timeout`으로 닫힌 경우에만 다음처럼 Codex 대체 claim을 한 번 허용한다.

```sh
python3 "$GATE" fallback sweep \
  --run-id "$provider_run_id" --contract-hash "$contract_hash"
provider_state="$(python3 "$GATE" \
  state sweep --contract-path "$PROJECT_ROOT/.claude/vault/backlog/_NIGHT.md")"
provider_run_id="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])')"
provider_token="$(printf '%s' "$provider_state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["owner_token"])')"
```

상태 전이는 현재 provider claim과 원자적으로 결속되며,
없는 claim·이미 닫힌 claim·알 수 없는 상태의 늦은 기록은 거부된다.

실행을 끝내는 일반적인 경계는 다음뿐이다.

- 연속으로 **3개** 단위가 결론 없이 끝나면 도구·입력 품질을 진단하고 그 밤의 새 단위 생성을 잠시 닫는다. 이미 실행 중인 단위는 안전하게 끝낸다.
- 오전 **8시**가 되면 새 단위를 잡지 않고 실행 중인 단위의 기록만 마친다.
- 위 경계는 처리량 조절이며, 안전상 hard-stop인 비가역 행동·예산 초과와 혼동하지 않는다.

## 13. 산출물과 보존

각 실행은 다음을 만든다.

- 기계 보고서: 실행 상태, 단위별 한 줄 결과, 수용 기준, 지출 합계, 막힘·복구 사유, `reviewed_merge_rate`, 자가/사람 머지 수.
- 사람 보고서: 맥락 → 해석 → 분해 → 수용 기준 → 결과 → 다음 질문 순서의 결과 카드. 상세 로그는 접고 경로만 연결한다.

저장 위치는 고정한다.

- 티켓·결과 카드: `.claude/vault/backlog/tickets/` — 새 티켓과 결과 카드는 이 디렉터리에만 만든다. backlog 루트에는 이 계약 문서와 실행 도구만 둔다.
- 보고서: `.claude/vault/backlog/reports/` — 기계 보고서는 `YYYY-MM-DD.md`, 사람 보고서는 `YYYY-MM-DD.html`. 사람 보고서 HTML은 readable-report 표준(`~/.claude/skills/readable-report/SKILL.md`)을 따르고 매 실행마다 반드시 만든다.
- 오너 접점은 두 개뿐이다: 쓰는 곳 `_INBOX.md`, 읽는 곳 최신 `reports/YYYY-MM-DD.html`. 다른 파일을 오너가 읽어야만 진행되는 절차를 만들지 않는다.
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
