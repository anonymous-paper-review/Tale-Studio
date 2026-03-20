import { create } from 'zustand'
import type { StageId } from '@/types'
import { STAGES } from '@/lib/constants'

interface ProjectState {
  currentStage: StageId
  workspaceId: string | null
  projectId: string | null
  projectTitle: string
  initLoading: boolean

  setStage: (stage: StageId) => void
  canNavigateTo: (stage: StageId) => boolean
  initProject: () => Promise<void>
  createNewProject: () => Promise<void>
  switchProject: (id: string, title: string) => void
  resetProject: () => void
}

function getStageIndex(id: StageId): number {
  return STAGES.findIndex((s) => s.id === id)
}

function resetChildStores() {
  // Lazy imports to avoid circular dependencies
  const { useProducerStore } = require('@/stores/producer-store')
  const { useWriterStore } = require('@/stores/writer-store')
  const { useArtistStore } = require('@/stores/artist-store')
  const { useDirectorStore } = require('@/stores/director-store')
  const { useEditorStore } = require('@/stores/editor-store')

  useProducerStore.getState().reset()
  useWriterStore.getState().reset()
  useArtistStore.getState().reset()
  useDirectorStore.getState().reset()
  useEditorStore.getState().reset()
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentStage: 'producer',
  workspaceId: null,
  projectId: null,
  projectTitle: 'Untitled',
  initLoading: false,

  setStage: (stage) => set({ currentStage: stage }),

  canNavigateTo: (stage) => {
    const { currentStage } = get()
    return getStageIndex(stage) <= getStageIndex(currentStage)
  },

  initProject: async () => {
    if (get().projectId) return
    set({ initLoading: true })
    try {
      const res = await fetch('/api/project/init', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to init project')
      const { workspaceId, projectId, project } = await res.json()
      set({
        workspaceId,
        projectId,
        projectTitle: project.title ?? 'Untitled',
        initLoading: false,
        currentStage: project.current_stage ?? 'producer',
      })
    } catch (err) {
      console.error('[project-store] initProject failed:', err)
      set({ initLoading: false })
    }
  },

  createNewProject: async () => {
    resetChildStores()
    set({ initLoading: true })
    try {
      const res = await fetch('/api/project/new', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to create project')
      const { workspaceId, projectId } = await res.json()
      set({
        workspaceId,
        projectId,
        projectTitle: 'Untitled',
        initLoading: false,
        currentStage: 'producer',
        })
    } catch (err) {
      console.error('[project-store] createNewProject failed:', err)
      set({ initLoading: false })
    }
  },

  switchProject: (id, title) => {
    resetChildStores()
    set({
      projectId: id,
      projectTitle: title,
      currentStage: 'producer',
    })
  },

  resetProject: () => {
    set({
      workspaceId: null,
      projectId: null,
      projectTitle: 'Untitled',
      currentStage: 'producer',
      initLoading: false,
    })
  },
}))
