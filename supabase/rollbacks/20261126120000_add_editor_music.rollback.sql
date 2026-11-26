-- 되돌리기: 20261126120000_add_editor_music(Editor 음악 만들기, 2026-11-26) — 마이그레이션이 아니다. 사람이 골라 실행한다(개발 DB 먼저 → 운영).
--   이 파일은 supabase/migrations 밖에 둔다 — 그 폴더의 .sql 은 모두 마이그레이션으로 실행된다.
--   순서: (1) 앱을 이 마이그레이션 전 코드로 먼저 되돌린다(새 코드는 editor_music 을 읽고 쓴다 — 표가 없으면 [생성] 목록 · 만들기가 실패한다).
--         (2) 아래를 실행한다.
--   남는 것: 보관함의 곡 파일({ws}/{project}/editor/music/*.mp3) — 타임라인에 놓은 조각이 그 주소를 들고 있어 지우지 않는다.
--     generation_jobs 의 kind 'editor_music' 행과 take_ledger 의 그 작업 행 — 장부라 지우지 않는다.
--     마이그레이션 (3)이 generation_jobs.kind 값 목록 제약에 'editor_music' 을 더했다면 그대로 둔다 — 그 값의 작업 행이 남아 있어 빼면 제약이 깨진다.
begin;

drop table if exists public.editor_music;

delete from supabase_migrations.schema_migrations where version = '20261126120000';

notify pgrst, 'reload schema';
commit;
