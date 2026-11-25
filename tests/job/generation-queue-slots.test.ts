// 단일 폴러가 받은 "내 자리" 수는 도는 작업 목록이 그대로여도 구독자에게 알린다 (2026-11-25)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// useSyncExternalStore 를 가로채 훅이 넘기는 구독 함수 · 스냅샷 함수를 그대로 쥔다(다른 UI 테스트와 같은 방식).
const hooks = vi.hoisted(() => ({
  subscribe: null as null | ((onChange: () => void) => () => void),
  snapshot: null as null | (() => unknown),
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (subscribe: (onChange: () => void) => () => void, snapshot: () => unknown) => {
    hooks.subscribe = subscribe
    hooks.snapshot = snapshot
    return snapshot()
  },
}))

import { refreshGenerationQueue, useGenerationSlots } from '@/lib/generation-queue'

// 테스트마다 다른 프로젝트를 본다 — 폴러는 프로젝트가 바뀔 때 스냅샷을 비우므로 앞 테스트의 숫자가 새지 않는다.
const FIRST_PROJECT = 'slot-line-project'
const SECOND_PROJECT = 'slot-line-project-2'
const json = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const FEW = { image: { used: 1, limit: 6 }, video: { used: 0, limit: 3 } }
const MANY = { image: { used: 6, limit: 6 }, video: { used: 2, limit: 3 } }

let release: (() => void) | null = null

beforeEach(() => {
  hooks.subscribe = null
  hooks.snapshot = null
})

afterEach(() => {
  release?.()
  release = null
  vi.restoreAllMocks()
})

describe('내 자리 수 구독', () => {
  it('자리 수가 바뀌면 구독자에게 알린다', async () => {
    // 왜: 도는 작업 목록이 그대로여도(둘 다 빈 목록) 내 자리 수는 바뀐다 — 그때 알리지 않으면 줄이 옛 숫자로 멈춰 있다.
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ jobs: [], slots: FEW }))
      .mockResolvedValueOnce(json({ jobs: [], slots: MANY }))
    useGenerationSlots(FIRST_PROJECT)
    const listener = vi.fn()
    release = hooks.subscribe!(listener)

    await vi.waitFor(() => expect(hooks.snapshot!()).toEqual(FEW))
    const toldSoFar = listener.mock.calls.length

    refreshGenerationQueue()

    // 두 응답은 자리 수만 다르다 — 자리 수가 시그니처에 없으면 같은 스냅샷으로 보고 알리지 않는다.
    await vi.waitFor(() => expect(hooks.snapshot!()).toEqual(MANY))
    expect(listener.mock.calls.length).toBeGreaterThan(toldSoFar)
  })

  it('아직 받지 못했으면 자리 수는 없다', async () => {
    // 왜: 0 / 6 으로 먼저 보여 주면 실제로 그리는 중인 자리를 "비었다"로 잘못 읽는다 — 받기 전에는 줄을 그리지 않는다.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ jobs: [] }))
    useGenerationSlots(SECOND_PROJECT)
    expect(hooks.snapshot!()).toBeNull()

    const listener = vi.fn()
    release = hooks.subscribe!(listener)
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    expect(hooks.snapshot!()).toBeNull()
  })
})
