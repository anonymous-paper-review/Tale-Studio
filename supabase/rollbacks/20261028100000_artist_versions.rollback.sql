-- 되돌리기: 20261028100000_artist_versions(작품 스타일 기록, 2026-10-28) — 마이그레이션이 아니다. 사람이 골라 실행한다(개발 DB 먼저 → 운영).
--   이 파일은 supabase/migrations 밖에 둔다 — 그 폴더의 .sql 은 모두 마이그레이션으로 실행된다.
--   순서: (1) 앱을 이 마이그레이션 전 코드로 먼저 되돌린다(새 코드는 artist_versions 를 읽고 쓴다). (2) 아래를 한 번에 실행한다.
--   기존 표는 이 마이그레이션이 바꾸지 않았다(배경 "지금 그림" 색인 바꾸기는 2026-10-31 오너 결정으로 보류) — 되돌릴 것은 새 표뿐이다.
--   남는 것: 보관함의 버전 폴더({ws}/{project}/versions/v{n}/) 파일. 불러온 버전의 그림은 지금 그림이 이 폴더 파일을 가리킨다 —
--   표를 지운 뒤에도 이 파일은 지우지 않는다.
begin;

-- (1) 작품 스타일 기록 표.
drop table if exists public.artist_versions;

-- (2) 마이그레이션 기록에서 뺀다(다시 올릴 수 있게).
delete from supabase_migrations.schema_migrations where version = '20261028100000';

commit;
