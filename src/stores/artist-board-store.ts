// Artist New UI (asset-shot board) 의 샷 데이터 스토어.
//
// 씬은 artist-store.sceneManifest.scenes 를 그대로 쓰고(중복 로드 없음), 여기는 director 전단계의
// "샷 ↔ 에셋 연결" 편집에 필요한 shots 행만 든다.
//   - 인물 참조: shots.characters (writer 가 채운 기존 컬럼을 그대로 편집)
//   - 배경 참조: shots.location_ids (029) — null=씬(scenes.location) 상속, []=명시적 없음
// 쓰기는 writer-store 의 샷 편집과 동일하게 클라 supabase 직접 update (RLS owner-write).
import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'

export interface BoardShot {
  shotId: string
  sceneId: string
  /** 카메라 앵글(샷 타입: WS/MS/CU…) */
  shotType: string
  /** 표시용 스토리 — action_description_native ?? action_description */
  description: string
  durationSeconds: number
  /** 등장 인물 character_id 목록 (per-shot 명시값) */
  characters: string[]
  /** 배경 location_id 목록. null = 씬 상속 */
  locationIds: string[] | null
  sortOrder: number
}

/** 샷의 유효 배경 참조 — 명시값(locationIds) 우선, null 이면 씬 location 상속. */
export function effectiveLocationIds(
  shot: BoardShot,
  sceneLocation: string | null | undefined,
): { ids: string[]; inherited: boolean } {
  if (shot.locationIds != null) return { ids: shot.locationIds, inherited: false }
  return { ids: sceneLocation ? [sceneLocation] : [], inherited: true }
}

/** undo/redo 히스토리 엔트리 — 한 편집 = 한 샷의 한 필드 전이. locationIds 는 null(씬 상속) 복원 가능. */
interface BoardHistoryEntry {
  shotId: string
  field: 'characters' | 'locationIds'
  before: string[] | null
  after: string[] | null
}

interface ArtistBoardState {
  /** 실험 New UI 토글 — 스토어에 두어 탭 전환(route remount)에도 유지(page-local useState 리셋 방지). */
  boardMode: boolean
  shots: BoardShot[]
  loading: boolean
  /** 로드 완료된 projectId — 프로젝트 전환 감지용 */
  loadedProjectId: string | null
  error: string | null
  /** undo/redo 스택 — 성공 저장된 편집만 쌓인다(실패 편집은 히스토리 미기록). */
  past: BoardHistoryEntry[]
  future: BoardHistoryEntry[]

  setBoardMode: (on: boolean) => void
  load: () => Promise<void>
  /** 샷의 인물 참조 교체 — 낙관적 반영 + DB update, 실패 시 롤백. 성공 시 undo 히스토리 기록. */
  setShotCharacters: (shotId: string, next: string[]) => Promise<void>
  /** 샷의 배경 참조 교체(명시화) — 낙관적 반영 + DB update, 실패 시 롤백. 성공 시 undo 히스토리 기록. */
  setShotLocationIds: (shotId: string, next: string[]) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  reset: () => void
}

export const useArtistBoardStore = create<ArtistBoardState>((set, get) => {
  // 한 필드 전이를 낙관적 반영 + DB 저장. 실패 시 전체 롤백 후 false — 호출자가 히스토리를 안 쌓게.
  const applyShotField = async (
    shotId: string,
    field: 'characters' | 'locationIds',
    value: string[] | null,
  ): Promise<boolean> => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return false
    const prev = get().shots
    set({
      shots: prev.map((s) => (s.shotId === shotId ? { ...s, [field]: value } : s)),
      error: null,
    })
    const column = field === 'characters' ? 'characters' : 'location_ids'
    const { error } = await createClient()
      .from('shots')
      .update({ [column]: value } as { characters?: string[] | null; location_ids?: string[] | null })
      .eq('project_id', projectId)
      .eq('shot_id', shotId)
    if (error) {
      set({ shots: prev, error: `참조 저장 실패: ${error.message}` })
      return false
    }
    return true
  }

  return {
  boardMode: false,
  shots: [],
  loading: false,
  loadedProjectId: null,
  error: null,
  past: [],
  future: [],

  setBoardMode: (on) => set({ boardMode: on }),

  load: async () => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId || get().loading) return
    set({ loading: true, error: null })
    try {
      const { data, error } = await createClient()
        .from('shots')
        .select(
          'shot_id, scene_id, shot_type, action_description, action_description_native, duration_seconds, characters, location_ids, sort_order',
        )
        .eq('project_id', projectId)
        .order('sort_order')
      if (error) throw error
      set({
        shots: (data ?? []).map((s) => ({
          shotId: s.shot_id,
          sceneId: s.scene_id,
          shotType: s.shot_type,
          description: s.action_description_native ?? s.action_description ?? '',
          durationSeconds: s.duration_seconds ?? 5,
          characters: s.characters ?? [],
          locationIds: s.location_ids ?? null,
          sortOrder: s.sort_order ?? 0,
        })),
        loadedProjectId: projectId,
        loading: false,
        past: [],
        future: [],
      })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? `샷 로드 실패: ${err.message}` : 'Shot load failed',
      })
    }
  },

  setShotCharacters: async (shotId, next) => {
    const shot = get().shots.find((s) => s.shotId === shotId)
    if (!shot) return
    const entry: BoardHistoryEntry = {
      shotId,
      field: 'characters',
      before: shot.characters,
      after: next,
    }
    if (await applyShotField(shotId, 'characters', next))
      set((st) => ({ past: [...st.past, entry], future: [] }))
  },

  setShotLocationIds: async (shotId, next) => {
    const shot = get().shots.find((s) => s.shotId === shotId)
    if (!shot) return
    const entry: BoardHistoryEntry = {
      shotId,
      field: 'locationIds',
      before: shot.locationIds, // null(씬 상속)일 수 있음 — undo 가 상속 상태를 그대로 복원
      after: next,
    }
    if (await applyShotField(shotId, 'locationIds', next))
      set((st) => ({ past: [...st.past, entry], future: [] }))
  },

  undo: async () => {
    const entry = get().past.at(-1)
    if (!entry) return
    if (await applyShotField(entry.shotId, entry.field, entry.before))
      set((st) => ({ past: st.past.slice(0, -1), future: [...st.future, entry] }))
  },

  redo: async () => {
    const entry = get().future.at(-1)
    if (!entry) return
    if (await applyShotField(entry.shotId, entry.field, entry.after))
      set((st) => ({ future: st.future.slice(0, -1), past: [...st.past, entry] }))
  },

  reset: () =>
    set({ shots: [], loading: false, loadedProjectId: null, error: null, past: [], future: [] }),
  }
})
