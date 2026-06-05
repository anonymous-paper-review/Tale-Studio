import { create } from 'zustand'
import type { ProjectSettings } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'

interface ExtractedSettings {
  playtime?: number
  genre?: string
  aspectRatio?: '16:9' | '9:16' | '1:1'
  toneStyle?: string
  dialogueLanguage?: string
  storyText?: string
  storyReady?: boolean
}

interface ProducerState {
  storyText: string
  storyReady: boolean
  projectSettings: ProjectSettings
  syncing: boolean
  error: string | null

  setStoryText: (text: string) => void
  updateSettings: (partial: Partial<ProjectSettings>) => void
  applyExtractedSettings: (extracted: ExtractedSettings) => void
  saveAndHandoff: () => Promise<boolean>
  loadProject: () => Promise<void>
  clearError: () => void
  reset: () => void
}

const DEFAULT_SETTINGS: ProjectSettings = {
  playtime: 0,
  genre: '',
  aspectRatio: '16:9',
  toneStyle: '',
  dialogueLanguage: '',
}

export const useProducerStore = create<ProducerState>((set, get) => ({
  storyText: '',
  storyReady: false,
  projectSettings: { ...DEFAULT_SETTINGS },
  syncing: false,
  error: null,

  setStoryText: (text) => set({ storyText: text }),

  updateSettings: (partial) =>
    set((state) => ({
      projectSettings: { ...state.projectSettings, ...partial },
    })),

  applyExtractedSettings: (extracted) =>
    set((state) => {
      if (!extracted) return state
      const { storyText: nextStory, storyReady: nextReady, ...settingsPatch } =
        extracted
      return {
        projectSettings: {
          ...state.projectSettings,
          ...settingsPatch,
        },
        storyText: nextStory ? nextStory : state.storyText,
        storyReady: nextReady === true ? true : state.storyReady,
      }
    }),

  saveAndHandoff: async () => {
    const { storyText, projectSettings } = get()
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return false

    set({ syncing: true, error: null })

    // 시간측정: 핸드오프 클릭 시각을 기록 → artist 가 "이미지 생성 가능"까지의 end-to-end 를 계산.
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`handoffStartedAt:${projectId}`, String(Date.now()))
      } catch {}
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({
          story_text: storyText,
          settings: projectSettings,
          // writer는 백그라운드 전용 스테이지 → 사용자는 artist로 직행 (decisions #37)
          current_stage: 'artist',
        })
        .eq('id', projectId)

      if (error) throw error

      // writer 파이프라인 백그라운드 시작 — 단일 생산자(§3 일원화). S0~L5 텍스트 단계가
      //   DB scenes/characters/locations/shots 를 채워 artist/director 가 읽는다(persist_manifest).
      //   옛 generate-scenes 는 제거됨. 2분 가량 걸리므로 await 하지 않음(fire-and-forget).
      try {
        const runtimeSeconds = typeof projectSettings.playtime === 'number' && projectSettings.playtime > 0
          ? projectSettings.playtime
          : undefined
        await fetch('/api/writer/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId,
            story: storyText,
            runtimeSeconds,
          }),
        }).catch((e) => {
          // writer 시작 실패는 무시 (UI에 표시는 status polling이 함)
          console.warn('[producer] writer-pipeline start failed (non-blocking):', e)
        })
      } catch (writerErr) {
        console.warn('[producer] writer-pipeline trigger error (non-blocking):', writerErr)
      }

      useProjectStore.getState().setStage('artist')
      set({ syncing: false })
      return true
    } catch (err) {
      set({
        syncing: false,
        error: err instanceof Error ? err.message : 'Save failed',
      })
      return false
    }
  },

  loadProject: async () => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return

    try {
      const supabase = createClient()
      const { data: project } = await supabase
        .from('projects')
        .select('story_text, settings')
        .eq('id', projectId)
        .single()

      if (project) {
        set({
          storyText: project.story_text ?? '',
          projectSettings: {
            ...DEFAULT_SETTINGS,
            ...(project.settings as Partial<ProjectSettings>),
          },
        })
      }
    } catch (err) {
      console.error('[producer-store] loadProject failed:', err)
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      storyText: '',
      storyReady: false,
      projectSettings: { ...DEFAULT_SETTINGS },
      syncing: false,
      error: null,
    }),
}))
