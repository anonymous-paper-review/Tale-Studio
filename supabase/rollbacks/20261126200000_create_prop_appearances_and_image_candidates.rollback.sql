-- 되돌리기: 20261126200000_create_prop_appearances_and_image_candidates(소품 모습 · 소품 지난 그림, 2026-11-26) — 마이그레이션이 아니다. 사람이 골라 실행한다(개발 DB 먼저 → 운영).
--   이 파일은 supabase/migrations 밖에 둔다 — 그 폴더의 .sql 은 모두 마이그레이션으로 실행된다.
--   순서: (1) 앱을 이 마이그레이션 전 코드로 먼저 되돌린다(새 코드는 두 표를 읽고 쓴다 — 표가 없으면 소품 모습 · 기록 읽기가 실패한다).
--         (2) 아래를 한 번에 실행한다.
--   기존 표(props 등)는 이 마이그레이션이 바꾸지 않았다 — 되돌릴 것은 새 표 둘뿐이다.
--   남는 것: 보관함의 소품 모습 그림 파일({ws}/{project}/props/…) — 표를 지운 뒤에도 파일은 지우지 않는다. 소품 기본 그림(props.image_url)은 그대로다.
begin;

drop table if exists public.prop_image_candidates;
drop table if exists public.prop_appearances;

delete from supabase_migrations.schema_migrations where version = '20261126200000';

notify pgrst, 'reload schema';
commit;
