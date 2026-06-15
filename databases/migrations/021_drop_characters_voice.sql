-- 021_drop_characters_voice.sql
-- producer-ui-redesign-readiness-board: character voice metadata is removed from Producer/Writer cast contracts.
--
-- Gate G precondition before applying this SQL manually:
--   1) product code no longer reads or writes character/cast `voice` fields;
--   2) writer start handoff smoke check passes while the live table still has `characters.voice`;
--   3) editor/post-production audio `kind = 'voice'` remains untouched (different domain).
--
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행 필요.
-- ⚠️ This is forward-only and drops existing character voice metadata.

ALTER TABLE characters
  DROP COLUMN IF EXISTS voice;
