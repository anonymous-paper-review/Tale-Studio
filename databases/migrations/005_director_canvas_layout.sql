-- Director Canvas Layout Migration
-- Phase D-1.1 — Director Canvas 노드 그래프 재설계
-- Created: 2026-05-25
--
-- specs/layers/director_canvas.md §15 (결정 #15) — 노드 위치는 shots/scenes 테이블의
-- canvas_position JSONB 컬럼에 같이 저장. 별도 layout 테이블 X.

-- 1. scenes.canvas_position — Scene 노드 위치
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS canvas_position JSONB;

COMMENT ON COLUMN scenes.canvas_position IS
  'Director Canvas의 Scene 노드 좌표. {x: number, y: number} 형식. null = 미배치(자동 배치 트리거)';

-- 2. shots.canvas_position — Shot 노드 위치
ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS canvas_position JSONB;

COMMENT ON COLUMN shots.canvas_position IS
  'Director Canvas의 Shot 노드 좌표. {x: number, y: number} 형식. null = 미배치(부모 Scene 우측 자동 stacking)';

-- 3. video_clips: Director Canvas의 Video 테이크는 한 Shot 아래 여러 개 가능
--    기존 스키마가 1:1(shot_id PK)이라면 다음 변경 필요할 수 있음. 우선은 컬럼만 추가.
--    실제 row 모델 결정은 D-5(영상 생성 wire-up)에서 확정.
ALTER TABLE video_clips
  ADD COLUMN IF NOT EXISTS canvas_position JSONB,
  ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS take_label TEXT,
  ADD COLUMN IF NOT EXISTS override JSONB;

COMMENT ON COLUMN video_clips.canvas_position IS
  'Director Canvas의 Video 노드 좌표';
COMMENT ON COLUMN video_clips.is_final IS
  'Editor 핸드오프 시 선정되는 ★ Final 마킹. Shot당 1개 강제(앱 레벨 enforce, 결정 #11)';
COMMENT ON COLUMN video_clips.take_label IS
  'take_v1 등 마더 Shot 안에서의 테이크 순번 라벨';
COMMENT ON COLUMN video_clips.override IS
  '마더 Shot 대비 변경된 필드 스냅샷 {prompt?, camera?, lighting?, cameraPreset?, provider?}';

-- 4. 부분 인덱스: 한 Shot 내 Final Video 빠른 조회
CREATE INDEX IF NOT EXISTS idx_video_clips_shot_final
  ON video_clips(shot_id) WHERE is_final = TRUE;
