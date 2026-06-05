-- Camera/Light Preset Library — Director Canvas D-6 (decisions #46)
-- Created: 2026-06-05 KST
--
-- Director Canvas의 카메라/조명/렌즈 셋업을 프리셋으로 저장해 재사용 (내부 #16).
-- 프리셋 적용 = camera/lighting/camera_preset 전체 덮어쓰기 (prompt/참고이미지는 유지).
-- project_id 1:N presets. 프로젝트 삭제 시 cascade.
--
-- JSONB shape:
--   camera        = CameraConfig { horizontal, vertical, pan, tilt, roll, zoom }
--   lighting      = LightingConfig { position, brightness, colorTemp }
--   camera_preset = CameraPreset { brand, focalLength, aperture, whiteBalance }
--
-- 소비: src/stores/preset-storage-store.ts ← /api/director/presets
-- RLS: 미설정(앱 레벨 project 필터 + 서버 supabase 클라이언트). 다른 앱 테이블 관행과 동일.

CREATE TABLE IF NOT EXISTS camera_light_presets (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  camera        jsonb NOT NULL,
  lighting      jsonb NOT NULL,
  camera_preset jsonb NOT NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camera_light_presets_project
  ON camera_light_presets(project_id);

COMMENT ON TABLE camera_light_presets IS
  'Director Canvas 카메라/조명/렌즈 프리셋 라이브러리 (D-6, 결정 #46). project_id 1:N.
   적용 = camera/lighting/camera_preset 전체 덮어쓰기, prompt 유지 (내부 #16).';
