// project-share-demo-mode — 스냅샷 빌더(server-only).
// 공유 시점 프로젝트 전체를 캡처한다. supabaseAdmin(service-role)로 project_id 스코프 테이블을 덤프.
//
// UI 내성: 각 테이블은 select('*')라 새 컬럼은 자동 포함. 새 "테이블"이 프로젝트 스코프로 추가되면
//   PROJECT_SCOPED_TABLES 에 한 줄만 더한다(allowlist 유지 이유: PostgREST 로 스키마 introspection 불가).
//   미디어(이미지/영상)는 기존 public Storage URL 을 행이 그대로 들고 있어 별도 복제 불요.

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ProjectSnapshot, SnapshotRow } from './types'

/** project_id 컬럼으로 걸리는 프로젝트 스코프 테이블. */
const PROJECT_SCOPED_TABLES = [
  'characters',
  'locations',
  'scenes',
  'shots',
  'video_clips',
  'messages',
  'character_image_candidates',
  'location_image_candidates',
  'character_relationships',
  'subtext_notes',
  'editor_states',
  'camera_light_presets',
] as const

export async function buildProjectSnapshot(
  projectId: string,
): Promise<ProjectSnapshot> {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle()

  const workspaceId =
    (project?.workspace_id as string | undefined) ?? null

  const tables: Record<string, SnapshotRow[]> = {}

  await Promise.all(
    PROJECT_SCOPED_TABLES.map(async (table) => {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .eq('project_id', projectId)
      tables[table] = !error && data ? (data as SnapshotRow[]) : []
    }),
  )

  // 워크스페이스 스코프(인벤토리)는 project_id 가 없어 별도 캡처.
  if (workspaceId) {
    const { data } = await supabaseAdmin
      .from('inventory_items')
      .select('*')
      .eq('workspace_id', workspaceId)
    tables['inventory_items'] = (data as SnapshotRow[] | null) ?? []
  }

  return {
    version: 1,
    capturedAt: Date.now(),
    projectId,
    workspaceId,
    project: (project as SnapshotRow | null) ?? null,
    tables,
  }
}
