// 프로젝트 전환 중 이전 응답은 폐기하고 새 프로젝트 완료만 구독자들에게 전달한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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
const response = (stage: 'writer' | 'artist', at: number) => Response.json({ data: {
  jobs: [], batches: [], completions: [{ stage, lane: stage === 'writer' ? 'writer-rough' : 'artist', at, units: 1 }],
} })

it('프로젝트를 바꾼 뒤 이전 프로젝트의 늦은 응답은 현재 알림에 섞이지 않는다.', async () => {
  const requests: Array<{ url: string; resolve: (value: Response) => void }> = []
  vi.stubGlobal('fetch', vi.fn((url: string) => new Promise<Response>(resolve => requests.push({ url, resolve }))))
  const queue = await import('@/lib/generation-queue')
  queue.useGenerationCompletions('old-project')
  const stopOld = hooks.subscribe!(() => {})
  stops.push(stopOld)
  stopOld()
  queue.useGenerationCompletions('new-project')
  stops.push(hooks.subscribe!(() => {}))
  requests[0].resolve(response('writer', 2000))
  await vi.advanceTimersByTimeAsync(1)
  expect(queue.useGenerationCompletions('new-project')).toEqual([])
  expect(requests.map(request => request.url)).toEqual([
    '/api/generation/active?projectId=old-project', '/api/generation/active?projectId=new-project',
  ])
  requests[1].resolve(response('artist', 3000))
  await vi.advanceTimersByTimeAsync(1)
  expect(queue.useGenerationCompletions('new-project')).toEqual([{ stage: 'artist', lane: 'artist', at: 3000, units: 1 }])
})

it('화면 구독이 잠시 겹쳐도 새 프로젝트 완료 확인을 즉시 시작한다.', async () => {
  const fetcher = vi.fn().mockResolvedValue(response('writer', 2000))
  vi.stubGlobal('fetch', fetcher)
  const queue = await import('@/lib/generation-queue')
  queue.useGenerationCompletions('overlap-old')
  stops.push(hooks.subscribe!(() => {}))
  await vi.advanceTimersByTimeAsync(1)
  expect(queue.useGenerationCompletions('overlap-new')).toEqual([])
  stops.push(hooks.subscribe!(() => {}))
  await vi.advanceTimersByTimeAsync(1)
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([
    '/api/generation/active?projectId=overlap-old', '/api/generation/active?projectId=overlap-new',
  ])
})
