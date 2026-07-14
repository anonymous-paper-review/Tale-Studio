import { create } from 'zustand'
import type { StageId } from '@/types'
import { STAGES } from '@/lib/constants'
import type { LifecycleStatus } from '@/lib/lifecycle'
import { EMPTY_LIFECYCLE_STATUS } from '@/lib/lifecycle'
import { createClient } from '@/lib/supabase/client'

/* eslint-disable @typescript-eslint/no-require-imports -- Lazy store imports avoid circular Zustand dependencies. */

interface ProjectState {
  currentStage: StageId
  /** 지금까지 도달한 최고 단계(순차 잠금 게이트 기준). 단조 증가 — 뒤로 가도 안 줄어든다. */
  reachedStage: StageId
  workspaceId: string | null
  projectId: string | null
  projectTitle: string
  initLoading: boolean

  // ── writer 산출물 게이트 (씬/샷 존재 여부 = "writer 완료"의 진실) ──
  /** 이 프로젝트에 씬이 존재 = writer 텍스트 파이프라인이 산출물을 남김 */
  writerComplete: boolean
  /** writer run 이 현재 진행 중 (진행 중이면 게이트백하지 않음 — artist 에서 진행률을 본다) */
  writerActive: boolean
  /** writer 산출물 없음 + 진행 중도 아님 + DB 단계가 producer 보다 앞 → producer 재실행 필요 */
  writerNeedsRerun: boolean
  /** Producer/Artist lifecycle gate 상태. Writer 계약이 없으면 unknown으로 둔다. */
  lifecycleStatus: LifecycleStatus

  setStage: (stage: StageId) => void
  /** reachedStage만 전진시켜 현재 보고 있는 stage는 바꾸지 않는다. */
  unlockThrough: (stage: StageId) => void
  canNavigateTo: (stage: StageId) => boolean
  initProject: (projectId?: string) => Promise<void>
  createNewProject: (title?: string) => Promise<void>
  switchProject: (id: string, title: string, stage?: StageId) => void
  renameProject: (title: string) => Promise<void>
  /** 진입 시 writer 산출물(씬) 검증 → 없으면 producer 로 게이트백 + writerNeedsRerun 표시 */
  verifyWriterGate: (projectId: string) => Promise<void>
  setLifecycleStatus: (status: LifecycleStatus) => void
  clearLifecycleStatus: () => void
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
  const { useDirectorCanvasStore } = require('@/stores/director-store')

  useProducerStore.getState().reset()
  useWriterStore.getState().reset()
  useArtistStore.getState().reset()
  useEditorStore.getState().reset()
  useGlobalChatStore.getState().reset()
  useAssetStorageStore.getState().reset()
  // director-store는 persist 캐시를 들고 있어 프로젝트 전환 시 명시적 reset 필요
  useDirectorCanvasStore.getState().reset()
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentStage: 'producer',
  reachedStage: 'producer',
  workspaceId: null,
  projectId: null,
  projectTitle: 'Untitled',
  initLoading: false,
  // 기본 true — 게이트 검증(verifyWriterGate) 전에는 잠그지 않는다(플래시 방지).
  writerComplete: true,
  writerActive: false,
  writerNeedsRerun: false,
  lifecycleStatus: EMPTY_LIFECYCLE_STATUS,

  // currentStage는 "지금 보는 단계", reachedStage는 "지금까지 연 최고 단계".
  // 뒤로 가도(currentStage 후퇴) 이미 연 단계가 잠기지 않도록 reachedStage는 단조 증가.
  setStage: (stage) =>
    set((s) => ({
      currentStage: stage,
      reachedStage: furtherStage(s.reachedStage, stage),
    })),

  unlockThrough: (stage) =>
    set((s) => ({
      reachedStage: furtherStage(s.reachedStage, stage),
    })),

  canNavigateTo: (stage) => {
    // 순차 잠금: producer→artist→director→editor 순으로 하나씩 열린다.
    // 도달한 최고 단계(reachedStage)까지만 진입 허용 — 다음 단계는 handoff로 열린다
    // (producer CTA / artist·director의 HandoffButton이 setStage로 reachedStage를 전진).
    return getStageIndex(stage) <= getStageIndex(get().reachedStage)
  },

  setLifecycleStatus: (status) => set({ lifecycleStatus: status }),
  clearLifecycleStatus: () => set({ lifecycleStatus: EMPTY_LIFECYCLE_STATUS }),

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
        lifecycleStatus: EMPTY_LIFECYCLE_STATUS,
      })
      const { useDirectorCanvasStore } = require('@/stores/director-store')
      useDirectorCanvasStore.getState().setProjectId(projectId)
    } catch (err) {
      console.error('[project-store] initProject failed:', err)
      set({ initLoading: false })
    }
  },

  createNewProject: async (title) => {
    resetChildStores()
    set({ initLoading: true })
    try {
      const trimmed = title?.trim() || 'Untitled'
      const res = await fetch('/api/project/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      if (!res.ok) throw new Error('Failed to create project')
      const { workspaceId, projectId } = await res.json()
      set({
        workspaceId,
        projectId,
        projectTitle: trimmed,
        initLoading: false,
        currentStage: 'producer',
        reachedStage: 'producer',
        writerComplete: true,
        writerActive: false,
        writerNeedsRerun: false,
        lifecycleStatus: EMPTY_LIFECYCLE_STATUS,
        })
      const { useDirectorCanvasStore } = require('@/stores/director-store')
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
      // 새 프로젝트 진입 — 게이트 플래그 초기화 (verifyWriterGate 가 곧 재계산).
      writerComplete: true,
      writerActive: false,
      writerNeedsRerun: false,
      lifecycleStatus: EMPTY_LIFECYCLE_STATUS,
    })
    const { useDirectorCanvasStore } = require('@/stores/director-store')
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

  // 진입 시 writer 산출물 게이트 검증.
  //   - 씬이 있으면 → writer 완료. 잠그지 않는다(현 단계 그대로).
  //   - 씬이 없고 writer run 도 진행 중이 아니고 DB 단계가 producer 보다 앞이면
  //     → "깨진 진행"(옛 깨진 writer / 중단). producer 로 게이트백 + 재실행 플래그.
  //   - 씬 없지만 run 이 진행 중이면 → 잠그지 않는다(artist 에서 진행률 관찰).
  //   양쪽 진입 경로(새로고침=initProject, 홈 클릭=switchProject) 모두 projectId 가
  //   세팅된 뒤 StudioLayout 이 1회 호출한다.
  verifyWriterGate: async (projectId) => {
    if (!projectId) return
    const origStage = get().currentStage
    try {
      const supabase = createClient()
      const [{ data: scenes }, { data: sourceLocations }] = await Promise.all([
        supabase
          .from('scenes')
          .select('scene_id')
          .eq('project_id', projectId)
          .limit(1),
        supabase
          .from('locations')
          .select('location_id, origin, visual_description')
          .eq('project_id', projectId)
          .limit(1),
      ])
      const hasScenes = !!(scenes && scenes.length > 0)
      const hasArtistSourceLocations = !!(sourceLocations && sourceLocations.length > 0)

      // writer_runs 는 RLS(service-role only)라 클라이언트가 못 읽음 → 서버 status 라우트 사용.
      let writerActive = false
      let writerFailed = false
      try {
        const r = await fetch(`/api/writer/status/${projectId}`)
        if (r.ok) {
          const s = await r.json()
          writerActive = !!(s?.started && !s?.pipeline_completed && !s?.pipeline_failed)
          writerFailed = !!s?.pipeline_failed
        }
      } catch {
        // status 조회 실패 → writerActive=false (씬 없으면 안전하게 게이트백)
      }

      const incomplete = !hasScenes && !writerActive
      // Producer-origin backgrounds now unlock Artist world generation before writer scenes exist.
      // If location source exists, keep Artist reachable but still expose rerun/failure state.
      const needsRerun = incomplete && (origStage !== 'producer' || writerFailed)
      const shouldGateBack = needsRerun && !hasArtistSourceLocations

      set({ writerComplete: hasScenes, writerActive, writerNeedsRerun: needsRerun })

      if (shouldGateBack) {
        // 단조 증가 reachedStage 를 의도적으로 producer 로 강제 하향 (setStage 우회).
        //   StudioLayout 의 canNavigateTo 가드가 잠긴 단계 URL 을 producer 로 리다이렉트한다.
        set({ currentStage: 'producer', reachedStage: 'producer' })
      }
    } catch (err) {
      console.error('[project-store] verifyWriterGate failed:', err)
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
      writerComplete: true,
      writerActive: false,
      writerNeedsRerun: false,
      lifecycleStatus: EMPTY_LIFECYCLE_STATUS,
    })
  },
}))
