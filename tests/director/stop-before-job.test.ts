// 이미지 일괄의 작업 행이 생기기 전에 [모두 멈추기]를 눌러도 툴바는 곧 다시 켜지고, 알림은 그림을 멈춘 문장으로 말한다 (영어 재점검 qa-golden S1, 리드 11/14)
import { readFileSync } from 'node:fs'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient, order: [] as string[] }))
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
vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  refreshGenerationQueue: () => { shared.order.push('refresh') },
}))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { runRealBatch } from '@/lib/director/real-batch-client'
import { stoppedCounts, stopNotice } from '@/lib/director/stop-work'
import { imageWorkBlock } from '@/lib/director/toolbar-work'
import { translate } from '@/lib/i18n/translate'

const page = () => readFileSync('src/app/studio/director/page.tsx', 'utf8')
let posts: number
let release: Array<() => void>

beforeEach(() => {
  vi.useFakeTimers()
  shared.client = new QueryClient()
  shared.order = []
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  posts = 0
  release = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      posts += 1
      const n = posts
      shared.order.push(`post-${n}`)
      // 작업 행이 생기기 전 — 서버 답이 늦게 온다.
      await new Promise<void>((resolve) => { release.push(resolve) })
      shared.order.push(`answer-${n}`)
      return new Response(JSON.stringify({ ok: true, data: { submitted: [{ jobId: `job-${n}`, shotIds: ['s1'] }], remaining: 0 } }), { status: 200 })
    }
    if (url === '/api/director/jobs/cancel') {
      const ids = (JSON.parse(String(init?.body)) as { jobIds: string[] }).jobIds
      shared.order.push(`cancel:${ids.join(',')}`)
      return new Response(JSON.stringify({ ok: true, data: { cancelled: ids.map((jobId) => ({ jobId, kind: 'storyboard_real_grid', writerShotIds: ['s1'], videoClipId: null, cancelledAt: '2026-11-14T00:00:00.000Z' })) } }), { status: 200 })
    }
    if (url.startsWith('/api/director/video-takes')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
    if (url.startsWith('/api/generation-jobs/')) return new Response(JSON.stringify({ data: { status: 'completed' } }), { status: 200 })
    return new Response(JSON.stringify({ ok: true, data: { jobs: [] } }), { status: 200 })
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('같이 정한 것', () => {
  it('작업 행이 생기기 전에 [모두 멈추기]를 눌러도 툴바는 곧 다시 켜지고, 알림은 그림을 멈춘 문장으로 말한다', async () => {
    // 왜: 영어 재점검 S1 — 멈춘 이미지 판이 서버 답을 기다리는 동안 [이미지 만들기]가 "Making images now…"로 꺼진 채 남았고,
    //   멈출 작업이 아직 목록에 없어 알림이 "Stopped."뿐이었다(작업은 서버 답 뒤 멈춤으로 기록됨).
    // 툴바: 멈춘 판은 "만드는 중"으로 단추를 끄지 않는다.
    expect(page()).toContain('imageWorkBlock(workStates, picked, realBatchBusy && !realBatchCancelled, ')
    expect(imageWorkBlock(new Map([['a', 'image_done']]), new Set(['a']), false)).toBeNull()
    // 알림: 도는 이미지 판을 멈췄으면, 멈춘 작업이 아직 목록에 없어도 그림 문장이다.
    expect(stoppedCounts([], new Set(), true)).toEqual({ images: 1, videos: 0 })
    expect(stoppedCounts([], new Set(), false)).toEqual({ images: 0, videos: 0 })
    expect(stoppedCounts([{ id: 'v', kind: 'shot_video' }], new Set(['v']), false)).toEqual({ images: 0, videos: 1 })
    expect(translate('en', stopNotice(stoppedCounts([], new Set(), true)))).toBe('Stopped. If the images being made finish later, they stay in the versions.')
    expect(page()).toContain('stopNotice(stoppedCounts(asked, stopped, imageBatchWasLive))')
  })

  it('멈춘 판이 서버 답을 기다리는 동안 [이미지 만들기]를 다시 누르면, 앞 판이 정리된 뒤 새 판이 바로 시작한다', async () => {
    // 왜: 툴바가 곧 켜지므로 누를 수 있어야 한다 — 예전엔 앞 판이 끝날 때까지 누름이 말없이 무시됐다(앞 판이 끝나며 새 판의 표시를 지우지도 않게).
    const first = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const second = runRealBatch('p1', { shotIds: ['s2'] })
    await vi.advanceTimersByTimeAsync(10)
    expect(posts).toBe(1)
    release.shift()!()
    await first
    await vi.advanceTimersByTimeAsync(10)
    expect(posts).toBe(2)
    expect(useDirectorCanvasStore.getState()).toMatchObject({ realBatchBusy: true, realBatchCancelled: false })
    release.shift()!()
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1000)
    await second
    expect(useDirectorCanvasStore.getState().realBatchBusy).toBe(false)
  })
})

describe('혼자 정한 것', () => {
  it('멈춘 판은 서버 답으로 받은 장을 "만드는 중"으로 띄우지 않고 바로 멈춘다', async () => {
    // 왜: 영어 재점검 S1 — 답을 받자마자 작업 목록을 다시 읽어 카드가 0.5초 "Making image · Stop making"으로 깜빡였다.
    const run = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    release.shift()!()
    await run
    const answer = shared.order.indexOf('answer-1')
    const cancel = shared.order.indexOf('cancel:job-1')
    expect(cancel).toBeGreaterThan(answer)
    expect(shared.order.slice(answer, cancel)).not.toContain('refresh')
  })
})
