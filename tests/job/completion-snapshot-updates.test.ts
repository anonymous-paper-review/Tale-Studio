// 완료 기록 수나 가장 최근 완료 시각이 그대로여도 Writer의 실제 완료 이미지 수 변화를 즉시 반영한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GenerationCompletion } from '@/lib/generation-batches'

const hooks = vi.hoisted(() => ({ subscribe: null as null | ((listener: () => void) => () => void) }))
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => unknown) => {
    hooks.subscribe = subscribe
    return snapshot()
  },
}))
const stops: Array<() => void> = []
beforeEach(() => { vi.useFakeTimers(); vi.resetModules() })
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const response = (completions: GenerationCompletion[]) => Response.json({ data: { jobs: [], batches: [], completions } })

it('전체 완료 기록 수와 마지막 시각이 같아도 Writer 완료 이미지 수가 바뀌면 숫자를 갱신한다.', async () => {
  const first: GenerationCompletion[] = [
    { stage: 'writer', lane: 'writer-rough', at: 2000, units: 1 },
    { stage: 'artist', lane: 'artist', at: 5000, units: 1 },
  ]
  const next: GenerationCompletion[] = [{ ...first[0], at: 3000, units: 4 }, first[1]]
  const fetcher = vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(next))
  vi.stubGlobal('fetch', fetcher)
  const queue = await import('@/lib/generation-queue')
  queue.useGenerationCompletions('writer-updates')
  const changed = vi.fn()
  stops.push(hooks.subscribe!(changed))
  await vi.advanceTimersByTimeAsync(1)
  expect(queue.useGenerationCompletions('writer-updates')).toEqual(first)
  changed.mockClear()
  queue.refreshGenerationQueue()
  await vi.advanceTimersByTimeAsync(1)
  expect(queue.useGenerationCompletions('writer-updates')).toEqual(next)
  expect(changed).toHaveBeenCalledTimes(1)
})

it('같은 완료 기록을 순서만 바꿔 다시 받아도 숫자를 다시 올리거나 변경 알림을 보내지 않는다.', async () => {
  const first: GenerationCompletion[] = [
    { stage: 'writer', lane: 'writer-rough', at: 2000, units: 1 },
    { stage: 'writer', lane: 'writer-rough', at: 3000, units: 4 },
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response([...first].reverse())))
  const queue = await import('@/lib/generation-queue')
  queue.useGenerationCompletions('same-writer-results')
  const changed = vi.fn()
  stops.push(hooks.subscribe!(changed))
  await vi.advanceTimersByTimeAsync(1)
  const snapshot = queue.useGenerationCompletions('same-writer-results')
  changed.mockClear()
  queue.refreshGenerationQueue()
  await vi.advanceTimersByTimeAsync(1)
  expect(queue.useGenerationCompletions('same-writer-results')).toBe(snapshot)
  expect(changed).not.toHaveBeenCalled()
})
