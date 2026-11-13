// [모두 멈추기]를 누르면 이미지 일괄은 아직 보내지 않은 장을 보내지 않는다 — 이미 보낸 장은 끝까지 만든다 (시안 D3 406:4931, 오너 답 7)
import { readFileSync } from 'node:fs'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { runRealBatch } from '@/lib/director/real-batch-client'

let posts: number

beforeEach(() => {
  vi.useFakeTimers()
  shared.client = new QueryClient()
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  posts = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      posts += 1
      // 한 판에 4샷 한 장씩 — 아직 4샷 남음.
      return new Response(JSON.stringify({ ok: true, data: { submitted: [{ jobId: `job-${posts}`, shotIds: ['s1', 's2', 's3', 's4'] }], remaining: 4 } }), { status: 200 })
    }
    if (url.startsWith('/api/generation-jobs/')) {
      return new Response(JSON.stringify({ data: { status: 'queued' } }), { status: 200 })
    }
    return new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 })
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('이미지 일괄 멈추기', () => {
  it('이미지 일괄을 멈추면 아직 보내지 않은 장은 보내지 않고 판을 끝낸다', async () => {
    // 왜: 오너 답 7 "아직 보내지 않은 것만 멈추고" — 이미 보낸 장은 서버에서 끝까지 만들어진다(비용은 이미 났다).
    let done = false
    const result = runRealBatch('p1').finally(() => { done = true })
    await vi.advanceTimersByTimeAsync(10)
    expect(posts).toBe(1)
    useDirectorCanvasStore.getState().cancelRealBatch()
    for (let i = 0; i < 600 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
    await result
    expect(posts).toBe(1)
    expect(useDirectorCanvasStore.getState().realBatchBusy).toBe(false)
  })

  it('[모두 멈추기]는 이미지 일괄이나 영상 묶음이 돌 때 보이고, 누르면 둘 다 아직 보내지 않은 것을 멈춘다', () => {
    // 왜: 시안 D3 · D4 — 2줄 진행 옆 [모두 멈추기] 하나.
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toContain('(realBatchBusy || videoBatchBusy) && (')
    expect(page).toContain('if (realBatchBusy && !realBatchCancelled) run.cancelRealBatch()')
  })
})
