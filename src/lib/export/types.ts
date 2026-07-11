export type ExportStage = 'producer' | 'writer' | 'artist' | 'director'

export interface ArtifactFile {
  path: string
  kind: 'text' | 'media'
  content?: string | null
  url?: string
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
