// 러프 · 인물 시트를 기다린 샷이 준비되면 이미지 일괄이 다시 돈다 — 처음 요청한 샷 · 다시 만들기만, [모두 멈추기] 뒤에는 돌지 않는다 (리드 검토 a S1+S3 보통 2 · S4-1 보통 5)
import { readFileSync } from 'node:fs'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  client: null as unknown as QueryClient,
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/generation-prerequisite-toast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  waitForPrerequisite: (_projectId: string, _body: unknown, opts?: { isCancelled?: () => boolean }) =>
    new Promise((resolve) => {
      shared.release = () => resolve(opts?.isCancelled?.() ? 'cancelled' : 'ready')
    }),
}))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { cancelRealBatchResume, runRealBatch } from '@/lib/director/real-batch-client'
import { chainStep } from '@/lib/director/toolbar-work'

let bodies: Array<Record<string, unknown>>
let onFirstRound: (() => void) | null

beforeEach(() => {
  shared.client = new QueryClient()
  shared.release = null
  onFirstRound = null
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  bodies = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      bodies.push(JSON.parse(String(init?.body ?? '{}')))
      if (bodies.length === 1) {
        onFirstRound?.()
        // 첫 판: w-a 는 러프가 없어 건너뜀.
        return new Response(JSON.stringify({ ok: true, data: { submitted: [], remaining: 0, skipped: [{ shotId: 'w-a', reason: 'missing_rough_storyboard' }] } }), { status: 200 })
      }
      return new Response(JSON.stringify({ ok: true, data: { submitted: [], remaining: 0, skipped: [] } }), { status: 200 })
    }
    return new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 })
  }))
})
afterEach(() => {
  cancelRealBatchResume('p1')
  vi.unstubAllGlobals()
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('기다린 샷이 준비되면 다시 도는 일괄', () => {
  it('고른 샷만 만들 때 러프 · 인물 시트를 기다린 샷이 준비되면, 다시 도는 일괄도 그 남은 샷만 싣는다', async () => {
    // 왜: 다시 도는 일괄이 목록 없이 돌아 고르지 않은 빈 샷까지 만들었다(리드 검토 a 보통 2, 탐침 probe-resume).
    await runRealBatch('p1', { shotIds: ['w-a', 'w-c'] })
    expect(shared.release).not.toBeNull()
    shared.release!()
    await vi.waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1].shotIds).toEqual(['w-a'])
    expect(bodies[1].force).toBeUndefined()
  })

  it('다시 만들기로 기다린 샷이 준비되면, 다시 도는 일괄도 다시 만들기로 싣는다', async () => {
    // 왜: 다시 만들기(force)가 빠지면 이미 그림이 있는 샷은 서버가 건너뛴다.
    await runRealBatch('p1', { force: true, shotIds: ['w-a', 'w-c'] })
    shared.release!()
    await vi.waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toMatchObject({ force: true, shotIds: ['w-a'] })
  })

  it('[모두 멈추기]를 누른 판은 기다리던 샷이 준비돼도 다시 돌지 않는다', async () => {
    // 왜: 멈춘 뒤 저절로 다시 돌아 남은 빈 샷을 그렸다(리드 검토 a S4-1 보통 5, 탐침 probe-stop-resume · 오너 답 7).
    onFirstRound = () => useDirectorCanvasStore.getState().cancelRealBatch()
    await runRealBatch('p1', { shotIds: ['w-a', 'w-c'] })
    expect(shared.release).toBeNull()
    await settle()
    expect(bodies).toHaveLength(1)
    expect(useDirectorCanvasStore.getState().realBatchResumeShotIds).toEqual([])
  })

  it('[모두 멈추기]를 누르면 이미 걸어 둔 다시 돌기도 거둔다', async () => {
    // 왜: 앞 판이 걸어 둔 다시 돌기가 멈춘 뒤에 돌면 멈춤이 지켜지지 않는다(리드 검토 a S4-1 보통 5).
    await runRealBatch('p1', { shotIds: ['w-a', 'w-c'] })
    expect(useDirectorCanvasStore.getState().realBatchResumeShotIds).toEqual(['w-a'])
    cancelRealBatchResume('p1')
    expect(useDirectorCanvasStore.getState().realBatchResumeShotIds).toEqual([])
    shared.release?.()
    await settle()
    expect(bodies).toHaveLength(1)
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    const stopAll = page.slice(page.indexOf('const stopAll = async () => {'), page.indexOf('const stopAll = async () => {') + 600)
    expect(stopAll).toContain('cancelRealBatchResume(run.projectId)')
  })
})

describe('영상까지 이어서 — 다시 도는 일괄을 기다리는 샷', () => {
  it('러프 · 시트를 기다려 다시 도는 일괄을 기다리는 샷은 "영상까지 이어서" 기다림에서 빠지지 않는다', () => {
    // 왜: 일괄이 끝날 때 말없이 기다림에서 빠져, 나중에 그림이 나와도 영상이 이어지지 않았다(리드 검토 a 낮음 9).
    expect(chainStep(['b'], new Map([['b', 'image_needed']]), false, new Set(['b']))).toEqual({ start: [], drop: [], keep: ['b'] })
    expect(chainStep(['b'], new Map([['b', 'image_needed']]), false, new Set())).toEqual({ start: [], drop: ['b'], keep: [] })
  })
})
