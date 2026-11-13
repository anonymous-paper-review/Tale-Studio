// 멈춘 이미지 판을 정리하는 동안 누른 [이미지 만들기] — 기다린다고 한 줄 알리고, 그 뒤 [모두 멈추기]를 누르면 서지 않는다 (검토 b S1b · S1c, 리드 11/14)
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }))

import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { cancelWaitingRealBatch, runRealBatch } from '@/lib/director/real-batch-client'

const page = () => readFileSync('src/app/studio/director/page.tsx', 'utf8')
const WAIT_EN = 'Wrapping up the previous work. It will start right after.'
const WAIT_KO = '앞 작업을 정리하는 중이에요. 끝나면 바로 시작해요.'
let bodies: Array<{ shotIds?: string[] }>
let release: Array<() => void>

/** [모두 멈추기]가 이미지 판에 하는 일 — 도는 판은 멈추고, 정리를 기다리는 누름은 거둔다(page.tsx stopAll 과 같은 순서). */
function pressStopAll() {
  const s = useDirectorCanvasStore.getState()
  if (s.realBatchBusy && !s.realBatchCancelled) s.cancelRealBatch()
  cancelWaitingRealBatch()
}

/** 정리를 기다린다는 알림만 — 다른 알림(끝 · 건너뜀)은 세지 않는다. */
const waitNotices = () => vi.mocked(toast.info).mock.calls.filter(([text]) => text === WAIT_EN || text === WAIT_KO)

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(toast.info).mockClear()
  vi.mocked(toast.dismiss).mockClear()
  shared.client = new QueryClient()
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  useLocaleStore.setState({ locale: 'ko' })
  bodies = []
  release = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      const body = JSON.parse(String(init?.body)) as { shotIds?: string[] }
      bodies.push(body)
      const n = bodies.length
      // 작업 행이 생기기 전 — 서버 답이 늦게 온다.
      await new Promise<void>((resolve) => { release.push(resolve) })
      return new Response(JSON.stringify({ ok: true, data: { submitted: [{ jobId: `job-${n}`, shotIds: body.shotIds ?? [] }], remaining: 0 } }), { status: 200 })
    }
    if (url === '/api/director/jobs/cancel') {
      const ids = (JSON.parse(String(init?.body)) as { jobIds: string[] }).jobIds
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
  it('멈춘 판을 기다리는 [이미지 만들기]도 그 뒤 [모두 멈추기]를 누르면 서지 않는다 — 사람이 마지막에 누른 것을 따른다', async () => {
    // 왜: 검토 b P6 — [모두 멈추기]는 도는 판만 멈춰서, 멈춘 판의 정리를 기다리던 누름은 정리가 끝나자 새 판을 세웠다(멈춘 뒤에 그림이 나감).
    //   [모두 멈추기] 뒤에 다시 누른 것은 선다 — 마지막에 누른 것을 따른다.
    expect(page()).toMatch(/if \(realBatchBusy && !realBatchCancelled\) run\.cancelRealBatch\(\)\n(?:\s*\/\/.*\n)*\s*cancelWaitingRealBatch\(\)\n/)
    const first = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    pressStopAll()
    // 정리를 기다리는 누름 → [모두 멈추기] → 다시 누름(이것도 기다림).
    const dropped = runRealBatch('p1', { shotIds: ['s2'] })
    await vi.advanceTimersByTimeAsync(10)
    pressStopAll()
    const last = runRealBatch('p1', { shotIds: ['s3'] })
    await vi.advanceTimersByTimeAsync(10)
    expect(bodies).toHaveLength(1)
    release.shift()!()
    await first
    expect(await dropped).toEqual({ generated: 0, quotaBlocked: false })
    await vi.advanceTimersByTimeAsync(10)
    // 정리 뒤 선 판은 마지막 누름 하나뿐이다.
    expect(bodies.map((b) => b.shotIds)).toEqual([['s1'], ['s3']])
    release.shift()!()
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1000)
    await last
    expect(bodies).toHaveLength(2)
    expect(useDirectorCanvasStore.getState().realBatchBusy).toBe(false)
  })

  it('멈춘 판을 정리하는 동안 [이미지 만들기]를 누르면 "앞 작업을 정리하는 중이에요. 끝나면 바로 시작해요." 한 줄을 알린다', async () => {
    // 왜: 검토 b P4 — 누름이 정리를 기다리는 동안 화면이 그대로였다. 서버 답이 매달리면(최대 300초 → 504 → 5초) 5분 남짓 아무 일도 없어 보였다.
    //   영어 화면은 영어로. 여러 번 눌러도 알림은 한 줄(같은 자리를 덮는다).
    const first = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    // 도는 판이 없을 때의 누름은 알리지 않는다.
    expect(waitNotices()).toHaveLength(0)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const second = runRealBatch('p1', { shotIds: ['s2'] })
    useLocaleStore.setState({ locale: 'en' })
    const third = runRealBatch('p1', { shotIds: ['s2'] })
    const notices = waitNotices()
    expect(notices.map(([text]) => text)).toEqual([WAIT_KO, WAIT_EN])
    const ids = notices.map(([, options]) => (options as { id?: string } | undefined)?.id)
    expect(ids[0]).toBeTruthy()
    expect(ids[1]).toBe(ids[0])
    release.shift()!()
    await first
    await vi.advanceTimersByTimeAsync(10)
    release.shift()!()
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1000)
    await Promise.all([second, third])
    expect(bodies).toHaveLength(2)
  })
})

describe('혼자 정한 것', () => {
  it('정리를 기다리던 누름을 [모두 멈추기]로 거두면 "끝나면 바로 시작해요" 알림도 거둔다', async () => {
    // 왜: 알림이 "끝나면 바로 시작해요"라고 한 판이 [모두 멈추기]로 서지 않게 됐다 — 알림이 남아 있으면 틀린 말이 된다.
    const first = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    pressStopAll()
    const dropped = runRealBatch('p1', { shotIds: ['s2'] })
    const id = (waitNotices()[0]?.[1] as { id?: string } | undefined)?.id
    expect(id).toBeTruthy()
    expect(toast.dismiss).not.toHaveBeenCalledWith(id)
    pressStopAll()
    expect(toast.dismiss).toHaveBeenCalledWith(id)
    release.shift()!()
    await first
    await dropped
    expect(bodies).toHaveLength(1)
  })

  it('저절로 다시 도는 판(러프 · 시트를 기다린 샷)은 정리를 기다려도 알리지 않는다', async () => {
    // 왜: 사람이 누르지 않은 판에 "끝나면 바로 시작해요"라고 하면 무엇이 시작하는지 알 수 없다 — 이 함수의 다른 알림도 저절로 도는 판에서는 말하지 않는다.
    const first = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const auto = runRealBatch('p1', { silent: true, shotIds: ['s2'] })
    expect(waitNotices()).toHaveLength(0)
    release.shift()!()
    await first
    await vi.advanceTimersByTimeAsync(10)
    release.shift()!()
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1000)
    await auto
  })
})
