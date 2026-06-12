import { create } from 'zustand'
import type { ProjectSettings, ProjectFormat } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'
import { depthLevelFromRuntime } from '@/lib/depth'
import { assignCastSlugs } from '@/lib/cast-slug'
import type {
  CastMember,
  CastArc,
  CastMotivation,
  EntityType,
} from '@/lib/producer-gate'

// 채팅이 스토리에서 추출한 캐스트 후보 (제안일 뿐 — 사용자가 카드에서 확정/수정).
export interface ExtractedCastMember {
  name?: string
  entityType?: EntityType
  appearance?: string
  role?: string
  voice?: string
  arc?: Partial<CastArc>
  motivation?: Partial<CastMotivation>
}

interface ExtractedSettings {
  playtime?: number
  genre?: string
  subGenre?: string
  format?: ProjectFormat
  tone?: string[]
  targetEmotion?: string[]
  dialogueLanguage?: string
  storyText?: string
  storyReady?: boolean
  characters?: ExtractedCastMember[]
}

function newLocalId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `cast_${Math.random().toString(36).slice(2)}_${Date.now()}`
  }
}

// 추출 캐스트 병합: 빈칸만 채우는 자율 규칙 (architecture §5 원천 공동편집).
//   - 이름이 같은 기존 멤버가 있으면 비어 있는 필드만 보강 (사용자 입력 덮어쓰기 금지).
//   - 없으면 신규 후보로 추가.
function mergeExtractedCast(
  existing: CastMember[],
  extracted: ExtractedCastMember[],
): CastMember[] {
  const next = existing.map((m) => ({ ...m }))
  for (const e of extracted) {
    const name = (e.name ?? '').trim()
    if (!name) continue
    const match = next.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())
    if (match) {
      if (!match.appearance && e.appearance) match.appearance = e.appearance
      if (!match.voice && e.voice) match.voice = e.voice
      if (!match.role && e.role) match.role = e.role
      if (!match.arc && e.arc && (e.arc.start_state || e.arc.end_state || e.arc.arc_type))
        match.arc = { start_state: '', end_state: '', arc_type: '', ...e.arc }
      if (!match.motivation && e.motivation && e.motivation.want)
        match.motivation = { want: '', ...e.motivation }
    } else {
      next.push({
        localId: newLocalId(),
        name,
        entityType: e.entityType === 'object' ? 'object' : 'person',
        appearance: e.appearance ?? '',
        role: e.role,
        voice: e.voice,
        arc:
          e.arc && (e.arc.start_state || e.arc.end_state || e.arc.arc_type)
            ? { start_state: '', end_state: '', arc_type: '', ...e.arc }
            : undefined,
        motivation: e.motivation?.want ? { want: '', ...e.motivation } : undefined,
        origin: 'producer',
      })
    }
  }
  return next
}

interface ProducerState {
  storyText: string
  storyReady: boolean
  projectSettings: ProjectSettings
  cast: CastMember[]
  syncing: boolean
  error: string | null

  setStoryText: (text: string) => void
  updateSettings: (partial: Partial<ProjectSettings>) => void
  applyExtractedSettings: (extracted: ExtractedSettings) => void
  addCastMember: (entityType: EntityType) => string
  updateCastMember: (localId: string, patch: Partial<CastMember>) => void
  removeCastMember: (localId: string) => void
  saveAndHandoff: () => Promise<boolean>
  loadProject: () => Promise<void>
  clearError: () => void
  reset: () => void
}

const DEFAULT_SETTINGS: ProjectSettings = {
  playtime: 0,
  genre: '',
  format: 'horizontal_16:9',
  tone: [],
  targetEmotion: [],
  dialogueLanguage: '',
}

export const useProducerStore = create<ProducerState>((set, get) => ({
  storyText: '',
  storyReady: false,
  projectSettings: { ...DEFAULT_SETTINGS },
  cast: [],
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
      const {
        storyText: nextStory,
        storyReady: nextReady,
        characters: extractedCast,
        ...settingsPatch
      } = extracted
      return {
        projectSettings: {
          ...state.projectSettings,
          ...settingsPatch,
        },
        cast:
          extractedCast && extractedCast.length > 0
            ? mergeExtractedCast(state.cast, extractedCast)
            : state.cast,
        storyText: nextStory ? nextStory : state.storyText,
        storyReady: nextReady === true ? true : state.storyReady,
      }
    }),

  addCastMember: (entityType) => {
    const localId = newLocalId()
    set((state) => ({
      cast: [
        ...state.cast,
        { localId, name: '', entityType, appearance: '', origin: 'producer' },
      ],
    }))
    return localId
  },

  updateCastMember: (localId, patch) =>
    set((state) => ({
      cast: state.cast.map((m) => (m.localId === localId ? { ...m, ...patch } : m)),
    })),

  removeCastMember: (localId) =>
    set((state) => ({
      cast: state.cast.filter((m) => m.localId !== localId),
    })),

  saveAndHandoff: async () => {
    const { storyText, projectSettings, cast } = get()
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
          // 핸드오프 → writer 탭(러프 스토리보드, 2026-06-12 부활). 파이프라인은 아래에서
          //   백그라운드 발사되고, 사용자는 writer 탭에서 진행/결과(러프 보드)를 본다.
          //   current_stage 는 낙관적으로 writer 로 올리되(진행 중 새로고침에도 유지),
          //   진입 게이트(verifyWriterGate)가 "씬 없음 + run 없음/실패"면 producer 로 되돌려
          //   빈 화면 진입을 막는다(자가 교정).
          current_stage: 'writer',
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

        // producer-story-gate §3: 확정 장르(완성형) + 캐스트 계약 조립.
        //   slug 는 producer 가 부여(생성 후 불변). writer 는 이를 seed 로 받아 s0/s2 를 생략한다.
        const slugged = assignCastSlugs(cast)
        const castContract = {
          characters: slugged.map((m) => ({
            character_id: m.character_id,
            name: m.name,
            entity_type: m.entityType,
            role: m.role,
            appearance: m.appearance,
            voice: m.voice,
            arc: m.arc,
            motivation: m.motivation,
          })),
        }
        const genre = {
          genre: projectSettings.genre,
          subGenre: projectSettings.subGenre || undefined,
          tone: projectSettings.tone,
          targetEmotion: projectSettings.targetEmotion,
          runtime_seconds: projectSettings.playtime,
          depth_level: depthLevelFromRuntime(projectSettings.playtime || 0),
          format: projectSettings.format,
        }

        await fetch('/api/writer/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId,
            story: storyText,
            runtimeSeconds,
            genre,
            cast: castContract,
          }),
        }).catch((e) => {
          // writer 시작 실패는 무시 (UI에 표시는 status polling이 함)
          console.warn('[producer] writer-pipeline start failed (non-blocking):', e)
        })
      } catch (writerErr) {
        console.warn('[producer] writer-pipeline trigger error (non-blocking):', writerErr)
      }

      useProjectStore.getState().setStage('writer')
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

      // 캐스트는 characters 테이블이 단일 진실 (pull) — producer/writer/artist 공용.
      //   재진입 시 기존(producer·writer-origin 무관) 행을 카드로 복원.
      const { data: chars } = await supabase
        .from('characters')
        .select('id, character_id, name, role, entity_type, appearance, voice, arc, motivation, origin')
        .eq('project_id', projectId)

      if (project) {
        set({
          storyText: project.story_text ?? '',
          // 이미 저장된 스토리가 있으면 "준비됨"으로 본다 — 핸드오프/재실행 버튼이
          //   storyReady 게이트에 막혀 비활성화되지 않도록 (writer 재실행 가능하게).
          storyReady: !!(project.story_text && project.story_text.trim().length > 0),
          projectSettings: {
            ...DEFAULT_SETTINGS,
            ...(project.settings as Partial<ProjectSettings>),
          },
          cast: (chars ?? []).map((c): CastMember => ({
            localId: c.id as string,
            characterId: c.character_id as string,
            name: (c.name as string) ?? '',
            entityType: c.entity_type === 'object' ? 'object' : 'person',
            appearance: (c.appearance as string) ?? '',
            role: (c.role as string) ?? undefined,
            voice: (c.voice as string) ?? undefined,
            arc: (c.arc as CastArc) ?? undefined,
            motivation: (c.motivation as CastMotivation) ?? undefined,
            origin: c.origin === 'writer' ? 'writer' : 'producer',
          })),
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
      cast: [],
      syncing: false,
      error: null,
    }),
}))
