-- Shot Storyboard Image Migration
-- Phase ST-1 — Director Storyboard (I2I 샷 이미지 + I2V wire-up)
-- Created: 2026-06-04
--
-- specs/changes/director-storyboard/ (결정 #36/#37) — 샷당 1장의 I2I 생성 이미지를
-- shots 테이블에 storyboard_image JSONB로 저장. 사용자 업로드 reference_images와 의미상 분리.
-- 영상 생성 방식(T2V/I2V)은 generation_method 컬럼.

-- 1. shots.storyboard_image — I2I 생성 샷 대표 이미지
ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS storyboard_image JSONB;

COMMENT ON COLUMN shots.storyboard_image IS
  'I2I 생성 샷 대표 이미지 (샷당 1장, 결정 #36/#37). {url, status, errorMessage, generatedAt} 형식. null = 미생성. 이 이미지가 해당 샷 I2V의 기본 레퍼런스.';

-- 2. shots.generation_method — 영상 생성 방식
ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS generation_method TEXT NOT NULL DEFAULT 'T2V';

COMMENT ON COLUMN shots.generation_method IS
  '영상 생성 방식 T2V|I2V. storyboard_image/레퍼런스 있으면 I2V, 없으면 T2V (결정 #36). 기존 generate-video API의 요구 파라미터와 정합.';
