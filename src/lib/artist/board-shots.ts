'use client'

// Artist 에셋·샷 보드의 샷 데이터 — zustand store(artist-board-store) → TanStack Query
// 전환 3호 (2026-08-24). 첫 "서버 데이터 + UI 상태 혼합" 분리 사례:
//
//   - shots 목록            → 서버 상태. 여기(useBoardShots, 질의 캐시)로.
//   - undo/redo 스택·편집 오류 → 이 화면만의 편집 세션 상태. 파일 안의 작은 zustand 로 잔류.
//   - boardMode 토글         → 옛 파일(artist-board-store)에 남김 — 서버와 무관한 페이지 UI.
//
// 낙관적 편집(applyShotField)은 옛 store 의 backup/rollback 을 캐시 위에서 재현하되,
// 시작 전에 cancelQueries 를 건다 — 날아가던 재조회가 낙관 반영 위에 옛 스냅샷을
// 덮어쓰는 경합은 옛 구조엔 없던(재조회 자체가 없었으니) 새 위험이라 표준 수순으로 막는다.
//
// 씬은 여기서도 로드하지 않는다 — artist-store.sceneManifest 를 그대로 쓴다(옛 주석 유지).
// 쓰기는 writer-store 의 샷 편집과 동일하게 클라 supabase 직접 update (RLS owner-write).

import { useEffect } from 'react'
import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getQueryClient } from '@/lib/query-client'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

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

export const boardShotsKey = (projectId: string) => ['board-shots', projectId] as const

async function fetchBoardShots(projectId: string): Promise<BoardShot[]> {
  const { data, error } = await createClient()
    .from('shots')
    .select(
      'shot_id, scene_id, shot_type, action_description, action_description_native, duration_seconds, characters, location_ids, sort_order',
    )
    .eq('project_id', projectId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((s) => ({
    shotId: s.shot_id,
    sceneId: s.scene_id,
    shotType: s.shot_type,
    description: s.action_description_native ?? s.action_description ?? '',
    durationSeconds: s.duration_seconds ?? 5,
    characters: s.characters ?? [],
    locationIds: s.location_ids ?? null,
    sortOrder: s.sort_order ?? 0,
  }))
}

// ── 편집 세션 상태 (서버 상태 아님 — 이 화면의 실행취소 스택과 실패 안내) ──────────

/** undo/redo 히스토리 엔트리 — 한 편집 = 한 샷의 한 필드 전이. locationIds 는 null(씬 상속) 복원 가능. */
interface BoardHistoryEntry {
  shotId: string
  field: 'characters' | 'locationIds'
  before: string[] | null
  after: string[] | null
}

interface BoardEditState {
  /** 스택이 속한 프로젝트 — 다른 프로젝트의 편집 기록으로 undo 하는 사고 방지. */
  projectId: string | null
  /** 성공 저장된 편집만 쌓인다(실패 편집은 히스토리 미기록 — 옛 store 동일). */
  past: BoardHistoryEntry[]
  future: BoardHistoryEntry[]
  error: string | null
}

export const useBoardEditStore = create<BoardEditState>(() => ({
  projectId: null,
  past: [],
  future: [],
  error: null,
}))

function resetEditsFor(projectId: string | null): void {
  if (useBoardEditStore.getState().projectId === projectId) return
  useBoardEditStore.setState({ projectId, past: [], future: [], error: null })
}

/** 보드의 샷 목록. 편집 중인 화면이라 30초 층 — 캐릭터 시트(5분)보다 짧다.
 *  프로젝트가 바뀌면 실행취소 스택도 함께 비운다(옛 load() 가 하던 일). */
export function useBoardShots(projectId: string | null) {
  useEffect(() => {
    resetEditsFor(projectId)
  }, [projectId])
  return useQuery({
    queryKey: boardShotsKey(projectId ?? ''),
    queryFn: () => fetchBoardShots(projectId ?? ''),
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

// ── 낙관적 편집 ────────────────────────────────────────────────────────────────

/** 한 필드 전이를 캐시에 낙관 반영 + DB 저장. 실패 시 백업 복원 후 false —
 *  호출자가 히스토리를 안 쌓게 (옛 applyShotField 와 같은 계약). */
async function applyShotField(
  projectId: string,
  shotId: string,
  field: 'characters' | 'locationIds',
  value: string[] | null,
): Promise<boolean> {
  const client = getQueryClient()
  const key = boardShotsKey(projectId)
  // 진행 중 재조회가 낙관 반영을 덮지 않게 먼저 끊는다(표준 낙관 수순).
  await client.cancelQueries({ queryKey: key })
  const backup = client.getQueryData<BoardShot[]>(key)
  client.setQueryData<BoardShot[]>(key, (old) =>
    old?.map((s) => (s.shotId === shotId ? { ...s, [field]: value } : s)),
  )
  useBoardEditStore.setState({ error: null })

  const column = field === 'characters' ? 'characters' : 'location_ids'
  const { error } = await createClient()
    .from('shots')
    .update({ [column]: value } as { characters?: string[] | null; location_ids?: string[] | null })
    .eq('project_id', projectId)
    .eq('shot_id', shotId)
  if (error) {
    client.setQueryData(key, backup)
    useBoardEditStore.setState({
      error: translate(useLocaleStore.getState().locale, 'Failed to save the reference: {message}', {
        message: error.message,
      }),
    })
    return false
  }
  return true
}

function currentShot(projectId: string, shotId: string): BoardShot | undefined {
  return getQueryClient()
    .getQueryData<BoardShot[]>(boardShotsKey(projectId))
    ?.find((s) => s.shotId === shotId)
}

/** 샷의 인물 참조 교체 — 낙관적 반영 + DB update, 실패 시 롤백. 성공 시 undo 히스토리 기록. */
export async function setShotCharacters(
  projectId: string,
  shotId: string,
  next: string[],
): Promise<void> {
  const shot = currentShot(projectId, shotId)
  if (!shot) return
  resetEditsFor(projectId)
  const entry: BoardHistoryEntry = { shotId, field: 'characters', before: shot.characters, after: next }
  if (await applyShotField(projectId, shotId, 'characters', next))
    useBoardEditStore.setState((st) => ({ past: [...st.past, entry], future: [] }))
}

/** 샷의 배경 참조 교체(명시화) — 낙관적 반영 + DB update, 실패 시 롤백. 성공 시 undo 히스토리 기록. */
export async function setShotLocationIds(
  projectId: string,
  shotId: string,
  next: string[],
): Promise<void> {
  const shot = currentShot(projectId, shotId)
  if (!shot) return
  resetEditsFor(projectId)
  const entry: BoardHistoryEntry = {
    shotId,
    field: 'locationIds',
    before: shot.locationIds, // null(씬 상속)일 수 있음 — undo 가 상속 상태를 그대로 복원
    after: next,
  }
  if (await applyShotField(projectId, shotId, 'locationIds', next))
    useBoardEditStore.setState((st) => ({ past: [...st.past, entry], future: [] }))
}

/** 마지막 편집 취소 — 스택이 기억하는 프로젝트에만 적용된다(인자 불필요). */
export async function undoBoardEdit(): Promise<void> {
  const { projectId, past } = useBoardEditStore.getState()
  const entry = past.at(-1)
  if (!projectId || !entry) return
  if (await applyShotField(projectId, entry.shotId, entry.field, entry.before))
    useBoardEditStore.setState((st) => ({
      past: st.past.slice(0, -1),
      future: [...st.future, entry],
    }))
}

export async function redoBoardEdit(): Promise<void> {
  const { projectId, future } = useBoardEditStore.getState()
  const entry = future.at(-1)
  if (!projectId || !entry) return
  if (await applyShotField(projectId, entry.shotId, entry.field, entry.after))
    useBoardEditStore.setState((st) => ({
      future: st.future.slice(0, -1),
      past: [...st.past, entry],
    }))
}
