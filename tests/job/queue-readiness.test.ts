// 생성 상태를 처음 확인하거나 프로젝트를 바꾸면 확인이 끝날 때까지 기다리고 실패하면 재조회할 수 있다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ subscribe: null as null | ((listener: () => void) => () => void) }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => unknown) => {
    hooks.subscribe = subscribe
    return snapshot()
  },
}))

let cleanups: Array<() => void> = []
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); cleanups = [] })
afterEach(() => { cleanups.forEach(cleanup => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals() })

it('처음 들어오거나 다른 프로젝트로 이동하면 생성 상태 조회가 끝날 때까지 기다린다', async () => {
  const api = await import('@/lib/generation-queue')
  let respond: (response: Response) => void = () => {}
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve })))
  expect(api.useGenerationQueueStatus('project-a')).toBe('loading')
  cleanups.push(hooks.subscribe!(() => {}))
  respond(Response.json({ data: { jobs: [] } }))
  await vi.advanceTimersByTimeAsync(0)
  expect(api.useGenerationQueueStatus('project-a')).toBe('ready')
  expect(api.useGenerationQueueStatus('project-b')).toBe('loading')
  cleanups.push(hooks.subscribe!(() => {}))
  respond(Response.json({ data: { jobs: [] } }))
  await vi.advanceTimersByTimeAsync(0)
  expect(api.useGenerationQueueStatus('project-b')).toBe('ready')
})

it('생성 상태 조회가 실패하면 실패를 알리고 다시 조회해 복구한다', async () => {
  const api = await import('@/lib/generation-queue')
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ data: { jobs: [] } }))
  vi.stubGlobal('fetch', fetcher)
  api.useGenerationQueueStatus('project-a')
  cleanups.push(hooks.subscribe!(() => {}))
  await vi.advanceTimersByTimeAsync(0)
  expect(api.useGenerationQueueStatus('project-a')).toBe('error')
  api.refreshGenerationQueue()
  expect(api.useGenerationQueueStatus('project-a')).toBe('loading')
  await vi.advanceTimersByTimeAsync(0)
  expect(api.useGenerationQueueStatus('project-a')).toBe('ready')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('생성 화면을 떠났다가 같은 프로젝트로 돌아오면 이전의 빈 작업 목록을 믿지 않고 다시 확인한다', async () => {
  const api = await import('@/lib/generation-queue')
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: { jobs: [] } }))
    .mockImplementationOnce(() => new Promise(() => {}))
  vi.stubGlobal('fetch', fetcher)
  api.useGenerationQueueStatus('project-a')
  const unsubscribe = hooks.subscribe!(() => {})
  await vi.advanceTimersByTimeAsync(0)
  expect(api.useGenerationQueueStatus('project-a')).toBe('ready')
  unsubscribe()
  expect(api.useGenerationQueueStatus('project-a')).toBe('loading')
  cleanups.push(hooks.subscribe!(() => {}))
  expect(fetcher).toHaveBeenCalledTimes(2)
})
