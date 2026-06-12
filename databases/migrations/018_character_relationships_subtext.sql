-- 018_character_relationships_subtext.sql
-- producer-story-gate (결정 3): 관계/서브텍스트는 characters 행이 아닌 프로젝트 차원 데이터 →
--   별도 정규화 테이블. 오픈 캐스트로 인물이 동적으로 늘/줄어도 FK로 무결성 유지(인물 삭제 시 관계 자동 정리).
--
-- 지금까지 relationships/subtext_notes 는 writer가 생성만 하고 writer_runs JSONB에만 남아
--   관계형으로 영속되지 않았다. 본 마이그레이션이 영속 구조를 신설한다.
--
-- 선행: 017 (characters UNIQUE(project_id, character_id) — 복합 FK 대상).
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행 필요.

CREATE TABLE IF NOT EXISTS character_relationships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- 두 인물 slug. characters(project_id, character_id) 복합 FK → 인물 삭제 시 관계 자동 정리.
  character_a text NOT NULL,
  character_b text NOT NULL,
  type text NOT NULL DEFAULT '',
  state_change text,
  visible_in_video boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, character_a)
    REFERENCES characters(project_id, character_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, character_b)
    REFERENCES characters(project_id, character_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_relationships_project
  ON character_relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_character_relationships_a
  ON character_relationships(project_id, character_a);
CREATE INDEX IF NOT EXISTS idx_character_relationships_b
  ON character_relationships(project_id, character_b);

CREATE TABLE IF NOT EXISTS subtext_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- 프로젝트 차원 서브텍스트 노트(string[]). 특정 인물에 묶이지 않음.
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtext_notes_project
  ON subtext_notes(project_id);

COMMENT ON TABLE character_relationships IS
  '오픈 캐스트 관계(StoryRelationship). between=[character_a, character_b] slug. 인물 삭제 시 복합 FK로 자동 정리.';
COMMENT ON TABLE subtext_notes IS
  '프로젝트 차원 서브텍스트 노트(Characters.subtext_notes string[]).';
