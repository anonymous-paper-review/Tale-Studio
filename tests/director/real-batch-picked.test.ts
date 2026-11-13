// 고른 샷만 이미지를 만들면 일괄 요청에 그 샷들만 실어 보내고, 서버는 그 샷만 고른다 (시안 D2 406:4588, 오너 2026-11-14)
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

let bodies: Array<Record<string, unknown>>

beforeEach(() => {
  vi.useFakeTimers()
  shared.client = new QueryClient()
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  bodies = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      bodies.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response(JSON.stringify({ ok: true, data: { submitted: [], remaining: 0 } }), { status: 200 })
    }
    return new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 })
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('고른 샷만 이미지 만들기', () => {
  it('고른 샷만 이미지를 만들면 일괄 요청에 그 Writer 샷들만 실어 보낸다', async () => {
    // 왜: 시안 D2 "위 버튼이 고른 샷에만" — 고르지 않은 빈 샷까지 그리면 안 된다.
    let done = false
    const result = runRealBatch('p1', { shotIds: ['w-a', 'w-c'] }).finally(() => { done = true })
    for (let i = 0; i < 200 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
    await result
    expect(bodies[0]).toMatchObject({ projectId: 'p1', shotIds: ['w-a', 'w-c'] })
  })

  it('고른 샷만 일괄로 만드는 동안 화면은 그 샷만 기다림으로 보고, 끝나면 잊는다', async () => {
    // 왜: 고르지 않은 빈 샷까지 "이미지 생성 대기 중"으로 보이면 고른 샷에만 일한다는 말과 어긋난다.
    let done = false
    const result = runRealBatch('p1', { shotIds: ['w-a'] }).finally(() => { done = true })
    expect(useDirectorCanvasStore.getState().realBatchShotIds).toEqual(['w-a'])
    for (let i = 0; i < 200 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
    await result
    expect(useDirectorCanvasStore.getState().realBatchShotIds).toBeNull()
  })

  it('고르지 않고 [이미지 만들기]를 눌러도 화면이 센 샷 목록을 그대로 실어 보낸다', () => {
    // 왜: 목록 없이 보내면 서버가 따로 고른다 — 실패한 샷이 한 장씩 길과 일괄에 함께 실릴 수 있었다(리드 검토 a 낮음 6).
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toContain('void runRealBatch(pid, { shotIds: batch })')
    expect(page).not.toContain('picked.size > 0 ? { shotIds: batch } : undefined')
  })

  it('서버 일괄은 고른 샷이 오면 그 샷만 고른다', () => {
    // 왜: 화면이 센 샷과 실제로 그리는 샷이 같아야 한다.
    const route = readFileSync('src/app/api/director/generate-storyboard-batch/route.ts', 'utf8')
    expect(route).toMatch(/if \(wanted && !wanted\.has\(s\.shot_id as string\)\) continue/)
  })
})
