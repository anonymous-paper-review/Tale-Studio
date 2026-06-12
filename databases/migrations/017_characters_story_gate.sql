-- 017_characters_story_gate.sql
-- producer-story-gate: S2(캐릭터) 정의를 producer로 내리고 writer는 오픈 캐스트로 추가만 하도록
--   characters 테이블을 확장한다. 잠금 플래그(locked)는 폐기(additive 원칙으로 대체, 결정 4).
--
-- 변경:
--   1) entity_type — 'person' | 'object'(사물 캐릭터, 예: 반지). object는 arc/voice/motivation·턴어라운드 미적용.
--   2) origin — 'producer'(게이트 확정) | 'writer'(전개상 추가). 오픈 캐스트 추적 근거.
--   3) voice / arc / motivation — 지금까지 생성만 되고 버려지던 S2 필드를 수용.
--   4) locked 컬럼 제거 — 이미지 잠금 UI 폐기.
--   5) UNIQUE(project_id, character_id) — slug 무결성. additive upsert(Section 4)의 ON CONFLICT 기준 +
--      character_relationships / character_image_candidates 의 복합 FK 대상.
--
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행 필요.
-- ⚠️ UNIQUE 추가 전, (project_id, character_id) 중복 행이 있으면 실패한다. 실패 시 중복 정리 후 재실행.
--    중복 점검:  SELECT project_id, character_id, count(*) FROM characters
--               GROUP BY 1,2 HAVING count(*) > 1;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'writer',
  ADD COLUMN IF NOT EXISTS voice text,
  ADD COLUMN IF NOT EXISTS arc jsonb,
  ADD COLUMN IF NOT EXISTS motivation jsonb;

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_entity_type_check,
  ADD CONSTRAINT characters_entity_type_check CHECK (entity_type IN ('person', 'object'));

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_origin_check,
  ADD CONSTRAINT characters_origin_check CHECK (origin IN ('producer', 'writer'));

ALTER TABLE characters
  DROP COLUMN IF EXISTS locked;

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_project_slug_unique,
  ADD CONSTRAINT characters_project_slug_unique UNIQUE (project_id, character_id);

COMMENT ON COLUMN characters.entity_type IS
  'person | object. object(사물 캐릭터)는 인물 전용 필드(arc/voice/motivation)·턴어라운드 미적용, 단일 레퍼런스 이미지만.';
COMMENT ON COLUMN characters.origin IS
  'producer(게이트에서 확정) | writer(스토리 전개상 추가). 오픈 캐스트 추적 근거. 기존 행은 전부 writer.';
COMMENT ON COLUMN characters.voice IS 'S2 voice — 캐릭터 화법/보이스. writer 생성 또는 producer 입력.';
COMMENT ON COLUMN characters.arc IS 'S2 arc jsonb { start_state, end_state, arc_type }. person 전용.';
COMMENT ON COLUMN characters.motivation IS 'S2 motivation jsonb { want, need, wound? }. person 전용.';
