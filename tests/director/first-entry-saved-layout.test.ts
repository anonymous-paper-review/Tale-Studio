// Director 처음 정렬은 DB 에 저장된 자리(씬 · 샷 canvas_position)가 하나라도 있으면 하지 않고(영상 Take 는 세지 않는다), 읽기가 실패하면 안 하는 쪽으로 간다 (오너 2026-11-16 · 2026-11-26 D7)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  rows: { scenes: [] as unknown[], shots: [] as unknown[] },
  error: null as { message: string } | null,
  takes: [] as unknown[],
  takesStatus: 200,
  reads: [] as string[],
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: 'scenes' | 'shots') => {
      const query: Record<string, unknown> = {}
      const chain = () => query
      for (const name of ['select', 'eq', 'limit', 'update', 'insert', 'upsert', 'delete', 'order', 'in', 'is', 'single', 'maybeSingle']) query[name] = chain
      query.not = (column: string, op: string, value: unknown) => {
        db.reads.push(`${table}.${column} ${op} ${String(value)}`)
        return query
      }
      query.then = (resolve: (value: unknown) => unknown) => resolve({ data: db.rows[table] ?? [], error: db.error })
      return query
    },
  }),
}))

import { markFirstEntrySettled, projectHasSavedLayout, resetFirstEntryMemo } from '@/features/director/first-entry-layout'
import { arrangeIfFirstEntry, confirmFirstEntryArrange, LATE_FIRST_ENTRY_ARRANGE_MS } from '@/features/director/hooks/use-writer-director-sync'
import { useDirectorCanvasStore } from '@/stores/director-store'

beforeEach(() => {
  resetFirstEntryMemo()
  db.rows = { scenes: [], shots: [] }
  db.error = null
  db.takes = []
  db.takesStatus = 200
  db.reads = []
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ takes: db.takes }), { status: db.takesStatus })))
})
afterEach(() => vi.unstubAllGlobals())

describe('DB 에 저장된 자리가 있는가', () => {
  // 왜: 아무것도 저장되지 않은 프로젝트만 처음 정렬을 한다 — 이 답이 false 일 때만 정렬이 일어난다.
  it('저장된 씬 · 샷 자리가 없으면 없다고 답한다', async () => {
    expect(await projectHasSavedLayout('p1')).toBe(false)
    // 저장된 자리는 "canvas_position 이 비어 있지 않은 행"으로 읽는다(씬 · 샷 둘 다).
    expect(db.reads).toEqual(['scenes.canvas_position is null', 'shots.canvas_position is null'])
  })

  // 왜: 샷 자리는 사람이 끌었을 때 저장된다. 하나만 저장돼 있어도 사람이 손댄 프로젝트다.
  it('저장된 샷 자리가 하나라도 있으면 있다고 답한다', async () => {
    db.rows.shots = [{ project_id: 'p1' }]

    expect(await projectHasSavedLayout('p1')).toBe(true)
  })

  // 왜: 씬 자리는 [자동 정렬]이 저장한다(숨은 씬 카드의 자리). 정렬해 둔 프로젝트는 다시 정렬하지 않는다.
  it('저장된 씬 자리가 있으면 있다고 답한다', async () => {
    db.rows.scenes = [{ project_id: 'p1' }]

    expect(await projectHasSavedLayout('p1')).toBe(true)
  })

  // 왜: 오너 2026-11-26 D7 "자동 정렬이 잘 작동하지 않는데, 첫진입 시 잘 작동하는지 확인" — Take 자리는 사람이 놓은 것이 아니라 만들 때 저절로 저장된다
  //   (영상 요청이 Take 카드 자리를 함께 보낸다). 예전에는 Take 가 하나라도 있으면 처음으로 보지 않아, 스토리보드 보기 · 채팅으로 영상을 만든 프로젝트는
  //   노드 보기를 처음 열어도 넓은 기본 간격 그대로였다(개발 DB 실측: 씬 묶음 사이 1780, [자동 정렬] 뒤 776).
  it('영상 Take 만 있고 저장된 씬 · 샷 자리가 없으면 없다고 답한다', async () => {
    db.takes = [{ id: 'clip-1', canvas_position: { x: 900, y: 40 } }]

    expect(await projectHasSavedLayout('p1')).toBe(false)
  })

  // 왜: 모르는데 덮는 것보다 안 고치는 편이 안전하다 — 읽기가 실패하면 처음 정렬을 하지 않는다(단추를 누르면 된다).
  it('읽기가 실패하거나 답이 이상하면 있다고 보고 아무것도 안 한다', async () => {
    db.error = { message: 'permission denied' }
    expect(await projectHasSavedLayout('p1')).toBe(true)

    db.error = null
    db.takesStatus = 500
    expect(await projectHasSavedLayout('p1')).toBe(true)

    db.takesStatus = 200
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    expect(await projectHasSavedLayout('p1')).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })))
    expect(await projectHasSavedLayout('p1')).toBe(true)
  })

  // 왜: 저장된 자리가 있는 프로젝트는 열 때마다 DB 를 세 번(씬 · 샷 · 테이크) 다시 읽을 까닭이 없다. 한 번 있다고 확인했으면 이 화면을 닫기 전까지 다시 읽지 않는다.
  it('저장된 자리가 있다고 한 번 확인한 프로젝트는 다시 읽지 않는다', async () => {
    db.rows.shots = [{ project_id: 'p-memo' }]
    expect(await projectHasSavedLayout('p-memo')).toBe(true)
    const reads = db.reads.length
    const calls = vi.mocked(fetch).mock.calls.length

    db.rows.shots = []
    expect(await projectHasSavedLayout('p-memo')).toBe(true)

    expect(db.reads.length).toBe(reads)
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
  })

  // 왜: 읽기가 실패해 "있다고 본" 답까지 기억하면, 일시적인 오류 한 번으로 그 프로젝트는 이 화면에서 처음 정렬이 영영 안 된다.
  it('읽기가 실패해서 있다고 본 답은 기억하지 않는다', async () => {
    db.error = { message: 'network down' }
    expect(await projectHasSavedLayout('p-flaky')).toBe(true)

    db.error = null
    expect(await projectHasSavedLayout('p-flaky')).toBe(false)
  })
})

describe('DB 를 읽는 때', () => {
  // 왜: 점검은 카드가 Writer 에서 온 것뿐일 때만 한다. 카드가 없거나 영상 · 직접 만든 카드가 섞였으면 처음일 수 없다 — 그 판별에 DB 읽기 셋(씬 · 샷 · 테이크)을 쓸 까닭이 없다.
  it('Writer 카드만 있는 캔버스가 아니면 DB 를 읽지 않고 정렬도 하지 않는다', async () => {
    expect(await arrangeIfFirstEntry('p1')).toBe(false)

    expect(db.reads).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('같은 창에서 이미 확인한 프로젝트', () => {
  const api = () => useDirectorCanvasStore.getState()
  /** Writer 에서 온 씬 · 샷 카드 하나씩 — 처음 정렬 후보다. */
  function addWriterCards() {
    api().reset()
    const sceneId = api().addSceneNode({ x: 380, y: 80 }, 'sc_01')
    api().updateNodeData<'scene'>(sceneId, { writerSceneId: 'sc_01' })
    const shotId = api().addShotNode(sceneId, { x: 740, y: 80 }, 'sh_01_01')
    api().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01' })
  }

  // 왜: 리드 2026-11-16 — 같은 창에서 한 번 확인을 마친 프로젝트(저장된 자리를 찾았거나 정렬을 마쳤다)는 Storyboard 에 갔다 와도 DB 를 셋(씬 · 샷 · 테이크) 다시 읽을 까닭이 없다.
  it('같은 창에서 이미 확인한 프로젝트는 다시 들어가도 DB 를 다시 읽지 않는다', async () => {
    const projectId = api().projectId

    // 저장된 자리를 찾은 프로젝트
    addWriterCards()
    db.rows.shots = [{ project_id: projectId }]
    expect(await arrangeIfFirstEntry(projectId)).toBe(false)
    const reads = db.reads.length
    const calls = vi.mocked(fetch).mock.calls.length
    expect(reads).toBeGreaterThan(0)

    addWriterCards() // 다시 들어감
    expect(await arrangeIfFirstEntry(projectId)).toBe(false)
    expect(db.reads.length).toBe(reads)
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)

    // 정렬을 마친 프로젝트: 저장된 자리가 없어 정렬을 요청했고, 화면이 정렬을 마쳤다고 알린다
    resetFirstEntryMemo()
    db.rows.shots = []
    addWriterCards()
    expect(await arrangeIfFirstEntry(projectId)).toBe(true)
    markFirstEntrySettled(projectId)
    const readsAfterArranged = db.reads.length
    const callsAfterArranged = vi.mocked(fetch).mock.calls.length

    addWriterCards() // 다시 들어감
    expect(await arrangeIfFirstEntry(projectId)).toBe(false)
    expect(api().arrangePending).toBe(false)
    expect(db.reads.length).toBe(readsAfterArranged)
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsAfterArranged)
  })

  // 왜: 리뷰 s11 낮음 1 — 이 브라우저가 마지막 보기를 되살려 스토리보드 보기로 열리면 노드 보기가 열릴 때까지 정렬을 기다린다. 그 사이 다른 탭에서 자리를 저장했거나
  //   Take 를 만들었을 수 있는데 요청할 때의 점검은 그것을 모른다. 늦게 돌게 되면 정렬 직전에 DB 를 한 번 더 읽는다(빨리 돌면 다시 읽지 않는다).
  it('노드 보기가 늦게 열리면 정렬하기 직전에 저장된 자리를 다시 확인한다', async () => {
    const projectId = api().projectId
    vi.useFakeTimers()
    try {
      // 빨리 돌면 정렬 직전에 다시 읽지 않는다
      addWriterCards()
      expect(await arrangeIfFirstEntry(projectId)).toBe(true)
      const readsAtRequest = db.reads.length
      expect(await confirmFirstEntryArrange(projectId)).toBe(true)
      expect(db.reads.length).toBe(readsAtRequest)

      // 늦게 돌면 다시 읽는다: 그 사이 다른 탭에서 저장한 자리가 있으면 정렬하지 않는다
      resetFirstEntryMemo()
      addWriterCards()
      expect(await arrangeIfFirstEntry(projectId)).toBe(true)
      const readsAfterSecondRequest = db.reads.length
      await vi.advanceTimersByTimeAsync(LATE_FIRST_ENTRY_ARRANGE_MS + 100)
      db.rows.shots = [{ project_id: projectId }]
      expect(await confirmFirstEntryArrange(projectId)).toBe(false)
      expect(db.reads.length).toBeGreaterThan(readsAfterSecondRequest)
    } finally {
      vi.useRealTimers()
    }
  })
})
