-- Align live DB with shipped code (direction A)
-- Created: 2026-06-05 KST
--
-- 배경: 002/003/006 마이그레이션이 라이브 Supabase에 적용된 적이 없어, Director/Editor
-- 코드가 update하는 shots 컬럼들이 실제로 존재하지 않는다. PostgREST가 행 전체를 거부 →
-- Director 카메라/무브먼트 영속화가 조용히 실패(try/catch+warn), Editor 속도는 500.
-- (근거: .claude/cache/db/_code-vs-db-vs-migration.md — PostgREST 컬럼 probe로 실증)
--
-- 이 마이그레이션은 "코드가 실제로 쓰는 컬럼"만 추가한다. 코드가 안 쓰는 컬럼은 제외:
--   · shots/scenes.canvas_position, video_clips.is_final/take_label/override/canvas_position
--     → Director Canvas 노드 위치는 현재 코드가 DB에 영속화하지 않음(grep 0건). 추가 보류.
--   · svc 파이프라인 디자인 토큰 → changes/unify-svc-writer-pipeline §2의 미래 대상.
--     저장 위치(characters/projects 확장 vs 신규 design_tokens)가 열린 질문이라 008로 분리.
--
-- 타입 근거: src/types/shot.ts CameraPreset / DEFAULT_CAMERA_PRESET, editor/speed route(0.25~4.0),
--            src/types/director-canvas.ts StoryboardImage(객체) — storyboard_image는 JSONB.

ALTER TABLE shots
  -- Director 카메라 기어 프리셋 (src/stores/director-store.ts:70-77). 기본값은 DEFAULT_CAMERA_PRESET.
  ADD COLUMN IF NOT EXISTS camera_brand   TEXT          DEFAULT 'arri',
  ADD COLUMN IF NOT EXISTS focal_length   INTEGER       DEFAULT 35,
  ADD COLUMN IF NOT EXISTS aperture       NUMERIC(3,1)  DEFAULT 2.8,
  ADD COLUMN IF NOT EXISTS white_balance  INTEGER       DEFAULT 5600,
  -- Director 무브먼트 프리셋 (src/stores/director-store.ts:488-493).
  ADD COLUMN IF NOT EXISTS movement_preset    TEXT,
  ADD COLUMN IF NOT EXISTS movement_intensity INTEGER   DEFAULT 5,
  -- Editor 속도 (src/app/api/editor/speed/route.ts:27, 0.25~4.0).
  ADD COLUMN IF NOT EXISTS speed          NUMERIC(3,2)  DEFAULT 1.0,
  -- Director-canvas I2I 스토리보드 이미지. 소비측(ShotNode/StoryboardGridView)이 객체로 읽음
  -- ({url,status,errorMessage,...}) → JSONB. ⚠️ upload-image 라우트가 현재 문자열 URL을 쓰므로
  -- 객체를 쓰도록 후속 수정 필요(아래 NOTE).
  ADD COLUMN IF NOT EXISTS storyboard_image JSONB;

COMMENT ON COLUMN shots.storyboard_image IS
  'I2I 생성 샷 대표 이미지 (샷당 1장, 결정 #36/#37). {url, status, errorMessage, generatedAt} 형식.
   소비: src/features/director/canvas-nodes/ShotNode.tsx. null = 미생성.';

-- NOTE(후속 코드 수정, 이 SQL 범위 밖):
--   src/app/api/assets/upload-image/route.ts 는 field='storyboard_image'일 때 publicUrl(문자열)을
--   그대로 update한다. JSONB 컬럼에는 객체 { url, status:'completed', generatedAt } 형태로 써야
--   ShotNode 소비와 정합한다. (reference_image 는 TEXT 그대로 유지 — 문자열 소비)
