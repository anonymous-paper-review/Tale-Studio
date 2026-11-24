-- 되돌리기: 20261124230000_generation_jobs_finalize_claim(마무리 자리 칸, 2026-11-24) — 마이그레이션이 아니다. 사람이 골라 실행한다(개발 DB 먼저 → 운영).
--   이 파일은 supabase/migrations 밖에 둔다 — 그 폴더의 .sql 은 모두 마이그레이션으로 실행된다.
--   순서: (1) 앱을 이 마이그레이션 전 코드로 먼저 되돌린다(새 코드는 finalize_claimed_at 을 갱신한다 — 칸이 없으면 마무리가 전부 실패한다).
--         (2) 아래를 실행한다.
--   남는 것: 없음. 같은 그림을 두 쪽이 동시에 마무리하면 다시 2번 저장될 수 있다(화면은 1장, 저장 공간 2배).
begin;

alter table public.generation_jobs
  drop column if exists finalize_claimed_at;

delete from supabase_migrations.schema_migrations where version = '20261124230000';

notify pgrst, 'reload schema';
commit;
