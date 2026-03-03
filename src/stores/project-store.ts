import { create } from 'zustand'
import type { StageId } from '@/types'
import { STAGES } from '@/lib/constants'

interface ProjectState {
  currentStage: StageId
  videoGenerationStarted: boolean

  setStage: (stage: StageId) => void
  startVideoGeneration: () => void
  canNavigateTo: (stage: StageId) => boolean
}

function getStageIndex(id: StageId): number {
  return STAGES.findIndex((s) => s.id === id)
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentStage: 'visual',
  videoGenerationStarted: false,

  setStage: (stage) => set({ currentStage: stage }),

  startVideoGeneration: () => set({ videoGenerationStarted: true }),

  canNavigateTo: (stage) => {
    const { videoGenerationStarted, currentStage } = get()
    if (!videoGenerationStarted) return true
    return getStageIndex(stage) >= getStageIndex(currentStage)
  },
}))
