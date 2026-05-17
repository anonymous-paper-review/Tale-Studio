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
  switchProject: (id: string, title: string, stage?: StageId) => void
  renameProject: (title: string) => Promise<void>
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
  const { useGlobalChatStore } = require('@/stores/global-chat-store')
  const { useCanvasStore } = require('@/stores/canvas-store')
  const { useAssetStorageStore } = require('@/stores/asset-storage-store')

  useProducerStore.getState().reset()
  useWriterStore.getState().reset()
  useArtistStore.getState().reset()
  useDirectorStore.getState().reset()
  useEditorStore.getState().reset()
  useGlobalChatStore.getState().reset()
  useCanvasStore.getState().reset()
  useAssetStorageStore.getState().reset()
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentStage: 'producer',
  workspaceId: null,
  projectId: null,
  projectTitle: 'Untitled',
  initLoading: false,

  setStage: (stage) => set({ currentStage: stage }),

  canNavigateTo: (_stage) => {
    // TEMP (2026-05-17): 검증 편의 위해 가드 해제. 검증 끝나면 아래 원본 로직으로 복원.
    // const { currentStage } = get()
    // return getStageIndex(stage) <= getStageIndex(currentStage)
    return true
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
      const { useCanvasStore } = require('@/stores/canvas-store')
      useCanvasStore.getState().setProjectId(projectId)
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
      const { useCanvasStore } = require('@/stores/canvas-store')
      useCanvasStore.getState().setProjectId(projectId)
    } catch (err) {
      console.error('[project-store] createNewProject failed:', err)
      set({ initLoading: false })
    }
  },

  switchProject: (id, title, stage) => {
    resetChildStores()
    set({
      projectId: id,
      projectTitle: title,
      currentStage: stage ?? 'producer',
    })
    const { useCanvasStore } = require('@/stores/canvas-store')
    useCanvasStore.getState().setProjectId(id)
  },

  renameProject: async (title: string) => {
    const { projectId } = get()
    if (!projectId) return
    set({ projectTitle: title })
    try {
      await fetch(`/api/project/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    } catch (err) {
      console.error('[project-store] rename failed:', err)
    }
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
