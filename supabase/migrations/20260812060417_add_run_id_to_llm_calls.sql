-- llm_calls 에 run_id 추가 + 조회 인덱스 + RLS 정본화 (2026-08-12).
--
-- 이 표(llm_calls)는 2026-08-10 커밋 577e2ef 가 라이브 DB 에 직접 DDL 로 만들었고
--   저장소엔 설계도(마이그레이션 파일)가 없었다. 이 파일이 그 이후 변경분의 첫 기록이다.
--
-- 왜 run_id 인가: 지금은 project_id/stage/seq 만 있어 같은 프로젝트를 두 번 돌리면
--   기록이 섞이고 사후에 "어느 런의 것인지" 못 가린다(실측: 한 프로젝트의 93건이 실패
--   런과 성공 런에 걸쳐 있었다). writer_runs.id 를 실어 런 단위로 분리한다.
--
-- nullable + backfill 안 함: 기존 행은 이 컬럼이 없던 시절 기록이라 원래부터 "어느 런인지"
--   정보가 없다 — 추측으로 채우면 거짓 정합성이라 NULL 로 남긴다(레거시 표시).

begin;

alter table public.llm_calls
  add column if not exists run_id uuid references public.writer_runs(id) on delete set null;
-- FK 는 projects.last_writer_run_id / locations.last_writer_run_id 와 동일 관례
--   (on delete set null) — writer_runs 행이 지워져도 아카이브 기록 자체는 보존한다.
--   NULL 은 FK 를 항상 만족하므로 기존 행(전부 NULL)엔 영향 없다.

-- 조회 인덱스: run_id 단일이 아니라 (run_id, created_at desc) 로 잡는다.
--   이유 — seq 는 이 런 전체를 관통하는 단조 카운터가 아니다. 서버리스 stepwise 경로
--   (pipeline/steps.ts)는 각 step 이 별도 인보케이션(별도 V8 인스턴스)이라 raw_collector 의
--   seqCounter 가 인보케이션마다 1부터 다시 센다(resetRawSeq 는 로컬 runPipeline 에서만
--   호출됨) — 즉 같은 run_id 안에서도 seq 가 여러 번 1..n 으로 반복된다. (run_id, seq) 로
--   정렬하면 여러 인보케이션의 호출이 seq 기준으로 뒤섞여 시간순이 깨진다.
--   반면 called_at/created_at 은 인보케이션 경계와 무관하게 항상 단조 — 이 표에 이미 있는
--   (project_id, created_at desc) 인덱스와 같은 관례를 run_id 로도 반복한다(한 런의 호출을
--   시간순으로 재구성하는 진단 조회가 실제 쓰임새).
create index if not exists llm_calls_run_created_idx
  on public.llm_calls (run_id, created_at desc)
  where run_id is not null;

-- RLS: 서버 전용 테이블 관례 정본화 (20260811120000_lock_rls_and_revoke_anon_writes.sql 의
--   주석은 llm_calls 를 이미 "RLS ENABLE + 정책 0개, service_role 경유만" 사례로 들었지만
--   실제 alter table 목록에서 빠졌다 — 라이브 확인 결과 이미 relrowsecurity=true, policy 0건으로
--   writer_runs 와 동일 상태였다(문서 누락, 라이브는 정상). 여기서 ENABLE 을 반복해도
--   idempotent 라 라이브엔 영향 없고, 저장소/라이브 drift 만 없앤다.
--   코드 조사(2026-08-12): llm_calls 를 건드리는 경로는 archive-calls.ts 의
--   supabaseAdmin(service_role) 뿐 — anon/authenticated 클라이언트 경로 0건.
alter table public.llm_calls enable row level security;

commit;
