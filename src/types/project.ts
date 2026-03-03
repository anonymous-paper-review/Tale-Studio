export type StageId = 'meeting' | 'script' | 'visual' | 'set' | 'post'

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
