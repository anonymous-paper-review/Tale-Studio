// project-share-demo-mode — 데모/공유 스냅샷 타입.
// 스냅샷 = 공유 시점 프로젝트 전체 데이터의 불변 캡처. 데모 모드는 이걸로 스토어를 hydrate 하고
// createClient() 읽기를 여기서 되돌린다(실 DB 미접근).

export type SnapshotRow = Record<string, unknown>

export interface ProjectSnapshot {
  version: 1
  capturedAt: number
  projectId: string
  workspaceId: string | null
  /** projects 단일 행 */
  project: SnapshotRow | null
  /** 테이블명 → 행 배열 (project_id 스코프 덤프). select('*')라 새 컬럼은 자동 포함. */
  tables: Record<string, SnapshotRow[]>
}

export interface ProjectShareRow {
  id: string
  project_id: string
  token: string
  created_by: string | null
  snapshot: ProjectSnapshot | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}
