export type StageId = 'producer' | 'writer' | 'artist' | 'director' | 'editor'

export interface StageConfig {
  id: StageId
  name: string
  agent: string
  path: string
  handoffLabel: string
  nextStage: StageId | null
}

export interface ProjectSettings {
  playtime: number // seconds
  genre: string
  aspectRatio: '16:9' | '9:16' | '1:1'
  toneStyle: string
  dialogueLanguage: string // BCP-47 short code: 'en', 'ko', 'ja', 'zh', ...
}

export interface Project {
  id: string
  title: string
  storyText: string
  settings: ProjectSettings
  currentStage: StageId
  createdAt: string
  updatedAt: string
}
