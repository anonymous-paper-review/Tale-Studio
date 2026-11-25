# API 호출 실패 원장

2026-11-24 기준. 고치기 전의 문제를 먼저 적어 둔다. 고친 뒤 같은 상황을 다시 만들어 1절의 표와 비교한다.

- 근거: 2026-11-24 코드 읽기(4구역 85건, 코드에서 확인 79건 · 추정 6건), 2026-11-23 운영 장애 조사(20명 동시 접속, DB 14분 정지).
- 하지 않은 것: 운영 로그와 케이스를 하나하나 맞추지 않았다. 고치는 순서를 정하지 않았다. (부하 재현은 2026-11-24 저녁에 했다 → 9절.)
- 케이스 번호(C·ART·DIR·WRT·LLM)는 이 문서 안에서만 쓴다. 코드에는 없다.
- 1절 "목표" 열은 혼자 정한 초안이다. 오너가 확정하기 전에는 구현을 시작하지 않는다(`.claude/rules/tdd.md`).

## 0. 원인 7개

85건이 모이는 곳. 대표 케이스만 적었다(전체는 2~5절).

| 번호 | 원인 | 대표 케이스 |
|---|---|---|
| 1 | 기다리는 시간에 한도가 없다. DB·fal·결과 다운로드 어디에도 "N초 안에 답이 없으면 끊는다"가 없어, DB 가 느리면 요청이 서버 함수 수명(60~300초)까지 붙잡힌다 | C01 C07 C13 ART-02 ART-05 DIR-V-04 LLM-08 |
| 2 | 폴링이 겹쳐 쌓이거나(setInterval 이 앞 요청을 안 기다림), 서버 오류 한 번에 포기한다(`!res.ok → throw`). 실패 시 간격을 늘리는 백오프가 없다. 틱 1건이 Auth 1 + DB 3 (+fal 1) 로 무겁다 | C02 C06 C14 C15 ART-01 ART-06 ART-10 DIR-V-01 DIR-B-04 DIR-S-04 WRT-R-02 LLM-06 |
| 3 | 조회가 실패하면 화면이 아무 말 없이 멈춘다. 진행 판단이 전부 "조회 성공"에 기대고, 실패를 "아무 일 없음"으로 읽는다 | ART-03 ART-04 ART-08 DIR-S-01 LLM-07 |
| 4 | 서버 함수가 중간에 꺼지면 반쯤 된 상태가 남는다. 60초 안에 DB 10~14회를 끝내야 하는 라우트가 있고, 꺼진 뒤 깨우는 손이 하루 1회 cron 과 열려 있는 화면뿐이다 | C04 C07 ART-05 WRT-R-01 WRT-R-03 DIR-B-01 LLM-01 LLM-02 LLM-13 LLM-19 |
| 5 | 접수만 되고 결과를 못 받는 작업(reserved 좀비)과 이중 발주. 접수번호 저장 실패·제출 전 함수 종료는 어느 회수 경로도 보지 않고, 10분 상수 하나가 화면·중복 가드·진행 목록을 동시에 바꿔 같은 칸을 다시 발주한다 | C05 C10 C11 C12 C21 ART-07 DIR-V-02 DIR-V-03 WRT-P-01 |
| 6 | 같은 결과를 여러 경로(웹훅·폴링 reconcile·유령 청소·cron)가 동시에 처리한다. 잡 행은 1회만 바뀌지만 다운로드·업로드·후보 기록은 중복되고, cron 은 겹침을 막지 않는다 | C08 C09 C20 DIR-B-03 |
| 7 | 요청 하나하나가 무겁다. 요청마다 로그인 확인(Auth 1) + 소유 확인(DB 2), 그림 1장 예약에 DB 6~10회, 서버(미국 동부)와 DB(싱가포르) 사이 왕복 1.2~2.4초 | C03 C04 C19 ART-09 ART-16 ART-17 LLM-17 LLM-18 |

글 AI 쪽에서 원인 7개 밖에 있는 것: 429 를 영구 오류로 오분류(LLM-04, 추정), 스키마 오류 4회 뒤 사람(LLM-03), 동시 시작 두 번이면 run 두 개(LLM-12, 추정).

## 1. 비교 지표

고친 뒤 같은 상황을 만들어 잰다. "지금" 열은 2026-11-24 코드 기준이고, "목표" 열은 혼자 정한 초안이다.

| 번호 | 상황(이렇게 만든다) | 지금 (2026-11-24) | 목표 (초안 · 오너 확정 전) | 케이스 |
|---|---|---|---|---|
| 1-a | DB 응답을 5초 지연시킨 상태에서 `GET /api/generation-jobs/[id]` 1회 | Auth 1 + DB 3 왕복이 순서대로 가 20초 이상. 60초를 넘기면 504. 중간에 끊는 코드 없음 | 요청 1건이 10초 안에 끝나거나 "아직 모름"으로 끊긴다 | C01 C07 |
| 1-b | fal status 응답을 30초 지연 | 폴링 틱 1건이 30초 매달림 | fal 조회에 5초 한도 | C13 |
| 1-c | 결과 파일(fal CDN) 다운로드를 70초 지연 | finalize 가 60초 한도를 넘겨 함수 종료. 잡은 queued 로 남음 | 다운로드 한도 20초, 넘기면 "저장 재시도" 분류로 남긴다 | C07 C09 |
| 2-a | Artist 화면 1개, DB 5초 지연, 60초 관찰 | `loadData` 가 3초마다 새로 나가 동시 요청 최대 20개 | 동시 1개. 앞 응답이 오기 전엔 다음을 보내지 않는다 | ART-01 ART-10 |
| 2-b | 폴링 중 서버가 500 을 1회 돌려줌 | `pollGenerationJob` 이 throw. 화면 "실패", 루프 종료. 서버는 계속 그림 | 다음 틱 계속. 연속 3회 실패면 "확인 중" 표시. 작업 실패로 적지 않는다 | C06 ART-06 DIR-V-01 |
| 2-c | 폴링 중 응답 지연이 반복 | 간격 3초 고정 | 실패·지연 시 3→6→12초(상한 30초) | C14 |
| 2-d | 20명이 각 그림 6장을 동시에 그림 | 분당 폴링 2,400건 × 틱당 왕복 4~5 (가정 계산) | 틱당 왕복 1~2 | C02 C03 |
| 3-a | `GET /api/artist/generation-status` 가 500 을 1회 | `serverDrawCheckedAt` 미기록. 이어 그리기 "wait" 영구, 다시 그리기 단추 숨김 | N초 뒤 재조회. 단추 노출. 화면에 "상태 확인 실패" 표시 | ART-03 |
| 3-b | `GET /api/artist/generation-slots` 응답 20초 지연 | 자동 그리기 첫 장이 20초 동안 0개 | 자리 조회 5초 한도. 실패 시 1장으로 시작 | ART-04 |
| 3-c | Supabase 가 error 객체 반환(data=null) | 카드 전부 사라지고 "그림 만드는 중" 전체 화면 | 이전 카드 유지 + 오류 띠 | ART-08 |
| 3-d | Writer step 체인이 끊긴 상태로 시작 화면 대기 | `pollWriter` 가 "쓰는 중" 영구. 멈춤 판정 없음 | 180초 멈춤이면 resume 호출 또는 "멈춤" 안내 | LLM-07 |
| 4-a | DB 4초 지연 상태로 `POST /api/artist/generate-world` | DB 10~14회 순차 → 60초 초과 → 504. reserved 행 남음 | 60초 안에 끝나거나, 예약 전에 시간 예산을 보고 깨끗하게 거절 | ART-05 C04 |
| 4-b | `writer/step` 이 300초를 넘김 | run 이 running 고착. 깨우기는 하루 1회 cron | 꺼지기 전 저장 지점. 다음 깨우기 60초 안 | LLM-01 LLM-02 |
| 4-c | 러프 1라운드가 60초를 넘김 | 펌프 멈춤. 사용자가 다시 눌러야 함 | 라운드 크기를 시간 예산으로 자른다 | WRT-R-01 |
| 5-a | `confirmGenerationJobReceipt` 를 강제로 실패 | reserved 영구. 결과·Take 회수 0 | N분 뒤 회수 경로가 fal 에 묻거나 Take 를 돌려준다 | C05 DIR-V-02 |
| 5-b | 결과 저장을 11분 지연 | 화면 실패 + 서버 가드가 그 잡을 무시 → 같은 칸 재발주 → fal 비용 2회 | 재발주 전에 진행 중 잡을 1회 재확인 | ART-07 C12 |
| 5-c | `/api/generate/image` 가 90초를 넘김 | 500. 잡은 queued, 웹훅 없음. 다시 누르면 이중 과금 | 같은 대상 queued 잡이 있으면 재사용 | C10 |
| 6-a | 웹훅과 폴링 틱이 같은 순간 COMPLETED 를 봄 | 잡 행 1회 갱신. 다운로드·업로드 2회 | 다운로드·업로드 1회 | C08 |
| 6-b | cron video-batches 가 앞 실행과 겹침 | 겹침 방지 없음 | 1회 실행 보장 | DIR-B-03 |
| 7-a | `GET /api/generation-jobs/[id]` 1회의 왕복 수 | Auth 1 + DB 3 (+fal 1) | Auth 0(토큰 로컬 검증) + DB 1 | C03 |
| 7-b | 그림 1장 예약의 왕복 수 | DB 6~10 | DB 2 이하 | C04 |
| 7-c | `GET /api/generation/active` 1회 | 완료 이력 전체 읽기 포함 8회 이상 | 완료 이력은 변경분만 | C02 |
| L-a | Gemini 가 429 를 돌려줌 | "billing" 낱말 → permanent → 즉시 실패 (문구는 추정) | network 분류 → 백오프 재시도 | LLM-04 |
| L-b | 이야기 구조 단계가 스키마 오류 | 4회 실패 뒤 사람이 눌러야 함 | 정할 것 | LLM-03 |

## 1-1. 단계별 진행 확인 방식

시뮬레이션을 설계할 때 어느 주기를 흉내 낼지 고르는 표.

| 단계 | 무엇 | 방식 | 진행 확인 | 함수 시간 |
|---|---|---|---|---|
| Producer | entry/start · recommend · style-facets · comic-script · chat | LLM 동기(응답 한 번) | 시작 화면 `pollWriter` 2.5초 (시한·멈춤 판정 없음) | 60~300초 |
| Writer | step 체인 | 단계마다 새 함수, `after()` 로 다음 step 자기 호출 | `use-writer-status` 3초 · resume(180초 멈춤 뒤 60초마다) · watchdog 하루 1회 | 300초 |
| Writer | rough-storyboard | fal 큐 + 웹훅 + 브라우저 펌프 라운드 | `pollGenerationJob` 3초, 라운드당 함수 60초 | 60초 |
| Writer | rough-directing-edit | Grok 동기 | 없음 | 120초 |
| Writer | dialogue · scene-gate · scene-story-rewrite · chat | LLM 동기 또는 백그라운드 + CAS 저장 | 5분 뒤 시간 초과만 | 300초 |
| Artist | generate-sheet · generate-world | fal 큐 + 웹훅 + 폴링 | `pollGenerationJob` 3초 + 화면 `loadData` 3·4초 + 버전 5초 + generation-slots 매 작업 | 60초 |
| Artist | chat · versions | LLM 동기 | 버전 5초 | 300초 |
| Director | generate-storyboard(-batch) | fal 큐 + 웹훅 + 폴링 | `pollGenerationJob` 3초 · 실사 러너 5초 | 60 / 300초 |
| Director | generate-video | fal 큐 + 웹훅 + 폴링 | director-store 자체 5초 루프, 10분 상한 | 300초 |
| Director | video-batches | 서버 이어가기 + cron + 폴링 | 화면 2.5초 · cron 2분 | 300초 |
| Editor | trim · speed · state · title-image | DB·Storage 만 | 없음 | 기본 |
| 공통 | generation-jobs/[id] · generation/active · fal/webhook · generate/image | 폴링 창구 · 진행 목록 · 웹훅 · 동기 fal 폴링 | active 4초(숨김 15초) · generate/image 는 서버가 1초 간격 90초 | 60 / 300초 |

같은 "진행 확인"이 7가지 주기(2.5·3·4·5초, 60초, 2분, 하루 1회)로 흩어져 있다.

## 2. 공통 생성 흐름 (21건, 높음 7)

fal 에 그림·영상을 맡기고 결과를 받아오는 길. 모든 단계가 같이 쓴다.

호출 흐름:

- [제출] 화면 스토어(artist-store · director-store · writer-store · global-chat-store) → POST 생성 라우트(artist/generate-sheet · director/generate-storyboard(-batch) · lib/artist/world-submit · draft-trigger · generate/image) → getUser()[Supabase Auth 1회] → userOwnsProject / requireProjectAccess[DB 2회] → assertUserTextAllowed[Creem 1회·단일 시도·fail-closed] → reserveGenerationJob[DB: syncFalKeyLimits(프로세스 1회) + resolveJobOwnership(0~2) + syncGenerationCapacityExemption(면제표 delete/upsert 1회) + pickFalKey(키 수만큼 count) + insert(트리거: 전역 advisory lock + count 3~5회)] → (영상) holdTakesForVideoJob[take_hold RPC] → falImageSubmit/falVideoSubmit.submitQueueOnce[queue.fal.run POST, fal_webhook=resolveWebhookUrl()] → confirmGenerationJobReceipt[DB update reserved:→request_id] → 응답 {jobId}
- [폴링] pollGenerationJob(3초, timeoutMs=STALE_QUEUED_MS 10분, 잡 id 당 탭 내 1루프) → GET /api/generation-jobs/[id] (maxDuration 60) → getUser()[Auth] → getGenerationJobById[DB] → userOwnsProject[DB 2회] → queued 면 reconcileJobFromFal → falImageFetch/falVideoFetch[fal queue.status (+queue.result)] → COMPLETED 면 finalizeGenerationJob 을 같은 요청 안에서 실행(recordFalResponseSnapshot RPC → fal CDN 다운로드(무제한) → mediaUpload/uploadThumbnail[Supabase Storage] → shots/characters/locations/candidates DB 갱신 → completeGenerationJob CAS) → 응답 {status,resultUrl,error}
- [웹훅] fal → POST /api/fal/webhook (maxDuration 60) → verifyFalWebhook[JWKS rest.fal.ai, 콜드 인스턴스마다 fetch, ±5분] → getGenerationJobByRequestId[DB] (없으면/terminal 이면 200 무시) → status≠OK: moderation 이면 fail+release, 그 외 reconcileJobFromFal → OK: after(finalizeGenerationJob) → 실패 분류(TerminalTransition 무시 / PersistenceError 는 queued 유지 / 그 외 failGenerationJob + releaseTakesForJob) → batch 면 continueVideoBatch
- [진행 목록] generation-queue.ts 단일 폴러(4초/15초, 탭마다 1개) → GET /api/generation/active → getUser → userOwnsProject(2) → reconcileGhostQueuedJobs(프로젝트·인스턴스별 60초 스로틀, STALE 넘긴 queued 최신 5건을 reconcile+finalize 인라인) → listActiveGenerationJobs → countProjectVideoGenerations → listRecentGenerationJobRows(24h, 500행) → listGenerationCompletionRows(완료 전부 500행씩 끝까지) → 응답 {jobs,videoUsage,batches,completions}
- [동기 이미지] POST /api/generate/image (maxDuration 300) → generateReservedImage: reserveGenerationJob → falImageSubmit(웹훅 없음) → confirmGenerationJobReceipt(실패 시 throw) → 1초 간격 90초 fal 폴링 → completeGenerationJob → 라우트가 fal URL 바이트를 다시 fetch → blob 응답
- [회수·관리] GET/POST /api/generation/queue(큐 콘솔) → listQueueConsoleJobs → reconcileJobFromFal ≤10건 ; DELETE /api/generation-jobs/[id] → releaseTakesForJob → delete_generation_job_with_release RPC(completed 는 409, queued 러프는 409)
- [크론·백그라운드] /api/cron/video-batches(2분) → recoverVideoBatches → director_video_batches(running) + generation_jobs(shot_video·queued·batch_id) 전수 페이지 읽기 → 배치 ≤50개 × 잡별 getGenerationJobById + reconcileJobFromFal + continueVideoBatch ; /api/writer/watchdog(하루 1회) → stale queued created_at 오름차순 10건 reconcile ; instrumentation.ts keepalive(웜 인스턴스마다 60초) → writer_runs 조회 ; /api/cron/log-retention(하루 1회) → server_errors·writer_observability_events·chat_traces 90일 delete
- [실패·정산] failGenerationJob → failure-class.classifyJobError → error_class ; 영상 Take 반환 = releaseTakesForJob(take_release_for_job RPC) 또는 markDirectorVideoAttemptFailed ; 진단 쓰기 = recordWriterObservabilityEvent(fire-and-forget) · instrumentation.onRequestError → server_errors insert

구조적 약점 4개. (1) 모든 외부 I/O(Supabase PostgREST·Auth·Storage, fal submit/status, CDN 다운로드)에 타임아웃·재시도 정책이 없다. DB 지연이 그대로 요청 시간이 되고, 끝은 Vercel maxDuration kill(중간 상태) 아니면 클라이언트의 '실패' 굳힘이다(src 전체에서 AbortSignal.timeout 은 portrait-file.ts·paddle-ips.ts 2곳뿐). (2) 완료 진실을 회수하는 경로가 4개(웹훅 after() · 폴링 reconcile · active ghost sweep · 크론/워치독/콘솔)인데 잡 행만 CAS 로 보호되고 부작용(다운로드·업로드·후보 행)은 중복되며(2026-11-24 `finalize_claimed_at` 자리 찍기로 막음, 8절 마지막 행), 모든 경로가 reserved: 행을 건너뛰어 '접수번호 저장 실패' 좀비는 어디서도 회수·환급되지 않는다. (3) 폴링 1건의 고정비가 크다. generation-jobs/[id] 는 Auth 1 + DB 3 + fal 1, active 는 ≥8 DB 왕복(완료 이력 전수 읽기 포함). 사용자 수 × 잡 수 × 3~4초로 선형 증폭되고, 제출(예약)은 전역 advisory lock 으로 직렬화된 트리거 안에서 count 3~5회를 돈다. 싱가포르 왕복 1.2~2.4초 × Nano DB 에서 2026-11-23 의 187 동시요청·551 인증/분 은 이 산술의 결과다. (4) 시계가 셋이다. STALE 10분(화면·sweep·클라 timeout), 자리 창 30분(QUOTA_COUNT_WINDOW_MIN·DB 트리거), BATCH_STALE 10분 별도 상수. 작업 종류별 기대 시간과 무관해 정상 영상이 '시간 초과' 로 보이고 유령은 화면에서 사라진 뒤 20분 더 자리를 먹는다. 부가 확인: '2분마다 무거운 쿼리' 의 출처는 log-retention(하루 1회 delete) 이 아니라 /api/cron/video-batches → recoverVideoBatches 의 director_video_batches + generation_jobs 전수 페이지 읽기이고, llm_calls 를 주기적으로 읽는 코드는 src 에 없다(archive-calls.ts 의 insert 만). 또한 generation_jobs 의 request_id · (project_id,status) 조회용 인덱스는 migrations 에서 확인되지 않았다(기반 테이블 생성 마이그레이션이 저장소 밖. inferred).

### C01 · 높음 · DB 부하 · 코드 확인

**DB 응답이 느려지면 상태 조회 1번이 수 초~60초까지 붙잡힌다(타임아웃 없음)**

- 상황(언제): Supabase DB 가 느리거나 멈춤(연결 지연·522) 상태에서 화면이 3초마다 잡 상태를 묻는다
- 지금 일어나는 일: 폴링 라우트가 요청마다 getUser(Auth 왕복 1) → getGenerationJobById(DB) → userOwnsProject(DB 2) 를 순차로 기다리는데, supabaseAdmin·createServerClient 모두 fetch 타임아웃이 없다. 끝은 maxDuration=60 의 함수 kill 뿐.
- 터지는 모습: 요청이 응답 없이 쌓이고(한 인스턴스 187개), 60초 뒤 504 로 끊기거나 함수가 중간에 죽는다. 화면은 '실패' 또는 멈춤
- 이미 있는 방어: 라우트 maxDuration=60 이 상한. Supabase service_role 쿼리의 statement_timeout 은 코드에 없음(플랫폼 기본값 의존).
- 남은 구멍: DB·Auth 호출에 짧은 타임아웃이 없고, 느릴 때 '아직 모름' 으로 빨리 답하는 길이 없다. 요청이 길어질수록 다음 폴링과 겹쳐 DB 부하가 자기증폭한다.
- 근거: src/lib/supabase/admin.ts:11-14 · src/lib/supabase/server.ts:7-25 · src/app/api/generation-jobs/[id]/route.ts:19-43 · src/lib/generation-jobs.ts:868-878 · src/lib/generation-jobs.ts:1259-1278

### C02 · 높음 · DB 부하 · 코드 확인

**진행 목록 조회(4초마다)가 매번 프로젝트의 완료 이력 전체를 읽는다**

- 상황(언제): 잡이 하나라도 돌고 있는 프로젝트를 열어 둔 탭(스테이지 어디든)
- 지금 일어나는 일: /api/generation/active 가 요청마다 listGenerationCompletionRows(status=completed 전부를 500행씩 끝까지) + listRecentGenerationJobRows(500행) + count + 활성 목록 + 소유권 2쿼리 + Auth 를 수행한다. 클라 폴러는 잡이 있으면 4초, 없으면 15초, 탭마다 하나.
- 터지는 모습: DB 읽기량이 폭증(프로젝트 완료 이력이 많을수록 매 4초 수 MB), 다른 모든 요청이 느려진다
- 이미 있는 방어: 클라 폴러는 inFlight 가드로 겹치지 않고 탭당 1개. includeUnreflected 추가 쿼리 2개는 opt-in. 응답 시그니처 비교로 불필요한 리렌더는 막음.
- 남은 구멍: 완료 이력 전수 읽기가 opt-in 이 아니라 매 폴링. 시간·행 상한 없음. 사용자 20명이면 4초마다 ≥160 DB 왕복.
- 근거: src/app/api/generation/active/route.ts:49-58 · src/lib/generation-jobs.ts:745-767 · src/lib/generation-jobs.ts:723-742 · src/lib/generation-queue.ts:35-36 · src/lib/generation-queue.ts:76-96

### C03 · 높음 · 로그인 확인 · 코드 확인

**API 요청마다 로그인 확인(Supabase Auth)과 소유권(DB 2쿼리)을 처음부터 다시 한다**

- 상황(언제): 폴링·제출·진행 목록 등 모든 /api 호출
- 지금 일어나는 일: getUser() 가 매 호출 supabase.auth.getUser() 네트워크 왕복. middleware matcher 가 api/ 를 제외하므로 API 라우트는 각자 getUser + userOwnsProject(projects→workspaces 2쿼리) 또는 requireProjectAccess.ownsProject(2쿼리) 를 수행. 캐시 없음.
- 터지는 모습: DB 가 느릴 때 로그인 확인만 분당 551건. 요청 수에 비례해 Auth/DB 왕복이 늘고 모든 응답이 1.2~2.4초씩 더 걸린다
- 이미 있는 방어: 미들웨어는 정적 에셋·_vercel 제외. 페이지 요청만 미들웨어 getUser 1회.
- 남은 구멍: JWT 로컬 검증·소유권 짧은 캐시가 없다. 폴링 라우트는 jobId 로 project·owner 를 한 쿼리로 합칠 수 있는데 3쿼리로 나눠 친다. 토큰 만료 순간 병렬 폴러 여럿이 동시에 refresh 를 시도하면 일부가 401 을 받을 수 있다(Supabase 재사용 창 10초로 완화. inferred).
- 근거: src/lib/supabase/auth.ts:8-14 · src/middleware.ts:137-145 · src/lib/api/guard.ts:3-7 · src/lib/api/guard.ts:27-44 · src/lib/generation-jobs.ts:1259-1278

### C04 · 높음 · 자리(정원) · 코드 확인

**자리 예약(제출) 1건이 DB 왕복 6~10회 + 전역 잠금 안의 count 3~5회. DB 가 느리면 제출이 60초를 넘긴다**

- 상황(언제): 여러 사용자가 동시에 그림/영상 생성을 누름(장애 당시 20명)
- 지금 일어나는 일: reserveGenerationJob 이 syncFalKeyLimits → resolveJobOwnership(≤2) → syncGenerationCapacityExemption(일반 사용자도 매 예약 면제표 delete 1회, 실패 시 fail-closed throw) → pickFalKey(키 수만큼 count) → insert 를 순차 수행. insert 트리거는 pg_advisory_xact_lock('generation-capacity') 로 전 시스템 insert 를 한 줄로 세우고 안에서 count 3~5회(개인·키·전체).
- 터지는 모습: '배경 그리기 요청 60초 초과' 류. 제출 응답이 오래 걸리거나 끊기고, 뒤 사람은 앞 사람 전부를 기다린다
- 이미 있는 방어: 원자적 자리 판정(경쟁 통과 방지)은 트리거가 보장. 부분 인덱스(generation_jobs_active_user_idx·active_key_idx)가 30분 queued count 를 돕는다.
- 남은 구멍: 면제표 동기화가 변화 없는데도 매 예약 쓰기. pickFalKey 의 count 는 트리거가 다시 하므로 중복. 전역 단일 잠금이라 DB 가 느릴 때 제출 지연이 선형으로 쌓인다. 예약은 성공했는데 응답이 늦어 클라가 재시도하면 자리 2개를 먹는다.
- 근거: src/lib/generation-jobs.ts:337-392 · src/lib/generation-quota.ts:117-141 · src/lib/fal/keys.ts:128-141 · supabase/migrations/20261027100000_generation_capacity_per_user_limit.sql:66 · supabase/migrations/20261027100000_generation_capacity_per_user_limit.sql:25

### C05 · 높음 · 웹훅·저장 · 코드 확인

**접수번호 저장(confirmGenerationJobReceipt)이 실패하면 영구 reserved 좀비. 결과도 환급도 어디서도 회수되지 않는다**

- 상황(언제): fal 제출은 성공했는데 그 직후 DB update(reserved:→request_id)가 실패/타임아웃(DB 느림)
- 지금 일어나는 일: 호출부(world-submit·generate-sheet·generate-storyboard·draft-trigger)는 confirm 실패를 로그만 남기고 진행. 행은 request_id='reserved:<id>' 로 남아 (1) 웹훅은 fal request_id 로 못 찾고 200 OK 로 무시(fal 재전송 없음) (2) reconcileJobFromFal 은 reserved 를 그대로 반환 (3) ghost sweep·큐 콘솔·워치독·video-batches 모두 reconcile 을 거치므로 동일. 워치독은 created_at 오름차순 10건이라 오래된 reserved 좀비가 스윕 앞을 영구히 막는다.
- 터지는 모습: fal 은 그림/영상을 다 만들었는데 화면은 10분 뒤 '시간 초과', 자리는 30분 점유, 영상이면 Take 가 묶인 채 남는다. 큐 콘솔 수동 회수도 안 된다
- 이미 있는 방어: 예약 보존 원칙(시간만으로 실패·환급·재제출하지 않음)은 이중 과금을 막는 의도된 설계. listActive/hasQueued* 는 10분 지나면 유령을 숨겨 다시 만들기를 연다. DELETE 라우트로 러프 외 reserved 잡은 수동 삭제+Take 반환 가능.
- 남은 구멍: fal 요청에 jobId 를 심지 않아(웹훅 URL 쿼리·metadata) 웹훅이 jobId 로 매칭할 수 없다. confirm 실패 재시도·대기열 없음. 영상 reserved 좀비의 Take hold 는 영구. 워치독 스윕이 reserved 를 거르지 않아 head-of-line 봉쇄.
- 근거: src/lib/generation-jobs.ts:399-423 · src/lib/artist/world-submit.ts:119-127 · src/app/api/fal/webhook/route.ts:107-108 · src/lib/fal/reconcile.ts:115-121 · src/app/api/writer/watchdog/route.ts:60-67 · src/lib/fal/generate-image.ts:116

### C06 · 높음 · 폴링 · 코드 확인

**상태 조회가 HTTP 오류 1번(500/504/401/429)을 받으면 화면이 즉시 '실패' 로 굳고 폴링을 멈춘다**

- 상황(언제): DB 지연으로 폴링 라우트가 500/504 를 한 번 내거나, 세션 만료 401, 일시 네트워크 오류
- 지금 일어나는 일: pollGenerationJob 이 !res.ok 면 재시도·백오프 없이 onStatus failed 후 throw. 서버 라우트는 reconcile 만 try/catch 하고 getUser·getGenerationJobById·userOwnsProject 의 예외는 프레임워크 500. 라우트 주석이 같은 문제를 reconcile 에 한해 고친 흔적.
- 터지는 모습: fal 은 멀쩡히 완료하는데 화면은 '실패' 표시 후 더 묻지 않는다. 웹훅이 나중에 끝내도 그 화면은 갱신되지 않음(새로고침 필요)
- 이미 있는 방어: reconcile 예외는 삼켜 queued 유지. director-store 는 httpStatus 가 있는 실패를 '확정 실패' 로 보지 않음(director-store.ts:4300-4302). 잡 id 당 폴링 1루프(inFlightPolls).
- 남은 구멍: 클라에 5xx/네트워크 오류 재시도 정책이 없고, 서버 라우트 전체를 감싸 '아직 모름' 응답으로 돌리지 않는다. onStatus 를 쓰지 않는 호출자(writer·artist 일부)는 httpStatus 구분 없이 실패 처리.
- 근거: src/lib/generation-jobs-client.ts:79-88 · src/app/api/generation-jobs/[id]/route.ts:45-64 · src/app/api/generation-jobs/[id]/route.ts:25-43

### C07 · 높음 · 시간 한도 · 코드 확인

**상태 조회 요청 안에서 결과 저장(finalize)까지 끝내려다 60초를 넘기면 함수가 죽고 다음 폴링이 처음부터 반복한다**

- 상황(언제): fal 완료 시점에 폴링이 먼저 도착(웹훅보다 빠름/웹훅 유실), 특히 영상(최대 128MiB) 또는 느린 Storage/DB
- 지금 일어나는 일: 폴링 GET(maxDuration 60) 이 queued 면 reconcile → COMPLETED 면 finalizeGenerationJob 을 같은 요청에서 끝까지 수행: 스냅샷 RPC → 다운로드(영상 45초 상한, 이미지 무제한) → 업로드/썸네일 → shots 등 DB 갱신 → completeGenerationJob. 웹훅도 after() 안에서 같은 작업(60초). 넘기면 kill → 잡 queued → 3초 뒤 다음 폴링이 전 과정 반복.
- 터지는 모습: 결과 저장이 25~31분 걸리거나 끝없이 반복, 파일은 올라갔는데 잡은 queued 인 중간 상태(화면은 '만드는 중' 과 완성 이미지가 동시에 보일 수 있음)
- 이미 있는 방어: 영상 다운로드 45초 상한·128MiB 상한. 이미지 파일은 작업 id 로 이름이 달라 재실행이 덮어쓰기(upsert)로 무해. uploadImmutableObject 는 같은 바이트 재업로드를 성공으로 처리. 웹훅은 응답을 먼저 보내 fal 재전송 루프는 끊었다.
- 남은 구멍: finalize 가 폴링 요청에 묶여 있어 60초 예산을 폴링·인증·fal 조회와 나눈다. 전용 finalize 라우트/큐가 없고, 중간 상태(shots 갱신됨·잡 queued)를 감지하는 것도 없다. 이미지 다운로드·업로드엔 타임아웃 자체가 없다.
- 근거: src/app/api/generation-jobs/[id]/route.ts:19 · src/app/api/generation-jobs/[id]/route.ts:58-64 · src/lib/fal/finalize.ts:133 · src/lib/fal/finalize.ts:610-654 · src/app/api/fal/webhook/route.ts:38 · src/app/api/fal/webhook/route.ts:170-173

### C08 · 중간 · 웹훅·저장 · 코드 확인

**같은 잡을 웹훅·폴링·유령 청소·크론이 동시에 저장한다. 잡 행은 한 번만 바뀌지만 다운로드·업로드·후보 기록은 중복**

- 상황(언제): fal 완료 직후 웹훅과 폴링이 거의 동시에 도착, 또는 여러 탭/여러 Vercel 인스턴스가 같은 프로젝트의 유령을 청소
- 지금 일어나는 일: 회수 경로 4개가 모두 finalizeGenerationJob 을 직접 부르고, 보호는 completeGenerationJob 의 status='queued' CAS 하나. 그 전에 실행되는 부작용은 각 경로가 전부 수행. recordCharacterImageCandidate 는 '선택 해제→insert' 두 단계라 교차 시 중복/유니크 위반(.catch 로 삼킴). ghost sweep 의 스로틀·inFlight 는 프로세스 로컬.
- 터지는 모습: 같은 그림을 여러 번 내려받고 올림(대역폭·시간 2~4배), 캐릭터 후보 기록에 같은 작업이 2줄 생기거나 유니크 위반 경고, 드물게 폴링 화면에 '완료됐지만 결과 URL 없음'
- 이미 있는 방어: CAS 로 잡 행 종결은 1회. 중복 패자는 DB 를 다시 읽어 올바른 status/result_url 을 돌려줌(#dup-finalize-null-url 수정). storyboard 버전은 withStoryboardVersion 이 id 기준으로 쌓고 updateStoryboardImage 는 rev 비교 재시도. 클라 inFlightPolls 로 탭 내 중복 폴링 제거.
- 남은 구멍: finalize 진입 임대(lease) 가 없어 승자만 부작용을 하도록 만들 수 없다. 인스턴스 간 유령 청소 중복. 후보 insert 가 비멱등.
- 근거: src/lib/generation-jobs.ts:960-980 · src/lib/fal/finalize.ts:735-757 · src/lib/fal/finalize.ts:642-644 · src/lib/fal/reconcile.ts:180-186 · src/lib/fal/reconcile.ts:63-71 · src/app/api/fal/webhook/route.ts:175-180 · supabase/migrations/20260827200300_scope_images_and_merge_okhwa.sql:30-32

### C09 · 중간 · 저장소 · 코드 확인

**러프/실사 그리드 저장은 다운로드·업로드 일시 오류를 영구 실패로 굳힌다(다른 경로는 재시도로 분류)**

- 상황(언제): fal CDN 이 5xx/429 를 주거나 Supabase Storage 가 520 등 일시 오류를 낼 때 그리드(4샷 시트) 저장 중
- 지금 일어나는 일: finalizeRoughGridJob·finalizeRealGridJob·스트립 경로는 `if (!res.ok) throw new Error` / `if (error) throw error` 로 raw Error 를 던지고, completeOrTerminalizeJob·웹훅은 DirectorVideoCompletionPersistenceError 만 queued 로 남기므로 raw Error 는 terminalizeJob → failed. 캐릭터/배경/단일 경로는 providerImageFetchFailure·classifyMediaPersistenceFailure 로 5xx/429 를 재시도로 분류한다.
- 터지는 모습: 4샷이 한 번에 '실패' 로 표시되고, fal 에 결과가 있어도 재생성(재과금) 외 방법이 없다
- 이미 있는 방어: mediaUpload 가 5xx 에 2회(400/900ms) 재시도. 단일 이미지·캐릭터·배경·영상 경로는 retryable 분류가 있다. error_class 'provider' 는 give-up 예산 면제.
- 남은 구멍: 그리드 3경로가 공용 uploadImageFromUrl/classifyMediaPersistenceFailure 를 쓰지 않는다. 다운로드엔 타임아웃이 없어 멈춤도 가능.
- 근거: src/lib/fal/finalize.ts:1208-1218 · src/lib/fal/finalize.ts:1109-1110 · src/lib/fal/finalize.ts:1132-1133 · src/lib/fal/finalize.ts:985-986 · src/lib/fal/finalize.ts:117-121 · src/lib/fal/finalize.ts:425-437 · src/lib/fal/reconcile.ts:72-85

### C10 · 중간 · 중복 제출 · 코드 확인

**/api/generate/image 동기 경로: 90초 넘으면 500 인데 잡은 queued 로 남고 웹훅도 없어, 다시 누르면 이중 과금**

- 상황(언제): Director 에셋 노드·수동 이미지에서 fal 이 90초 안에 못 끝냄(큐 대기·느린 모델) 또는 DB 느려 접수번호 저장 실패
- 지금 일어나는 일: generateReservedImage 가 reserve → falImageSubmit(webhookUrl 없음) → confirm(실패 시 throw, 행은 reserved 고아) → 1초 간격 90초 fal 폴링. 초과 시 throw 만 하고 failGenerationJob 을 부르지 않음. 라우트는 maxDuration 300 이지만 내부 90초와 어긋나고 클라에 jobId 를 주지 않는다. 완료 뒤에도 라우트가 fal URL 을 다시 fetch(타임아웃 없음)해 실패하면 과금된 결과를 500 으로 버린다.
- 터지는 모습: 화면은 '[fal] timed out' 500. 잡은 queued 로 30분 자리 점유, 결과는 10분 뒤 유령 청소가 result_url 만 기록하고 화면엔 안 닿는다. 사용자가 다시 누르면 새 유료 요청
- 이미 있는 방어: 자리 예약·확정 거절(4xx)만 예약 닫기·모더레이션 검사는 공용 규약대로. 완료 시 completeGenerationJob 기록. 유령 청소가 10분 뒤 fal 진실로 종결.
- 남은 구멍: 비동기(jobId+폴링) 계약이 아니다. 타임아웃 시 잡 상태를 바꾸지 않아 자리를 30분 묶고, 사용자에게 '이미 만들어지고 있다' 는 정보를 주지 않는다.
- 근거: src/lib/fal/generate-image.ts:21 · src/lib/fal/generate-image.ts:97-100 · src/lib/fal/generate-image.ts:116 · src/lib/fal/generate-image.ts:118-147 · src/app/api/generate/image/route.ts:24 · src/app/api/generate/image/route.ts:60-64 · src/app/api/generate/image/route.ts:170-175

### C11 · 중간 · 과금·Take · 코드 확인

**영상 실패 뒤 Take 돌려주기(release)가 best-effort. 실패하면 로그만 남고 묶인 Take 가 고아로 남는다**

- 상황(언제): 영상 잡이 failed 로 바뀐 직후 take_release_for_job RPC 가 DB 지연으로 실패/끊김; 또는 reserved 좀비(C05)
- 지금 일어나는 일: reconcile·웹훅 세 곳 모두 failGenerationJob 성공 뒤 releaseTakesForJob 을 try/catch 로 감싸 console.error 만. 두 쓰기가 한 트랜잭션이 아니다. take-expire 는 lot 만료만, billing-reconcile 은 Paddle 대조만 하고 'failed 인데 hold 잔존' 스윕은 없다. markDirectorVideoAttemptFailed(연결 영상) 는 RPC 안에서 반환까지 처리해 안전.
- 터지는 모습: 사용자 잔액에서 Take 가 계속 묶여 있고(실패했는데 안 돌아옴) 어떤 자동 정리도 그 상태를 찾지 않는다
- 이미 있는 방어: TAKE_BILLING_MODE 기본 off(hold 자체 없음). RPC 는 멱등(이미 반환이면 0). DELETE 라우트는 반환 실패 시 삭제를 막아 근거를 남김. 연결 영상은 RPC 가 fail+release 를 함께 함.
- 남은 구멍: 비연결 영상(shot_previz_video·레거시 shot_video) 의 fail 과 release 가 두 호출. 고아 hold 회수 크론 없음. reserved 좀비는 반환 경로 자체가 없음.
- 근거: src/lib/fal/reconcile.ts:36-44 · src/app/api/fal/webhook/route.ts:119-126 · src/app/api/fal/webhook/route.ts:199-206 · src/lib/billing/take-hold.ts:83-87 · src/app/api/cron/take-expire/route.ts:1-8

### C12 · 중간 · 시간 한도 · 코드 확인

**시계가 셋. 화면/유령 10분, 자리 집계 30분, 배치 상수 10분 별도. 정상 영상이 '시간 초과' 로 보이고 유령은 20분 더 자리를 먹는다**

- 상황(언제): fal 큐가 밀려 영상이 10분 넘게 걸림 / 회수 불가 유령(reserved·fal 조회 일시 오류 반복)
- 지금 일어나는 일: STALE_QUEUED_MS=10분을 클라 timeoutMs·listActiveGenerationJobs·ghost sweep 이 공유. 자리 집계는 QUOTA_COUNT_WINDOW_MIN=30·트리거 v_cutoff 30분. generation-batches 는 같은 10분을 BATCH_STALE_QUEUED_MS 로 따로 적음. 클라 10분 판정은 루프 머리에서만 검사하고 fetch 가 무제한이라 실제 포기 시각은 10분+서버 응답.
- 터지는 모습: (1) 10분에 화면이 '예상보다 오래 걸린다' 를 띄우고 폴링을 끊고 진행 목록에서도 사라지지만 작업은 계속 돌아 나중에 조용히 끝난다 (2) 화면에서 사라진 유령이 20분 더 개인 6장/전체 자리를 점유해 429 가 난다
- 이미 있는 방어: 클라·서버가 같은 상수를 import 해 10분 축은 정합(#poll-timeout-align). 유령 청소가 10분 지난 잡을 fal 진실로 종결 시도. 30분 창은 영구 점유를 막는 의도.
- 남은 구멍: 작업 종류(이미지/영상)별 기대 시간이 없다. 10분과 30분 사이 20분 구간에 '화면엔 없는데 자리는 먹는' 유령이 산다. BATCH_STALE 상수 중복은 드리프트 위험.
- 근거: src/lib/generation-job-timing.ts:9 · src/lib/generation-jobs-client.ts:59-78 · src/lib/generation-jobs.ts:688-691 · src/lib/generation-jobs.ts:1073 · supabase/migrations/20261027100000_generation_capacity_per_user_limit.sql:25 · src/lib/generation-batches.ts:35 · src/lib/fal/reconcile.ts:215-221

### C13 · 중간 · 공급자 오류 · 코드 확인

**fal 제출·상태 조회·결과 다운로드에 타임아웃이 없고, 제출 5xx/429/통신 오류는 '접수 불명' 으로 예약을 남긴다**

- 상황(언제): fal 이 느리거나(큐 백로그) 429/5xx 를 돌려줄 때, 또는 fal 잔액 소진·키 오류
- 지금 일어나는 일: submitQueueOnce 의 fetch·@fal-ai/client queue.status/result·finalize 의 CDN fetch 모두 signal 없음. isDefiniteSubmitRejection 은 4xx(408/425/429 제외)만 확정 거절로 보고 나머지는 예약 유지(이중 과금 방지 설계). 조회 429 는 isPermanentProviderLookupFailure 가 제외해 queued 유지. 잔액 소진은 fal 403 → 확정 거절 → 예약 닫힘, error_class 'billing'.
- 터지는 모습: 제출 요청이 fal 응답까지 무한 대기(maxDuration 까지), 통신 오류면 queued 예약 행이 남아 자리를 30분 묶음, 잔액 소진은 즉시 실패(billing 분류)
- 이미 있는 방어: 제출은 retry:false 로 1회만(이중 발주 방지). 확정 4xx 는 rejectGenerationJobReservation 으로 즉시 닫음. 조회 401/403 은 키 회전 중으로 보고 queued 유지. 실패 분류가 billing/provider/moderation 을 가른다.
- 남은 구멍: fal 호출에 타임아웃이 없어 느린 fal 이 함수 시간을 다 먹는다. 접수 불명 예약은 C05 와 같은 좀비가 되어 30분 자리 점유 + 영상이면 hold 잔존.
- 근거: src/lib/fal/keys.ts:70-74 · src/lib/writer/llm/fal.ts:326-355 · src/lib/fal/submit-rejection.ts:9-16 · src/lib/fal/reconcile.ts:91-104 · src/lib/fal/failure-class.ts:30-45

### C14 · 중간 · 화면 상태 · 코드 확인

**클라 폴링 루프를 멈출 길이 없고(AbortController 없음), 두 번째 구독자의 상태 콜백은 조용히 무시된다**

- 상황(언제): 탭 이동·새로고침 전 언마운트·projectId 변경 중에도 pollGenerationJob 이 돌고 있음 / 같은 잡을 두 화면이 동시에 구독
- 지금 일어나는 일: pollGenerationJob 은 잡 id 당 Promise 를 재사용하되 existing 반환 시 새 onStatus 를 등록하지 않음. fetch 에 signal·취소 수단이 없고 호출자(artist-store 등) 는 결과 적용 시점에 projectId 만 비교. inFlightPolls 는 탭(JS 컨텍스트) 범위.
- 터지는 모습: 떠난 프로젝트의 잡을 10분까지 백그라운드에서 3초마다 계속 묻는다(DB 부하 지속). 두 번째 화면은 진행 표시가 갱신되지 않고 결과만 받는다. 탭을 두 개 열면 같은 잡을 두 루프가 묻는다
- 이미 있는 방어: 잡 id 당 1루프(D8 약속). 호출자가 결과 적용 전 projectId 일치 확인. 서버 진실(generation_jobs)이 있어 돌아오면 active 목록으로 복원.
- 남은 구멍: 취소 API 가 없어 떠난 화면의 폴링이 DB 부하로 남는다. 다중 구독자 콜백 미지원은 global-chat-store 주석이 인정만 함. 탭 간 중복은 서버 CAS 외 방어 없음.
- 근거: src/lib/generation-jobs-client.ts:42-56 · src/lib/generation-jobs-client.ts:79-120 · src/stores/global-chat-store.ts:5567-5569 · src/stores/artist-store.ts:1467-1470

### C15 · 중간 · 폴링 · 코드 확인

**유령 청소(ghost sweep)가 진행 목록 요청 안에서 인라인으로 돌아, 최대 5건의 fal 조회+저장이 그 요청을 수 분 붙잡는다**

- 상황(언제): 10분 넘은 queued 잡이 있는 프로젝트를 열었을 때 첫 /api/generation/active 호출(인스턴스별 60초마다)
- 지금 일어나는 일: reconcileGhostQueuedJobs 가 listActive 전에 await 로 실행되어 최신 5건을 순차 reconcile(fal status → COMPLETED 면 finalize 전부). active 라우트는 maxDuration 미지정(플랫폼 기본). 스로틀·inFlight 가 프로세스 로컬.
- 터지는 모습: 진행 목록 응답이 오래 걸려 화면 진행 표시가 멈춰 보이고(폴러 inFlight), 인스턴스가 여럿이면 같은 유령을 동시에 회수
- 이미 있는 방어: 60초 스로틀·동시 1회·5건 상한·실패 삼킴. 최신 행이 queued 인지 재확인 후 착수(M11).
- 남은 구멍: 폴링 응답 경로에 무거운 작업이 붙어 있다(after() 나 전용 라우트가 아님). 인스턴스 간 중복. 최신 5건이 전부 reserved/진행 중이면 그 뒤 유령은 영원히 순서가 오지 않음.
- 근거: src/app/api/generation/active/route.ts:40-42 · src/lib/fal/reconcile.ts:177-245 · src/lib/generation-queue.ts:76-80

### C16 · 낮음 · 공급자 오류 · 코드 확인

**fal 이 상세 없이 FAILED 를 돌려주면 'fal queue FAILED' 로 기록되어 분류가 unknown. 자동 재시도 예산을 깎고 사용자 안내도 불명**

- 상황(언제): fal 큐 status 가 FAILED(사유 미제공) 또는 웹훅 ERROR 에 payload_error 없음
- 지금 일어나는 일: falImageFetch/falVideoFetch 가 FAILED 에 'fal queue FAILED' 문자열만 반환 → classifyJobError 규칙 어디에도 안 걸려 'unknown' → GIVE_UP_EXEMPT_CLASSES(provider·infra) 에 없어 countFailedJobsForTarget 이 센다. 웹훅 generic ERROR 는 reconcile 로 재확인하므로 그쪽은 완화.
- 터지는 모습: '생성 실패' 만 뜨고 이유를 모름. 같은 칸의 자율 채움이 2회 뒤 멈춤(give-up)
- 이미 있는 방어: 웹훅 ERROR 는 fal 진실로 재확인. result 422 는 상세를 담아 FAILED 로 매핑. normalizeFailureEvidence 가 빈 문자열을 맥락으로 감쌈.
- 남은 구멍: FAILED 시 queue.status 에 logs:true 로 사유를 가져오지 않는다(falQueueStatusWithLogs 가 있는데 콘솔 전용). unknown 이 give-up 을 소모.
- 근거: src/lib/writer/llm/fal.ts:351 · src/lib/writer/llm/fal.ts:528 · src/lib/fal/failure-class.ts:30-50 · src/lib/generation-jobs.ts:1017-1057 · src/app/api/fal/webhook/route.ts:111-136

### C17 · 낮음 · 웹훅·저장 · 코드 확인

**웹훅 서명 검증이 콜드 인스턴스마다 fal JWKS 를 받아오고 실패하면 401. 결과 전달이 fal 재전송과 폴링에 의존**

- 상황(언제): Vercel 콜드 스타트 직후 웹훅 도착 + rest.fal.ai 일시 장애, 또는 전달 지연 5분 초과(timestamp 창)
- 지금 일어나는 일: getPublicKeys 가 프로세스 캐시(24h) 뿐이라 인스턴스마다 fetch(타임아웃 없음). 실패 시 verify false → 401. 타임스탬프 ±300초.
- 터지는 모습: 웹훅이 거절되어 결과가 늦게(폴링/유령 청소로) 반영됨. 브라우저를 닫은 사용자는 10분+ 뒤 재방문 때 반영
- 이미 있는 방어: 폴링 reconcile·ghost sweep·워치독·큐 콘솔이 웹훅 없이도 fal 진실을 회수(설계상 웹훅은 가속 수단). fal 재전송(inferred).
- 남은 구멍: JWKS fetch 타임아웃·재시도 없음. 결과 반영 지연 자체는 방어가 충분해 severity low.
- 근거: src/lib/fal/verify-webhook.ts:17-45 · src/lib/fal/verify-webhook.ts:70-74 · src/app/api/fal/webhook/route.ts:77-83

### C18 · 낮음 · 공급자 오류 · 코드 확인

**Creem 내용 검사는 1회 시도·타임아웃 후 fail-closed(503). Creem 이 느리면 모든 생성이 막힌다**

- 상황(언제): Creem API 지연/장애/키 오설정
- 지금 일어나는 일: assertUserTextAllowed 가 Promise.race 로 TIMEOUT_MS 뒤 abort, 네트워크/HTTP 오류 모두 ModerationUnavailableError → moderationRejectionResponse 503. 재시도 없음. 예약 전에 호출되어 자리는 안 먹는다.
- 터지는 모습: '내용 검사를 지금 할 수 없어 생성하지 않았다' 503 이 모든 생성 경로에 뜬다
- 이미 있는 방어: fail-closed 는 오너 결정(검사 없는 생성 금지). 관측 이벤트로 거절 기록. 예약·과금 전에 수행.
- 남은 구멍: 1회 짧은 재시도조차 없어 순간 지연이 그대로 사용자 거절이 된다. 설계 의도라 low.
- 근거: src/lib/moderation/creem.ts:231-282 · src/lib/api/moderation.ts:84-99 · src/app/api/generate/image/route.ts:138-152

### C19 · 낮음 · DB 부하 · 코드 확인

**오류가 날 때마다 DB 에 또 쓰는 진단 경로(server_errors·관측 이벤트)가 DB 장애를 더 키운다**

- 상황(언제): DB 지연으로 요청들이 500 을 내기 시작할 때
- 지금 일어나는 일: instrumentation.onRequestError 가 잡히지 않은 모든 오류를 server_errors 에 insert(실패는 삼킴). quotaRejectionResponse·recordModerationPass·finalize 의 recordWriterObservabilityEvent 는 fire-and-forget insert. 모두 타임아웃 없음.
- 터지는 모습: 실패 요청 1건마다 server_errors insert 1건 + 관측 이벤트 insert 가 추가로 DB 에 들어가 회복이 늦어진다(증폭)
- 이미 있는 방어: Sentry 이중 송신(DB 아닌 경로). 진단 실패는 제품을 막지 않음(best-effort). 90일 retention 크론.
- 남은 구멍: DB 장애 시 진단 쓰기를 끊는 회로차단기(circuit breaker)·샘플링이 없다.
- 근거: src/instrumentation.ts:104-127 · src/lib/api/quota.ts:29-37 · src/lib/writer/debug-events.ts:1-10 · src/lib/fal/reconcile.ts:56-62

### C20 · 낮음 · DB 부하 · 코드 확인

**2분 크론(video-batches)이 running 배치와 queued 영상 잡을 전수 읽고 잡마다 fal 을 조회하며, 웜 인스턴스마다 60초 keepalive 가 writer_runs 를 훑는다**

- 상황(언제): 크론 틱(2분)·인스턴스 생존(60초). 사용자 활동과 무관하게 항상
- 지금 일어나는 일: recoverVideoBatches 가 director_video_batches(status=running) 와 generation_jobs(kind=shot_video, status=queued, batch_id not null) 를 500행씩 끝까지 읽고 배치 ≤50개 × 잡별 getGenerationJobById + reconcileJobFromFal(fal 호출) + continueVideoBatch + updated_at 갱신. instrumentation.register 가 인스턴스마다 setInterval 60초로 listStalledRunningProjects(writer_runs) 조회. llm_calls 를 읽는 주기 코드는 없음(archive-calls.ts insert 만).
- 터지는 모습: DB 가 느릴 때도 배경 조회가 계속 들어와 회복을 늦춘다. log-retention 은 하루 1회 delete 라 '2분마다 무거운 쿼리' 의 출처가 아니다
- 이미 있는 방어: CRON_SECRET 인증, 배치 50개 상한, maxDuration 300, generation_jobs_batch_idx 부분 인덱스. keepalive 는 unref·HMR 중복 방지.
- 남은 구멍: DB 상태를 보고 크론/keepalive 를 늦추는 백오프가 없다. 인스턴스 수만큼 keepalive 가 곱해진다.
- 근거: vercel.json:17-20 · src/lib/director/batch-recovery.ts:26-36 · src/lib/director/batch-recovery.ts:54-120 · src/instrumentation.ts:38-56 · src/app/api/cron/log-retention/route.ts:50-62 · src/lib/writer/llm/archive-calls.ts:64

### C21 · 낮음 · 웹훅·저장 · 코드 확인

**큐 콘솔·워치독·sweep 의 회수 순서가 서로 달라 어떤 유령은 어느 경로에도 순서가 오지 않는다**

- 상황(언제): 오래된 reserved/진행 중 유령이 10건 이상 쌓인 상태
- 지금 일어나는 일: 워치독은 created_at 오름차순 10건(가장 오래된 것부터. reserved 좀비가 앞을 막음), ghost sweep 은 내림차순 5건(가장 최신부터. 오래된 유령은 뒤로 밀림), 큐 콘솔 POST 는 목록 내림차순 10건. 세 경로 모두 reserved 를 reconcile 에서 그대로 반환해 '처리했지만 바뀐 것 없음' 으로 상한만 소모.
- 터지는 모습: 큐 콘솔 '전부 회수' 와 일일 워치독을 돌려도 특정 유령은 계속 queued 로 남는다
- 이미 있는 방어: 세 경로가 서로 다른 끝에서 시작해 부분적으로 보완. fal 큐 TTL 뒤 404 → 종결은 reserved 가 아닌 잡에만 적용.
- 남은 구멍: 회수 대상 조회에서 reserved: 를 제외하거나 별도 처리하지 않아 상한을 좀비가 소모한다. 한 곳에서 우선순위를 정하는 큐가 없다.
- 근거: src/app/api/writer/watchdog/route.ts:60-67 · src/lib/fal/reconcile.ts:215-221 · src/app/api/generation/queue/route.ts:101-112 · src/lib/fal/reconcile.ts:121


## 3. Artist (22건, 높음 8)

캐릭터 시트·배경·외형·버전·자동 그리기.

호출 흐름:

- 화면 열림: src/app/studio/artist/page.tsx useEffect(projectId) → artist-store.loadData → Supabase(브라우저·RLS) scenes·characters·locations·character_image_candidates·projects·character_appearances·location_image_candidates·location_appearances 8쿼리 동시 → 끝나면 syncGenerationStatus → GET /api/artist/generation-status → getUser(Auth 서버) + userOwnsProject(projects·workspaces 2쿼리) + generation_jobs 4쿼리 + writer_observability_events 1쿼리 (maxDuration 미지정)
- 진입 전 폴링: page.tsx:232 setInterval 3초 → loadData(위 전부 반복); 만드는 중 폴링: page.tsx:363 setInterval 4초 → loadData(위 전부 반복). 이전 응답을 기다리지 않음
- Writer 진행: page.tsx useWriterStatus 3초 → GET /api/writer/status/{projectId} (15초 abort, 순차 setTimeout) → writer_runs; last_timestamp 가 3분 넘게 멈춰 보이면 60초마다 POST /api/writer/resume 자동
- 레이아웃 잠금 폴러: src/app/studio/layout.tsx useArtistLockPoll 5초 → GET /api/writer/status/{projectId}?assets=1 (15초 abort) → generation_jobs 집계
- 진입 시 부가 읽기: page.tsx loadProducer → producer-store(프로젝트 행), loadStyleAnchors → style_anchors, useSeriesInfo → 시리즈 조회, useGlobalChatStore 채팅 기록, cardsShown 이면 artist-version-store.refresh → GET /api/artist/versions
- 자동 그리기(진입 1회): page.tsx:305 autoGenerateBaseImages → runAdaptivePool(src/lib/artist/generation-slots.ts) → 작업 발송 전마다·대기 중 15초마다 GET /api/artist/generation-slots → getUser + countQueuedJobsByUser(generation_jobs) → writer-origin 인물은 generateCharacterView('auto'), 빈 배경은 waitForWorldWideShot(Supabase locations 3초 폴링 최대 30초) → generateWorldShot('auto')
- 이어 그리기: page.tsx:402 drawDecision==='continue' → continueMissingImages → drawMissingImages(skipFailed) → generateCharacterView('auto')·generateWorldShot('auto') → 내 한도(429 user)면 60초 뒤·그림체 읽는 중이면 20초 뒤 재시도, 최대 3바퀴·30분 → 멈추면 [안 나온 그림 n장 다시 그리기] → redrawMissingImages
- 인물 시트 1장: artist-store.generateCharacterView → (대기 중 편집 PATCH /api/artist/character flush) → POST /api/artist/generate-sheet (maxDuration 60) → requireProjectAccess(getUser+workspaces+projects) → character_appearances → countFailedJobsForTarget(auto) → hasQueuedCharacterViewJob → listFailedCharacterViewJobs(safe) → checkGenerationCapacity → projects·characters·appearances×2 → resolveStyleAnchor/resolvePhotoLook → templateAssetUrl(storage) → Creem moderation → reserveGenerationJob(insert+DB 트리거) → fal queue submit(webhook URL) → confirmGenerationJobReceipt → {jobId} → pollGenerationJob 3초 → GET /api/generation-jobs/{id} (maxDuration 60; getUser + job + owner 2쿼리 + fal reconcile/finalize) → 완료 시 Supabase character_image_candidates 재조회 + refreshViewFailures(GET generation-status)
- 배경 1장: artist-store.generateWorldShot → (ui/chat 면 Supabase locations.update user_edited) → POST /api/artist/generate-world (maxDuration 60) → requireProjectAccess → hasQueuedWorldShotJob → locations(auto 이미 있음 확인) → listFailedWorldShotJobs(safe) → countFailedJobsForTarget(auto) → checkGenerationCapacity → projects → resolveStyleAnchor/styleDrawsWithoutReference/resolvePhotoLook → location_appearances(변형) → Creem moderation → src/lib/artist/world-submit.ts reserveGenerationJob → fal submit → confirm → {jobId} → pollGenerationJob → refreshWorldFailures(GET generation-status) + Supabase location_image_candidates 재조회
- 카드 [다시 만들기]·[우회(safe) 다시 시도]: character-panel/world-panel → generateCharacterView('ui', safeMode) / retryWorldShotSafe → 위 generate-sheet/generate-world 와 동일(claimAction 1초 연타 방어 + generatingViews/Locations 메모리 가드)
- 글로벌 채팅: POST /api/artist/chat (maxDuration 300) → getUser + userOwnsProject + 활동 로그 + LLM → updates[] → artist-store.applyUpdates → generateCharacterView('chat') / generateWorldShot('chat') / 모습 추가(POST /api/artist/character-appearance·location-appearance)
- 카드 기록에서 그림 고르기: POST /api/artist/select-candidate / select-location-candidate → requireProjectAccess → candidates is_selected 해제 UPDATE → 선택 UPDATE → portrait 자르기(storage) → appearances 미러 (트랜잭션 없음)
- 인라인 편집(350ms 디바운스): PATCH /api/artist/character · /api/artist/location · /api/artist/appearance · /api/artist/character-appearance · /api/artist/location-appearance; 모습 추가/삭제 POST/DELETE 같은 라우트; 인물 삭제 DELETE /api/artist/character(queued 잡 있으면 409)
- 작품 스타일 버전: StyleVersionBar → GET /api/artist/versions (maxDuration 300; regen 중 page.tsx:469 5초 폴링) → requireProjectAccess + readVersionProject + artistStyleLocked + readLiveImages(6표 전체 페이지 읽기) + readVersionRows + settleVersions(끊긴 불러오기 마저 하기 = 쓰기) + regenProgressFor(generation_jobs); [재생성하기] POST /api/artist/versions/regenerate (300; 떠나는 버전 그림 전체 storage 복사) → continueRegen 루프(4초) → generateCharacterView/generateWorldShot('ui'); [불러오기] POST /api/artist/versions/load (300; failStaleImageJobs + 그림 되돌리기); 거절 칸 POST /api/artist/versions/regen action=fail
- 사이드바 [다시 시도]: project-store.retryArtistDrafts → POST /api/artist/retry-drafts (60) → getUser + userOwnsProject + checkGenerationCapacity + queued 수 → triggerAssetDrafts(서버 초안 fal 제출)
- [완료하기]: ArtistCompleteDialog → POST /api/writer/artist-complete (maxDuration 300) → requireProjectAccess + loadCompletionGaps + versionWorkPending(버전 표) + getActiveRun + projects.current_stage='writer' + writer_runs 갱신 + after(triggerWriterStep) → 화면 restartWriterStatus + router.push('/studio/writer')
- Storyboard 미리 그리기: page.tsx useBackgroundRoughs(그림 다 그린 뒤·만드는 중 아님) → POST /api/writer/rough-storyboard 묶음 반복 → 잡마다 pollGenerationJob 3초 → 429 면 조용히 멈춤 (Artist 자리 수를 1장으로 떨어뜨리는 원인)
- 브레이크다운 목록: 레퍼런스 올리기 POST /api/artist/breakdown-image (multipart → sharp 재인코딩 → Supabase storage); [만들기] StyleMakeDialog → producer-store.setStyleAnchor + saveAndHandoff → /api/writer/start (Writer 영역)
- 페이지 요청 /studio/artist 자체: src/middleware.ts → supabase.auth.getUser() (Auth 서버·DB). API(/api/*) 는 미들웨어 제외, 라우트마다 requireProjectAccess 가 따로 3회 왕복

구조적 약점: ① 폴링이 '이전 응답 완료'를 기다리지 않는 고정 setInterval(3·4·5초) 이고, 조회 라우트(generation-status · generation-jobs/[id] · generation-slots) 는 클라 abort 도 서버 maxDuration 도 없어 DB 가 느려지면 요청이 함수 기본 한도(5분)까지 묶인 채 새 요청이 계속 겹친다. 라우트마다 인증 3회(getUser+workspaces+projects) + 5~14회 순차 DB 왕복이라 DB 1.2~2.4초면 정상 때도 한 요청이 20~30초다. ② 화면의 '진행 판단'이 전부 조회 성공에 의존한다. serverDrawCheckedAt(이어 그리기), writerStatusKnown(자동 그리기), generation-slots 응답(첫 발송). 하나라도 실패하면 '기다림(wait)' 으로 조용히 멈추고 멈춤 표시도 단추도 없다. 재시도·백오프가 없고 새로고침만이 탈출구다. ③ STALE_QUEUED_MS(10분) 하나가 화면 폴링 포기 · 서버 중복 가드 무시 · '그리는 중' 목록 제외를 동시에 정한다 → finalize 가 10분 넘게 늦으면(장애 때 25~31분) 실패 배지 + 같은 칸 재발주(이중 과금) 가 열린다. ④ 실패를 '실패로 굳히는' 지점이 너무 이르다. pollGenerationJob 은 HTTP 오류 1회에 failed, loadData 는 쿼리 error 를 보지 않아 DB 장애가 '카드 사라짐 · 만들기 화면 회귀' 로 둔갑한다.

### ART-01 · 높음 · DB 부하 · 코드 확인

**화면이 열려 있는 동안 3~4초마다 DB 를 9번씩 두드리고, 느려져도 멈추지 않는다**

- 상황(언제): Artist 화면을 열어 둔 채(만드는 중이거나 진입 전) DB 응답이 느려짐. 20명이 동시에 열면 분당 수백 건.
- 지금 일어나는 일: page.tsx 의 setInterval(3초·4초) 이 매 틱 loadData 를 새로 부른다. loadData 는 브라우저에서 Supabase 로 직접 8개 쿼리를 동시에 보내고, 끝나면 GET /api/artist/generation-status 를 또 부른다(서버에서 인증 3회 + 5쿼리). 이전 호출이 끝났는지 보지 않으므로 응답이 늦어지면 겹쳐 쌓인다.
- 터지는 모습: DB 가 느려질수록 요청이 쌓여 더 느려지고(악순환), 화면은 멈춘 듯 보이며 다른 사람의 요청까지 함께 느려진다. 장애 당시 한 서버 인스턴스에 동시 요청 187개.
- 이미 있는 방어: loadData 는 응답 뒤 projectId 가 바뀌었으면 버린다(artist-store.ts:868). making 이 끝나면(progress.done) 폴링이 멈춘다. Writer 상태 폴러(use-writer-status.ts)와 잠금 폴러(use-artist-lock-poll.ts)는 순차 setTimeout + 15초 abort 로 겹치지 않게 돼 있다.
- 남은 구멍: loadData 폴링에는 '이전 요청이 끝나기 전엔 다시 안 보냄' 가드도, 타임아웃(abort)도, 실패 시 간격을 늘리는 백오프도 없다. 8쿼리를 한 번에 보내는 대신 서버 라우트 1개로 모으거나 바뀐 것만 읽는 구조가 아니다.
- 근거: src/app/studio/artist/page.tsx:229-234 (진입 전 3초 setInterval → loadData) · src/app/studio/artist/page.tsx:361-365 (만드는 중 4초 setInterval → loadData) · src/stores/artist-store.ts:811-873 (Supabase 8쿼리 Promise.all) · src/stores/artist-store.ts:1026-1027 (loadData 끝에 syncGenerationStatus fire-and-forget) · src/app/api/artist/generation-status/route.ts:20-41 (getUser + userOwnsProject + 5쿼리 Promise.all) · src/lib/generation-jobs.ts:1259-1278 (userOwnsProject 2쿼리)

### ART-02 · 높음 · 폴링 · 코드 확인

**그림 상태 조회(generation-status)가 5분까지 묶이고, 그 사이 또 조회를 보낸다**

- 상황(언제): DB 응답 지연 중 화면이 loadData(4초마다)·그림 완료 후 refreshViewFailures·refreshWorldFailures 로 generation-status 를 부름.
- 지금 일어나는 일: GET /api/artist/generation-status 는 maxDuration 을 지정하지 않아 Vercel 함수 기본 한도(약 300초, 추정)까지 돈다. 클라 fetch(syncGenerationStatus·refreshViewFailures·refreshWorldFailures) 는 AbortController 가 없어 그 시간을 그대로 기다린다. 라우트 안은 getUser → userOwnsProject(2쿼리) → 5쿼리 순이라 DB 가 느리면 합쳐서 수십 초가 된다.
- 터지는 모습: 요청 하나가 5분 동안 매달린 뒤 끊김(장애 당시 181회 실패, 148회가 5분 대기 후 끊김). 화면은 '그리는 중' 수와 실패 배지를 갱신하지 못한다.
- 이미 있는 방어: 실패해도 화면 로드는 막지 않는다(try/catch best-effort). 그림 1장이 끝날 때마다 refreshViewFailures 는 fire-and-forget 이라 UI 를 블로킹하진 않는다.
- 남은 구멍: 클라 타임아웃(15초 같은)·서버 maxDuration 둘 다 없다. 5분 대기 중에도 4초 폴링이 같은 조회를 계속 보낸다. 상태 조회 하나가 인증 3회 + 5쿼리라 비싸다. Vercel 기본 한도가 300초라는 점은 설정 파일에서 확인되지 않아 추정이다.
- 근거: src/app/api/artist/generation-status/route.ts:17 (runtime 만 있고 maxDuration 없음) · src/stores/artist-store.ts:1426-1428 (syncGenerationStatus fetch, abort 없음) · src/stores/artist-store.ts:499-506 (refreshWorldFailures fetch, abort 없음) · src/stores/artist-store.ts:1529-1532 (refreshViewFailures fetch, abort 없음) · src/hooks/use-artist-lock-poll.ts:12 (ARTIST_LOCK_REQUEST_TIMEOUT_MS=15초. 대비되는 올바른 예) · src/lib/writer/use-writer-status.ts:63 (WRITER_STATUS_REQUEST_TIMEOUT_MS=15초)

### ART-03 · 높음 · 화면 상태 · 코드 확인

**상태 조회가 실패하면 이어 그리기가 영원히 '기다림' 에 머물러 그림 요청을 하나도 보내지 않는다**

- 상황(언제): [만들기] 뒤 그림 그리는 단계에서 GET /api/artist/generation-status 가 계속 실패(5xx·504·타임아웃).
- 지금 일어나는 일: syncGenerationStatus 는 성공 경로 마지막에서만 serverDrawCheckedAt 을 적는다. 실패(res.ok 아님 → return, 예외 → catch) 면 적지 않는다. drawContinueDecision 은 checkedSinceDrawingBegan 이 false 면 무조건 'wait' 를 돌려주고, 'wait' 면 continueMissingImages 가 불리지 않으며(page.tsx:402) 다시 그리기 단추도 숨겨진다(404). 조회가 복구될 때까지 아무 일도 일어나지 않는다.
- 터지는 모습: 오버레이는 '그림을 그리고 있어요 k/N' 도는 원만 보이고, 다시 그리기 단추도 없다. 실제로는 요청이 0개 나가고 새로고침해도 같다. 장애 당시 'autogen 이 19:47 시작했지만 요청 0개로 멈춤' 과 일치.
- 이미 있는 방어: 성공하면 서버가 그리는 중인 잡을 '그리는 중' 으로 세어 중복 발주를 막는다(설계 의도는 맞다). 카드가 생긴 뒤에는 오버레이 [닫기] 가 있어 화면에 갇히지는 않는다(page.tsx:432).
- 남은 구멍: 조회 실패를 N회 넘기면 'stop' 으로 바꿔 단추를 보이거나, 실패 횟수를 세어 사용자에게 '상태를 읽지 못했어요' 를 알리는 경로가 없다. 실패가 조용해서 사용자는 기다리는 것과 멈춘 것을 구분할 수 없다.
- 근거: src/stores/artist-store.ts:1519 (set({ serverDrawCheckedAt }). 성공 끝에서만) · src/stores/artist-store.ts:1428 (if (!res.ok) return. 시각 기록 안 함) · src/stores/artist-store.ts:1520-1522 (catch. 조용히 무시) · src/lib/artist/draw-continue.ts:117-120 (checkedSinceDrawingBegan false → 'wait') · src/app/studio/artist/page.tsx:385-395 (checkedSinceDrawingBegan 계산) · src/app/studio/artist/page.tsx:401-407 (continue 일 때만 continueMissingImages, stop 일 때만 단추)

### ART-04 · 높음 · 자리(정원) · 코드 확인

**자동 그리기는 '동시 몇 장' 조회 응답을 받아야 첫 장을 보내서, 그 응답이 늦으면 요청 0개**

- 상황(언제): autoGenerateBaseImages·drawMissingImages·재생성 루프가 runAdaptivePool 을 시작했는데 GET /api/artist/generation-slots 가 DB 지연으로 수 분 걸림.
- 지금 일어나는 일: runAdaptivePool 은 루프 첫 줄에서 `await safeLimit(getLimit)` 으로 자리 수를 먼저 묻는다. fetchArtistGenerationLimit 은 실패하면 1 을 돌려주지만 abort 가 없어 '느린 응답' 은 실패가 아니라 그냥 기다림이다. 그 라우트도 getUser + generation_jobs count 로 DB 를 탄다. 작업마다·대기 15초마다 다시 묻기 때문에 그림 N장이면 조회도 N번 이상이다.
- 터지는 모습: 콘솔에 '[autogen] start. rest:N' 만 찍히고 그림 요청이 하나도 안 나간다. 응답이 끊기면(5분 뒤) 1장 모드로 뒤늦게 시작한다.
- 이미 있는 방어: 조회가 '실패' 하면 1장으로 보수적으로 돌아간다. 자리가 줄면 보낸 것은 두고 새 발송만 멈춘다. 다른 프로젝트로 옮기면 보내지 않는다.
- 남은 구멍: 자리 수 조회에 짧은 타임아웃(2~3초) 이 없고, 시간 초과 시 1장으로 바로 시작하는 길이 없다. 마지막 성공값을 캐시해 재사용하지도 않는다. waitForWorldWideShot 의 30초 한도도 쿼리가 끝난 뒤에만 검사한다.
- 근거: src/lib/artist/generation-slots.ts:64-66 (while 첫 줄 await safeLimit(getLimit)) · src/lib/artist/generation-slots.ts:27-37 (fetchArtistGenerationLimit. abort 없음, 실패만 1 fallback) · src/app/api/artist/generation-slots/route.ts:14-26 (getUser + countQueuedJobsByUser) · src/stores/artist-store.ts:2196 (autoGenerateBaseImages → runAdaptivePool) · src/stores/artist-store.ts:2017 (drawMissingImages → runAdaptivePool) · src/stores/artist-store.ts:356-371 (waitForWorldWideShot. 배경마다 Supabase 3초 폴링, 시간 체크가 쿼리 뒤라 DB 느리면 30초를 훨씬 넘김)

### ART-05 · 높음 · 시간 한도 · 코드 확인

**그림 요청 라우트(generate-sheet·generate-world)가 60초 안에 DB 10~14번 + 외부 2번을 순서대로 끝내야 한다**

- 상황(언제): DB 왕복이 1.2~2.4초로 느린 상태에서 인물 시트·배경 요청(사람 클릭·자동·채팅 어느 경로든).
- 지금 일어나는 일: generate-world: requireProjectAccess(getUser+workspaces+projects) → hasQueuedWorldShotJob → locations(auto) → listFailedWorldShotJobs(safe) → countFailedJobsForTarget → checkGenerationCapacity → projects → 스타일 앵커·사진 룩 → location_appearances → Creem moderation(외부) → reserveGenerationJob(insert+트리거) → fal submit(외부) → confirm 을 모두 순차로 돈다. generate-sheet 도 같은 구조에 템플릿 storage 조회가 더 있다. 왕복 2초면 정상 때도 25~30초, 장애 때 60초 초과. reserveGenerationJob 뒤 kill 되면 queued 예약 행만 남아 request_id 없이 자리를 10분 점유한다.
- 터지는 모습: 요청이 60초를 넘겨 끊긴다(장애 당시 배경 요청 60초 초과 5회). 화면은 '실패' 배지 + 채팅에 실패 기록. 실제로는 fal 에 접수됐을 수도, 안 됐을 수도 있다.
- 이미 있는 방어: 자리 예약을 먼저 하고 fal 에 보내므로 거절될 때 돈이 나가지 않는다. fal 접수 확정 거절(4xx) 만 예약을 닫고 통신 오류·5xx 는 queued 로 남겨 이중 발주를 막는다. 10분 지난 queued 는 유령으로 정리된다(다른 조사자 영역).
- 남은 구멍: 인증·가드 쿼리를 병렬화하거나 한 RPC 로 묶지 않았다. 예약→제출 사이에 함수가 kill 되면 자리만 점유한 예약이 남고 화면은 실패로 적어, 사용자가 다시 누르면 10분 동안 'deduped(이미 그리는 중)' 로 조용히 거절된다(hasQueued* 가 fresh queued 로 봄). 화면 쪽 fetch 에도 타임아웃이 없어 60초를 그대로 기다린다.
- 근거: src/app/api/artist/generate-world/route.ts:42 (maxDuration 60) · src/app/api/artist/generate-world/route.ts:90-121 (인증·중복·존재 확인 순차) · src/app/api/artist/generate-world/route.ts:164-175 (checkGenerationCapacity → projects) · src/app/api/artist/generate-world/route.ts:225-262 (moderation → submitWorldShotJob) · src/lib/artist/world-submit.ts:85-137 (reserve → fal submit → confirm; 5xx 는 queued 예약 유지) · src/app/api/artist/generate-sheet/route.ts:58 (maxDuration 60) · src/app/api/artist/generate-sheet/route.ts:101-170 (순차 가드 7개) · src/app/api/artist/generate-sheet/route.ts:384-446 (moderation → reserve → submit → confirm) · src/stores/artist-store.ts:1301-1309 (!res.ok → 실패 처리) · src/stores/artist-store.ts:1751-1763 (배경 실패 failCount+1)

### ART-06 · 높음 · 폴링 · 코드 확인

**그림 완료 확인 폴링이 서버 오류 한 번에 '실패' 로 굳고, 다시 묻지 않는다**

- 상황(언제): pollGenerationJob 이 3초마다 부르는 GET /api/generation-jobs/{id} 가 DB 지연·인증 실패로 5xx/504/401 을 한 번 돌려줌.
- 지금 일어나는 일: pollGenerationJobOnce 는 res.ok 가 아니면 즉시 throw 하고 루프를 끝낸다. generateCharacterView/generateWorldShot 의 catch 가 viewFailures/worldFailures 에 'failed' 를 적고 notifyGenerationFailed 를 부른다. 간격은 3초 고정, 백오프·재시도 없음. 서버 라우트 주석도 이 불일치('서버 의도는 기다려, 화면은 실패로 굳힘') 를 인정한다. 잡마다 독립 루프라 그림 6장이면 3초마다 6요청(각각 getUser + owner 2쿼리 + fal reconcile).
- 터지는 모습: 실제로는 fal 이 그리고 있는데 카드에 '이미지 실패' 배지가 붙고 채팅에 '실패했어요' 가 남는다. 그림은 나중에 DB 에는 저장되지만 화면은 새로고침(또는 만드는 중 4초 폴링) 전까지 모른다.
- 이미 있는 방어: 같은 jobId 는 inFlightPolls 로 한 루프만 돈다(generation-jobs-client.ts:36-55). reconcile 실패는 서버가 삼켜 queued 로 돌려준다. 완료 뒤 refreshViewFailures 가 서버 기준으로 실패 배지를 다시 맞춘다(실패 기록이 서버에 없으면 배지는 사라짐).
- 남은 구멍: 5xx·네트워크 오류를 실패로 치지 않고 간격을 늘려 재시도하는 길이 없다. 배지는 사라져도 완성된 그림(sheetUrl) 은 loadData 가 다시 읽어야만 보인다. 만드는 중이 끝난 뒤(progress.done) 엔 폴링이 멈춰 새로고침이 필요하다.
- 근거: src/lib/generation-jobs-client.ts:83-93 (!res.ok → onStatus failed → throw) · src/lib/generation-jobs-client.ts:122 (3초 고정 대기, 백오프 없음) · src/stores/artist-store.ts:1380-1395 (catch → withViewFailure + notifyGenerationFailed) · src/stores/artist-store.ts:1751-1763 (배경 catch → worldFailures failCount+1) · src/app/api/generation-jobs/[id]/route.ts:51-60 (reconcile 예외는 삼키지만 인증·DB 오류는 500) · src/app/api/generation-jobs/[id]/route.ts:19 (maxDuration 60)

### ART-07 · 높음 · 웹훅·저장 · 코드 확인

**결과 저장(finalize)이 10분 넘게 늦으면 화면은 실패로 보고, 같은 칸을 다시 발주해 두 번 과금될 수 있다**

- 상황(언제): fal 은 그렸는데 webhook finalize 가 DB 지연으로 10분(STALE_QUEUED_MS) 넘게 늦음(장애 당시 25~31분).
- 지금 일어나는 일: 10분 상수 하나가 세 곳을 동시에 바꾼다: (a) 화면 폴링 포기 → timed_out → 실패 기록, (b) 서버 중복 가드 hasQueuedCharacterViewJob/hasQueuedWorldShotJob 가 그 잡을 '없는 것' 으로 봄, (c) listQueuedMainJobs/listQueuedWorldShotJobs 가 '그리는 중' 에서 뺌 → drawing 0. 한편 refreshViewFailures 는 서버 실패 목록(최신 잡이 failed 인 칸만) 으로 viewFailures 를 통째로 덮어쓰므로, 아직 queued 인 칸의 클라 'failed' 기록은 사라진다 → missingDrawTargets(skipFailed) 가 그 칸을 다시 고른다 → 서버 가드가 통과 → 재발주.
- 터지는 모습: 10분 시점에 카드가 '실패' 로 바뀜. 이후 이어 그리기나 사용자의 [다시 만들기] 가 같은 인물·배경을 또 그린다(fal 비용 2배). 25~31분 뒤 첫 결과가 도착해 나중 결과와 뒤섞여 덮어쓰기 순서가 보장되지 않는다.
- 이미 있는 방어: 이어 그리기는 최대 3바퀴(DRAW_CONTINUE_MAX_ROUNDS) 로 제한된다. 자동 경로는 서버 give-up(2회 실패) 가드가 있다. 2026-11-14 결정으로 '멈춘 칸을 다시 만들 수 있게' 의도적으로 stale 잡을 무시한다. 늦게 온 결과는 '대기 중인 작업만 받는다' 규칙으로 버전 바꾼 뒤 덮어쓰기를 막는다(style-versions-server failStaleImageJobs).
- 남은 구멍: 화면 포기 시각과 서버 중복 가드 무시 시각이 같은 상수여서 분리가 안 된다. 재발주 전에 fal 에 request_id 로 '진짜 끝났는지' 물어보는 단계가 없다. 늦은 첫 결과와 새 결과가 같은 칸에 도착하는 순서를 정하는 규칙이 없다(공통 finalize 영역과 연결).
- 근거: src/lib/generation-job-timing.ts:9 (STALE_QUEUED_MS = 10분) · src/lib/generation-jobs-client.ts:72-79 (timeoutMs 초과 → timed_out throw) · src/lib/generation-jobs.ts:478-497 (hasQueuedCharacterViewJob. freshQueued 아니면 false) · src/lib/generation-jobs.ts:504-522 (hasQueuedWorldShotJob 동일) · src/lib/generation-jobs.ts:777-797 (listQueuedMainJobs. stale 제외) · src/stores/artist-store.ts:1524-1555 (refreshViewFailures. viewFailures 전체를 서버 목록으로 대체) · src/lib/generation-jobs.ts:549-556 (listFailedCharacterViewJobs. 최신 잡이 failed 인 칸만) · src/lib/artist/draw-continue.ts:71-90 (missingDrawTargets. 실패 기록 없고 그리는 중 아니면 대상)

### ART-08 · 높음 · 화면 상태 · 코드 확인

**DB 가 응답을 못 주면 카드가 전부 사라지고 '그림 만드는 중' 전체 화면으로 되돌아간다**

- 상황(언제): loadData 의 Supabase 쿼리가 타임아웃·오류·RLS 거절(세션 만료)로 data 없이 돌아옴. 4초 폴링 중이면 매 틱 가능.
- 지금 일어나는 일: loadData 는 Promise.all 결과에서 `{ data }` 만 꺼내고 error 를 보지 않는다. data 가 null 이면 `(dbChars ?? [])` 로 빈 배열이 되어 characterAssets/worldAssets 를 [] 로 set 한다. 그러면 hasAssets=false → artistPhase 가 'cards' 대신 'making' 을 돌려주고(designFinished 이고 hasAssets 아니면 making), page.tsx 는 `phase==='making' && !hasAssets` 분기로 전체 화면 오버레이만 그린다.
- 터지는 모습: 방금까지 보이던 인물·배경 카드가 모두 사라지고 전체 화면 오버레이 '그림을 만들고 있어요' 가 다시 뜬다(진행률 0/0). DB 가 돌아오면 다음 폴링에 복구된다. 사용자는 작업이 지워진 줄 안다.
- 이미 있는 방어: 예외가 던져지면(네트워크 끊김) catch 로 들어가 writer 스토어 매니페스트로 폴백한다. 한 번이라도 진입한 프로젝트는 gateOpen 으로 진행 게이트에 다시 걸리지 않는다(enteredProjects).
- 남은 구멍: 쿼리 error 가 하나라도 있으면 기존 상태를 유지하고 error 만 표시해야 하는데, 빈 결과로 덮어쓴다. supabase-js 는 오류를 throw 하지 않고 { error } 로 주므로 catch 도 걸리지 않는다. 폴백(writer 매니페스트)도 views.main 이 모두 null 이라 '그림 전부 사라짐' 으로 보인다.
- 근거: src/stores/artist-store.ts:819-873 (data 만 구조분해, error 미확인) · src/stores/artist-store.ts:1010-1024 (set characterAssets/worldAssets) · src/lib/artist/breakdown.ts:84-87 (designFinished → hasAssets ? 'cards' : 'making') · src/app/studio/artist/page.tsx:489-491 (phase making && !hasAssets → 전체 오버레이) · src/stores/artist-store.ts:1030-1032 (예외 시 writer store 폴백. 그림 URL 전부 null)

### ART-09 · 중간 · 로그인 확인 · 추정

**모든 요청이 로그인 확인으로 DB 를 다시 부르고, 화면 자체도 미들웨어 로그인 확인에 걸려 안 열릴 수 있다**

- 상황(언제): DB/Auth 가 느린 상태에서 Artist 화면을 열거나(미들웨어 getUser) API 를 부름(라우트마다 requireProjectAccess).
- 지금 일어나는 일: src/middleware.ts 는 페이지 요청마다 supabase.auth.getUser() 를 기다린 뒤 통과시키는데, Vercel 미들웨어는 응답 시작 한도(약 25초, 추정)가 있다. API 는 미들웨어에서 제외돼 라우트마다 requireProjectAccess = getUser(Auth 서버) + workspaces + projects 조회를 따로 한다(generation-status·generation-jobs 는 getUser + userOwnsProject 2쿼리). 세션 만료 시 브라우저 Supabase 클라이언트는 빈 결과(ART-08 로 연결), API 는 401 → pollGenerationJob 이 즉시 failed.
- 터지는 모습: 화면이 25초쯤 뒤 오류로 열리지 않음(장애 당시 6회, 추정). API 는 요청마다 인증 왕복 3회가 더 붙어 전체가 느려진다. 세션이 만료되면 API 는 401 인데 화면은 로그인으로 보내지 않고 폴링만 '실패' 로 굳는다.
- 이미 있는 방어: 미들웨어는 정적 자산·API 를 건너뛴다(getUser 왕복 절약 주석). 세션 쿠키 갱신을 리다이렉트에도 실어 무한 루프를 막는다. layout 에 useIdleTimeout 이 있다.
- 남은 구멍: 인증 결과를 요청 안에서 재사용하거나 짧게 캐시하는 층이 없어 라우트 1개 = Auth 1회 + DB 2회가 고정 비용이다. 미들웨어 getUser 에 타임아웃·실패 시 통과(또는 안내 페이지) 가 없다. API 401 을 받았을 때 화면이 '다시 로그인' 으로 안내하는 공통 처리가 없다. 25초 한도는 코드에 없어 추정이다.
- 근거: src/middleware.ts:29-31 (await supabase.auth.getUser()) · src/middleware.ts:126-131 (matcher. api/ 제외) · src/lib/api/guard.ts:97-100 (getUser + ownsProject) · src/lib/api/guard.ts:22-42 (ownsProject. workspaces + projects 2쿼리) · src/lib/supabase/auth.ts:8-14 (getUser) · src/lib/generation-jobs-client.ts:83-93 (401 도 failed 로 굳힘)

### ART-10 · 중간 · 폴링 · 코드 확인

**한 화면에서 폴러 6종이 따로 돌아 같은 사실을 겹쳐 읽고, 탭 복귀 때 한꺼번에 쏜다**

- 상황(언제): Artist 화면을 열어 둠. 특히 만드는 중·재생성 중·탭을 숨겼다가 다시 봄.
- 지금 일어나는 일: page.tsx loadData 3초/4초(DB 8쿼리+상태 1), useWriterStatus 3초(/api/writer/status), layout 의 useArtistLockPoll 5초(/api/writer/status?assets=1), 재생성 중 versions 5초(/api/artist/versions. 6표 전체 읽기), 잡마다 pollGenerationJob 3초, 배경마다 waitForWorldWideShot 3초. 각각 독립 타이머이고 서로의 결과를 공유하지 않는다. useWriterStatus·lock poll 은 visibilitychange/focus 에서 즉시 tick 한다.
- 터지는 모습: DB 가 느릴 때 요청 수가 폴러 수만큼 곱해져 늘고, 탭 복귀 순간 Writer 상태·잠금 폴러가 동시에 두드린다. 백오프가 없어 장애 중에도 간격이 그대로다.
- 이미 있는 방어: useWriterStatus 는 같은 프로젝트 구독자끼리 요청 1개를 공유하고 15초 abort·순차 setTimeout 이다. lock poll 도 15초 abort·순차. pollGenerationJob 은 jobId 당 1루프. versions 폴링은 regen 중에만 켜진다.
- 남은 구멍: loadData·versions 폴링만 setInterval 이라 겹침 가드가 없다. 폴러 간 공유(예: generation-status 결과를 lock poll 과 공유) 가 없다. 어느 폴러에도 '실패하면 간격을 늘리는' 백오프가 없다.
- 근거: src/app/studio/artist/page.tsx:232, 363, 469 (setInterval 3000/4000/5000) · src/lib/writer/use-writer-status.ts:53, 140-144 (3초 + focus/visibility wake) · src/hooks/use-artist-lock-poll.ts:11, 150-160 (5초 + onWake) · src/lib/generation-jobs-client.ts:63 (intervalMs 3000) · src/stores/artist-store.ts:356-371 (waitForWorldWideShot 3초) · src/stores/artist-version-store.ts:14 (REGEN_POLL_MS 4초)

### ART-11 · 중간 · 자리(정원) · 코드 확인

**동시 6장 한도에 막히면 자동 경로는 조용히 1분마다 30분간 재시도하고, 화면에는 '왜 멈췄는지' 가 없다**

- 상황(언제): 내 한도(user 429). 다른 프로젝트·러프 스토리보드·재생성이 내 자리 6개를 쓰는 중에 Artist 가 그림을 보냄.
- 지금 일어나는 일: continueMissingImages 는 refusedScope==='user' 면 drawContinue.paused=true + userWaitSince 를 적고 USER_LIMIT_RECHECK_MS(60초) 뒤 다시 본다. paused 면 drawContinueDecision 이 'wait' → 단추 숨김. 두 번째부터 quietQuota=true 라 토스트가 생략된다. USER_LIMIT_WAIT_MAX_MS(30분) 가 지나야 stopped. Artist 화면이 열려 있으면 useBackgroundRoughs 가 러프를 돌려 같은 한도를 쓰고, generation-slots 는 러프가 돌면 Artist 를 1장으로 줄인다.
- 터지는 모습: 오버레이는 '그림 그리는 중' 도는 원(단추 없음) 으로 보이고 진행이 멈춘 듯하다. 첫 거절 때만 토스트 1회, 이후 quietQuota 로 안내 없음. 30분 뒤에야 '일부 그림이 안 그려졌어요' + 단추. 모두의 자리(global 429) 는 즉시 멈추고 단추를 보인다.
- 이미 있는 방어: 거절 축(user/global) 을 구분해 global 은 바로 멈추고 단추를 보인다. 사전 검사가 DB 장애로 fail-open 돼도 reserveGenerationJob 의 DB 트리거가 거절해 429 로 변환된다(capacityReservationRejection). 러프는 Artist 그림을 그리는 동안(making) 돌지 않는다.
- 남은 구멍: 내 한도 대기 중임을 오버레이에 글로 보여주지 않는다('자리가 나면 이어 그려요' 같은 문구 없음). 재생성(regen) 중에는 러프가 함께 돌 수 있어 regen 이 1장씩 + 429 user 로 느려진다. 새로고침하면 userWaitSince/rounds 가 사라져 바퀴 수가 0 으로 돌아간다.
- 근거: src/stores/artist-store.ts:2075-2091 (userWaitSince·paused·pauseFor 60초) · src/lib/artist/draw-continue.ts:14-19 (USER_LIMIT_RECHECK_MS 60s, USER_LIMIT_WAIT_MAX_MS 30분) · src/lib/artist/draw-continue.ts:117-120 (paused → 'wait') · src/stores/artist-store.ts:303-305 (quietQuota 면 내 한도 토스트 생략) · src/app/studio/artist/page.tsx:366-371 (useBackgroundRoughs. 만드는 중이 아니면 러프 돌림) · src/lib/artist/generation-slots.ts:21-24 (러프 돌면 1장) · src/lib/generation-quota.ts:189-215 (checkGenerationCapacity fail-open; 진짜 집행은 insert 트리거)

### ART-12 · 중간 · 화면 상태 · 코드 확인

**새로고침·탭 이동·프로젝트 전환 때 진행 상태는 사라지고 폴링 루프는 남는다**

- 상황(언제): 그림이 그려지는 중에 새로고침, 다른 스테이지 탭으로 이동, 다른 프로젝트(시리즈 다음 화 포함) 로 전환.
- 지금 일어나는 일: generatingViews/generatingLocations/drawContinue/drawingBeganAt 는 메모리 상태라 새로고침에 사라진다. 복원은 syncGenerationStatus 의 queuedMain/queuedWorld 로만 한다. pollGenerationJob 의 inFlightPolls 는 모듈 전역이라 projectId 가 바뀌어도 루프는 계속 돌고, then/catch 에서 projectId 가 다르면 상태 반영만 건너뛴다. 탭 이동(route remount) 은 store 가 살아 있어 상태가 유지된다.
- 터지는 모습: 새로고침 후 '그리는 중' 표시는 generation-status 조회가 성공해야 돌아오고(실패하면 빈칸으로 보임), 이어 그리기 바퀴 수가 0 으로 리셋돼 거절된 뒤에도 또 3바퀴를 돈다. 프로젝트를 바꿔도 이전 잡의 폴링(3초) 은 최대 10분 서버를 계속 두드린다(결과는 버림).
- 이미 있는 방어: 서버 잡은 webhook 으로 저장되므로 화면이 꺼져도 그림은 DB 에 남는다(고아 아님). 같은 jobId 폴링은 1루프로 합쳐진다. 프로젝트 전환 시 resetChildStores 가 artist 상태를 비운다. 늦게 시작하는 작업은 sameProject 로 보내지 않는다.
- 남은 구멍: 폴링 루프에 AbortController/취소가 없어 프로젝트를 떠나도 10분까지 서버 요청이 계속된다. 이어 그리기 바퀴 수·내 한도 대기 시각이 서버에 없어 새로고침마다 다시 시작한다. 새로고침 직후 generation-status 가 실패하면 서버가 그리는 잡을 모르는 채 이어 그리기가 'wait'(ART-03) 에 걸린다.
- 근거: src/lib/generation-jobs-client.ts:36-55 (전역 inFlightPolls, 취소 없음) · src/stores/artist-store.ts:1466-1470, 1489-1491 (projectId 다르면 반영 skip. 루프는 계속) · src/stores/artist-store.ts:1464-1512 (queued 잡으로 '그리는 중' 복원) · src/stores/artist-store.ts:2048-2050 (drawContinue 가 projectId 다르면 rounds 0 으로 새로 시작) · src/stores/project-store.ts:146-174 (프로젝트 전환 시 artist reset) · src/app/studio/artist/page.tsx:159-166 (enteredProjects 로 remount 게이트 유지)

### ART-13 · 중간 · 시간 한도 · 코드 확인

**화면과 서버의 시간 한도가 서로 맞지 않아 어느 쪽이 먼저 포기하는지 일정하지 않다**

- 상황(언제): DB·fal 지연 중 여러 요청이 동시에 길어짐.
- 지금 일어나는 일: 값 목록: pollGenerationJob 포기 10분(STALE_QUEUED_MS, 서버 유령 기준과 맞춤) · /api/generation-jobs/[id] maxDuration 60 · generate-sheet/world 60 · versions/load·regenerate·versions GET·artist-complete 300 · writer status 폴러 abort 15초 · generation-status/generation-slots/versions refresh 는 클라 abort 없음·서버 maxDuration 없음(기본) · waitForWorldWideShot 30초(쿼리 뒤 검사) · 재생성 RESTORE_LEASE_MS 305초.
- 터지는 모습: 같은 그림에 대해 화면은 10분 뒤 실패로 보지만 서버 조회 함수는 60초에 끊기고, 상태 폴러는 15초에 끊고, 자리 수 조회·상태 조회는 끊지 않고 5분을 기다린다. 사용자는 어떤 것이 '아직 진행 중' 이고 어떤 것이 '끝난 실패' 인지 알 수 없다.
- 이미 있는 방어: STALE_QUEUED_MS 는 서버·화면이 한 파일(generation-job-timing.ts)을 같이 써서 어긋나지 않게 했다(#poll-timeout-align). 버전 불러오기 lease(305초) 는 라우트 300초와 맞춰져 있다.
- 남은 구멍: 조회성 라우트(generation-status·generation-slots) 와 그 클라 fetch 에는 어느 쪽에도 한도가 없다. '진행 중 vs 실패' 를 사용자에게 구분해 보여주는 기준 시각이 없다.
- 근거: src/lib/generation-job-timing.ts:9 · src/app/api/generation-jobs/[id]/route.ts:19 · src/app/api/artist/generate-sheet/route.ts:58 · src/app/api/artist/versions/route.ts:25 · src/app/api/writer/artist-complete/route.ts:19 · src/lib/writer/use-writer-status.ts:63 · src/hooks/use-artist-lock-poll.ts:12 · src/stores/artist-store.ts:359 (waitForWorldWideShot 30초) · src/lib/artist/style-versions-server.ts:34 (RESTORE_LEASE_MS)

### ART-14 · 중간 · 공급자 오류 · 코드 확인

**fal·내용 검사(Creem) 쪽 오류는 화면에서 실패로만 보이고, 자동 경로는 2번 실패하면 영구히 건너뛴다**

- 상황(언제): fal 접수가 5xx/통신 오류, Creem 검사 503, 같은 칸이 2회 실패(give-up), 우회(safe) 2회 실패(cap).
- 지금 일어나는 일: world-submit.ts/generate-sheet 는 fal 확정 거절(4xx) 만 예약을 닫고 그 외는 queued 로 남긴 뒤 throw → 라우트 500 → 화면 실패 기록. actor='auto' 는 countFailedJobsForTarget ≥ AUTO_GENERATION_GIVE_UP_THRESHOLD(2) 면 skipped(gave_up) → notifyGenerationGaveUp. missingDrawTargets 도 failCount ≥ 2 면 대상에서 뺀다. moderation 실패는 moderationRejectionResponse 로 400/503.
- 터지는 모습: fal 5xx: 화면은 HTTP 500 실패 배지, 서버엔 queued 예약이 request_id 없이 남아 10분 자리 점유. Creem 503: '내용 검사를 할 수 없어요' 토스트, 생성 없음. give-up: 자동 그리기가 그 칸을 조용히 건너뛰고 '자동 생성이 멈췄어요' 알림, 사람이 카드에서 직접 눌러야 함. safe cap: 우회 단추가 꺼짐.
- 이미 있는 방어: 거절 종류별 토스트가 공용 파일 하나로 통일돼 있다. give-up 은 사람의 명시적 재생성(ui/chat) 은 통과시켜 회복 경로가 있다. fal 실패 분류(src/lib/fal/failure-class.ts JobErrorClass) 로 moderation/infra/billing 을 가른다.
- 남은 구멍: fal 5xx 뒤 남는 queued 예약은 10분간 '그리는 중' 으로 세어져 재시도가 deduped 로 조용히 거절된다. give-up 임계 2회가 장애(infra 류) 실패와 내용(moderation) 실패를 구분하지 않아, DB 장애로 2번 실패한 칸은 장애가 끝나도 자동으로 다시 그려지지 않는다. 잔액(billing) 류 실패는 Artist 화면에서 별도 안내가 없다.
- 근거: src/lib/artist/world-submit.ts:128-137 (isDefiniteSubmitRejection 만 예약 닫음) · src/app/api/artist/generate-sheet/route.ts:430-446 (동일) · src/app/api/artist/generate-sheet/route.ts:132-146 (give-up 게이트) · src/app/api/artist/generate-world/route.ts:143-156 (give-up) · src/lib/artist/draw-continue.ts:33 (AUTO_DRAW_GIVE_UP_FAILS = 2) · src/stores/artist-store.ts:1322-1327 (skipped → notifyGenerationGaveUp) · src/lib/artist/safe-retry.ts:3 (SAFE_RETRY_CAP = 2) · src/lib/generation-quota-toast.ts (notifyModerationUnavailable·notifyContentPolicyBlocked)

### ART-15 · 중간 · 기타 · 코드 확인

**예전 잡 한 건에 모습 키가 없으면 상태 조회 전체가 500 이 되어 이어 그리기까지 멈춘다**

- 상황(언제): generation_jobs 에 target.appearanceKey 가 없는 queued character_view main 잡이 하나라도 있음(옛 데이터·수동 삽입·스키마 변경 전 행).
- 지금 일어나는 일: listQueuedMainJobs 는 appearanceKey 가 없는 행을 만나면 throw 하고, generation-status 라우트의 Promise.all 이 그 예외를 그대로 500 으로 돌려준다. 다른 네 조회 결과도 함께 버려진다.
- 터지는 모습: GET /api/artist/generation-status 가 매번 500 → 실패 배지·그리는 중 표시가 모두 사라지고, ART-03 으로 이어 그리기가 영원히 '기다림'.
- 이미 있는 방어: listCapacitySkips 만 .catch(() => ({})) 로 감싸 실패해도 조회를 막지 않는다. 10분 넘긴 잡은 freshQueued 로 걸러진다(오래된 잘못된 행은 10분 뒤 사라짐).
- 남은 구멍: 나머지 네 조회는 하나가 실패하면 전부 실패한다. 잘못된 행 1건을 건너뛰지 않고 전체를 던진다.
- 근거: src/lib/generation-jobs.ts:790-793 (throw new Error('queued character_view main job missing appearanceKey')) · src/app/api/artist/generation-status/route.ts:32-41 (Promise.all 전체가 한 번에 실패) · src/stores/artist-store.ts:1428 (!res.ok → return, 시각 미기록)

### ART-16 · 중간 · DB 부하 · 코드 확인

**재생성 중 5초마다 읽는 버전 기록 조회가 6개 표를 통째로 읽고 쓰기까지 할 수 있다**

- 상황(언제): [재생성하기] 뒤 그림을 그리는 동안 Artist 화면이 열려 있음(versionsNeedRefresh).
- 지금 일어나는 일: page.tsx setInterval 5초 → artist-version-store.refresh → GET /api/artist/versions → requireProjectAccess + readVersionProject + readLiveImages(readAllProjectRows 로 6표 1000줄 단위 끝까지) + readVersionRows + settleVersions(restoring 마크가 있으면 finishRestore 쓰기) + regenProgressFor(generation_jobs). refresh 에도 in-flight 가드가 없다.
- 터지는 모습: DB 가 느릴 때 5초마다 큰 읽기(인물·모습·후보·배경·배경 모습·배경 후보 전체 페이지 읽기) 가 겹쳐 쌓여 다른 요청을 더 느리게 한다. 조회 요청이 '끊긴 불러오기 마저 하기' 쓰기를 시작해 최대 300초를 점유할 수 있다.
- 이미 있는 방어: 끊긴 불러오기 마저 하기는 updated_at 비교로 한 창구만 맡고(busy), 시도 수 MAX_RESTORE_ATTEMPTS(3)·재시도 간격 60초로 제한된다. 폴링은 regen/restoring 중에만 켜진다.
- 남은 구멍: 진행률(k/N) 하나를 위해 전체 그림 목록을 매번 다시 읽는다. 가벼운 진행 전용 조회가 없다. 조회 요청이 쓰기(복원) 를 겸해 응답 시간이 예측되지 않는다. 겹침 가드가 없다.
- 근거: src/app/studio/artist/page.tsx:467-471 (setInterval 5000 → refresh) · src/stores/artist-version-store.ts:312-316 (refresh fetch, 가드 없음) · src/app/api/artist/versions/route.ts:25-37 (maxDuration 300, readLiveImages + settleVersions) · src/lib/artist/style-versions-server.ts:229-232 (readLiveImages 6표) · src/lib/artist/read-all-rows.ts:12-25 (1000줄 페이지 반복)

### ART-17 · 중간 · DB 부하 · 코드 확인

**Writer 진행 조회가 3분 멈춘 듯 보이면 열려 있는 화면마다 1분에 한 번 '다시 시작' 요청을 자동으로 보낸다**

- 상황(언제): DB 지연으로 writer_runs.last_timestamp 가 3분 넘게 갱신되지 않은 것처럼 보임(실제로는 진행 중일 수 있음). Artist 화면(useWriterStatus) 을 켜 둔 모든 사용자.
- 지금 일어나는 일: use-writer-status.ts tick 이 started && !completed && !failed && age ≥ 180초 && 마지막 keepalive 로부터 60초 지났으면 fetch('/api/writer/resume') 를 조용히 보낸다. 상태 응답 자체가 느려 age 계산이 늦은 시각 기준이면 더 쉽게 걸린다.
- 터지는 모습: 장애 중 /api/writer/resume POST 가 사용자 수 × 분당 1회로 추가 발생해 부하를 키우고, Writer 단계가 중복 재개될 위험(Writer 영역).
- 이미 있는 방어: 60초 쿨다운(entry.keepaliveAt), awaiting_confirmation/awaiting_artist 에는 보내지 않음, 같은 프로젝트 구독자는 요청 1개 공유.
- 남은 구멍: DB 지연으로 '멈춘 것처럼 보이는' 경우와 진짜 멈춤을 구분하지 않는다. 사용자 수만큼 곱해지는 자동 재개 요청에 전역 억제가 없다(서버 resume 의 멱등성은 Writer 조사자 영역).
- 근거: src/lib/writer/use-writer-status.ts:112-118 (age ≥ 180_000 && keepaliveAt 60_000 → POST /api/writer/resume) · src/app/studio/artist/page.tsx:134 (useWriterStatus 사용)

### ART-18 · 낮음 · 중복 제출 · 코드 확인

**사람이 누른 재생성은 1초 연타 방어가 있지만 채팅·자동 경로는 없고, 메모리 가드는 새로고침에 사라진다**

- 상황(언제): 채팅으로 '다시 그려' 를 빠르게 두 번, 혹은 새로고침 직후 같은 칸 다시 만들기, 재생성 루프와 [안 나온 그림 다시 그리기] 가 동시에 돎.
- 지금 일어나는 일: generateCharacterView 는 actor==='ui' 일 때만 claimAction(1초) 을 쓰고, 그 전에 generatingViews(메모리) 로 같은 칸을 막는다. 채팅('chat')·자동('auto') 은 claimAction 을 건너뛴다. 서버는 hasQueuedCharacterViewJob/hasQueuedWorldShotJob 으로 fresh queued 가 있으면 deduped 응답. redrawMissingImages 는 drawContinue.running 만 보고 regen 루프(artist-version-store) 는 보지 않지만, 둘 다 같은 generateCharacterView 를 쓰므로 generatingViews 가 같은 칸을 막는다.
- 터지는 모습: 대부분은 서버 dedupe(이미 queued) 로 조용히 '겹친 요청' 처리된다. 10분 넘은 queued 잡이 있으면(ART-07) 가드가 열려 두 번 발주될 수 있다.
- 이미 있는 방어: 3단 방어(claimAction → generatingViews → 서버 DB queued 가드) 와 자리 예약 트리거가 있어 정상 상태에서는 이중 발주가 거의 없다. 비용이 큰 fal 제출은 SDK 재시도를 끈다(retry:false).
- 남은 구멍: 서버 가드는 10분 지난 queued 를 무시하므로 finalize 지연 때 열린다(ART-07). 채팅·자동 경로의 연타는 메모리 가드에만 의존한다. 서버 dedupe 응답은 사용자에게 '이미 그리는 중' 이라고 말하지 않고 조용히 끝나 사용자가 다시 누른다.
- 근거: src/stores/artist-store.ts:1251-1261 (generatingViews 가드 + ui 만 claimAction) · src/stores/artist-store.ts:1646-1653 (배경 동일) · src/app/api/artist/generate-sheet/route.ts:151-153 (hasQueuedCharacterViewJob → deduped) · src/app/api/artist/generate-world/route.ts:107-109 (hasQueuedWorldShotJob → deduped) · src/stores/artist-store.ts:2098-2101 (redrawMissingImages. running 가드) · src/lib/action-guard.ts:13 (ACTION_GUARD_MS 1000)

### ART-19 · 낮음 · 화면 상태 · 코드 확인

**[완료하기] 는 중복·실패에 대해 방어가 충분하다**

- 상황(언제): [완료하기] 를 눌렀는데 응답이 늦거나 네트워크가 끊김, 다른 창에서 먼저 눌림.
- 지금 일어나는 일: artist-complete-dialog 는 busy 로 중복 클릭을 막고, 실패 코드별 안내 + 버전 관련 코드면 refresh. 서버는 그림 빠짐·버전 작업 중·디자인 미완을 409 로 거절하고, writer_runs 갱신을 updated_at 조건부로 3회 시도한다. Storyboard 열기(projects.current_stage) 는 멱등.
- 터지는 모습: 단추가 busy 로 잠기고 실패 시 '완료하지 못했어요' 토스트. 응답을 잃어도 다시 누르면 서버가 이미 연 상태(running) 분기로 ok 를 돌려줘 Storyboard 로 넘어간다.
- 이미 있는 방어: 충분함. 중복 클릭 잠금, 멱등한 stage 갱신, 서버 쪽 조건 검사, 실패 시 상태 재읽기.
- 남은 구멍: maxDuration 300 안에서 versionWorkPending 이 끊긴 불러오기를 마저 할 수 있어 응답이 길어질 수 있으나(사용자는 로더만 봄), 그 외 구멍은 작다. after() 의 triggerWriterStep 은 Writer 영역.
- 근거: src/features/artist-room/artist-complete-dialog.tsx:44-70 (busy·오류 처리) · src/app/api/writer/artist-complete/route.ts:36-57 (가드 409들) · src/app/api/writer/artist-complete/route.ts:79-93 (running/completed 면 openStoryboard 후 ok) · src/app/api/writer/artist-complete/route.ts:104-117 (조건부 갱신 + after(triggerWriterStep))

### ART-20 · 낮음 · 저장소 · 코드 확인

**카드 기록에서 그림 고르기·레퍼런스 올리기는 실패하면 반쪽 상태가 남을 수 있지만 영향은 작다**

- 상황(언제): select-candidate 가 첫 UPDATE(기존 선택 해제) 뒤 두 번째 UPDATE 나 portrait 자르기(storage) 에서 실패; breakdown-image 업로드가 느린 DB/storage 에서 끊김.
- 지금 일어나는 일: select-candidate 는 '해제 UPDATE → 선택 UPDATE → portrait 자르기 → 미러' 를 트랜잭션 없이 순차 실행한다(maxDuration 미지정). breakdown-image 는 sharp 재인코딩 후 Supabase storage 업로드, DB 행은 쓰지 않는다. 결과 저장(finalize) 의 storage 업로드는 공통 영역.
- 터지는 모습: 그 칸에 선택본이 0개인 상태로 남거나 대표 얼굴(portrait) 만 옛것으로 남는다. 레퍼런스 올리기는 그 줄만 실패 표시, [만들기] 는 업로드 중 막힌다.
- 이미 있는 방어: 다른 스타일 그림은 409(other_style) 로 거절하고 화면이 버전 기록을 다시 읽는다. portrait 실패는 시트 선택을 막지 않는다. 업로드 중 만들기 금지.
- 남은 구멍: 선택 교체가 원자적이지 않아 중간 실패 시 선택본 0개. 비-fal 공급자(gemini/tailscale) 의 persistImage 경로는 브라우저가 blob 을 받아 다시 올리는 구식 경로가 남아 있다(artist-store.ts:224-250). 현재 fal 기본이라 실사용은 거의 없음.
- 근거: src/app/api/artist/select-candidate/route.ts:85-99 (두 UPDATE 순차, 트랜잭션 없음) · src/app/api/artist/select-candidate/route.ts:13-16 (portrait 자르기 실패해도 시트는 바꿈. 최선) · src/app/api/artist/breakdown-image/route.ts:1-5 (storage 만, DB 행 없음) · src/features/artist-room/breakdown-list.tsx:91-92 (uploading 중 [만들기] 막음)

### ART-21 · 낮음 · AI 응답 형식 · 코드 확인

**Artist 채팅 명령은 LLM 답을 updates[] 로 파싱해 그대로 그림 요청으로 보낸다**

- 상황(언제): 글로벌 채팅에서 '다시 그려줘' 류 요청 → POST /api/artist/chat (LLM) → updates → applyUpdates.
- 지금 일어나는 일: 라우트가 parseFencedUpdates → validateUpdates 로 걸러 반환하고, 새 카드 만들기 명령은 버린다. 화면 applyUpdates 는 regenerateCharacter 면 views 별로 runAdaptivePool → generateCharacterView('chat'), 배경이면 generateWorldShot('chat'). 상세 파싱 실패 양상은 LLM 조사자(3-LlmTextCalls) 영역.
- 터지는 모습: LLM 출력 형식이 어긋나면 updates 가 비어 아무 일도 안 일어나거나(안내만), 검증을 통과한 명령은 바로 generateCharacterView('chat') 로 나가 자리를 쓴다. 채팅 라우트는 maxDuration 300 이라 응답이 오래 걸릴 수 있다.
- 이미 있는 방어: validateUpdates·countNewCardUpdates 로 잘못된/금지된 명령을 버린다. 그림 요청은 같은 generateCharacterView 를 타 generatingViews·서버 dedupe·자리 예약을 그대로 받는다.
- 남은 구멍: 채팅 경로는 claimAction 이 없어 연타 방어가 메모리 가드뿐이다(ART-18). LLM 출력 파싱 세부는 다른 조사자가 다룬다. 여기서는 연결만.
- 근거: src/app/api/artist/chat/route.ts:225 (maxDuration 300) · src/app/api/artist/chat/route.ts:231-315 (getUser → userOwnsProject → llmChat) · src/stores/artist-store.ts:2232-2250 (applyUpdates → generateCharacterView 'chat')

### ART-22 · 낮음 · 과금·Take · 코드 확인

**그림에는 Take 차감이 없어 과금 불일치는 fal 비용(이중 발주) 로만 나타난다**

- 상황(언제): ART-07/ART-05 의 재발주·유령 예약.
- 지금 일어나는 일: StyleMakeDialog 주석대로 그림은 Take 가 들지 않는다(Take 는 영상 전용). 그림 비용 통제는 자리 예약 트리거(동시 수) + give-up(2회) + 서버 dedupe 가 전부다. 환불·되돌림 개념이 없다.
- 터지는 모습: 사용자 크레딧(Take) 은 변하지 않고, 운영 fal 계정 비용만 2배로 나간다. 사용자는 알 수 없다.
- 이미 있는 방어: 예약 선행으로 '거절됐는데 과금' 은 막았다. fal SDK 재시도 off.
- 남은 구멍: 이중 발주를 사후에 감지·집계하는 수단이 없다(같은 칸에 10분 안 두 completed 잡). 운영 비용 이상을 알리는 경로가 Artist 에는 없다.
- 근거: src/features/artist-room/style-make-dialog.tsx:5 (그림은 Take 가 들지 않는다 주석) · src/lib/artist/world-submit.ts:85-86 (자리 예약이 먼저. 거절되면 돈이 안 나감) · src/app/api/generation-jobs/[id]/route.ts:132-139 (잡 삭제 시 releaseTakesForJob. 영상용)


## 4. Director · 스토리보드 (22건, 높음 3)

스토리보드 이미지, 영상 1개·일괄, 러프 스토리보드 펌프.

호출 흐름:

- [스토리보드 1장] ShotNode/그리드 카드/상세 → director-store.generateStoryboardImage → POST /api/director/generate-storyboard (DB: projects·shots·scenes·character_appearances 조회, LLM deriveEnBatch, Creem 모더레이션, 스트립 PNG 합성→Supabase storage 업로드, reserveGenerationJob RPC, fal 제출) → 응답 jobId → pollGenerationJob 3초 간격 GET /api/generation-jobs/[id] (매 틱 getUser+userOwnsProject+reconcileJobFromFal→fal 조회) → 완료 시 invalidateShots + hydrateFromDb(Supabase scenes/shots + GET /api/director/video-takes)
- [스토리보드 일괄] 툴바 '이미지 만들기'/채팅 generateImage → real-batch-client.runRealBatch → 라운드마다 POST /api/director/generate-storyboard-batch (maxDuration 300; shots·generation_jobs·characters·character_appearances 조회, 시트 2장: 러프 합성→storage 업로드, 모더레이션, reserveGenerationJob, fal 제출) → 응답 submitted/inProgress/remaining → 잡마다 순차 60×5초 GET /api/generation-jobs/[id] → 시트 끝날 때마다 invalidateShots+hydrateFromDb → remaining>0 이면 다음 라운드(최대 200) ; 건너뛴 샷은 waitForPrerequisite(브라우저→Supabase 10초 폴링, 20분) 뒤 자동 재실행
- [스토리보드 버전 고르기] director-store.selectStoryboardImageVersion → POST /api/director/storyboard-image/version → shots.storyboard_image 갱신
- [영상 1개] ShotNode/VideoNode/상세/채팅 remakeShotVideo → director-store.generateVideoForShot → regenerateVideo → POST /api/director/generate-video (maxDuration 300; prepareVideoRequest: getUser, 소유·예산·한도 검사, shots/video_clips/characters 조회, deriveEnBatch LLM, Creem 모더레이션 → submitPreparedVideo: reserve_director_video_take RPC → holdTakesForVideoJob → fal 제출 → attachProviderRequest) → 5초 간격 GET /api/generation-jobs/[id] 최대 10분 → 완료 시 hydrateFromDb → video-adherence 캡처 POST /api/director/video-adherence(관리자만)
- [영상 일괄 시작] 툴바/채팅 startChatVideos → video-batch-client.runVideoBatch → buildVideoBatchInputs(캔버스 스냅샷) → POST /api/director/video-batches (샷마다 prepareDirectorVideoSubmission 순차 → create_director_video_batch RPC → after(): continueVideoBatch) → 2.5초 간격 GET /api/director/video-batches?batchId (director_video_batches+items+generation_jobs) → 새 잡/완료 보일 때마다 hydrateFromDb
- [영상 일괄 이어가기(서버)] continueVideoBatch ← (a) POST 응답 뒤 after(), (b) fal webhook finalize 저장 뒤, (c) /api/cron/video-batches 2분마다 recoverVideoBatches → claim_director_video_batch RPC(5분 임대) → pending 항목 최대 3개/120초: reserve_director_video_batch_item RPC → hold → fal 제출 → items 갱신 → pending·active 0 이면 completed
- [영상 일괄 복구(cron)] GET /api/cron/video-batches (CRON_SECRET) → running 배치 + queued shot_video 전수 조회 → 배치 50개까지 잡마다 getGenerationJobById + (reserved: 이고 recoveryReceipt 있으면 submitPreparedDirectorVideo 재접수) + reconcileJobFromFal(fal) → continueVideoBatch → updated_at 갱신
- [영상 일괄 화면 복귀] director page visibilitychange → restoreVideoBatch → GET /api/director/video-batches?projectId (running 전부 + 최근 20개 각각 items/jobs 조회) → active 배치 1개에 pollVideoBatch 재부착
- [영상 일괄 멈춤/순서] [모두 멈추기] → DELETE /api/director/video-batches → cancelVideoBatch → 클라 다음 조회에서 cancelled 보고 cancelRunningJobs ; [먼저 하기] → PATCH /api/director/video-batches → moveVideoBatchShotFirst(position 만)
- [멈추기] 카드/노드/[모두 멈추기] → director-store.cancelRunningJobs → POST /api/director/jobs/cancel → cancel_director_jobs RPC(director_job_cancellations 기록, fal 취소 없음, Take 환불 없음) → closeVideoBatchesLeftStopped → markJobsCancelled + refreshGenerationQueue
- [진행 큐(공통)] useActiveGenerationJobs → 4초(활성)/15초(유휴) GET /api/generation/active → 큐 축소 시 useQueueRehydrate: invalidateShots + hydrateFromDb + writer refreshShotMedia
- [previz 영상] writer-store → POST /api/director/generate-previz-video (maxDuration 60; createGenerationJob reserved: → holdTakes → fal 제출 → request_id 교체 → shots.previz_video 낙관 기록) → webhook
- [Director 채팅] global-chat-store → POST /api/director/chat (llmChat, 다른 조사자) → updates 실행: generateImage → runRealBatch/generateStoryboardImage, 영상 → startChatVideos → runVideoBatch/remakeShotVideo
- [러프 스토리보드 펌프] rough-storyboard-view generateAllMissing/drawShots → runRoughPump → 라운드마다 POST /api/writer/rough-storyboard (maxDuration 60; shots·scenes·locations·characters·generation_jobs(queued/failed)·shot design 7개 병렬 조회, location_appearances, force 시 reconcileJobFromFal ≤4, deriveEnBatch 8종+ensureEntityNamesEn LLM, 블록아웃 PNG 렌더→storage 업로드, Creem 모더레이션, reserve_rough_storyboard_grid RPC → fal 제출 ×2, 관측 이벤트 DB 쓰기 4회) → 잡마다 convergeJob: pollGenerationJob 3초(≤10분) → 리로드 ≤40회(invalidateShots+loadProject) → 라운드 배리어 → 다음 라운드(≤20)
- [러프 한 장 고치기] directing-arrow-editor/rough-frames-still/storyboard-shot-dialog → POST /api/writer/rough-directing-edit {separate|save|regenerate-end|regenerate-frame} (maxDuration 120) → directing-edit.generateReservedImage: reserveGenerationJob → fal Grok i2i 제출(webhook 없음) → 1초 간격 90초 서버 폴링 → 결과 다운로드 → storage 업로드 → shots.rough_storyboard 갱신
- [기타] POST /api/director/generate-shots (llmJSON, 소유 확인 없음, 호출부 없음) ; GET /api/director/generate-video/[taskId] (reconcileJobFromFal, 호출부 없음)

구조적 약점: ① 진행 확인이 전부 브라우저 폴링(배치 2.5초·이미지 3초·큐 4초·영상 5초·실사 러너 5초)이고 /api/generation-jobs/[id] 는 매 틱 getUser+소유 확인+fal reconcile 을 하므로 사용자 수×잡 수로 DB·fal 요청이 증폭된다(2026-11-23 '한 인스턴스 동시 요청 187개'의 Director 쪽 원천). 같은 잡을 pollGenerationJob·실사 러너·큐 훅이 각자 묻고, 완료 1건에 hydrateFromDb 가 2~3번 돈다. ② '예약 보존 약속'(reserved: 잡을 자동 회수하지 않음) × 시간 제한 없는 영상 busy 트리거 × 10분 뒤 active 목록 제외([멈추기] 사라짐)가 겹쳐, 예약·Take 차감 뒤 함수가 한 번 끊기면 샷이 영구 잠기고 Take 가 묶이는데 사용자 탈출구가 없다. ③ 폴링 실패 정책이 경로마다 다르다. 영상은 HTTP 오류 1회로 '실패', 스토리보드는 '확인 중' 유지, 러프는 재확인 뒤 판단, 실사 러너는 무시. 같은 DB 지연에 화면이 서로 다른 거짓말을 한다. ④ 이어가기 책임의 비대칭. 영상 일괄만 서버(after/webhook/cron)가 잇고, 실사 일괄·러프 펌프는 브라우저가 라운드를 돌려야 하며 러프 라우트는 60초 예산 없이 LLM·모더레이션·PNG 렌더·fal 제출을 한 요청에 담아 504 한 번에 펌프가 멈춘다.

### DIR-V-01 · 높음 · 폴링 · 코드 확인

**영상 상태 조회가 한 번만 실패해도 화면이 '실패'로 굳는다**

- 상황(언제): 영상 1개 생성 중 /api/generation-jobs/[id] 가 504(DB 느림)·401(세션 만료)·500 을 한 번 돌려준다
- 지금 일어나는 일: 폴링 루프가 `if (!pollResponse.ok) throw` 로 바로 던지고 catch 가 lastAttemptStatus/status 를 failed 로 쓴다. 재시도·백오프·불확실 처리가 없다. 스토리보드 경로(markUncertain)와 정책이 다르다
- 터지는 모습: 영상 카드가 즉시 '실패'로 바뀌고 Take 는 이미 차감됨. 서버는 계속 만들고 있어 나중에 완료되지만 화면은 사용자가 다시 만들기를 눌러 409 '이미 만드는 중' 을 받아야 복원된다
- 이미 있는 방어: 재시도 시 서버가 director_video_shot_busy(409)를 돌려주고 클라가 hydrateFreshFromDb 로 원상 복구. useQueueRehydrate 가 큐 축소 시 DB 진실로 재수화
- 남은 구멍: 조회 오류와 생성 실패를 구별하지 않는다. 사용자가 손대지 않으면 '실패' 표시가 완료까지 남고, 2026-11-23 처럼 조회가 연쇄 실패하면 모든 영상 카드가 실패로 보인다
- 근거: src/stores/director-store.ts:5062-5064 · src/stores/director-store.ts:5154-5178 · src/stores/director-store.ts:4974-4989 (409 busy → hydrateFreshFromDb 복원) · src/stores/director-store.ts:4356-4362 (스토리보드는 markUncertain)

### DIR-V-02 · 높음 · 웹훅·저장 · 코드 확인

**영상 예약·Take 차감 뒤 fal 제출 전에 서버가 끊기면 샷이 영구히 잠기고 Take 가 묶인다**

- 상황(언제): generate-video 처리 중 reserve RPC + holdTakes 까지 끝난 뒤 fal 제출 전에 함수가 죽는다(DB 지연으로 300초 초과, 배포 교체, 예외)
- 지금 일어나는 일: request_id='reserved:<id>' 잡은 reconcile·ghost sweep 이 보존하고(예약 보존 약속), 영상 busy 트리거는 queued 이고 취소 안 된 잡을 시간 제한 없이 busy 로 본다. 반면 active 목록은 10분 넘은 잡을 빼서 멈추기 UI 가 사라진다
- 터지는 모습: 그 샷은 이후 영상 요청마다 '이미 만드는 중'(409)이고, Take hold 는 돌아오지 않으며, 10분 뒤에는 화면 [멈추기] 버튼도 사라져 사용자가 풀 방법이 없다
- 이미 있는 방어: 모호한 제출 응답은 recordAmbiguousVideoSubmission + recoveryReceipt 로 재접수 가능. jobs/cancel 로 10분 안에는 멈출 수 있음. generate-video maxDuration 300
- 남은 구멍: 함수 kill 처럼 응답 자체가 없는 경우의 reserved 좀비 회수 경로가 없고, 10분 뒤에는 수동 탈출도 불가. Take 환불 경로 없음
- 근거: src/lib/director/video-submit.ts:1011-1041 (reserve→hold) · src/lib/director/video-submit.ts:1123-1127 (그 뒤 fal 제출) · src/lib/fal/reconcile.ts:112-116 · supabase/migrations/20261114100000_director_job_cancellations.sql:139-154 · src/lib/generation-jobs.ts:684-691

### DIR-V-03 · 중간 · 시간 한도 · 코드 확인

**영상 폴링 10분 상한을 넘기면 화면은 '오래 걸림' 실패인데 서버는 계속 만든다**

- 상황(언제): fal 큐 밀림·DB 지연으로 영상 1개가 10분(VIDEO_POLL_TIMEOUT_MS=STALE_QUEUED_MS) 안에 끝나지 않는다
- 지금 일어나는 일: 폴링 루프가 시간 초과 시 throw → catch 가 failed 로 기록. 서버 ghost sweep 은 10분 넘은 잡만 fal 에 다시 묻는다
- 터지는 모습: 카드가 '영상이 예상보다 오래 걸립니다' 실패 표시, 다시 만들기 누르면 409 '이미 만드는 중'. 2026-11-23 처럼 finalize 가 25~31분 뒤에 끝나는 구간이면 그 사이 화면은 실패
- 이미 있는 방어: 클라·서버 상한을 같은 상수로 맞춤(#poll-timeout-align). 완료되면 useQueueRehydrate 가 DB 진실로 재수화
- 남은 구멍: 모델별 실제 소요(큐 대기 포함)가 10분을 넘는 경우에 대한 '아직 만드는 중' 표시 없음. 시간 초과와 진짜 실패를 같은 failed 로 기록
- 근거: src/stores/director-store.ts:571-575 · src/stores/director-store.ts:5062, 5153 · src/lib/generation-job-timing.ts:9

### DIR-V-04 · 중간 · 시간 한도 · 코드 확인

**영상 요청이 서버에서 최대 5분 매달려도 화면은 아무 반응이 없다**

- 상황(언제): generate-video 준비(LLM 번역·Creem 모더레이션·DB 조회 다수)가 DB·외부 지연으로 수십 초~수 분 걸린다
- 지금 일어나는 일: 클라 fetch 에 타임아웃이 없고 서버 maxDuration 이 300 이라 요청이 5분까지 걸린다. generationLock 이 요청 전 구간을 잠근다
- 터지는 모습: 버튼을 눌렀는데 카드만 '만드는 중'이고 몇 분간 변화 없음, 그 샷의 다른 영상 조작도 막힘. 2026-11-23 '배경 그리기 60초 초과'와 같은 양상
- 이미 있는 방어: 락으로 중복 제출 방지, 응답 유실 시 recoveryReceipt 로 최대 3회 재시도(canRecoverGenerationAttempt)
- 남은 구멍: 진행 단계 안내·클라 타임아웃 없음. 504 뒤 재시도하면 DIR-V-02 로 이어질 수 있다
- 근거: src/stores/director-store.ts:4916-4931 · src/stores/director-store.ts:4600-4602 · src/lib/director/video-submit.ts:703, 888 · src/app/api/director/generate-video/route.ts:3

### DIR-V-05 · 중간 · 화면 상태 · 코드 확인

**영상을 [멈추기]한 직후 '다시 만들기'가 조용히 무시된다**

- 상황(언제): 만드는 중인 영상 카드에서 [멈추기]를 누른 뒤 바로 같은 샷의 영상 다시 만들기를 누른다
- 지금 일어나는 일: 폴링 루프가 cancelledAt/stoppedJobIds 를 보지 않아 멈춘 뒤에도 계속 돌며 generationLock 을 유지. generateVideoForShot 은 락 실패 시 null 을 돌려주고 ShotNode 는 void 로 버린다. 서버는 멈춘 잡을 busy 에서 빼 새 요청을 받을 준비가 되어 있다
- 터지는 모습: 아무 일도 일어나지 않고 안내도 없다. 최대 10분(이전 폴링이 끝날 때까지) 뒤에야 눌린다
- 이미 있는 방어: 서버 트리거는 cancelled 잡을 busy 로 보지 않음(오너 7번 약속)
- 남은 구멍: 클라 락·폴링이 멈춤을 모름. 사용자 피드백 없음
- 근거: src/stores/director-store.ts:4600-4602 · src/stores/director-store.ts:5062-5152 (cancelledAt 검사 없음) · src/features/director/canvas-nodes/ShotNode.tsx:164 · supabase/migrations/20261114100000_director_job_cancellations.sql:143

### DIR-V-06 · 낮음 · 자리(정원) · 코드 확인

**멈춘 영상은 끝날 때까지 내 동시 자리(3개)를 차지해 다음 영상이 '자리 부족'으로 거절될 수 있다**

- 상황(언제): 영상 2~3개를 멈추고 바로 새 영상을 만든다
- 지금 일어나는 일: fal 에는 취소가 없어 멈춘 잡이 끝까지 돌고 동시 생성 자리도 끝날 때까지 점유한다(설계 주석). 멈춤 표(director_job_cancellations)는 busy 와 투영만 바꾼다
- 터지는 모습: '내 영상 동시 한도' 429 로 거절되고 몇 분 뒤에야 가능. 멈춘 영상 Take 는 환불되지 않음(의도된 정책)
- 이미 있는 방어: stopNotice 가 'Take 는 돌려드리지 않는다'고 안내, 넘기기 창이 자리 부족 까닭을 표시
- 남은 구멍: 멈춤 뒤 자리 부족이 왜 나는지 연결 안내 없음. 방어는 대체로 충분
- 근거: src/lib/director/job-cancellations.ts:1-3 · src/lib/director/stop-work.ts:2-3, 33-35 · src/stores/director-store.ts:5029-5030 (lastVideoLimitRefusal)

### DIR-B-01 · 중간 · 시간 한도 · 코드 확인

**영상 일괄 시작 요청이 샷마다 LLM·모더레이션을 순차로 돌려 100샷이면 300초를 넘길 수 있다**

- 상황(언제): 샷이 많은 프로젝트에서 '영상 모두 만들기'
- 지금 일어나는 일: video-batches POST 가 items(≤100)마다 prepareDirectorVideoSubmission(DB 조회 다수 + deriveEnBatch LLM + Creem 모더레이션)을 await 로 순차 실행하고 createVideoBatch 는 맨 마지막. 클라는 POST 실패 시 같은 id GET 으로만 복구하는데 배치가 없다
- 터지는 모습: POST 가 504 로 끊기고 배치가 만들어지지 않아 '영상 일괄 생성 실패' 토스트. 번역·모더레이션 비용은 이미 소모됨. 사용자가 다시 누르면 처음부터
- 이미 있는 방어: 재제출 없이 GET 복구(#batch-resume), 중간 kill 시 DB 잔재 없음(생성이 마지막), 설계 메모 60초 캐시(designsOfRun)
- 남은 구멍: 준비 단계에 시간 예산·부분 생성 없음. 샷 수 상한(100)과 maxDuration(300)이 맞지 않는다
- 근거: src/app/api/director/video-batches/route.ts:18, 92-110 · src/lib/director/video-submit.ts:703, 888 · src/lib/director/video-batch-client.ts:214-245

### DIR-B-02 · 낮음 · 자리(정원) · 코드 확인

**배치 이어가기 임대를 쥔 서버 실행이 죽으면 최대 5분간 아무도 다음 영상을 못 낸다**

- 상황(언제): POST 뒤 after()·webhook 뒤·cron 의 continueVideoBatch 가 임대를 받은 채 함수 수명 초과로 끊긴다
- 지금 일어나는 일: claim_director_video_batch 가 5분 임대를 주고, 정상 종료면 finally 가 해제하지만 kill 되면 해제 못 함. 이어가기 3주체 모두 임대 만료까지 claim 실패
- 터지는 모습: 진행 표시가 멈추고 다음 영상이 최대 5분 뒤에야 나간다. 사용자는 '왜 안 나가지' 상태
- 이미 있는 방어: 임대 만료 후 자동 재개, 항목마다 임대 재확인, 120초/3개 상한
- 남은 구멍: 임대 길이(5분)와 실행 상한(120초+제출)이 느슨하게 맞춰져 있어 kill 시 공백이 길다
- 근거: src/lib/director/batch-continue.ts:20-24, 47-49, 169-175 · supabase/migrations/20260909110000_director_video_batches.sql:202-217 · src/app/api/director/video-batches/route.ts:48-58

### DIR-B-03 · 중간 · DB 부하 · 추정

**2분 cron 이 모든 사용자의 배치 잡을 fal 에 다시 묻고 DB 를 갱신하며, 실행이 겹치는 것을 막지 않는다**

- 상황(언제): running 배치·queued 영상 잡이 많거나 DB 가 느린 상태에서 cron 이 돈다
- 지금 일어나는 일: recoverVideoBatches 가 running 배치 + queued shot_video 전수 조회 → 배치 50개까지 잡마다 getGenerationJobById + reconcileJobFromFal(fal HTTP) → continueVideoBatch → updated_at 갱신. maxDuration 300 > 주기 120초
- 터지는 모습: cron 한 번이 수 분 걸려 다음 회차와 겹치고, 장애 구간에서 DB·fal 부하를 더한다. CRON_SECRET 미설정이면 401 로 복구가 전혀 안 돌아도 알 수 없다
- 이미 있는 방어: 배치 50개 상한(updated_at 오름차순), claim RPC 로 이어가기 중복 방지, 실패는 로그만
- 남은 구멍: 겹침 방지(락·skip) 없음, 배치당 잡 수 상한 없음, cron 자체의 시간 예산 없음. Vercel cron 중복 실행 여부는 추정
- 근거: src/lib/director/batch-recovery.ts:26-33, 55-105, 107-119 · vercel.json:18-20 · src/app/api/cron/video-batches/route.ts:5, 10-12

### DIR-B-04 · 중간 · 폴링 · 코드 확인

**배치 진행 중 화면이 2.5초마다 5쿼리짜리 조회를 하고 완료마다 재수화를 2~3번 돈다**

- 상황(언제): 영상 일괄이 돌고 있는 Director 화면(여러 사용자면 곱으로)
- 지금 일어나는 일: pollVideoBatch 가 2.5초 sleep 뒤 GET(getUser+userOwnsProject+batches+items+jobs). 새 잡 보이면 hydrateFromDb, 완료면 invalidateShots+hydrateFromDb. 같은 완료를 useQueueRehydrate(4초 active 폴링)도 hydrateFromDb+refreshShotMedia 로 반영. 간격 고정·백오프 없음
- 터지는 모습: DB 느릴 때 조회가 쌓이고, 완료 1건에 shots/scenes/video_takes 전체 재조회가 여러 번. 2026-11-23 '단순 상태 조회 1.2~2.4초'와 결합하면 화면이 계속 새 요청을 붙인다
- 이미 있는 방어: GET 실패는 재제출 없이 다음 조회, ownsRun 으로 옛 실행 결과 폐기, 순차 폴링(겹치지 않음)
- 남은 구멍: 응답 지연 시 간격을 늘리지 않음, 재수화 중복 제거 없음
- 근거: src/lib/director/video-batch-client.ts:21, 160-170, 174-194 · src/lib/director/batch-store.ts:54-67 · src/features/director/hooks/use-queue-rehydrate.ts:120-130 · src/lib/generation-queue.ts:38-39

### DIR-B-05 · 낮음 · 과금·Take · 코드 확인

**Take 부족·권한 거절로 배치가 멈춰도 화면은 'N/M 완료' 성공 토스트만 보인다**

- 상황(언제): 배치 도중 Take 잔액이 부족해지거나(402) 401/403 으로 제출이 거절된다
- 지금 일어나는 일: 클라는 global_at_capacity 만 notifyQuotaExceeded 로 안내하고 다른 paused 사유는 분기가 없다
- 터지는 모습: 서버는 배치를 paused(insufficient_takes/submission_forbidden)로 두고 남은 샷은 pending 인데, 화면은 '5/12 videos generated' 성공 토스트와 Lumi 카드만 띄우고 이유를 말하지 않는다
- 이미 있는 방어: stopReason 이 DB 에 남고 done<total 숫자로 눈치챌 수 있음. 사전 Take 계산(limit)으로 대부분 예방
- 남은 구멍: insufficient_takes 안내 없음. 시작 후 다른 곳에서 Take 를 쓰면 사전 계산과 어긋난다
- 근거: src/lib/director/video-batch-client.ts:262-291 · src/lib/director/batch-continue.ts:125-134

### DIR-B-06 · 낮음 · 화면 상태 · 코드 확인

**탭을 떠나거나 새로고침해도 영상 배치는 서버가 이어가고 화면은 복귀 시 다시 붙는다. 방어 충분**

- 상황(언제): 배치 진행 중 새로고침·탭 이동·브라우저 종료
- 지금 일어나는 일: 서버가 고정 목록을 소유하고 클라는 읽기만. visibilitychange 마다 GET 1회로 복원, videoBatchBusy 면 중복 복원 안 함
- 터지는 모습: 진행은 계속되고(after/webhook/cron), 돌아오면 restoreVideoBatch 가 active 배치에 진행 표시를 다시 붙인다. 백그라운드 탭에서는 브라우저 타이머 제한으로 조회가 늦어질 수 있음
- 이미 있는 방어: 서버 소유 배치 + 3주체 이어가기 + 복귀 복원
- 남은 구멍: restore 는 active 배치 중 첫 번째만 붙인다(배치 2개 동시 running 은 설계상 없음). 백그라운드 탭 타이머 제한은 추정
- 근거: src/lib/director/video-batch-client.ts:322-366 · src/app/studio/director/page.tsx:1602-1611 · src/lib/director/batch-store.ts:79-89

### DIR-B-07 · 낮음 · 중복 제출 · 코드 확인

**[모두 멈추기]와 서버의 다음 영상 내기가 엇갈려도 막 낸 영상은 다음 조회에서 멈춘다. 방어 충분**

- 상황(언제): 배치 멈추기(DELETE)를 누르는 순간 after()/webhook/cron 이 다음 영상을 내는 중
- 지금 일어나는 일: continue 루프는 항목마다 status 재확인, reserve RPC 는 배치 행을 FOR UPDATE 로 잠가 cancelled 면 거절. 클라는 cancelled 요약을 보면 stopStartedVideos 로 queued 잡을 jobs/cancel 에 넘긴다
- 터지는 모습: 막 나간 영상이 잠깐 '만드는 중'으로 보인 뒤 다음 조회에서 멈춤 처리. 그 영상의 Take 는 차감됨
- 이미 있는 방어: RPC 잠금 + 클라 후속 멈춤
- 남은 구멍: reserve 통과 직후 cancel 이면 그 영상 Take 는 소비됨(정책상 환불 없음)
- 근거: src/lib/director/batch-continue.ts:52-58 · src/lib/director/video-batch-client.ts:119-131 · supabase/migrations/20260909110000_director_video_batches.sql:225-242

### DIR-S-01 · 중간 · 화면 상태 · 코드 확인

**스토리보드 1장 요청이 '확인 중'에 걸리면 사용자가 재시도할 길이 없고 DB 가 바뀌어야만 풀린다**

- 상황(언제): generate-storyboard 응답 유실, 폴링 HTTP 오류, 10분 시간 초과, 또는 그리드 잡 replay 뒤 샷 그림 확인 실패
- 지금 일어나는 일: definitivelyFailed 가 아니면 markUncertain 이 노드를 generating 으로 유지. 재클릭은 generating 이면 deduped. 해제는 useQueueRehydrate 가 DB storyboard_image 로 덮을 때만
- 터지는 모습: 카드가 '이미지 요청을 확인 중' 스피너로 남고, 다시 누르면 status==='generating' 으로 조용히 무시. 잡이 reserved 좀비이거나 finalize 가 shots 를 못 쓰면 영원히 스피너
- 이미 있는 방어: [멈추기](cancelRunningJobs)가 generating 을 내림(4523-4536). 단 active 목록(10분 이내)에 있을 때만. 큐 축소 시 자동 재수화
- 남은 구멍: 10분 뒤 DB 가 바뀌지 않으면 자동 해제 경로 없음. '확인 중'에서 수동 재시도 불가
- 근거: src/stores/director-store.ts:4171-4174, 4214-4220 · src/stores/director-store.ts:4356-4362 · src/stores/director-store.ts:4328-4341 (replay 확인) · src/lib/generation-jobs-client.ts:72-83

### DIR-S-02 · 중간 · 폴링 · 코드 확인

**실사 일괄은 브라우저가 라운드를 돌려야 끝나고, 잡 하나에 5분씩 순차로 기다린다**

- 상황(언제): 시트가 많은 프로젝트에서 '이미지 모두 만들기' 뒤 탭을 닫거나, 한 시트가 5분 넘게 걸린다
- 지금 일어나는 일: runRealBatchOnce 가 라운드(≤200)마다 POST 하고 서버는 2장만 제출, 러너가 잡마다 60×5초 GET 을 순차로 기다린 뒤 다음 라운드. 재진입은 멱등(빈칸만)+runId 로 같은 판 중복 방지
- 터지는 모습: 탭을 닫으면 아직 안 낸 샷은 나가지 않는다(영상 일괄과 달리 서버 이어가기 없음). 한 시트가 5분을 넘기면 러너는 다음으로 넘어가고 그 시트는 큐 표시만 남는다. 수십 장이면 수십 분 탭을 열어둬야 한다
- 이미 있는 방어: runId 로 같은 판 중복 방지, inProgress 로 다른 탭 작업 대기, 5xx 2회 재시도, 멈춘 잡은 기다리지 않음
- 남은 구멍: 서버측 이어가기 부재, 5분 대기 뒤 결과를 세지 않아 요약 수가 틀어질 수 있음
- 근거: src/lib/director/real-batch-client.ts:107-112, 322-323, 334-357 · src/app/api/director/generate-storyboard-batch/route.ts:52, 155-178

### DIR-S-03 · 낮음 · 공급자 오류 · 코드 확인

**일괄 두 번째 시트가 fal 에서 확정 거절되면 첫 시트를 냈어도 라운드 전체가 500 으로 보인다**

- 상황(언제): 한 라운드 2시트 중 뒤 시트의 fal 제출이 4xx(모델 거절·입력 오류)
- 지금 일어나는 일: 라우트가 확정 거절에서 `throw err` 로 빠져 submitted 를 응답에 담지 못한다
- 터지는 모습: 클라는 5xx 로 보고 최대 2회 재시도 → 같은 4xx 가 반복되면 판이 멈춘다. 첫 시트는 다음 라운드의 busy/inProgress 로 다시 보인다
- 이미 있는 방어: busyJobByShot·runId 로 다음 라운드가 첫 시트를 복구, 거절된 예약은 닫음
- 남은 구멍: 부분 성공을 부분 성공으로 응답하지 않음
- 근거: src/app/api/director/generate-storyboard-batch/route.ts:594-611, 616-620 · src/lib/director/real-batch-client.ts:299-307

### DIR-S-04 · 중간 · 폴링 · 코드 확인

**같은 이미지 잡을 러너·단건 폴링·큐 훅이 각자 묻고 매 조회가 fal 까지 간다**

- 상황(언제): 일괄 진행 중 같은 샷을 단건으로도 누르거나(replay), '영상까지 이어서' 를 켠다
- 지금 일어나는 일: pollGenerationJob 은 jobId 당 1루프로 합치지만 실사 러너는 직접 fetch 루프를 쓴다. 라우트는 queued 면 reconcileJobFromFal
- 터지는 모습: 같은 잡에 3초(pollGenerationJob)+5초(러너)+4초(큐) 조회가 동시에 붙고, /api/generation-jobs/[id] 는 매 틱 fal reconcile 을 한다
- 이미 있는 방어: inFlightPolls(단건 경로만), 큐 폴링은 프로젝트 단위 1개
- 남은 구멍: 러너 루프가 공유 폴러를 쓰지 않음
- 근거: src/lib/director/real-batch-client.ts:337-341 · src/lib/generation-jobs-client.ts:48-56 · src/app/api/generation-jobs/[id]/route.ts:60-66

### WRT-R-01 · 높음 · 시간 한도 · 코드 확인

**러프 한 라운드가 60초 안에 번역·모더레이션·PNG 렌더·fal 제출 2건을 다 끝내야 하고, 넘기면 펌프가 멈춘다**

- 상황(언제): DB 가 느리거나(쿼리당 1~2초) LLM 번역이 지연된 상태에서 러프 전체 그리기/다시 그리기
- 지금 일어나는 일: maxDuration 60 안에 7개 병렬 조회 + deriveEnBatch 8종 + ensureEntityNamesEn(LLM·DB 쓰기) + 블록아웃 PNG 렌더/업로드 + Creem 모더레이션 + reserve RPC + fal 제출×2 + 관측 이벤트 DB 쓰기 4회. 클라 generate 는 !res.ok 면 throw→null, runRoughPump 는 null 이면 request_failed
- 터지는 모습: 504 → '러프 생성 요청 실패' 토스트 → 펌프 종료(자동 재시도 없음). 예약 뒤 끊겼으면 그 샷은 10분간 '이전 요청 확인 중'으로 막힌다
- 이미 있는 방어: STALE_QUEUED_MS 뒤 in_flight 제외, force 재생성 시 reconcile ≤4, confirmationPending 안내, 라운드 2장 캡
- 남은 구멍: 라운드 시간 예산 없음, 5xx/504 재시도 없음(실사 러너와 다름), 서버 이어가기 없음
- 근거: src/app/api/writer/rough-storyboard/route.ts:52, 481-535, 605-616, 660-690 · src/lib/writer/rough-submit.ts:34-40, 70-75 · src/features/writer/rough-storyboard-view.tsx:398-400, 617-630 · src/lib/writer/rough-pump-client.ts:46-50 · src/app/api/writer/rough-storyboard/route.ts:288-296 (in_flight 10분)

### WRT-R-02 · 중간 · 폴링 · 코드 확인

**러프 라운드 배리어가 잡당 최대 10분 폴링 + 40회 전체 재로딩이라 DB 를 두드리고 탭을 떠나면 끊긴다**

- 상황(언제): 러프 잡이 느리게 끝나거나 폴링이 한 번 실패한 뒤 완료 확인이 늦어진다
- 지금 일어나는 일: convergeJob = pollGenerationJob(3초, ≤10분) → 실패면 상태 1회 재확인 → invalidateShots+loadProject 를 2초/10초 간격으로 최대 40회
- 터지는 모습: 라운드 하나가 10~17분까지 늘어지고, 그 사이 loadProject(프로젝트 전체 재조회)가 10초마다 반복. 탭을 떠나면 isAborted 로 멈추고 남은 샷은 안 그려진다
- 이미 있는 방어: 큐(queuedRoughIds)가 로컬 상태를 이겨 복귀 시 진행 표시 복원, 상한으로 스피너 영구 방지
- 남은 구멍: 재확인이 전체 프로젝트 로딩, 간격 고정, 서버 이어가기 없음
- 근거: src/features/writer/rough-storyboard-view.tsx:550-595 · src/features/writer/rough-storyboard-view.tsx:138 · src/lib/writer/rough-pump-client.ts:46-55 · src/features/writer/rough-storyboard-view.tsx:702-708

### WRT-R-03 · 중간 · 시간 한도 · 코드 확인

**러프 한 장 고치기(Grok 동기 호출)가 90초를 넘기면 자리를 점유한 유령 잡이 남고 사용자는 500 을 본다**

- 상황(언제): 화살표 분리/한 장 다시 그리기에서 fal Grok i2i 가 90초 안에 끝나지 않거나 결과 다운로드가 느리다
- 지금 일어나는 일: generateReservedImage 가 timeoutError 를 던질 때 completeGenerationJob/failGenerationJob 을 부르지 않고, 제출에 webhookUrl 이 없다. 라우트 maxDuration 120 > 90 이라 함수는 살지만 정리가 없다. context 에 userId/workspaceId 가 없어 개인 축 집계와 어긋날 수 있음
- 터지는 모습: '약 30초' 안내 뒤 실패 토스트, 잡은 queued 그대로(완료/실패 기록 없음)여서 동시 생성 자리를 차지한다. webhook 이 없어 저절로 끝나지 않는다
- 이미 있는 방어: generatedAt 캐시로 재과금 방지, 확정 거절 시 예약 종료, 10분 뒤 ghost sweep 이 fal 재조회(공통 경로)
- 남은 구멍: 시간 초과 시 잡 미정리, 클라 타임아웃·연타 방어는 컴포넌트 의존, 사용자 축 한도 집계 누락(추정)
- 근거: src/lib/fal/generate-image.ts:19-20, 118-146 · src/lib/writer/directing-edit.ts:147-155 · src/app/api/writer/rough-directing-edit/route.ts:21 · src/features/writer/directing-arrow-editor.tsx:306, 354, 376

### WRT-P-01 · 낮음 · 공급자 오류 · 코드 확인

**previz 영상 제출이 모호하게 끝나면 Take 를 잡은 reserved 잡이 남고 10분간 같은 샷은 409**

- 상황(언제): generate-previz-video 의 fal 제출이 408/429/5xx/통신 오류
- 지금 일어나는 일: 접수 불명 시 reserved: queued 행과 hold 를 보존(중복 비용 방지), 중복 검사는 STALE_QUEUED_MS 창
- 터지는 모습: 응답은 {status:'queued'} 지만 fal 접수 여부 불명, Take hold 유지. 같은 샷 재요청은 'Previz video already generating' 409
- 이미 있는 방어: 확정 거절은 즉시 failed+Take 반환, 기록→Take→제출 순서
- 남은 구멍: reserved 좀비 회수 없음(공통), previz 는 Take 묶임이 사용자에게 보이지 않음
- 근거: src/app/api/director/generate-previz-video/route.ts:69-80, 216-220 · src/lib/fal/reconcile.ts:112-116

### DIR-O-01 · 낮음 · AI 응답 형식 · 코드 확인

**generate-shots 라우트는 로그인만 확인하고 LLM 응답이 배열이 아니면 500 으로 터진다(현재 호출부 없음)**

- 상황(언제): 누군가 /api/director/generate-shots 를 직접 호출하거나 LLM 이 배열 대신 객체/문장을 돌려준다
- 지금 일어나는 일: userOwnsProject 없음, maxDuration 미설정, llmJSON 결과 형태 검증 없음
- 터지는 모습: 500 'rawShots.map is not a function'. 프로젝트 소유 확인이 없어 로그인 사용자면 누구나 LLM 비용을 쓸 수 있다
- 이미 있는 방어: 앱 코드에서 호출하는 곳이 없음(죽은 라우트)
- 남은 구멍: 소유 확인·출력 검증·maxDuration 없음. 삭제 후보
- 근거: src/app/api/director/generate-shots/route.ts:55-60, 97-104


## 5. 글 AI (Producer · Writer · 채팅) (20건, 높음 4)

그림이 아닌 LLM 텍스트 호출 전부.

호출 흐름:

- [시작 화면 추천] entry-store.readAndRecommend → POST /api/produce/entry/recommend(maxDuration 60) → (이미지면) transcribeComic = Anthropic messages.create(비스트리밍·타임아웃 없음) → recommendWithLlm = writer/llm/dispatch.generateJson(gemini S축 · withLlmRetry 4회 · 25초 withTimeout) → DB projects.entry_draft 저장(saveEntryDraft) → 실패하면 규칙 추천
- [시작 화면 시작] entry-store.startWriter → POST /api/produce/entry/start(maxDuration 300) → (만화 그대로면) runComicScript = transcribeComic ×≤2 → DB projects update(current_stage CAS) → 클라가 받은 writerStart 로 → POST /api/writer/start
- [Writer 시작] producer-store.saveAndHandoff / entry-store.startWriter → POST /api/writer/start(maxDuration 60) → getUser · userOwnsProject · getActiveRun(writer_runs) · characters/locations upsert · appearanceI18nFields/applyProducerI18n/ensureEntityNamesEn = src/lib/claude.ts claudeJSON(best-effort) → createRun(writer_runs insert) → after(): POST /api/writer/step
- [Writer 단계 자가 체인] POST /api/writer/step(x-writer-secret, maxDuration 300, 예산 240s) → runWriterSteps → getActiveRun → saveRunState(진입 마킹, CAS) → stage.run → dispatch.generateJson → gemini.generateContent(gemini-3.6-flash / 접지는 gemini-3-flash-preview, 120s 타임아웃 ×4회) 또는 writer/llm/claude.ts messages.stream(claude-sonnet-4-6, CLAUDE_API_KEY) → JSON.parse → repairJsonStrict → zod safeParse → saveRunState(CAS) → logger.flushRawLlm → llm_calls insert → paused 면 after(): 다음 /api/writer/step; done 이면 markCompleted · projects.current_stage · drawDeferredArtistDrafts
- [Writer 진행 폴링] useWriterStatus(3초, 프로젝트당 1요청 공유, 15초 abort) · entry-store.pollWriter(2.5초, 타임아웃 없음) · use-artist-lock-poll(5초, ?assets=1) · project-store.verifyWriterGate(?assets=1) · writer-store.applyChatUpdates 가드 → GET /api/writer/status/[projectId] → requireProjectAccess(auth DB) → getRunStatusLight(writer_runs 1쿼리) → assets=1 이면 projects·characters·locations·generation_jobs·character_image_candidates 9~10개 count 쿼리
- [Writer 멈춤 회복] useWriterStatus(last_timestamp 180초 경과·60초 간격) → POST /api/writer/resume → getActiveRun → runMayBeAlive(330s) 판정 → after(): triggerWriterStep | Vercel cron 0 3 * * *(하루 1회) → GET /api/writer/watchdog → writer_runs running & updated_at<330s → triggerWriterStep | instrumentation.ts setInterval 60s keepalive(서버리스에선 사실상 미동작 추정)
- [씬 스토리 게이트] global-chat-store/scene-story-section → POST /api/writer/scene-gate(maxDuration 300) → getActiveRun → writer_runs update(CAS) → confirm: after() triggerWriterStep / revise: after() generateSceneStoryProposal = runScenes(gemini) → writer_runs CAS 저장 3회 / rewrite: after() POST /api/writer/scene-story-rewrite(안마다 1요청, 비밀 열쇠) → after() writeVariant = runDramaturgySafe·runNarrativeStructure·runScenes → saveVariant CAS 8회
- [대사 다시 쓰기] writer 화면 → POST /api/writer/dialogue(maxDuration 300) → requireProjectAccess → getActiveRun(state 전체) → runDialogue(gemini S축, 씬 순차 1~2분) → shots.dialogue_lines 샷마다 update(N회 왕복)
- [채팅 producer/writer/artist] global-chat-store.sendMessage → createChatRequestSession(ndjson Accept, 클라 241초) → POST /api/produce|writer|artist/chat(maxDuration 300) → withChatRecovery(서버 240초 타이머, x-chat-*-remaining 예산) → getUser(auth DB) → userOwnsProject → resolveChatLocale(projects select/update) → (produce) listStyleAnchorCatalog·buildReferenceDigest → src/lib/claude.ts claudeChat = Anthropic beta.messages.stream(claude-sonnet-5-5, web_search, 앱 도구, 컴팩션, 출력 복구 continue/retry ≤2회·320k 토큰) → parseExtractedSettings/parseFencedUpdates → chat_traces upsert(best-effort) → 클라 tool loop 최대 6라운드·16콜 반복 → 클라 saveChatMessage(fire-and-forget) → POST /api/project/[id]/messages → messages insert
- [채팅 director/editor] global-chat-store.sendMessage → POST /api/director/chat | /api/editor/chat(maxDuration 미선언, withChatRecovery 없음) → getUser → userOwnsProject → resolveChatLocale → claudeChat(signal·recovery 없음) → parseFencedUpdates/adviceOnly → chat_traces upsert
- [그림체 분석] producer-store 그림체 고정 → POST /api/produce/style-facets(maxDuration 300) → getUser · userOwnsProject · readAnchor(projects) → extractHpFacets = Anthropic messages.create fill ×≤2 + compile ×≤2(200~215초 자체 마감) → projects.custom_style_anchor update → drawArtistAfterAnalysis
- [만화 대본 옮기기(채팅)] 채팅 첨부 → POST /api/produce/comic-script(maxDuration 300) → getUser · userOwnsProject → runComicScript = transcribeComic(Anthropic messages.create, 16k 토큰) ×≤2 → 실패 502 comic_script_failed

구조적 약점: ① 재시도·타임아웃 사다리가 층마다 따로 정해져 서로를 모른다. gemini 120초×4회(≈500초) vs step 예산 240초 vs 함수 수명 300초, Anthropic SDK 기본 10분 vs maxDuration, 25초 withTimeout 은 약속만 거절하고 호출은 끊지 않음. shotCheck 만 deadlineMs 를 받고 나머지 단계는 예산을 모른 채 호출한다. ② 멈춘 Writer 의 자동 회복 장치 셋(instrumentation keepalive · cron watchdog · 화면 resume)이 서버리스에선 사실상 '화면이 열려 있을 때' 또는 '하루 1회'로 줄어든다. running 고착은 상태가 틀린 게 아니라 깨우는 손이 없는 문제이고, 시작 화면 pollWriter 는 깨우기도 안 부른다. ③ 실패 분류가 전부 오류 문구 정규식(retry.ts · stage-errors.ts · dispatch.ts). 공급자 문구에 'billing'·'500' 같은 낱말이 섞이면 일시/영구가 뒤바뀌고, 접지(webSearch) 호출은 어떤 오류든 claude 폴백으로 가 비용이 두 배가 된다. ④ 관측·저장이 모두 best-effort fire-and-forget(클라 메시지 저장, llm_calls, chat_traces)이라 DB 장애 때 조용히 사라지고, raw_collector 전역 버퍼는 한 인스턴스의 동시 요청끼리 섞인다. 텍스트 LLM 호출은 take 를 쓰지 않아 차감·환불 불일치는 없지만, 그만큼 유저당 호출 상한도 없어 재시도 폭주가 운영자 비용으로 직결된다.

### LLM-01 · 높음 · 시간 한도 · 코드 확인

**Writer 단계의 AI 호출 재시도 시간이 함수 수명보다 길어, 함수가 중간에 꺼지면 산 결과가 사라지고 같은 호출을 다시 산다**

- 상황(언제): Gemini 가 느리거나 503/429 를 내서 한 단계 안에서 재시도가 쌓일 때(특히 이야기 구조·씬·샷 설계처럼 호출이 큰 단계)
- 지금 일어나는 일: gemini.ts 는 요청마다 120초 타임아웃을 두고 withLlmRetry 가 최대 4회(백오프 1.5→12초) 돈다. 한 호출만으로도 ~500초. 그런데 step 예산은 240초, 함수 하드 한도는 300초. deadlineMs 는 shotCheck(claude)에만 넘어가고 다른 단계는 예산을 모른다. 함수가 300초에 꺼지면 진입 마킹(_attempt+1)만 DB 에 남고 결과(patch)는 로컬 변수라 소실 → 다음 호출이 같은 단계를 다시 산다 → 3회면 markFailed.
- 터지는 모습: Writer 진행률이 한 단계에서 수 분간 멈춘 뒤 처음부터 그 단계를 다시 돌고, 3번 반복되면 '단계 시간 초과' 실패로 뜬다. 공급자 비용은 매번 든다.
- 이미 있는 방어: shotCheck 는 예상 시간(샷당 6초·바닥 160초)으로 착수 보류하고 deadlineMs+30초에 끊는다(ClaudeTimeBudgetError, 재시도 없음). decoupage·shotDesign 은 씬 단위 부분 체크포인트로 양보한다. 매 단계 후 state 를 DB 에 저장해 완료된 단계는 다시 돌지 않는다.
- 남은 구멍: gemini 경로와 narrativeStructure·scenes·storyCheck·renderPrompts 등 단일 호출 단계는 남은 예산을 모른다. 재시도 상한·타임아웃이 함수 수명과 정합하지 않아 kill 이 attempt 예산을 갉아먹고 유료 호출을 반복한다.
- 근거: src/lib/writer/llm/gemini.ts:33 GEMINI_REQUEST_TIMEOUT_MS = 120_000 · src/lib/writer/llm/retry.ts:43-67 withLlmRetry maxAttempts 4, baseMs 1500 · src/app/api/writer/step/route.ts:9-12 maxDuration 300 · STEP_BUDGET_MS 240_000 · src/lib/writer/pipeline/steps.ts:300-334 shotCheck 만 deadlineMs 착수 게이트 · src/lib/writer/llm/dispatch.ts:47,136-146 deadlineMs 는 claude 만 · gemini 분기엔 미전달 · src/lib/writer/pipeline/steps.ts:884-895 진입 마킹(_attempt) 후 kill 시 증가분만 남음 · src/lib/writer/pipeline/steps.ts:866-882 MAX_STAGE_ATTEMPTS 3 → markFailed

### LLM-02 · 높음 · 시간 한도 · 코드 확인

**함수가 꺼져 Writer 가 'running' 으로 남으면, 깨우는 손은 하루 1회 cron 과 '화면이 열려 있을 때' 뿐이다**

- 상황(언제): step 함수가 300초에 강제 종료되거나 다음 step 트리거(after fetch)가 유실됐을 때, 또는 runWriterSteps 가 yielded 로 물러난 뒤 앞 호출이 죽었을 때
- 지금 일어나는 일: 회복 경로 셋: (1) instrumentation.ts 의 60초 setInterval keepalive. 서버리스는 요청 사이 인스턴스가 멈춰 사실상 돌지 않음(추정). (2) cron watchdog `0 3 * * *` 하루 1회. (3) use-writer-status 가 last_timestamp 180초 경과 시 60초마다 /api/writer/resume → 서버는 330초(WRITER_RUN_ALIVE_MS) 지나야 킥. 시작 화면의 entry-store.pollWriter 는 resume 을 부르지 않는다. 또 CAS 패배·시도 소진 대기로 yielded 를 돌려주면 step 라우트가 다음 step 을 띄우지 않아 같은 깨우기에만 의존.
- 터지는 모습: 진행률이 멈춘 채 '쓰는 중'이 계속된다. 사용자가 Writer 화면을 열어 두면 약 3~6분 뒤 저절로 이어지지만, 화면을 닫았으면 다음 날 낮 12시(KST) cron 까지 그대로. 시작 화면(트리트먼트 초안)에서는 화면을 열어 두어도 영원히 '쓰는 중'.
- 이미 있는 방어: resume 라우트가 유저 세션으로 서버 안쪽 비밀 열쇠 체인을 대신 찌른다(프로덕션에서 클라 keepalive 가 401 로 죽었던 자리). 330초 기준으로 살아 있는 호출 옆에 같은 단계를 또 띄우지 않는다. 화면 복귀(visibilitychange/focus)에 즉시 재폴.
- 남은 구멍: 서버 쪽 자동 깨우기가 없다(cron 하루 1회). 시작 화면 폴러는 깨우기 자체가 없다. 사용자가 떠난 프로젝트는 하루를 기다린다.
- 근거: src/instrumentation.ts:38-55 setInterval 60s keepalive(서버리스 미보장) · vercel.json:4-5 /api/writer/watchdog schedule 0 3 * * * · src/app/api/writer/watchdog/route.ts:19,37-42 STALE_MS=330s · running & updated_at<cutoff 만 재발사 · src/lib/writer/use-writer-status.ts:113-117 age>=180s 일 때만 /api/writer/resume · src/app/api/writer/resume/route.ts:37-44 runMayBeAlive 면 action:'running' · 아니면 kicked · src/lib/writer/run-alive.ts:6 WRITER_RUN_ALIVE_MS 330_000 · src/features/entry/entry-store.ts:358-382 pollWriter. resume 호출 없음·멈춤 판정 없음 · src/lib/writer/pipeline/steps.ts:848-852,873,893 yielded → 다음 step 안 띄움

### LLM-03 · 높음 · AI 응답 형식 · 코드 확인

**이야기 구조 단계는 AI 답이 형식(스키마)을 어기면 Gemini→Claude 폴백 2회 × 자동 재시도 2회 = 4번 실패 뒤 사람이 눌러야 한다**

- 상황(언제): 모델이 JSON 을 잘못 내거나(펜스·잘림·서술 섞임) 산출이 NarrativeStructureSchema 를 어길 때. 2026-11-23 '이야기 구조 단계 4회 실패'와 같은 모양
- 지금 일어나는 일: s1_structure 는 webSearch:true + schema + enforceSchema 로 generateJson 을 부른다. gemini(접지 모델 gemini-3-flash-preview)가 어떤 이유로든 실패하면 dispatch 가 groundingFailed 로 보고 claude(sonnet-4-6)로 같은 질문을 1회 더 보낸다. 둘 다 실패하면 스테이지 예외 → classifyStageError 가 'LLM 산출 스키마 위반'·'JSON parse failed' 를 transient 로 분류 → 자동 1회 재시도(paused→다음 step) → 다시 2회 호출 → markFailed. 즉 2 attempt × 2 provider = 4회. 중간에 LossyRepairError 면 1회 재호출하고 두 번째도 잘리면 '살아남은 값으로 진행'해 조용한 데이터 손실도 가능.
- 터지는 모습: Writer 가 '이야기 구조' 단계에서 실패로 뜨고 '이어서 재시도' 버튼이 나온다. 실패 1건에 유료 호출은 최대 4번(각 호출 안의 withLlmRetry 는 별도) 들었다.
- 이미 있는 방어: JSON 복구기(펜스 제거·잉여문자 삭제·닫기·절단) + zod 스키마 게이트 + 손실 복구 재호출 1회 + Claude 는 output_config.format 으로 생성 자체를 스키마에 강제 + 실패 시 error_detail 에 직전 호출 3건의 프롬프트/응답 저장 + 자동 재시도 1회 + resume 버튼.
- 남은 구멍: 형식 오류는 같은 프롬프트를 그대로 다시 보내는 재시도만 있고 '형식을 고쳐 달라'는 교정 재요청이 없다. 폴백은 비용을 두 배로 하면서도 접지(web_search) 결과가 실제로 붙었는지 보증하지 않는다. 손실 복구 2회째의 '살아남은 값으로 진행'은 console.error 외 사용자에게 보이지 않는다.
- 근거: src/lib/writer/pipeline/stages/s1_structure.ts:86-93 webSearch:true · schema · enforceSchema · src/lib/writer/llm/dispatch.ts:52-66 safeParse 실패 → 'LLM 산출 스키마 위반' throw · src/lib/writer/llm/dispatch.ts:119-131 groundingFailed = gemini && webSearch → 무조건 claude 폴백 · src/lib/writer/llm/dispatch.ts:87-104 LossyRepairError 재호출 1회 · 두 번째도 손실이면 살아남은 값으로 진행 · src/lib/writer/pipeline/stage-errors.ts:15,55-57 AUTO_RETRY_PER_STAGE 1 · transient 만 · src/lib/writer/pipeline/steps.ts:974-997 shouldAutoRetry → paused / 소진 → markFailed · src/lib/writer/llm/gemini.ts:150-162 JSON.parse → repairJsonStrict → 'Gemini JSON parse failed' · src/lib/writer/llm/claude.ts:165-200 claudeGenerateJson 파싱·슬라이스 복구

### LLM-04 · 높음 · 호출 한도 · 추정

**공급자 429(한도 초과)는 호출 층에서 4번 짧게 재시도한 뒤, Gemini 문구의 'billing' 낱말 때문에 영구 오류로 분류돼 즉시 실패할 수 있다**

- 상황(언제): 동시 접속 폭주로 Gemini RPM/TPM 한도에 걸렸을 때(씬 병렬 12·샷 설계 병렬 8 × 접속자 수) 또는 Anthropic 429/529
- 지금 일어나는 일: withLlmRetry 는 429 를 transient 로 4회(총 약 10초) 재시도하고 던진다. 스테이지 층의 classifyStageError 는 permanent 패턴을 먼저 보며 거기에 /insufficient.{0,12}(credit|fund)|billing/i 가 있다. Gemini 429 본문은 통상 'You exceeded your current quota, please check your plan and billing details.' 형태(추정)라 permanent → 즉시 markFailed. 유저당 LLM 호출 상한이 없어 20명 동시 시작이 그대로 공급자 한도로 간다.
- 터지는 모습: Writer 가 '단계 실패'로 바로 멈추고 사람이 '이어서 재시도'를 눌러야 한다. 백그라운드 무차감 재시도(최대 8회·15초 백오프)를 타지 못한다. 접지 호출이면 Claude 로 한 번 더 보내 비용이 두 배.
- 이미 있는 방어: 호출 층 4회 재시도 + 스테이지 층 network 분류 시 예산 무차감 8회 백오프 재시도 + rateLimitHits 관측 + 쿼터 에러 본문 800자 보존 로그.
- 남은 구멍: permanent 패턴의 'billing' 이 네트워크 분류를 가로챈다(문구 의존). 유저·전역 LLM 동시 호출 상한이 없다. 접지 폴백은 429 에도 발화해 비용을 키운다.
- 근거: src/lib/writer/llm/retry.ts:5-18,31-37 TRANSIENT/QUOTA 패턴 · 429 는 transient · src/lib/writer/llm/retry.ts:43-67 4회 · 1.5초 기반 지수 백오프(총 ~10초) · src/lib/writer/pipeline/stage-errors.ts:32-49 PERMANENT 먼저 판정 · L39 billing · src/lib/writer/pipeline/stage-errors.ts:8-10 주석 'quota 단어는 permanent 로 취급하지 않는다'(의도) · src/lib/writer/pipeline/steps.ts:932-968 network 무차감 재시도 NET_RETRY_CAP 8 · src/lib/writer/llm/dispatch.ts:119-131 429 포함 모든 오류에 claude 폴백(webSearch) · src/lib/writer/pipeline/stages/decoupage.ts:173-176 씬 동시성 기본 4·최대 12 · src/lib/writer/pipeline/stages/v4_shots.ts:72-75 샷 설계 동시성 8

### LLM-05 · 중간 · DB 부하 · 코드 확인

**DB 가 느릴 때 Writer 는 저장 실패를 '일시 정지'로 보고 쉬지 않고 다음 step 을 띄운다. 백오프가 없다**

- 상황(언제): 2026-11-23 처럼 DB 응답이 느리거나 끊겨 writer_runs 저장(진입 마킹·부분 체크포인트)이 실패하는 동안
- 지금 일어나는 일: runWriterSteps 는 진입 마킹 saveRunState 가 throw 하면 `{paused:true}`, 부분 진행 저장이 throw 해도 `{paused:true}` 를 돌려준다. step 라우트는 paused 면 after() 로 즉시 다음 step 을 띄운다. getActiveRun 이 성공하고 저장만 실패하는 '느린 DB' 구간에서는 getActiveRun→저장 실패→재발사가 대기 없이 반복된다. (getActiveRun 자체가 throw 하면 500 으로 체인이 멈춘다.)
- 터지는 모습: writer step 호출이 꼬리를 물고 늘어나 DB 를 더 때린다. 부분 진행(씬 몇 개) 저장이 실패하면 그 결과를 버리고 다음 호출이 같은 씬을 다시 산다.
- 이미 있는 방어: CAS(state_version)로 두 호출이 같은 run 을 덮지 않는다. 종결 상태 전이는 running 일 때만. DB 완전 불통이면 getActiveRun 이 throw 해 체인이 자연히 멈춘다.
- 남은 구멍: 저장 실패 뒤 재발사 전 대기(백오프)가 없다. 부분 결과는 저장 재시도 없이 버린다. 체크포인트 저장(단계 완료) 실패는 markFailed 로 가는데 그 markFailed 도 같은 DB 라 실패하면 500 으로 끝나 running 고착(LLM-02).
- 근거: src/lib/writer/pipeline/steps.ts:887-900 진입 마킹 저장 catch → paused · src/lib/writer/pipeline/steps.ts:1008-1026 부분 진행 저장 catch → paused(결과 소실) · src/app/api/writer/step/route.ts:45-49 paused → after(triggerWriterStep) 즉시 · src/lib/writer/pipeline/steps.ts:784-797 triggerWriterStep 에러 흡수(재시도 없음) · src/lib/writer/run-store.ts:224-290 markFailed/markCompleted 는 throw(상위 500)

### LLM-06 · 중간 · 폴링 · 코드 확인

**원고 진행 3초 폴링은 프로젝트당 1요청으로 묶여 있지만, 검토 대기 중에도 계속 돌고 매번 로그인 확인 DB 를 부른다**

- 상황(언제): Writer·Producer·Artist 화면이 열려 있는 동안(awaiting_confirmation·awaiting_artist 대기 포함), 특히 DB 가 느릴 때
- 지금 일어나는 일: useWriterStatus 는 모듈 전역 엔트리로 같은 프로젝트 구독자들이 1요청을 공유하고, 직렬(응답 후 타이머)·15초 abort·완료/실패에서만 정지. awaiting_* 는 terminal 이 아니라 사용자가 씬 스토리를 검토하는 동안(수십 분) 3초 폴링이 계속된다. 서버 status 라우트는 requireProjectAccess(auth DB)+getRunStatusLight, assets=1 이면 Promise.all 로 9개 count 쿼리 + 후속 1개. 클라 abort 는 서버 함수를 멈추지 않는다.
- 터지는 모습: 사용자 1명당 3초마다 /api/writer/status 요청(인증 DB 1 + run 조회 1). ?assets=1 변형(verifyWriterGate·5초 Artist 락 폴)은 9~10개 count 쿼리. DB 가 느려지면 클라는 15초에 끊고 새 요청을 보내지만 서버 요청은 끊기지 않아 서버 쪽에 쌓인다(알려진 '한 인스턴스 187 동시 요청'에 기여).
- 이미 있는 방어: 프로젝트당 요청 1개 공유, 직렬 폴링(응답 후 다음 타이머), 15초 클라 타임아웃, 백그라운드 탭 복귀 시 즉시 1회, 완료/실패 시 정지, 무거운 state 블롭은 SELECT 안 함(경량 컬럼), assets 실패는 빈 값 폴백.
- 남은 구멍: awaiting_confirmation/awaiting_artist 에서 폴링 간격을 늘리지 않는다. 서버 쪽 쿼리 타임아웃이 없어 클라 abort 뒤에도 서버 요청이 DB 응답까지 매달린다. 인증 확인이 매 폴마다 DB 를 친다(알려진 분당 551건의 일부).
- 근거: src/lib/writer/use-writer-status.ts:50,66,108-111 intervalMs 3000 · 15s abort · terminal=completed|failed 만 · src/lib/writer/use-writer-status.ts:140-146 subscribers.size===1 일 때만 tick 시작(요청 공유) · src/app/api/writer/status/[projectId]/route.ts:186-189 requireProjectAccess + getRunStatusLight · src/app/api/writer/status/[projectId]/route.ts:64-141 computeAssets 9개 count 쿼리 + 1 · src/hooks/use-artist-lock-poll.ts:11,100 5초 · ?assets=1 · src/stores/project-store.ts:610 verifyWriterGate ?assets=1 · src/app/studio/artist/page.tsx:138 · src/components/layout/chat-progress-pin.tsx:74 · src/features/producer/readiness-board.tsx:635 useWriterStatus 다중 구독

### LLM-07 · 중간 · 폴링 · 코드 확인

**시작 화면의 초안 진행 폴링(2.5초)은 타임아웃·멈춤 판정·깨우기가 없어, 체인이 끊기면 영원히 '쓰는 중'**

- 상황(언제): 트리트먼트 초안(treatmentDraft) 쓰기 중 step 함수가 꺼지거나 트리거가 유실됐을 때, 또는 DB 가 느려 status 응답이 오래 걸릴 때
- 지금 일어나는 일: pollWriter 는 while 루프에서 fetch(status) → ready/failed 만 종료, 그 외 'writing' 유지 → sleep 2.5초. AbortController·타임아웃·last_timestamp 기준 멈춤 판정·/api/writer/resume 호출이 없다. 실패는 pipeline_failed 일 때만.
- 터지는 모습: 시작 화면 잠금(쓰는 중)이 풀리지 않는다. 다시 시도 버튼은 failed 일 때만 뜬다. DB 가 느리면 요청 하나가 수 분 매달리고(fetch 타임아웃 없음) 그 동안 화면 단계가 갱신되지 않는다.
- 이미 있는 방어: generation 카운터로 프로젝트 전환·재로드 시 옛 폴러를 버린다. 요청 실패는 다음 차례에 다시 묻는다(직렬이라 증폭은 없음).
- 남은 구멍: 멈춤을 감지하거나 깨우지 못한다. 요청 타임아웃이 없다. 사용자는 새로고침해도 같은 상태로 돌아온다(LLM-02 의 시작 화면 변형).
- 근거: src/features/entry/entry-store.ts:48 WRITER_POLL_MS 2500 · src/features/entry/entry-store.ts:358-382 pollWriter. abort/timeout/resume 없음 · src/features/entry/entry-store.ts:453-457 새로고침 시 running·draft 면 다시 pollWriter · src/lib/writer/use-writer-status.ts:113-117 (대비) Writer 화면 폴러는 180초 후 resume 호출

### LLM-08 · 중간 · 시간 한도 · 코드 확인

**Director·Editor 채팅은 시간 예산·중단 신호 없이 AI 를 불러, 함수가 먼저 꺼지고 Stop 버튼이 서버 호출을 끊지 못한다**

- 상황(언제): Director/Editor 채팅에서 긴 답(샷 일괄 updates 등)이나 공급자 지연이 있을 때, 사용자가 Stop 을 누를 때
- 지금 일어나는 일: produce/writer/artist 채팅은 withChatRecovery(서버 240초 타이머·signal·recovery)+maxDuration 300 으로 클라 241초와 맞춘다. director/chat·editor/chat 은 llmChat 에 signal/recovery 를 넘기지 않고 maxDuration 선언도 없어 Vercel 기본값에 kill(추정). Anthropic SDK 기본 timeout 10분이 함수 수명보다 길다. recovery 없는 claudeChat 은 stop_reason max_tokens 에서 throw.
- 터지는 모습: 'Chat failed'/504 가 뜨고 부분 답(partialReply)이 없다. 답이 출력 한도에 닿으면 'Chat response reached its output limit' 500. Stop 을 눌러도 서버의 AI 호출은 끝까지 과금된다.
- 이미 있는 방어: 클라 createChatRequestSession 이 241초에 끊어 화면은 풀린다. 응답 JSON 하위 호환으로 readChatResponse 가 처리. 에러는 채팅 배너로 표면화.
- 남은 구멍: 두 라우트에 서버 타임아웃·abort 전파·출력 복구·maxDuration 이 없다. Vercel 기본 maxDuration 이 짧으면 긴 답은 항상 실패.
- 근거: src/lib/chat-response.ts:5-6,81 CHAT_RESPONSE_TIMEOUT_MS 240s · 클라 타이머 +1000 · src/lib/chat-response-server.ts:27-56 withChatRecovery 240s 타이머 · 504 partialReply · src/app/api/produce/chat/route.ts:34,37-38 maxDuration 300 · withChatRecovery · src/app/api/director/chat/route.ts:615-626,667-678 llmChat. signal/recovery 없음 · maxDuration 없음 · src/app/api/editor/chat/route.ts:82-86 동일 · src/lib/claude.ts:26-30 Anthropic 클라이언트 timeout/maxRetries 미지정(SDK 기본) · src/lib/claude.ts:228 recovery 없으면 max_tokens → throw · src/stores/global-chat-store.ts:5020-5022 stopGeneration 은 클라 fetch 만 abort

### LLM-09 · 중간 · 화면 상태 · 코드 확인

**채팅 메시지 저장은 화면이 '보내고 잊는' 방식이라 DB 가 느리거나 연결이 끊기면 대화가 조용히 사라진다**

- 상황(언제): DB 응답 지연·장애 중 채팅을 보낼 때, 답이 오기 전 탭을 닫거나 네트워크가 끊길 때, 프로젝트를 바꿀 때
- 지금 일어나는 일: saveChatMessage 는 fetch 결과를 기다리지 않고 실패 시 console.error 만. 서버 messages POST 도 insert 오류를 확인하지 않고 ok 를 돌려준다. 채팅 라우트는 메시지를 저장하지 않으므로(클라만 저장) 스트림이 끊기면 모델 답은 어디에도 남지 않는다. isCurrentSession 이 아니면 catch 에서 바로 return. 다른 프로젝트로 바뀐 뒤 도착한 답은 저장·표시되지 않는다(의도).
- 터지는 모습: 화면에는 보였던 질문/답이 새로고침하면 없다. 서버가 답을 다 만들었어도(과금됨) 사용자는 받지 못하고 다음 턴 히스토리에 사용자 질문만 남는다.
- 이미 있는 방어: 스트림 끊김 시 서버가 abort 로 LLM 을 멈춘다(ndjson cancel). 실패·중단 시 '미완성 답'과 도구 처리 영수증을 메시지로 남긴다. 완료된 도구 변경은 보존된다는 문구. 세션 전환 가드로 다른 프로젝트에 섣불리 적용하지 않는다.
- 남은 구멍: 저장 재시도·큐가 없다. 서버가 완성한 답을 서버에서 저장하지 않아 연결 끊김 = 답 유실 + 비용. 중복 저장은 없지만 유실은 사용자에게 보이지 않는다.
- 근거: src/lib/chat-persistence.ts:3-18 fire-and-forget · 실패 로그만 · src/app/api/project/[id]/messages/route.ts:59-63 insert 결과 미검사 · src/stores/global-chat-store.ts:3879 사용자 메시지 저장 시점(요청 전) · src/stores/global-chat-store.ts:4950 !isCurrentSession → return · src/stores/global-chat-store.ts:4982-4989 실패 시 partialReply/receipt 를 모델 메시지로 저장 · src/lib/chat-response-server.ts:96 클라 cancel → 서버 LLM abort(연결 끊김 감지 시)

### LLM-10 · 중간 · 공급자 오류 · 추정

**채팅 AI 호출의 429/5xx·연결 끊김은 코드에 명시적 재시도가 없고, 공급자 오류 문구가 그대로 사용자에게 보인다**

- 상황(언제): Anthropic 429/529(overloaded)/5xx, 스트리밍 도중 연결 끊김, 첨부 이미지 URL 을 공급자가 못 가져올 때
- 지금 일어나는 일: claudeChat 은 beta.messages.stream().finalMessage() 를 한 번 부른다. SDK 기본 maxRetries(2, 연결/429/5xx 요청 단계) 외 스트림 중 끊김 재시도는 없다. 오류가 나면 recovery 가 있고 안전한 부분 글이 있으면 ChatOutputRecoveryError('request_failed')로 partialText 반환, 아니면 그대로 throw → 라우트 catch 가 err.message 를 500 으로 반환. produce 는 첨부 턴에서 /image|fetch/ 메시지만 502 로 바꾼다.
- 터지는 모습: 채팅 에러 배너에 공급자 원문(예: 'Overloaded', 'rate_limit_error ...')이 뜬다. 복구 모드 중이면 '미완성 답' 과 함께 멈춘다. 재시도는 사용자가 다시 보내야 한다.
- 이미 있는 방어: SDK 기본 재시도(코드에 override 없음), 출력 한도 도달 시 continue/retry 최대 2회·320k 토큰 예산, 사용량 콜백 실패는 삼김, 부분 답 보존.
- 남은 구멍: 529/503 류 일시 오류에 대한 애플리케이션 재시도·사용자 친화 문구가 없다. 스트림 중 끊김은 재시도 없이 실패.
- 근거: src/lib/claude.ts:168-186 단일 stream 호출 · catch 에서 request_failed 또는 rethrow · src/lib/claude.ts:26-30 maxRetries/timeout 미지정(SDK 기본 의존) · src/app/api/produce/chat/route.ts:242-259 첨부 fetch 실패만 502 번역, 나머지 throw · src/app/api/produce/chat/route.ts:302-306 catch → error: message 500 · src/stores/global-chat-store.ts:4982-4999 error 문자열을 배너·lastTrace 에 그대로

### LLM-11 · 낮음 · AI 응답 형식 · 코드 확인

**채팅 답 끝의 ```json updates 블록이 잘리거나 깨져도 복구·안내·로그가 있어 방어가 충분하다**

- 상황(언제): 모델 답이 출력 한도에 닿아 닫는 펜스가 없거나 JSON 이 깨졌을 때(writer/artist/director/produce)
- 지금 일어나는 일: parseFencedUpdates 가 펜스 추출 → JSON.parse → repairJsonWithMeta(clean/punch/close/trim) → 화이트리스트 검증 → 복구 건수·재개 지점을 안내. 실패 시 stripLeakedUpdatesBlock 으로 펜스 이후를 잘라낸다. claudeChat 복구 모드는 action payload 경계(recoveryProse) 전까지만 부분 글로 보존해 반쪽 액션이 실행되지 않게 한다.
- 터지는 모습: 일부 항목만 반영되고 '답이 잘려 일부만 반영했어요. 나머지는 나눠서 다시' 안내가 붙는다. 날 JSON 이 채팅에 노출되지 않는다.
- 이미 있는 방어: 공용 가드 + 복구 모드 + 전수 서버 로그(status) + chat_traces 에 parse_status/raw·valid 건수 기록.
- 남은 구멍: director/editor 는 복구 모드가 없어 max_tokens 에서 바로 500(LLM-08). 복구 'trim' 은 뒤가 통째로 사라진 것이라 안내 문구에 의존한다.
- 근거: src/lib/agentic-reply-guard.ts:44-80 stripLeakedUpdatesBlock · parseFencedJsonReply · parseFencedUpdates · src/lib/claude.ts:60-66 recoveryProse 경계 · src/lib/claude.ts:229-253 continue/retry · continuationChangedFormat 시 전체 재시도 · src/app/api/writer/chat/route.ts:188-193 · src/app/api/artist/chat/route.ts:202-206 · src/app/api/director/chat/route.ts:517-523 공용 가드 사용

### LLM-12 · 중간 · 중복 제출 · 추정

**Writer 첫 시작을 거의 동시에 두 번 누르면 run 이 두 개 생기고, 옛 run 은 영원히 running 으로 남아 매일 재발사된다**

- 상황(언제): 핸드오프/시작 버튼 더블클릭, 느린 응답에 사용자가 다시 누름, 클라 재시도. 두 요청이 getActiveRun(없음)을 동시에 통과할 때
- 지금 일어나는 일: writer/start 는 getActiveRun 으로 running/awaiting 을 409 로 거르지만, '없음'인 첫 시작은 조회→createRun 사이에 재확인이 없다. 재실행(rerun) 경로만 createRun 직전 latest 를 다시 확인한다. writer_runs 에 (project_id, status=running) 유니크 제약은 마이그레이션에서 찾지 못했다.
- 터지는 모습: writer_runs 에 같은 프로젝트 running 행 2개. getActiveRun 은 최신 1건만 보므로 옛 행은 아무도 진행·종결하지 않는다. watchdog 은 project_id 로 매일 triggerWriterStep 을 쏘지만 최신 run 만 본다(무해한 노이즈). 단계 체인은 두 함수가 같은 최신 run 을 CAS 로 다툰다.
- 이미 있는 방어: 409 writer_run_active(두 번째가 늦게 오면 작동), 클라 loading/gen 카운터, CAS 로 두 체인이 같은 run 을 덮지 않음, 재실행·초안 이어가기는 조건부 업데이트.
- 남은 구멍: 첫 시작의 조회-삽입 레이스를 막는 DB 제약이나 재확인이 없다. 고아 running 행은 status 라우트에 보이지 않지만 watchdog·listStalledRunningProjects 에 영구히 잡힌다.
- 근거: src/app/api/writer/start/route.ts:536 getActiveRun(existing) · src/app/api/writer/start/route.ts:568-574 running/awaiting_artist → 409 writer_run_active · src/app/api/writer/start/route.ts:834-847 rerun 경로만 createRun 직전 재확인 · src/app/api/writer/start/route.ts:902-912 createRun → after(triggerWriterStep) · src/lib/writer/run-store.ts:112-140 getActiveRun created_at desc limit 1 · supabase/migrations: writer_runs 유니크 인덱스 검색 결과 없음

### LLM-13 · 중간 · 시간 한도 · 추정

**다음 단계를 띄우는 after() 가 다음 step 의 응답까지 기다려, 앞 함수가 뒤 함수 끝까지 살아 있고 60/300초에 끊긴다**

- 상황(언제): writer/start(60초)·writer/step(300초)·scene-gate confirm 이 after() 안에서 triggerWriterStep 을 await 할 때; scene-gate revise/rewrite 가 after() 안에서 직접 AI 를 돌릴 때
- 지금 일어나는 일: triggerWriterStep 은 fetch 응답을 await 한다(fire-and-forget 주석과 달리). Next.js after() 는 응답 후에도 콜백이 끝날 때까지 함수를 유지한다. 다음 step 이 240초 돌면 앞 함수도 그만큼 기다린다. scene-gate revise 는 after() 안에서 runScenes(gemini, 수십 초~분)와 CAS 저장 3회를 직접 실행하고, rewrite 는 안마다 별도 요청(scene-story-rewrite)으로 분리했다.
- 터지는 모습: 동시에 살아 있는 함수가 체인 깊이만큼 겹친다(비용·동시성 2배). 앞 함수가 수명에 kill 되면 fetch 가 끊기는데 뒤 step 은 이미 접수돼 계속 돈다(추정). scene-gate 의 수정안(revise)은 함수 수명 안에 끝나지 않으면 300초 만료 후 '시간 초과' 실패로 보인다.
- 이미 있는 방어: 트리거 실패는 삼키고 watchdog/keepalive 가 복구한다는 설계. rewrite 는 안마다 요청을 나눠 각자 300초를 쓴다. 수정안은 300초 만료로 사용자에게 실패를 보여 준다.
- 남은 구멍: 트리거는 응답을 기다리지 않아도 되는데 기다린다(짧은 타임아웃 또는 응답 전 반환이 없음). revise 의 백그라운드 LLM 은 함수 kill 시 결과가 사라지고 사용자는 5분 뒤에야 안다.
- 근거: src/lib/writer/pipeline/steps.ts:784-797 triggerWriterStep. await fetch(응답 대기) · src/app/api/writer/step/route.ts:45-49 after(async () => await triggerWriterStep) · src/app/api/writer/start/route.ts:60,910-912 maxDuration 60 · after(triggerWriterStep) · src/app/api/writer/scene-gate/route.ts:222-238 revise: after() 안에서 generateSceneStoryProposal · rewrite: 안마다 trigger · src/lib/writer/scene-story-proposal.ts:11-56 runScenes + CAS 저장 3회 · src/lib/producer/scene-story-proposal.ts:41-44 SCENE_STORY_PROPOSAL_TIMEOUT_MS 300_000

### LLM-14 · 중간 · 기타 · 코드 확인

**AI 호출 기록 버퍼가 서버 전역이라, 한 인스턴스가 여러 프로젝트를 동시에 처리하면 기록·진단이 서로 섞인다**

- 상황(언제): 같은 Vercel 인스턴스에서 두 프로젝트의 writer step / 시작 화면 OCR·추천 / 씬 수정안이 동시에 돌 때(2026-11-23 처럼 한 인스턴스가 수백 요청을 처리할 때)
- 지금 일어나는 일: raw_collector.ts 의 calls/totals 는 모듈 전역이고 recordRawCall 에 프로젝트 식별이 없다. captureErrorDetail 은 getPendingRawCalls 마지막 3건을, logger.flushRawLlm 은 flushRawCalls 전체를 가져가 archive-calls 가 호출자의 projectId 로 insert 한다.
- 터지는 모습: llm_calls 에 다른 프로젝트의 프롬프트·응답이 잘못된 project_id 로 저장된다. 실패한 run 의 error_detail 에 남의 호출 3건이 들어가 원인 추적이 틀린다. 스테이지별 토큰·429 통계가 오염된다.
- 이미 있는 방어: 아카이브는 best-effort 로 파이프라인을 막지 않는다. 각 스테이지 끝에 flush 해 버퍼가 길게 누적되지 않는다.
- 남은 구멍: 요청 단위 격리(AsyncLocalStorage 또는 projectId 태깅)가 없다. 진단 자료(error_detail)가 운영 장애 때 가장 필요한데 그때 가장 오염된다.
- 근거: src/lib/writer/llm/raw_collector.ts:59-82 전역 calls · flushRawCalls · getPendingRawCalls · src/lib/writer/pipeline/steps.ts:805-820 captureErrorDetail → 마지막 3건 · src/lib/writer/llm/archive-calls.ts:34-70 호출자 projectId 로 llm_calls insert · src/lib/entry/recommend-llm.ts:46-62,70-72 시작 화면도 같은 버퍼 사용 · src/lib/writer/pipeline/steps.ts:1034-1038 getUsageTotals 델타로 스테이지 통계

### LLM-15 · 낮음 · 시간 한도 · 코드 확인

**시작 화면의 AI 추천·글자 읽기·만화 대본 옮기기는 실패하면 규칙 추천/다시 시도로 떨어지지만, 25초 타임아웃은 호출을 끊지 않아 비용은 계속 든다**

- 상황(언제): 시작 화면에서 '다음'을 눌러 AI 추천을 받을 때(Gemini), 이미지 글자 읽기·만화 그대로 시작(Anthropic 비스트리밍)이 느리거나 실패할 때
- 지금 일어나는 일: recommendWithLlm 의 withTimeout 은 25초에 reject 만 하고 generateJson(withLlmRetry 4회) 을 abort 하지 않는다. transcribeComic 은 messages.create 비스트리밍(16k 토큰, SDK 기본 10분 타임아웃) 으로 runComicScript 가 ≤2회, entry/start 는 성공 뒤 projects update 가 wrong_stage 로 질 수 있어(두 번 시작) 그때 옮긴 대본은 버려진다.
- 터지는 모습: 추천이 25초 넘으면 규칙 추천으로 넘어가 설정 화면이 열린다(사용자는 모름). 글자 읽기 실패는 'read_failed' 502, 만화 옮기기 실패는 'comic_script_failed' 502 로 다시 시도 안내. 백그라운드 Gemini 호출은 최대 4회×120초 계속 돌며 과금.
- 이미 있는 방어: 추천은 규칙 폴백으로 사용자 흐름이 끊기지 않는다. 옮기기는 형식 검사 실패 시 교정 노트를 붙여 1회 재요청. 두 번 시작은 current_stage 조건부 저장으로 덮어쓰기를 막는다. 호출은 llm_calls 에 남긴다.
- 남은 구멍: 25초 타임아웃이 호출을 중단하지 않는다. Anthropic 비스트리밍 호출에 타임아웃/재시도 설정이 없다(SDK 기본). 추천이 규칙으로 떨어졌음을 사용자는 알 수 없다.
- 근거: src/lib/entry/recommend-llm.ts:14-29,66-73 RECOMMEND_TIMEOUT_MS 25s · abort 없음 · src/app/api/produce/entry/recommend/route.ts:20,41-44,62-66 maxDuration 60 · ocr 502 · 모델 실패 → 규칙 · src/lib/producer/comic-script-llm.ts:16-28 messages.create 타임아웃 없음 · src/lib/producer/comic-script-run.ts:25-37 2회 시도 · model_error · src/app/api/produce/entry/start/route.ts:23,45-52,64-73 maxDuration 300 · 502 · current_stage CAS · src/app/api/produce/comic-script/route.ts:16,53-55 maxDuration 300 · 502

### LLM-16 · 낮음 · 과금·Take · 코드 확인

**글 AI 호출(Producer·Writer·채팅)은 take 를 차감하지 않아 차감·환불 불일치는 없지만, 사용자별 호출 상한도 없다**

- 상황(언제): 채팅 연속 전송, 도구 루프(최대 6라운드·16콜), Writer 재시도 반복, 20명 동시 접속
- 지금 일어나는 일: 모든 글 LLM 라우트(produce/chat·writer/*·artist/chat·director/chat·editor/chat·comic-script·style-facets·entry/*)에 quota/take/checkGenerationCapacity 호출이 없다(그림·영상 라우트만 quotaRejectionResponse). 채팅 1턴은 서버 호출 1회 이상 + 클라 도구 루프 라운드마다 재호출.
- 터지는 모습: 사용자에게는 요금 변화가 없다. 운영자 LLM 비용만 늘고, 공급자 한도(429)에 먼저 닿는다(LLM-04).
- 이미 있는 방어: 턴당 출력 토큰 예산(320k)·복구 횟수(2)·도구 라운드(6)·클라 loading 가드(한 번에 한 요청)·채팅 컴팩션(입력 토큰 상한).
- 남은 구멍: 사용자·전역 단위 분당 호출 수 제한이 없고 Writer 재시도 비용에 상한이 없다(kill 반복 시 같은 호출 재구매). 환불 로직이 필요 없는 대신 폭주 방어도 없다.
- 근거: src/app/api/produce/chat/route.ts · src/app/api/writer/*/route.ts · src/app/api/*/chat/route.ts: take/quota 검색 결과 없음 · src/lib/api/quota.ts:25 quotaRejectionResponse 는 artist/director 그림·영상 라우트만 사용 · src/lib/chat-tools/loop.ts:45,59 maxRounds 6 · maxCalls 16 · src/lib/chat-output-recovery.ts:2-3 턴당 복구 2회 · 320k 토큰 상한

### LLM-17 · 낮음 · 로그인 확인 · 코드 확인

**모든 글 AI 라우트와 폴러가 요청마다 로그인 확인으로 DB 를 다시 부르고, 세션이 끊기면 채팅은 'Unauthorized' 로 멈춘다**

- 상황(언제): 매 채팅 턴·매 status 폴·도구 루프 라운드마다; 세션 토큰이 만료·갱신 중일 때; DB 가 느릴 때
- 지금 일어나는 일: produce/chat 등은 getUser() → userOwnsProject → resolveChatLocale(projects select/update) 순으로 DB 를 3회 이상 치고 나서 LLM 을 부른다. withChatRecovery 의 240초 타이머는 handler 진입 전에 시작된다. status 라우트는 requireProjectAccess. step/watchdog 는 x-writer-secret/CRON_SECRET fail-closed.
- 터지는 모습: DB 장애 때 채팅 240초 예산의 상당 부분이 getUser·userOwnsProject·resolveChatLocale 에 소모돼 AI 답이 늦거나 504. 세션 만료 시 채팅 배너 'Unauthorized'(사용자 재로그인), 폴러는 조용히 넘어간다. 서버 안쪽 체인(step·watchdog)은 secret 이 없으면 프로덕션에서 500 misconfigured.
- 이미 있는 방어: fail-closed 비밀 열쇠, 폴러는 !ok 를 정상 처리, locale 조회 실패는 삼키고 진행, 그림체 카탈로그는 TTL 캐시.
- 남은 구멍: 요청당 인증·소유 확인 캐시가 없다(알려진 분당 551건 DB 인증의 일부). 채팅 시간 예산이 DB 대기와 LLM 시간을 구분하지 않는다.
- 근거: src/app/api/produce/chat/route.ts:45-104 getUser · userOwnsProject · resolveChatLocale · src/lib/chat-response-server.ts:36-39 타이머가 handler 전에 시작 · src/app/api/writer/status/[projectId]/route.ts:186 requireProjectAccess 매 폴 · src/app/api/writer/step/route.ts:20-30 WRITER_STEP_SECRET fail-closed · src/app/api/writer/watchdog/route.ts:26-34 CRON_SECRET fail-closed · src/stores/global-chat-store.ts:4982-4999 401 메시지 배너 노출

### LLM-18 · 낮음 · DB 부하 · 코드 확인

**관측·보관 기록(llm_calls·chat_traces·messages) 쓰기가 매 호출마다 DB 로 가지만 모두 best-effort 라 장애 때 조용히 빠진다**

- 상황(언제): Writer 스테이지 종료마다, 채팅 턴마다, 메시지마다. 특히 DB 가 느릴 때
- 지금 일어나는 일: logger.flushRawLlm → archiveRawCalls 가 스테이지마다 llm_calls insert(실패 삼킴). persistChatTraceBestEffort 가 턴마다 chat_traces upsert(실패 삼킴). saveChatMessage 는 클라 fire-and-forget. LLM_ARCHIVE_DISABLED 킬 스위치 있음.
- 터지는 모습: Nano DB 에 프롬프트·응답 원문(필드당 최대 200KB)·trace upsert·메시지 insert 가 쌓인다. 장애 중에는 기록만 사라지고 제품은 계속 돈다(원인 추적 자료가 그때 비게 된다).
- 이미 있는 방어: 모두 실패를 삼켜 제품을 막지 않음, 본문 상한, 킬 스위치, 로컬 하네스 run 은 skip.
- 남은 구멍: DB 장애 때 기록 유실을 알리는 신호가 콘솔 외에 없고, 쓰기 양을 줄이는 샘플링·지연 큐가 없다.
- 근거: src/lib/writer/llm/archive-calls.ts:19,44-70 MAX_FIELD 200_000 · insert · 실패 warn · src/lib/chat-trace-server.ts:107-117 persistChatTraceBestEffort · src/lib/chat-persistence.ts:3-18 메시지 저장 fire-and-forget · src/lib/writer/llm/archive-calls.ts:27-29 LLM_ARCHIVE_DISABLED

### LLM-19 · 중간 · 시간 한도 · 코드 확인

**대사 다시 쓰기는 1~2분짜리 AI 호출 뒤 샷마다 DB 를 한 번씩 갱신해, 느린 DB 에서 함수가 꺼지면 일부만 반영되고 결과는 사라진다**

- 상황(언제): Writer 대사 다시 쓰기(/api/writer/dialogue) 중 DB 가 느릴 때, 샷이 많을 때
- 지금 일어나는 일: runDialogue(gemini, 씬 순차, deadline 없음) 가 끝난 뒤 for 루프로 샷마다 supabaseAdmin.update 를 await 하고 오류는 updatedShots 카운트에서 빼기만 한다(throw 없음). 300초 안에 끝나지 않으면 kill. 생성 결과는 DB 에 중간 저장되지 않는다.
- 터지는 모습: 일부 샷만 새 대사가 들어가고 나머지는 옛 대사. 응답이 500/504 로 끊기면 사용자가 다시 눌러 AI 호출을 다시 산다.
- 이미 있는 방어: run 이 running 이면 409 로 막음, 유료 호출 전 필요한 DB 읽기를 먼저 함, 성공 샷 수를 응답에 돌려줌.
- 남은 구멍: 결과를 한 번에 저장(upsert 배치)하지 않고, 부분 반영을 사용자에게 알리지 않으며, LLM 결과를 재사용할 체크포인트가 없다.
- 근거: src/app/api/writer/dialogue/route.ts:23 maxDuration 300 · src/app/api/writer/dialogue/route.ts:83-95 runDialogue(deadline 없음) · src/app/api/writer/dialogue/route.ts:101-111 샷마다 update · 오류 무시 · src/app/api/writer/dialogue/route.ts:64-70 유료 호출 전 인물 목록을 먼저 읽는 주석(의도 인지)

### LLM-20 · 낮음 · 화면 상태 · 코드 확인

**씬 스토리 수정안·다시 쓰기는 백그라운드에서 돌고 결과 저장이 CAS 로 겨루기 때문에, 저장에 지거나 함수가 꺼지면 5분 뒤 '시간 초과' 로만 보인다**

- 상황(언제): scene-gate revise/rewrite 요청 뒤 사용자가 동시에 직접 편집·다른 수정안을 내거나, 세 안이 동시에 끝나거나, 함수가 수명에 꺼질 때
- 지금 일어나는 일: generateSceneStoryProposal 은 최신 run 을 다시 읽고 updated_at 조건부 저장을 3회, saveVariant 는 8회(40~160ms 대기) 시도한 뒤 포기(console.warn). 저장 실패·kill 모두 proposal.status 가 generating 으로 남고 sceneStoryProposalExpired 가 300초 뒤 failed 로 표시한다.
- 터지는 모습: 수정안 카드가 5분(300초) 뒤 '시간 초과' 실패로 바뀐다. 비용은 들었고 결과는 없다. 적용 전에는 산문이 바뀌지 않아 데이터 손상은 없다.
- 이미 있는 방어: 중복 수정안 409, 버린/바뀐 수정안의 늦은 결과는 되살리지 않음, 만료로 사용자에게 실패 표시, 적용은 별도 action.
- 남은 구멍: 저장 포기 시 즉시 failed 로 기록하지 않아 사용자는 5분을 기다린다. 함수 kill 시 결과 소실.
- 근거: src/lib/writer/scene-story-proposal.ts:38-56 CAS 3회 후 warn · src/lib/writer/scene-story-rewrite.ts:21,66-86 SAVE_ATTEMPTS 8 · 짧은 대기 · src/lib/producer/scene-story-proposal.ts:41-44 300초 만료 판정 · src/app/api/writer/scene-gate/route.ts:113-115,147-149 generating 중 중복 요청 409


## 6. 2026-11-23 장애 증상 대조

| 그때 본 증상 | 원인 번호 | 케이스 |
|---|---|---|
| 상태 확인 181회 실패, 그중 148회는 5분 대기 뒤 끊김 | 1 + 2 | C01 ART-02 |
| Artist 화면이 25초 안에 안 열림 6회 | 2 + 7 | ART-01 ART-09 |
| 배경 요청 60초 초과 5회 | 4 | ART-05 |
| fal 은 다 그렸는데 25~31분 뒤 완료로 바뀜 | 5 + 6 | C07 C08 ART-07 |
| 자동 그리기가 요청 0개로 멈춤 | 3 | ART-03 ART-04 |
| 로그인 확인만 분당 551건 | 7 | C03 ART-09 LLM-17 |
| 이야기 구조 단계 4회 실패(장애와 별개) | 글 AI | LLM-03 |

## 7. 추정으로 남은 것

코드로 확정하지 못한 6건. 고치기 전에 확인하거나, 확인 방법을 적어 둔다.

| 케이스 | 추정 내용 | 확인 방법 |
|---|---|---|
| ART-09 | 미들웨어 `getUser` 가 느릴 때 화면 자체가 안 열린다 | DB 지연 주입 뒤 `/studio/artist` 응답 시간 측정 |
| DIR-B-03 | Vercel cron 이 앞 실행과 겹쳐 돌 수 있다 | Vercel 문서·대시보드 실행 기록 |
| LLM-04 | Gemini 429 본문에 "billing" 이 들어가 permanent 로 분류된다 | 429 응답 본문 실측(llm_calls 기록) |
| LLM-10 | 채팅 AI 호출의 5xx·연결 끊김에 재시도가 없다 | `src/lib/llm` 호출 층 재확인 |
| LLM-12 | Writer 첫 시작을 동시에 두 번 누르면 run 두 개 | 개발 DB 에서 동시 POST 2건 |
| LLM-13 | `after()` 가 다음 step 응답까지 기다려 앞 함수가 오래 산다 | step 함수 실행 시간 로그 |

## 8. 바뀐 것 기록

고친 뒤 1절의 어느 행이 어떻게 바뀌었는지 날짜와 함께 아래에 쌓는다. 비어 있으면 아직 아무것도 고치지 않은 것이다.

| 날짜 | 행 | 전 | 후 | 커밋 |
|---|---|---|---|---|
| 2026-11-24 | 7-a | Auth 1 + DB 3 (+fal 1) | Auth 0(`getClaims()` 공개키 로컬 검증) + DB 2(소유 1 + 잡 1). fal 은 웹훅 주소가 있으면 제출 뒤 45초 유예 · 잡별 30초 스로틀. 로컬 측정 중앙값 0.395s → 0.21s | f8189f2c |
| 2026-11-24 | 7-c | 완료 이력 전체 읽기 포함 8회 이상 순차 | 질문 4개를 `Promise.all` 로 동시 전송. 왕복 시간 7 → 2. 완료 이력 전량 읽기는 그대로(후속). 로컬 측정 0.688s → 0.21s | f8189f2c |
| 2026-11-24 | 2-d | 틱당 왕복 4~5 × 잡 수 | 탭당 스케줄러 1개가 잡을 묶어 `GET /api/generation-jobs?ids=`(최대 50). 잡 6개 = 왕복 2. 로컬 측정 6개 동시 0.71s → 묶음 0.275s | f8189f2c |
| 2026-11-24 | 2-b | 500 1회면 throw · 화면 실패 | 3분류. 2xx 성공 / 401·403·404·그 밖 4xx 영구 / 5xx·네트워크·10초 초과·408·429 일시(queued 유지). 포기는 유령 기준(그림 10분·영상 30분)에서만 | f8189f2c |
| 2026-11-24 | 2-c | 3초 고정 | 일시 오류 연속 횟수로 3→6→12→24→30초. 성공하면 3초. 요청 한도 `AbortSignal.timeout(10s)` | f8189f2c |
| 2026-11-24 | 2-a | `loadData` 3초마다 겹쳐 나감 | 프로젝트별 in-flight 1개(`dedupeLoadData`). 3·4·5초 반복은 `useSequentialPoll` 순차. DB 질문 8개 자체는 그대로(후속) | f8189f2c |
| 2026-11-24 | 7-b | DB 6~10 | 소유 1(embed) + 예외표 0(사용자별 10분 memo) + 키 세기(키 수, 동시) + insert. `pickFalKey` → `fal_key_id: null` 은 `generation-reserve.test.ts:189` 기대와 충돌해 보류(결정 필요) | f8189f2c |
| 2026-11-24 | 5-a | reserved 영구 | 접수 기록 DB 오류만 300ms·900ms 재시도(0행은 즉시 throw) · 웹훅 주소 `?jobId=` 로 reserved 잡 되찾아 늦게 기록(5 경로; rough-storyboard·storyboard-batch·previz-video·video-fallback 4 경로는 미적용) · 워치독 스윕 `.not('request_id','like','reserved:%')`. 시간만으로 실패·환급하지 않는 원칙 유지 | f8189f2c |
| 2026-11-24 | 5-b | 10분(화면·유령) vs 30분(자리) 불일치 | 종류별 시계 `staleQueuedMsFor`: 영상 30분 · 그림 10분. 화면 포기 · `listActiveGenerationJobs` · 유령 청소 · 배치 집계가 모두 한 함수(`staleQueuedOrFilter` 로 DB 측 필터). `BATCH_STALE_QUEUED_MS` 제거 | f8189f2c |
| 2026-11-24 | 9절 완료 처리 2번 | 웹훅과 폴링이 같은 그림을 동시에 마무리하면 둘 다 내려받아 저장(60장 중 12장) | `generation_jobs.finalize_claimed_at` 칸(빈 값 허용) 추가. `finalizeGenerationJob` 이 저장 전에 한 줄 UPDATE 로 자리를 찍고(`claimGenerationJobFinalize`), 못 찍은 쪽은 내려받기 전에 멈춤(폴링은 queued 그대로 리턴 · 웹훅은 기록만). 저장 실패는 자리를 풀고 오류 그대로. 찍은 쪽이 2분(`FINALIZE_CLAIM_STALE_MS`) 안에 못 끝내면 다른 쪽이 이어받음. 개발 DB 에서 동시 10번 자리 찍기 → 1번만 성공 실측. 마이그레이션 `20261124230000_generation_jobs_finalize_claim` 개발 DB(pbiumddivadgbzxuymak) · 운영 DB(qnjnrihfpqkdhjuzvepy) **적용됨 2026-11-24 23:16 KST**(코드 배포 전에 칸 먼저. 새 코드가 칸을 필요로 하고 예전 코드는 칸을 모른 채 돌아도 된다). 되돌리기 `supabase/rollbacks/20261124230000_…rollback.sql` | (이 커밋) |

보고서: `.claude/docs/2026-11-24/polling-layer1.html` · `queue-gaps.html`. 측정 파일: `.claude/docs/2026-11-24/measure/`. Supabase Realtime 조사 결론은 폴링 보고서 6절(Free 범위 · Broadcast 방식 권장 · 1층 실측 뒤 결정).

## 9. 운영 부하 재현 기록 (2026-11-24 21:28~22:02 KST)

가상 사용자 20명 · Artist 화면 · 그림 6장씩 · 작가 상태 폴링 켬. 스크립트 `scripts/load-replay-artist.mjs`. 결과 `.claude/docs/2026-11-24/loadtest/1124a/`. 보고서 `.claude/docs/2026-11-24/load-replay.html`. 대상 운영 커밋 b1e734be(sin1) · DB Micro.

| 실행 | 조건 | 서버 경유 중앙값 / p95 | 직접 DB 질문 중앙값 / p95 | 5xx | 결과 |
|---|---|---|---|---|---|
| A | 20명 · 그림 6장 · 작가 폴링 | 5.8~11.5s / 20~23s | 0.24s / 0.44s | 48(전부 fal 잔액 0) | 187초에 안전 중단. 그림 61/120 |
| B | 10명 · 그림 6장 · 카나리 | 제출 중 2.6~6.4s / 10~13s → 제출 뒤 0.16s | 0.14s / 0.40s | 26 | 그림 40/60 |
| C | 20명 · 폴링만(틱 4초 + 작가 3초) · 3분 | 0.16~0.40s / 0.3~0.8s | 0.15s / 0.45s | 0 | 11/23 을 죽인 폴링 모양을 DB 가 버팀 |
| D(11-24 23:47, 커밋 2347f146 · 열쇠 `prod-2000` 뺀 뒤 · 동시 2장) | A 와 같은 조건 | 3.3~7.3s / 17~19s | 0.24s / 0.75s | **0** | 214초 안전 중단(60초 창 p95 19.7s). 97장 제출 → 95 완료 · 1 moderation · 1 미완. 429 115(정원 34 넘침, 재시도). **완료 처리 2번 0/95**(후보 행 그림당 1행, `finalize_claimed_at` 95/95) |

확인한 것(실측):
- DB 는 병목이 아니다. 실행 A 최악 구간에도 브라우저→DB 직접 질문 최대 0.51초. DB CPU 일하는 시간 10% 미만 · Swap 0.15 GB(11/23 은 0.8 GB).
- 느림은 서버 함수(Vercel) 쪽에서 생긴다. 제출(`generate-sheet`·`generate-world`, 혼자일 때 4~5초)이 30~60개 동시면 가벼운 길(`generation-slots`)까지 7.8~11.9초. 같은 순간 직접 DB 0.11초 · JWKS 0.03초. 제출 30개는 인스턴스 16개로 나뉘었는데 1개만 받은 인스턴스도 5~11초. Fluid Compute 는 켜져 있다(오너 확인) → "한 번에 1요청만 받아 자리가 모자란다"는 설명은 접는다. 남는 후보: 새 인스턴스 켜는 시간(콜드 스타트) · 한 인스턴스 안에서 CPU 를 나눠 쓰는 경합. Vercel 함수 로그(cold start 표시 · 함수별 소요시간)로 가른다. 느림은 실패를 만들지 않았다. 화면의 잡 폴링 한도 10초(`POLL_REQUEST_TIMEOUT_MS`)에 걸리면 3→6→12초로 물러나 상태 갱신이 늦어질 뿐이고, 제출 요청에는 한도가 없어 그냥 기다린다.
- **그림을 못 받은 길은 하나다: 잔액 0 열쇠 → 같은 칸 2번 실패 → 자동 그리기 포기.** 실행 B 60장: 완료 40 · 시험 도구 로그인 실패 6(도구) · 내용 검사 거절 2("호빗") · 열쇠 포기 12. 실행 A 120장: 완료 53 · 안전 중단 때 그려지는 중 41 · 나머지 열쇠 포기. 서버 함수 느림으로 실패한 그림은 0장.
  - 열쇠 자리는 `legacy-1000` 34 + `prod-2000` 1(운영 `FAL_KEYS`, `fal_key_limits` 로 동기화). `pickFalKey` 와 트리거 모두 "남은 자리가 가장 많은 열쇠"를 고른다(`src/lib/fal/keys.ts:119`, `supabase/migrations/20261027100000_generation_capacity_per_user_limit.sql:116`).
  - `legacy-1000` 이 34장 차면 다음 그림은 `prod-2000` → fal 즉시 거절 `403 Exhausted balance` → `rejectGenerationJobReservation` 이 `billing` 으로 실패 기록. 즉시 실패해 `prod-2000` 자리는 늘 비어 보이므로 넘치는 그림이 전부 이 열쇠로 간다.
  - 화면이 10초 뒤 같은 칸을 다시 보내면 아직 34장이 차 있어 또 `prod-2000`. `actor='auto'` 는 같은 칸 실패 2회면 `gave_up`(`AUTO_GENERATION_GIVE_UP_THRESHOLD = 2`; `billing` 은 `GIVE_UP_EXEMPT_CLASSES` 에 없다) → 200 응답에 jobId 없음 → 화면엔 실패 표시, 사람이 "다시 그리기"(ui) 를 눌러야 산다.
  - 운영 DB 에 `error_class='billing'` 실패는 최근 30일 0건, `prod-2000` 마지막 성공 11/09. 11/23 수업(그림 11장)에는 일어나지 않았고 20명 × 3장 재현에서 처음 드러났다. 오너 결정(2026-11-24): `FAL_KEYS` 에서 `prod-2000` 을 빼고(Vercel 환경변수 · 재배포), 동시 장수 3 → 2(`ARTIST_SLOTS_IDLE`). 열쇠가 늘면 상수만 올린다.
- 완료 처리 2번: 시험 그림 60장 중 12장이 같은 파일로 후보 행에 2번 기록(웹훅 + 폴링 reconcile). 2절 구조적 약점 (2)의 실측.
- 제출→완료(fal 포함) 중앙값 68초 · p95 86초 · 최대 96초.

재측정 D 에서 가른 것(Vercel Observability → Functions, 23:38~23:53 · Logs 요청 상세):
- 함수 안 소요(P75): generation-status 0.18s · writer/status 0.37s · generation-jobs?ids 0.75s · generate-sheet 0.96s · generate-world 1.02s · generation-slots 0.08s · fal/webhook 3.3s(after 저장 포함). 함수 기준 TTFB P95 0.8s. 함수 안 Supabase 질문 1개 37~93ms.
- (가) 콜드 스타트: 요청의 1.8%, 한 번 0.58s, 2분 동안 인스턴스 25개쯤 켜짐(`[writer keepalive] started` 줄). 10초를 못 만든다. **아님.**
- (나) CPU 경합: 스로틀 P95 3.5%, 요청당 Active CPU P95 0.22s, 메모리 평균 0.37/4 GB. **아님.**
- (다) **함수 밖 대기.** 429 답 115개의 `x-vercel-id`(icn1::sin1::<inst>-<ms>) 시각 → 화면 수신까지 중앙값 4.7s · p95 16.4s. 같은 요청의 함수 소요는 1초 안. 남는 3~15초는 Vercel 입구(icn1)에서 sin1 함수로 넘기는 사이. 폴링만(C)에서는 없고 제출·웹훅 저장이 같이 돌 때 생기며 그 수가 늘수록 커짐(0~60s 작가 상태 중앙값 1.7s → 120~214s 6.7s, 같은 창 직접 DB 0.24 → 0.29s). 가장 잘 맞는 설명: 오래 사는 요청(제출 1초 안팎 + 검열 대기, 웹훅 3.3s, fal 상태 질문)이 Fluid 인스턴스의 동시 자리를 차지해 짧은 폴링이 밖에서 기다림. 확정은 Vercel 지원에 요청 번호로 물어야 함.
- 덤: fal 상태 질문 500 이 8번(23:48:59~23:50:43, `[fal/reconcile] transient provider fetch failed`). 일시 분류로 queued 유지, 실패 0.

도구 쪽 주의: 같은 계정의 마법 링크를 동시에 2번 만들면 `otp_expired`, 발급이 많으면 Supabase 가 `429 over_request_rate_limit`. 실행 B·C 의 401·429 는 이 원인이고 앱 문제가 아니다(세션을 계정당 1번만 발급하도록 고침).

결정됨(2026-11-24 오너): `FAL_KEYS` 에서 `prod-2000` 제거(Vercel 환경변수, 오너 또는 로그인 뒤 실행) · 동시 장수 3 → 2(커밋). 같은 글 검열 1번만은 뒤로.

결정됨(2026-11-24 밤, 오너): (1) 완료 처리 2번 고치기. "queued→completed 를 먹은 쪽만 저장" 안은 저장 실패 시 queued 로 남겨 재시도하는 `finalize.ts` 설계와 어긋나 접고(그림 없는 완료가 생김), `finalize_claimed_at` 자리 찍기로 구현 · 개발·운영 DB 적용(8절 마지막 행). (2) 잔액 실패 열쇠 피하기 코드 방어는 지금 안 한다. 사람이 열쇠를 관리하고, 비즈니스 플랜 열쇠를 넣을 때 재검토. (3) 제출 라우트 "DB 예약 뒤 즉시 답"은 지금 안 한다. 10절에 내용 검사 거절 처리와 한 묶음으로 등록. (4) Vercel 열쇠 제거는 오너 지인이 11-24 23:24 완료(재배포 포함) → 재측정 D 완료(위 표). 5xx 0 · 완료 처리 2번 0.

결정 필요(2026-11-25): (1) Vercel 지원 문의(함수 밖 대기, 요청 번호 5개 첨부 · 비용 0 · 오너 계정으로 보냄, 글은 에이전트가 씀) (2) 오래 사는 요청 줄이기: 10절 "제출 라우트 DB 예약 뒤 즉시 답"을 내용 검사 거절 처리와 함께 → 그 뒤 웹훅 저장(3.3s)을 요청 밖으로 빼는 것 검토 (3) 10절 과제 뒤 같은 조건 재측정(라벨 1126a 등).

## 10. 다음 최우선 과제 (오너 등록 2026-11-24)

**내용 검사 거절이 그림·영상 생성을 막는 경우의 처리.** 이번 재현에서 "호벗" 단어가 fal content_policy 로 2장 거절됐다(422 → `moderation`, 자동 그리기 2회면 포기). 관련 케이스: ART-14 · C13 · DIR-S-03. 오늘 안 한다. 이 운영 부하 작업이 끝나면 첫 번째로 든다. 범위를 정할 때 볼 것: 거절 단어가 창작 글(인물 이름 · 배경 설명)에 들어 있을 때 학생이 무엇을 보고 무엇을 고치는가, 우회(safe) 재시도의 상한(`SAFE_RETRY_CAP = 2`)과 자동 포기(`AUTO_GENERATION_GIVE_UP_THRESHOLD = 2`)가 수업에서 맞는가, Creem 검열(제출 전)과 fal 검열(제출 뒤)의 거절이 화면에서 같은 말로 보이는가.

**같은 묶음으로 든다(오너 등록 2026-11-24 밤): 제출 라우트의 "DB 예약 뒤 즉시 답".** `generate-sheet` · `generate-world` 등 5개 제출 라우트가 지금은 검열(Creem) → DB 예약 → fal 접수까지 마치고 답한다(혼자일 때 4~5초 · 30개 동시면 20초). DB 예약만 하고 바로 답한 뒤 검열·접수를 `after()` 로 넘기면 체감은 줄지만 검열 거절 안내가 "즉시 답"에서 "폴링으로 나중에"로 바뀐다. 위 거절 처리와 화면 문구를 한 번에 정해야 한다. 그때 같이 읽을 단점 6개: 됐다고 했다가 실패 · 접수 안 나가는 유령(C05) · 서버 일은 그대로 · 검열 전 자리 점유 · 실패 추적 어려움 · 범위 5라우트. Vercel 함수 로그(콜드 스타트 vs CPU 경합)를 본 뒤 시작한다.

**그 다음 과제(오너 등록 2026-11-24 23:45): 내 자리가 몇 개인지 화면에서 보이게.** 우리 큐는 사용자마다 동시에 돌릴 수 있는 장수가 정해져 있다(`USER_AXIS_LIMIT` 그림 6 · 영상 3, `src/lib/generation-jobs.ts:308`; Artist 화면은 그 안에서 한 번에 2장 `ARTIST_SLOTS_IDLE`). 지금 학생은 이 숫자를 어디서도 못 본다. 정원이 차면 429 안내만 받고(2026-09-11 결정: 안내만, 자동 재시도 없음) "왜 안 가는지"를 모른다. 할 것: 사용자별 "쓰는 중 N / 전체 M(빈 자리 M-N)"을 그림·영상 따로 화면에 보여준다. 숫자의 출처는 하나여야 한다(DB 트리거가 세는 것과 같은 집계 = `generation_jobs` queued 행의 종류별 시계 `staleQueuedOrFilter` 기준). 들어갈 곳 후보: `GET /api/generation/active` 응답(`videoUsage` 가 이미 있다. 같은 모양으로 `imageUsage` 를 더하고 둘 다 사용자 축으로) → 진행 목록(generation-queue) 화면. 같이 정할 것: 전역 자리(fal 열쇠 합계 34)가 모자랄 때도 같은 자리에 보일지, 러프 그리는 동안 1장으로 줄어드는 것(`ARTIST_SLOTS_WHILE_ROUGH`)을 어떻게 말할지. 오너는 화면 그림으로 검수한다. 내용 검사 거절 처리 뒤에 든다.
