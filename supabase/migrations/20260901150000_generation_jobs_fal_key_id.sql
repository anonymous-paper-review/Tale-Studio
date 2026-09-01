-- fal 다중 키 풀 (#fal-key-pool) — generation_jobs 에 제출 키 id 를 기록한다.
--
-- 이유: fal 잡 status/result 는 제출한 키로만 조회 가능(다른 키면 404) — 조회 계열(폴링·reconcile·
--   finalize)이 "어느 키로 나갔나"를 몰라도 되던 단일 키 시절과 달리, 다중 키에서는 필수 정보다.
--
-- Expand 단계: NOT NULL 강제 없음(컬럼 추가 + 비종결 행 backfill 만). 종결(completed/failed/cancelled)
--   행은 과거 사실이라 그대로 null 로 둔다 — 조회 불필요(터미널 잡은 다시 fal 을 보지 않는다).
--   비종결 행만 'prod-2000'(현재 단일 운영 키의 레지스트리 id, fal-key-pool.md 참고)으로 채운다 —
--   전환 시점에 진행 중이던 잡은 실제로 그 키로 제출됐기 때문.
alter table public.generation_jobs add column if not exists fal_key_id text;

update public.generation_jobs
set fal_key_id = 'prod-2000'
where fal_key_id is null
  and status not in ('completed', 'failed', 'cancelled');
