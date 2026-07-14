export type ExportStage = 'producer' | 'writer' | 'artist' | 'director'

export interface ArtifactFile {
  path: string
  kind: 'text' | 'media'
  content?: string | null
  url?: string
  /** 클라이언트에서 생성한 바이너리(캔버스 캡처 등) — url 대신 그대로 zip에 담는다. */
  blob?: Blob
}

export interface StageExport {
  stage: ExportStage
  files: ArtifactFile[]
}

export interface ExportBundle {
  project: { id: string; name: string }
  createdAt: string
  stages: StageExport[]
}

export interface ExportResult {
  total: number
  downloaded: number
  failed: number
}
