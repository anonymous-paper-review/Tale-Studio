-- 마무리 자리(2026-11-24): 같은 그림을 웹훅과 폴링이 동시에 마무리하면 둘 다 내려받아 저장했다
--   (운영 부하 재현에서 60장 중 12장이 후보 행에 2번 기록 — specs/api-failure-ledger.md 9절).
--   저장을 시작하기 전에 이 칸을 찍은 쪽만 저장한다(src/lib/generation-jobs.ts claimGenerationJobFinalize).
--   찍은 쪽이 FINALIZE_CLAIM_STALE_MS(2분) 안에 끝내지 못하면 다른 쪽이 이어받는다.
-- 늘리기만 하는 1단계(.claude/rules/supabase.md Expand → Contract): 빈 값 허용, 기본값 없음. 옛 코드는 이 칸을 모른 채 그대로 돈다.
-- 되돌리기: supabase/rollbacks/20261124230000_generation_jobs_finalize_claim.rollback.sql

alter table public.generation_jobs
  add column if not exists finalize_claimed_at timestamptz;

comment on column public.generation_jobs.finalize_claimed_at is
  '마무리(저장)를 시작한 쪽이 찍는 시각. queued 인 동안만 뜻이 있다. 2분 넘게 지난 자리는 다른 쪽이 이어받는다.';
