import { create } from 'zustand'
import type { StageId } from '@/types'
import { STAGES } from '@/lib/constants'

interface ProjectState {
  currentStage: StageId
  /** 지금까지 도달한 최고 단계(순차 잠금 게이트 기준). 단조 증가 — 뒤로 가도 안 줄어든다. */
  reachedStage: StageId
  workspaceId: string | null
  projectId: string | null
  projectTitle: string
  initLoading: boolean

  setStage: (stage: StageId) => void
  canNavigateTo: (stage: StageId) => boolean
  initProject: (projectId?: string) => Promise<void>
  createNewProject: () => Promise<void>
  switchProject: (id: string, title: string, stage?: StageId) => void
  renameProject: (title: string) => Promise<void>
  resetProject: () => void
}

function getStageIndex(id: StageId): number {
  return STAGES.findIndex((s) => s.id === id)
}

/** 두 단계 중 더 진행된 쪽을 반환 (reachedStage 단조 증가용). */
function furtherStage(a: StageId, b: StageId): StageId {
  return getStageIndex(a) >= getStageIndex(b) ? a : b
}

function resetChildStores() {
  // Lazy imports to avoid circular dependencies
  const { useProducerStore } = require('@/stores/producer-store')
  const { useWriterStore } = require('@/stores/writer-store')
  const { useArtistStore } = require('@/stores/artist-store')
  const { useEditorStore } = require('@/stores/editor-store')
  const { useGlobalChatStore } = require('@/stores/global-chat-store')
  const { useAssetStorageStore } = require('@/stores/asset-storage-store')
  const { useDirectorCanvasStore } = require('@/stores/director-canvas-store')

  useProducerStore.getState().reset()
  useWriterStore.getState().reset()
  useArtistStore.getState().reset()
  useEditorStore.getState().reset()
  useGlobalChatStore.getState().reset()
  useAssetStorageStore.getState().reset()
  // director-canvas-store는 persist 캐시를 들고 있어 프로젝트 전환 시 명시적 reset 필요
  useDirectorCanvasStore.getState().reset()
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentStage: 'producer',
  reachedStage: 'producer',
  workspaceId: null,
  projectId: null,
  projectTitle: 'Untitled',
  initLoading: false,

  // currentStage는 "지금 보는 단계", reachedStage는 "지금까지 연 최고 단계".
  // 뒤로 가도(currentStage 후퇴) 이미 연 단계가 잠기지 않도록 reachedStage는 단조 증가.
  setStage: (stage) =>
    set((s) => ({
      currentStage: stage,
      reachedStage: furtherStage(s.reachedStage, stage),
    })),

  canNavigateTo: (stage) => {
    // 순차 잠금: producer→artist→director→editor 순으로 하나씩 열린다.
    // 도달한 최고 단계(reachedStage)까지만 진입 허용 — 다음 단계는 handoff로 열린다
    // (producer CTA / artist·director의 HandoffButton이 setStage로 reachedStage를 전진).
    return getStageIndex(stage) <= getStageIndex(get().reachedStage)
  },

  initProject: async (restoreId?: string) => {
    if (get().projectId) return
    set({ initLoading: true })
    try {
      // restoreId 힌트(URL ?projectId)가 있으면 그 프로젝트를 복원, 없으면 최신 fallback
      const url = restoreId
        ? `/api/project/init?projectId=${encodeURIComponent(restoreId)}`
        : '/api/project/init'
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to init project')
      const { workspaceId, projectId, project } = await res.json()
      set({
        workspaceId,
        projectId,
        projectTitle: project.title ?? 'Untitled',
        initLoading: false,
        currentStage: project.current_stage ?? 'producer',
        // DB current_stage = 지금까지 진행한 최고 단계 → 새로고침/복원 시 그만큼 열어둔다
        reachedStage: project.current_stage ?? 'producer',
      })
      const { useDirectorCanvasStore } = require('@/stores/director-canvas-store')
      useDirectorCanvasStore.getState().setProjectId(projectId)
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
        reachedStage: 'producer',
        })
      const { useDirectorCanvasStore } = require('@/stores/director-canvas-store')
      useDirectorCanvasStore.getState().setProjectId(projectId)
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
      reachedStage: stage ?? 'producer',
    })
    const { useDirectorCanvasStore } = require('@/stores/director-canvas-store')
    useDirectorCanvasStore.getState().setProjectId(id)
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
      reachedStage: 'producer',
      initLoading: false,
    })
  },
}))
