-- 019_character_image_provenance.sql
-- producer-story-gate (#57, 원천/파생 정합): 파생 이미지의 provenance(입력 지문) + 후보 히스토리.
--
-- ⚠️ PROVISIONAL — Section 5(artist 후보 히스토리/stale UI) 구현 시 형태가 미세 조정될 수 있음.
--    017/018/020(고신뢰)을 먼저 적용하고, 본 파일은 Section 5 진입 직전 적용을 권장.
--
-- 모델:
--   * 선택된 이미지 URL은 기존대로 characters.view_main / view_back / view_side_left / view_side_right 에 남는다
--     (기존 read 경로 무변경). character_image_candidates 가 그 위에 provenance + 히스토리를 얹는다.
--   * 재생성 = 후보 *추가*(선택 자동 교체 없음). 선택본 자동 삭제 금지, 미선택은 슬롯당 최근 N장(앱이 정리).
--   * stale 판정 = 현재 입력 지문(source_hash) vs 선택 후보의 source_hash 비교(순수 함수, Section 5).
--   * source_hash 는 "생성 입력을 조립하는 그 함수"가 함께 계산(분리 금지 — architecture §5).
--
-- 선행: 017 (characters UNIQUE(project_id, character_id)), generation_jobs(016).
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행 필요.

CREATE TABLE IF NOT EXISTS character_image_candidates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_id text NOT NULL,                 -- slug
  view text NOT NULL,                         -- 'main' | 'back' | 'side_left' | 'side_right' | 'object'
  url text NOT NULL,
  source_hash text,                           -- 입력 지문. null = 미상(레거시 backfill) → stale 아님(unknown).
  job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  is_selected boolean NOT NULL DEFAULT false, -- 현재 characters.view_* 에 반영된 후보.
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, character_id)
    REFERENCES characters(project_id, character_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_char_img_candidates_slot
  ON character_image_candidates(project_id, character_id, view, generated_at DESC);

-- 슬롯당 선택본은 최대 1개.
CREATE UNIQUE INDEX IF NOT EXISTS idx_char_img_candidates_one_selected
  ON character_image_candidates(project_id, character_id, view)
  WHERE is_selected;

-- Backfill: 기존 4개 view 컬럼의 URL을 각각 "선택된" 후보로 시드(지문 미상).
INSERT INTO character_image_candidates (project_id, character_id, view, url, is_selected, generated_at)
SELECT c.project_id, c.character_id, v.view, v.url, true, COALESCE(c.updated_at, now())
FROM characters c
CROSS JOIN LATERAL (
  VALUES
    ('main', c.view_main),
    ('back', c.view_back),
    ('side_left', c.view_side_left),
    ('side_right', c.view_side_right)
) AS v(view, url)
WHERE v.url IS NOT NULL AND v.url <> ''
ON CONFLICT DO NOTHING;

COMMENT ON TABLE character_image_candidates IS
  '파생 이미지 후보 히스토리 + provenance(#57). 선택본 URL은 characters.view_*에 미러. 재생성=후보 추가, 선택본 자동 삭제 금지.';
