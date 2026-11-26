// Storyboard [시작] 일괄이 콘티 그림 · 인물 시트를 기다렸다가 다시 돌아도 Storyboard 일괄로 남는지(끝 알림 자리) 검사한다
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  client: null as unknown as QueryClient,
  notify: vi.fn(),
  // 기다리던 자료가 준비되는 때를 시험이 정한다.
  release: null as null | (() => void),
}))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'is', 'in', 'not', 'maybeSingle', 'update']) chain[m] = () => chain
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    },
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }))
vi.mock('@/lib/generation-notify', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/generation-notify')>(),
  notifyBatchSummary: shared.notify,
}))
vi.mock('@/lib/generation-prerequisite-toast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  waitForPrerequisite: (_projectId: string, _body: unknown, opts?: { isCancelled?: () => boolean }) =>
    new Promise((resolve) => {
      shared.release = () => resolve(opts?.isCancelled?.() ? 'cancelled' : 'ready')
    }),
}))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { cancelRealBatchResume, runRealBatch } from '@/lib/director/real-batch-client'

let bodies: Array<Record<string, unknown>>

beforeEach(() => {
  shared.client = new QueryClient()
  shared.release = null
  shared.notify.mockClear()
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  useProjectStore.setState({ projectId: 'p1', currentStage: 'writer' })
  useLocaleStore.setState({ locale: 'en' })
  bodies = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      bodies.push(JSON.parse(String(init?.body ?? '{}')))
      // 첫 판: w-a 는 콘티 그림(러프)이 아직 없어 건너뜀 · 다시 도는 판: w-a 를 그린다.
      const data = bodies.length === 1
        ? { submitted: [], remaining: 0, skipped: [{ shotId: 'w-a', reason: 'missing_rough_storyboard' }] }
        : { submitted: [{ jobId: 'job-a', shotIds: ['w-a'] }], remaining: 0, skipped: [] }
      return new Response(JSON.stringify({ ok: true, data }), { status: 200 })
    }
    if (url.startsWith('/api/generation-jobs/')) {
      return new Response(JSON.stringify({ data: { status: 'completed', resultUrl: 'https://img/a.png' } }), { status: 200 })
    }
    if (url.startsWith('/api/director/video-takes?')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
    return new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 })
  }))
})
afterEach(() => {
  cancelRealBatchResume('p1')
  vi.unstubAllGlobals()
})

describe('기다렸다가 다시 도는 Storyboard 일괄', () => {
  // 왜: 다시 도는 판이 단계를 잃으면 끝 알림이 Director 채팅으로 새어, Storyboard 를 보는 사람은 끝난 줄을 못 본다.
  //   언제: [시작] 때 콘티 그림 · 인물 시트가 아직 없던 샷이 준비되어 일괄이 저절로 다시 돌 때.
  it('Storyboard [시작] 일괄이 콘티 그림을 기다렸다가 다시 돌아도 끝 알림은 Storyboard 채팅에 남는다', async () => {
    await runRealBatch('p1', { stage: 'writer', shotIds: ['w-a', 'w-b'] })
    expect(shared.release).not.toBeNull()
    shared.release!()
    await vi.waitFor(() => expect(shared.notify).toHaveBeenCalledTimes(1), { timeout: 10_000 })
    expect(bodies[1]).toMatchObject({ shotIds: ['w-a'] })
    expect(shared.notify.mock.calls[0][0]).toBe('writer')
  }, 15_000)
})
