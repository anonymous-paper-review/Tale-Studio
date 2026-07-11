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

interface ArtistBoardState {
  /** 실험 New UI 토글 — 스토어에 두어 탭 전환(route remount)에도 유지(page-local useState 리셋 방지). */
  boardMode: boolean
  shots: BoardShot[]
  loading: boolean
  /** 로드 완료된 projectId — 프로젝트 전환 감지용 */
  loadedProjectId: string | null
  error: string | null

  setBoardMode: (on: boolean) => void
  load: () => Promise<void>
  /** 샷의 인물 참조 교체 — 낙관적 반영 + DB update, 실패 시 롤백. */
  setShotCharacters: (shotId: string, next: string[]) => Promise<void>
  /** 샷의 배경 참조 교체(명시화) — 낙관적 반영 + DB update, 실패 시 롤백. */
  setShotLocationIds: (shotId: string, next: string[]) => Promise<void>
  reset: () => void
}

export const useArtistBoardStore = create<ArtistBoardState>((set, get) => ({
  boardMode: false,
  shots: [],
  loading: false,
  loadedProjectId: null,
  error: null,

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
      })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? `샷 로드 실패: ${err.message}` : 'Shot load failed',
      })
    }
  },

  setShotCharacters: async (shotId, next) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const prev = get().shots
    set({
      shots: prev.map((s) => (s.shotId === shotId ? { ...s, characters: next } : s)),
      error: null,
    })
    const { error } = await createClient()
      .from('shots')
      .update({ characters: next })
      .eq('project_id', projectId)
      .eq('shot_id', shotId)
    if (error) set({ shots: prev, error: `인물 참조 저장 실패: ${error.message}` })
  },

  setShotLocationIds: async (shotId, next) => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const prev = get().shots
    set({
      shots: prev.map((s) => (s.shotId === shotId ? { ...s, locationIds: next } : s)),
      error: null,
    })
    const { error } = await createClient()
      .from('shots')
      .update({ location_ids: next })
      .eq('project_id', projectId)
      .eq('shot_id', shotId)
    if (error) set({ shots: prev, error: `배경 참조 저장 실패: ${error.message}` })
  },

  reset: () => set({ shots: [], loading: false, loadedProjectId: null, error: null }),
}))
