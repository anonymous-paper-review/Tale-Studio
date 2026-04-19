-- Drop scenes.act column
-- Plan 02 — Writer: ACT(기승전결) 고정 포맷 제거
-- Created: 2026-04-19 KST
--
-- ACT was a narrative classification (intro/dev/turn/conclusion) used only for
-- UI labeling. Removed in Plan 02 along with all Writer-side layout redesign.

ALTER TABLE scenes DROP COLUMN IF EXISTS act;
