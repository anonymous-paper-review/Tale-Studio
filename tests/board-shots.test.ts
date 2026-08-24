import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// vitest 는 node(isServer=true)라 진짜 getQueryClient 는 호출마다 새 인스턴스 — 공유시킨다.
const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({
  getQueryClient: () => shared.client,
}))

// supabase update 체인(.from('shots').update().eq().eq() → { error }) 만 흉내낸다.
// 목록 질의는 시험에서 캐시를 직접 심으므로 select 는 불리지 않는다.
const db = vi.hoisted(() => ({
  updateError: null as { message: string } | null,
  updateCalls: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        db.updateCalls.push(patch)
        return { eq: () => ({ eq: () => Promise.resolve({ error: db.updateError }) }) }
      },
    }),
  }),
}))

import {
  boardShotsKey,
  redoBoardEdit,
  setShotCharacters,
  setShotLocationIds,
  undoBoardEdit,
  useBoardEditStore,
  type BoardShot,
} from '@/lib/artist/board-shots'

function shot(shotId: string, over: Partial<BoardShot> = {}): BoardShot {
  return {
    shotId,
    sceneId: 'scene-1',
    shotType: 'WS',
    description: '',
    durationSeconds: 5,
    characters: [],
    locationIds: null,
    sortOrder: 0,
    ...over,
  }
}

const cellOf = (projectId: string) =>
  shared.client.getQueryData<BoardShot[]>(boardShotsKey(projectId))

beforeEach(() => {
  shared.client = new QueryClient()
  db.updateError = null
  db.updateCalls = []
  useBoardEditStore.setState({ projectId: null, past: [], future: [], error: null })
})

describe('낙관적 편집', () => {
  it('성공: 캐시에 반영되고 히스토리에 쌓인다', async () => {
    shared.client.setQueryData(boardShotsKey('p1'), [shot('s1', { characters: ['c1'] })])

    await setShotCharacters('p1', 's1', ['c1', 'c2'])

    expect(cellOf('p1')?.[0].characters).toEqual(['c1', 'c2'])
    expect(db.updateCalls).toEqual([{ characters: ['c1', 'c2'] }])
    expect(useBoardEditStore.getState().past).toHaveLength(1)
  })

  it('DB 거부: 캐시를 백업으로 되돌리고 히스토리에 안 쌓는다 (실패 편집은 undo 불가여야 함)', async () => {
    shared.client.setQueryData(boardShotsKey('p1'), [shot('s1', { characters: ['c1'] })])
    db.updateError = { message: 'row level security' }

    await setShotCharacters('p1', 's1', ['c1', 'c2'])

    expect(cellOf('p1')?.[0].characters).toEqual(['c1'])
    expect(useBoardEditStore.getState().past).toHaveLength(0)
    expect(useBoardEditStore.getState().error).toBeTruthy()
  })

  it('캐시에 없는 샷은 조용히 무시한다 (옛 store 의 find 미스와 동일)', async () => {
    shared.client.setQueryData(boardShotsKey('p1'), [shot('s1')])

    await setShotCharacters('p1', 'ghost', ['c1'])

    expect(db.updateCalls).toHaveLength(0)
    expect(useBoardEditStore.getState().past).toHaveLength(0)
  })
})

describe('undo/redo', () => {
  it('undo 는 before 로 되돌리고 스택을 past→future 로 옮긴다; redo 는 그 반대', async () => {
    shared.client.setQueryData(boardShotsKey('p1'), [shot('s1', { characters: ['c1'] })])

    await setShotCharacters('p1', 's1', ['c1', 'c2'])
    await undoBoardEdit()

    expect(cellOf('p1')?.[0].characters).toEqual(['c1'])
    expect(useBoardEditStore.getState().past).toHaveLength(0)
    expect(useBoardEditStore.getState().future).toHaveLength(1)

    await redoBoardEdit()

    expect(cellOf('p1')?.[0].characters).toEqual(['c1', 'c2'])
    expect(useBoardEditStore.getState().past).toHaveLength(1)
    expect(useBoardEditStore.getState().future).toHaveLength(0)
  })

  it('locationIds 의 undo 는 null(씬 상속) 상태를 그대로 복원한다', async () => {
    shared.client.setQueryData(boardShotsKey('p1'), [shot('s1', { locationIds: null })])

    await setShotLocationIds('p1', 's1', ['loc-1'])
    expect(cellOf('p1')?.[0].locationIds).toEqual(['loc-1'])

    await undoBoardEdit()
    expect(cellOf('p1')?.[0].locationIds).toBeNull()
  })

  it('새 편집은 future 를 비운다 (undo 후 갈라진 미래 금지)', async () => {
    shared.client.setQueryData(boardShotsKey('p1'), [shot('s1', { characters: [] })])

    await setShotCharacters('p1', 's1', ['c1'])
    await undoBoardEdit()
    await setShotCharacters('p1', 's1', ['c2'])

    expect(useBoardEditStore.getState().future).toHaveLength(0)
    expect(useBoardEditStore.getState().past).toHaveLength(1)
  })

  it('undo 의 DB 실패는 스택을 옮기지 않는다 — 다시 시도 가능', async () => {
    shared.client.setQueryData(boardShotsKey('p1'), [shot('s1', { characters: [] })])
    await setShotCharacters('p1', 's1', ['c1'])

    db.updateError = { message: 'offline' }
    await undoBoardEdit()

    expect(useBoardEditStore.getState().past).toHaveLength(1)
    expect(useBoardEditStore.getState().future).toHaveLength(0)
    expect(cellOf('p1')?.[0].characters).toEqual(['c1']) // 롤백으로 편집 후 상태 유지
  })
})

describe('프로젝트 전환', () => {
  it('다른 프로젝트의 편집이 오면 스택을 비운다 — 남의 히스토리로 undo 하는 사고 방지', async () => {
    shared.client.setQueryData(boardShotsKey('p1'), [shot('s1', { characters: [] })])
    shared.client.setQueryData(boardShotsKey('p2'), [shot('s9', { characters: [] })])

    await setShotCharacters('p1', 's1', ['c1'])
    expect(useBoardEditStore.getState().past).toHaveLength(1)

    await setShotCharacters('p2', 's9', ['x1'])

    const st = useBoardEditStore.getState()
    expect(st.projectId).toBe('p2')
    expect(st.past).toHaveLength(1) // p2 의 편집 하나만
    expect(st.past[0].shotId).toBe('s9')
  })
})
