# 그룹 B — 챗이 "알겠다"고 하고 실행 안 함 (명령→실행 연결 끊김)

상태: 부분 착륙 · 우선순위: 2

> 갱신(2026-08-27): 계측·서버 저장(chat_traces)·job 연결(chat_trace_id)·승인 집계가 origin/main에
> 착륙(27ebaf3), migration 원격 적용. **논의 #1·#2(자동실행경계·B3 의도분류) 결정 완료 +
> Artist 실제 UI E2E 실측 완료(2026-08-27). 결정 구현 착륙(2026-08-28, 0c45689): Director 이미지·
> Producer→Writer 최초 실행도 승인 카드 뒤로 + 프롬프트 hybrid_intent_rule. 남은 것: Director/Writer
> 실제 UI 실측, 부수 요소(아래 표 참고).**
>
> 발행 리포트: `.claude/docs/2026-08-28/group-b-approval-report.html` — 복구·실측·결정·구현 전체를 한 장으로.

챗 에이전트가 수정 의사를 밝히고 실제 액션(재생성·수정 트리거)으로 이어지지 않는 케이스들. 공통 원인은 챗 에이전트가 실제 생성/수정 도구를 못 부르거나, 부를 수 있는데 안 부르거나, 불렀는데 결과가 UI에 연결되지 않는 것 중 하나로 추정.

## 이슈

| # | 화면 | 증상 원문 | 현황(2026-08-27) |
|---|---|---|---|
| B1 | Artist | 체장수 나이를 젊은 옥화랑 맞춰달라고 함 → Artist가 그러겠다고 답함 → 이후 무반응 | 해소 — 실제 UI E2E 실측(재생성 요청→승인 카드→승인→fal 생성→completed) |
| B2 | Director | 채팅방에서 지정한 행동을 하지 않음 | 구현 완료(0c45689) — 무과금 수정 즉시, 이미지 생성은 승인 카드. 실제 UI 실측 남음 |
| B3 | Director | 비디오가 아닌 수정사항을 얘기했으나 [p4] 등장하고 video take 추가하고 생성한다고 함 (당시 로그의 내부 표기 누출·의도 오해) — 결국 수정 방법을 못 찾음 | 구현 완료(0c45689) — 하이브리드: 프롬프트가 생성 추론을 금지, 생성은 승인 카드. 재현 검증 남음 |
| B4 | Director | 샷 체이닝을 챗방에 말했으나 알겠다고 하고 반영 안 됨 | 해소 — 미지원 액션으로 정직하게 기록(동의만·실행 안 함) |
| B5 | 전체 | 채팅방에서 수정하면 그게 이미지 재생성으로 연계되어야 함 (모르는 사람은 뭘 해야 할지 전혀 모름) | 부분 — 재생성 배선 완료, 전 스테이지 E2E 미검증 |

## 실측 (2026-08-26, "화개장터" 프로젝트 채팅 로그)

- B2/B4 확증: Director가 "vertical 무빙 적용할게요"를 **6번 반복**("적용하라고"→"dd"→"ㅇㅇ"→"제발 적용해줘")하고 실행 없음. 마지막엔 "적용하고 Editor로 가자"에 그냥 Editor로 넘어감.
- B1 확증: Artist가 "체장수 외형을 젊은 시절로 바꿀게요" 선언 후 무반응 → 유저가 직접 재생성.
- 추가 실측: 유저가 "재생성했다"고 말해도 Artist가 side/back 뷰 상태를 3번 되물음 (G6과 연결).
- 채팅 말미 시스템 메시지: "스토리보드 이미지 생성을 시작하지 못했어요 — Generation queue is full (8/8)" — 챗 트리거 생성이 쿼터에 걸려 죽는 경로 실측 (그룹 A의 L1과 같은 뿌리).
- 선택지 회귀: Producer가 `[CHOICES] 순수 액션 / 액션 + 드라마 ...`처럼 파이프(`|`) 대신 공백이 있는 슬래시(`/`)를 출력하면 기존 파서가 후보를 하나로 읽어 선택지 UI가 열리지 않고 마커가 본문에 남았다. 공백으로 둘러싸인 슬래시를 구분자로 허용하고, 마커 감지·후보 수를 계측한다.
- 이 선택지는 Anthropic `AskUserQuestion` 도구가 아니라 `[CHOICES]` 텍스트와 클라이언트 제안 UI를 잇는 자체 프로토콜이다. 따라서 이번 증상은 SDK 도구가 깨진 것이 아니라 출력 문법과 파서 계약이 어긋난 문제다.

## 검증할 가설

- 각 스테이지 챗 에이전트가 가진 도구(tool) 목록에 "재생성 트리거"가 실제로 있는지 스테이지별 인벤토리 확인.
- 도구가 있어도 프롬프트가 "설명만 하고 실행은 사용자에게 미루기"로 되어 있는지.
- 도구 실행 결과(잡 시작)가 대시보드 UI 상태에 반영되는 경로가 있는지.

## 초기 문제 정의 (2026-08-26 코드 대조)

"채팅이 반영되지 않는다"를 모델의 능력 문제 하나로 묶지 않는다. 한 요청이 아래 다섯 경계를 모두 통과해야 반영으로 판정한다.

1. 의도와 대상이 올바르게 해석된다.
2. 모델 출력이 검증된 액션으로 변환된다.
3. 액션이 즉시 적용되거나, 비용이 걸리면 승인 대기로 명확히 전환된다.
4. 상태 변경 또는 생성 잡 시작이 실제로 일어난다.
5. 채팅과 화면에 결과·실패·불가능 사유가 남는다.

현재 코드는 이 경계를 한 덩어리로 관측하지 않는다. 따라서 "반영 안 됨"은 출력 누락, 파싱·검증 드롭, 클라이언트 적용 건너뜀, 승인 대기, 생성 API·쿼터 실패, 표시 누락을 구분할 수 없는 상태다.

초기 판정은 다음과 같다.

- **SDK 부족은 1차 원인이 아니다.** 채팅은 이미 `@anthropic-ai/sdk`의 `beta.messages.create`를 사용하고, 현재 활성 도구는 Producer의 서버 `web_search`뿐이다. 설치된 SDK 자체에 `beta.messages.toolRunner`와 `countTokens`가 있다. 다만 액션 도구를 서버에서 실행하려면 클라이언트 Zustand 상태·인증·과금 경계를 서버 액션으로 다시 설계해야 하므로 단순 SDK 교체로 끝나지 않는다.
- **Artist 재생성은 계약이 충돌한다.** Artist 프롬프트는 재생성 액션을 내면 직접 처리한다고 설명하지만, 클라이언트는 재생성 액션을 `pendingProposal`로 바꾸고 승인 뒤에만 생성 API를 호출한다. 승인 카드가 보이지 않거나 승인하지 않으면 "알겠다고 한 뒤 무반응"으로 관측된다.
- **Director 카메라 변경과 영상 생성은 분리돼 있다.** `setCamera`는 Shot 상태를 바꾸고 자식 Video를 stale로 표시할 뿐, 영상을 자동 재생성하지 않는다. 따라서 "vertical 값을 적용했다"와 "새 영상에서 움직임이 보인다"는 서로 다른 완료 조건이다.
- **Director 영상 생성 액션은 아직 실제 생성이 아니다.** `generateVideo`는 상태를 `generating`으로 바꾼 뒤 800ms 후 `pending`으로 되돌리는 플레이스홀더이며 영상 생성 API를 호출하지 않는다.
- **샷 체이닝은 현재 챗 액션이 아니다.** 체인은 `rebuildShotChainNodes`가 파생하는 구조이고, 챗의 `connect`는 `relates-to` 관계만 만든다. 지원하지 않는 요청에 동의하는 응답이 나오지 않도록 능력 범위를 명시해야 한다.
- **`[P3]`는 실제 내부 메타데이터였고, 이번 계측 단계에서 새 주입을 제거한다.** 과거 라우트는 스테이지 이력에 `[P1]`~`[P5]` 접두어를 붙였고, 특히 Artist/Writer/Director는 같은 스테이지에도 붙였다. 이미 저장된 답변에 남은 표기는 화면 스크럽으로 숨기되, 새 요청에는 접두어를 넣지 않는다.
- **표시 방어에도 빈틈이 있다.** `pendingProposal`의 target/action/impact는 말풍선 스크럽을 거치지 않고, Director 캔버스의 `dn_<UUID>` 노드는 현재 ID 치환 패턴에도 없다. 이번 변경은 새 이력·응답의 스테이지 마커도 제거하지만, 일반 에이전트 발화 외 경로의 내부 ID는 별도 과제로 남는다.

## 우선 가설과 반증 조건

| ID | 가설 | 맞다면 관측되는 것 | 틀렸다고 볼 조건 |
|---|---|---|---|
| H1 | 모델이 명령을 이해했지만 액션 블록을 내지 않는다 | 원문 응답에 JSON 펜스가 없고 `updates=0` | 원문에 유효한 액션이 있음 |
| H2 | 액션이 파싱·화이트리스트·대상 ID 검증에서 사라진다 | `raw updates > valid updates`, 파싱 상태가 `failed/recovered`, 잘못된 ID가 기록됨 | 검증 통과 액션과 적용 건수가 일치함 |
| H3 | 액션은 통과했지만 제품 레이어가 적용하지 못한다 | `valid > applied`, `skipped` 사유 또는 상태 경합이 있음 | 적용 후 상태 스냅샷이 기대값과 일치함 |
| H4 | 적용은 됐지만 승인·생성 경계에서 멈춘다 | Artist `pendingProposal`, 승인 전 잡 없음, 승인 후 429·dedupe·give-up 또는 잡 생성 실패 | 승인 없이도 요구한 비용 액션의 잡이 시작되고 완료 알림이 남음 |
| H5 | Director의 응답 액션이 제품 능력과 어긋난다 | `generateVideo`가 플레이스홀더만 실행되거나 체이닝에 액션 타입이 없음 | 실제 영상 잡·체인 상태가 생성됨 |
| H6 | 표시·컨텍스트 오염이 실행 결과를 숨기거나 반복시킨다 | 기존 DB/레거시 응답에는 `[P3]`·내부 ID가 남고 화면 경로별 노출이 다름; 오래된 이력이 같은 표기를 재주입함 | 새 요청·새 저장·일반 표시에서 스테이지 마커가 다시 생기지 않음 |
| H7 | 컨텍스트 또는 출력 한도 때문에 액션 블록이 잘린다 | `stop_reason=max_tokens`, `recovered/failed`, 입력 토큰이 비정상적으로 큼 | 짧은 동일 요청에서도 같은 실패가 재현됨 |

## 첫 계측 계약

SDK 전환 전에 한 턴을 하나의 `chatTraceId`로 묶어 다음 값만 기록한다. 원문 프롬프트와 이미지 URL은 저장하지 않는다.

`stage`, `history_count`, `history_chars`, `context_chars`, `llm_stop_reason`, `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `parse_status`, `raw_update_count`, `valid_update_count`, `choices_marker_found`, `choices_count`, `applied_count`, `skipped_reasons`, `pending_proposal`, `request_status`, `generation_http_status`, `job_id`.

검증 입력은 비용이 없는 Director의 카메라 수정, Artist의 재생성 요청(승인 전까지만), 지원하지 않는 샷 체이닝 요청 세 가지로 고정한다. 이 기록만으로 H1~H7 중 어느 경계에서 끊기는지 먼저 판정한다.

## 진행 순서 (합의안)

1. **계측**: 한 요청을 `chatTraceId`로 묶어 모델 응답, 파싱, 적용, 승인, 생성 잡, 화면 표시의 경계를 기록한다.
2. **실행 계약·정책 결정**: 무엇을 즉시 실행할지, 무엇을 승인받을지, 무엇을 지원하지 않는다고 답할지 정한다. 카메라 값 변경과 영상 재생성도 별도 완료 조건으로 정의한다.
3. **tool-use 도입 판단**: 계측 결과에서 JSON 액션 프로토콜이 반복적으로 한계를 보일 때만 전환한다. 전면 교체가 아니라 단계 이동·상태 수정·생성 트리거처럼 필요한 도구부터 부분 도입할 수 있다.
4. **서버 액션·상태 동기화**: tool-use가 결정된 액션을 서버 권한·쿼터·DB 경계에서 실행하고, 그 결과를 캔버스·카드·채팅에 다시 반영한다.

이 순서는 확정한다. SDK가 이미 tool-use를 지원한다는 사실만으로 3단계로 바로 건너뛰지 않는다. tool-use는 실행 방법이고, 2단계는 제품이 허용하는 실행 범위다.

### 이번 계측의 완료 경계

- 닫힌 경계: 채팅 요청 시작 → LLM 사용량/종료 사유 → `[CHOICES]`·JSON 파싱 → 액션 검증 → 클라이언트 적용·건너뜀 → 승인 대기 여부 → 화면 표시.
- 연결 완료된 경계: 승인 이후 비동기 생성 잡의 `job_id`를 최초 채팅 trace에 결합했다. 실제 Artist 생성에서 승인→queued→completed와 결과 URL까지 확인했다.

## 논의 항목 (현황 2026-08-27)

1. **[결정] 자동 실행의 경계**: 챗이 어디까지 스스로 실행해도 되나? (Take 차감이 있는 생성이라 과금이 걸림) 후보: (a) 무조건 실행, (b) "재생성할까요? [실행 버튼]" 카드 제시 후 원클릭, (c) 설정으로 선택.
   → Artist 재생성은 (b) 원클릭 승인 카드로 착륙. **[결정 2026-08-27] (b) 원클릭 확인 카드를 전 스테이지 표준으로 확정 — 생성(과금)은 무조건 확인 카드를 거친다. 예상 Take 표시는 하지 않는다.**
2. **[결정] B3 의도 분류**: "수정사항 전달"과 "생성 요청"을 구분하는 의도 분류를 프롬프트로 풀지, UI(수정 모드 토글)로 풀지. → **[결정 2026-08-27] (다) 하이브리드 — 챗이 의도를 추정하되 수정(무과금)은 즉시 적용, 생성(과금)은 확인 카드. 오분류가 나도 과금 카드에서 멈춘다.**
3. **[해소] B4 샷 체이닝**: 챗이 실행할 수 없는 요청(기능 자체가 없음, 그룹 H2)일 때 "알겠다"가 아니라 "그 기능은 아직 없어요"라고 답하게 하는 정직성 규칙 필요 — 챗의 능력 범위 선언 방식. → 미지원 액션으로 정직하게 기록(동의만 하고 실행 안 함) 구현.
4. **[해소] 실행 후 피드백 루프**: 실행했으면 "시작했어요 → 진행 중 → 끝났어요"를 챗에 표시 (그룹 D의 4단계 메커니즘과 공유되는 구현). → trace 요약(승인대기→생성대기→완료·일부성공·실패)으로 구현.

## 완료 조건 (초안)

- 챗에서 수정 요청 → 실행(또는 원클릭 실행 카드) → 진행 표시 → 완료 알림까지 전 스테이지에서 동작.
  → 현황: Artist는 **실제 UI E2E 실측 완료**(화개장터 체장수 재생성 → 승인 카드 → 승인 → 실제 fal 생성 → job completed+result_url → getChatTrace=completed, 2026-08-27). Director 영상은 챗 미지원. Writer E2E는 코드 배선만.
- 실행 불가능한 요청에는 불가능하다고 답한다 (거짓 수락 금지).
  → 현황: B4 샷 체이닝은 미지원 기록으로 충족. **B3 의도 분류(#2)는 결정됐고 구현·재현 검증이 남음.**

## 남은 부수 요소 (커밋 27ebaf3에서 제외)

핵심 배선은 착륙했으나, 완성본 대비 아래 둘은 뺐다(typecheck·테스트 불필요, `.next` 소스맵에 복원 재료 없음).

- `src/stores/producer-store.ts`의 `applyExtractedSettings` traceId 파라미터 — 호출부가 없는 미배선.
- `src/types/database.ts`의 `chat_traces` 타입 — `supabaseAdmin`이 Database 제네릭을 안 써서 런타임 무관.

필요해지면 producer 재생성 trace 배선과 DB 타입을 후속으로 채운다.

## 후속 구현 (2026-08-27)

실측에서 가장 분명했던 단절은 Artist 승인 뒤였다. 실제 `generation_jobs`는 완료됐지만
브라우저의 `lastTrace`는 계속 `pendingProposal`과 적용 0건으로 남았다. 이를 다음처럼 분리해
연결했다.

- `chat_traces`는 채팅 한 턴의 영수증으로 서버에 저장한다. 사용량·파싱·적용·승인 상태와
  생성 상태만 남기며 원문 프롬프트·첨부·결과 URL은 저장하지 않는다.
- `generation_jobs.chat_trace_id`는 비동기 생성 작업 티켓을 trace에 연결한다. 하나의 trace가
  여러 Artist 뷰나 Director 스토리보드 Job을 만들 수 있다. Director 영상 예약 RPC는 예약 후
  Job ID를 best-effort로 연결한다.
- Artist 승인 전에는 `awaiting_approval`이고 Job은 0개다. 승인 뒤에는 `queued`가 되고,
  각 Job의 `completed`·`failed` 결과를 조합해 `completed`·`partial`·`failed`로 계산한다.
  거절·중복·자동 give-up은 `skipped`·`deduped`로 구분한다.
- 채팅 하단 trace 요약은 Job ID·URL을 노출하지 않고 승인 대기·생성 대기·완료·일부 성공·
  실패를 표시한다. 화면을 닫아도 다시 열 때 서버 trace와 Job 상태를 조회한다.
- Director 채팅의 `generateImage`는 단일 샷과 실사 일괄 경로 모두 trace를 전달한다.
  `generateVideo`는 실제 영상 Job 계약과 승인 경계가 없던 플레이스홀더를 제거하고,
  지원하지 않는 액션으로 기록한다. 샷 체이닝도 같은 원칙으로 동의만 하고 실행하지 않는다.

### 최종 성공 판정

`appliedCount`나 `generation_jobs.status=completed`만으로 성공으로 보지 않는다. 다음 네 가지가
모두 맞아야 한다.

1. 요청 의도와 대상이 정확하다.
2. 검증된 액션이 올바른 DB·캔버스 상태를 만든다.
3. 비용이 걸린 경우 승인 뒤 올바른 Job이 생성되고 최종 상태가 `completed`다.
4. DB 대상 값과 화면 표시가 결과와 일치한다.

스키마 변경은 `supabase/migrations/20260827120000_chat_trace_persistence.sql`에 기록했다.

### 검증·반영·실측 (2026-08-27 후속 세션)

다른 세션이 코드를 완성한 뒤 커밋·실측 전에 멈춘 지점을 이어받아 정적 검증을 다시 돌리고,
오너 승인으로 migration 적용과 승인 생성 실측을 실행했다.

**정적 검증.** `pnpm typecheck` 통과. `pnpm test`(제품 핵심) 1533개 통과·15개 skip.
신규·수정 테스트 `chat-trace`·`chat-trace-api`·`generation-jobs-columns`·`generation-jobs-client`
11개 통과. 배선 확인: `createGenerationJob`이 `chat_trace_id`를 넣고 trace를 `queued`로 갱신하고,
영상 RPC는 `linkGenerationJobToChatTrace`로 사후 연결, `/api/chat/trace`는 `getUser`+`userOwnsProject`
인증 뒤 service role로만 접근한다.

**migration 적용.** 원격 스키마를 먼저 조회해 "이력 불일치"와 "진짜 미적용"을 갈랐다.
`error_class`·lock_rls policy·`custom_style_anchor`는 스키마엔 이미 있고 이력만 빠진 상태였다
(supabase 규칙의 "live schema 우선"과 일치). 반면 `chat_traces`와 `generation_jobs.chat_trace_id`는
실제로 없었다. `supabase db push`로 미적용 11개를 몰지 않고 `20260827120000` 하나만 적용했다
(이 SQL은 `create ... if not exists`라 멱등). 적용 뒤 테이블·컴럼·인덱스 2개·RLS(policy 0 =
서버 전용 deny-all)를 확인하고 migration 이력에 `20260827120000 => applied`로 기록했다.

**승인 생성 실측 (원격 DB, 과금 0).** 이번 변경이 여기 새로 엹은 건 fal 파이프라인이 아니라 `chat_trace_id`
연결과 상태 집계다. `createGenerationJob`은 DB insert만 하고 fal submit은 별도라, 제품 코드
(`createGenerationJob → completeGenerationJob/failGenerationJob → getChatTrace`)를 실제 원격 DB에
태워 상태 기계를 검증했다. 각 케이스는 test row를 넣고 확인 뒤 즉시 지워 운영 데이터를 남기지 않았다.

- 정상 경로: job 없음 → `awaiting_approval`(pending) → 생성 → `queued`(pending 해제, job 연결) → 완료 → `completed`(jobId 연결).
- 일부 성공: completed 1 + failed 1 → `partial`.
- 전부 실패: failed → `failed`.
- 실행 후 잔여 job 0.

이로써 최종 성공 판정 2·3·4를 실제 프로덕션 스키마에서 확인했다. fal이 실제로 이미지를 만드는지는
이번 변경이 건드리지 않은 기존 경로이고 오너가 화면에서 판정하는 영역이라 여기 실측에서 분리한다.
