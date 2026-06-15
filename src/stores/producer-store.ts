import { create } from 'zustand'
import type { ProjectSettings, ProjectFormat } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { depthLevelFromRuntime } from '@/lib/depth'
import { assignCastSlugs } from '@/lib/cast-slug'
import { computeProducerSourceHash } from '@/lib/lifecycle'
import { createPendingProposal } from '@/lib/pending-proposal'
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
  arc?: Partial<CastArc>
  motivation?: Partial<CastMotivation>
}

export interface ExtractedSettings {
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
  applyProducerSourcePatch: (patch: ExtractedSettings) => void
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

const SOURCE_SETTING_KEYS = [
  'playtime',
  'genre',
  'subGenre',
  'format',
  'tone',
  'targetEmotion',
  'dialogueLanguage',
] as const

function isMeaningfulExtractedValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return value > 0
  if (Array.isArray(value)) return value.length > 0
  return value != null
}

function normalizedComparable(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return JSON.stringify([...value].sort())
  return JSON.stringify(value ?? null)
}

function extractedOverwritesExisting(
  state: Pick<ProducerState, 'storyText' | 'projectSettings'>,
  extracted: ExtractedSettings,
): string[] {
  const overwritten: string[] = []
  if (
    isMeaningfulExtractedValue(extracted.storyText) &&
    state.storyText.trim().length > 0 &&
    normalizedComparable(extracted.storyText) !== normalizedComparable(state.storyText)
  ) {
    overwritten.push('storyText')
  }

  for (const key of SOURCE_SETTING_KEYS) {
    const next = extracted[key]
    const current = state.projectSettings[key]
    if (
      isMeaningfulExtractedValue(next) &&
      isMeaningfulExtractedValue(current) &&
      normalizedComparable(next) !== normalizedComparable(current)
    ) {
      overwritten.push(key)
    }
  }

  return overwritten
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

  applyExtractedSettings: (extracted) => {
    if (!extracted) return
    const project = useProjectStore.getState()
    const current = get()
    const afterHandoff = project.reachedStage !== 'producer'
    const overwritten = extractedOverwritesExisting(current, extracted)

    if (afterHandoff && overwritten.length > 0) {
      const accepted = useGlobalChatStore.getState().offerPendingProposal(
        createPendingProposal({
          stage: 'producer',
          kind: 'producerSourcePatch',
          target: 'Producer source',
          action: '채팅이 제안한 story/settings 변경 적용',
          impact: [
            `덮어쓰기 필드: ${overwritten.join(', ')}`,
            '기존 Writer/Artist 산출물이 낡을 수 있어요.',
            '승인 전에는 현재 Producer 값이 유지됩니다.',
          ],
          payload: { patch: extracted },
        }),
      )
      if (!accepted) set({ error: '이미 대기 중인 제안이 있어 새 Producer 변경 제안을 보류했어요.' })
      return
    }

    get().applyProducerSourcePatch(extracted)
  },

  applyProducerSourcePatch: (patch) =>
    set((state) => {
      const {
        storyText: nextStory,
        storyReady: nextReady,
        characters: extractedCast,
        ...settingsPatch
      } = patch
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
      const producerSourceHash = computeProducerSourceHash({
        storyText,
        settings: projectSettings,
        cast,
      })
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({
          story_text: storyText,
          settings: projectSettings,
          // current_stage 는 MVP에서 "최고로 열린 단계"로 재사용한다.
          // Producer gate 통과 후 Writer를 보여주되 Artist도 병렬 작업 가능해야 하므로
          // DB unlock은 artist까지 올리고, 클라이언트 currentStage만 writer로 둔다.
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
            producerSourceHash,
          }),
        }).catch((e) => {
          // writer 시작 실패는 무시 (UI에 표시는 status polling이 함)
          console.warn('[producer] writer-pipeline start failed (non-blocking):', e)
        })
      } catch (writerErr) {
        console.warn('[producer] writer-pipeline trigger error (non-blocking):', writerErr)
      }

      useProjectStore.getState().unlockThrough('artist')
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
        .select('id, character_id, name, role, entity_type, appearance, arc, motivation, origin')
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
