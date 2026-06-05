-- 014_inventory_items.sql
-- Workspace 단위 재사용 에셋 라이브러리.
-- 이미지는 저장 시점에 ${workspaceId}/inventory/${itemId}.${ext} 경로로 바이트 복사(원본 삭제와 독립).
-- RLS ENABLE + policy 없음 = service_role(서버 API)만. 클라는 /api/inventory 경유(getUser).
-- Created: 2026-06-06 KST
--
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행.

CREATE TABLE IF NOT EXISTS inventory_items (
  id                  uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind                text NOT NULL,                  -- 'character' | 'world' | 'image'
  name                text NOT NULL,
  image_url           text NOT NULL,                  -- workspace storage publicUrl (복사본)
  storage_path        text NOT NULL,                  -- media 버킷 내 객체 경로 (삭제 시 사용 — URL 역산 금지)
  thumbnail_url       text,                           -- nullable, 없으면 image_url 폴백
  source_project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  source_character_id text,                           -- 출처 추적 (FK 아님)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_workspace
  ON inventory_items(workspace_id, created_at DESC);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
