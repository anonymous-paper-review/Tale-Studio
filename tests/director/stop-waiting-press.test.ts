// 멈춘 이미지 판을 정리하는 동안 누른 이미지 일 — 기다린다고 한 줄 알리고([취소] 단추), 그 뒤 [모두 멈추기] · [취소] · 다른 프로젝트로 옮김이면 서지 않고, 낱장 · 이어 보내기도 정리 뒤 그대로 시작한다 (검토 b S1b · S1c · 결정 ③ · 검토 a S1e · 검토 b S1g, 리드 11/14)
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
import { afterStoppedRealBatch, cancelWaitingRealBatch, runRealBatch, startSingleImage } from '@/lib/director/real-batch-client'

const page = () => readFileSync('src/app/studio/director/page.tsx', 'utf8')
const between = (text: string, start: string, end: string) => {
  const from = text.indexOf(start)
  const to = text.indexOf(end, from)
  expect(from).toBeGreaterThanOrEqual(0)
  expect(to).toBeGreaterThan(from)
  return text.slice(from, to)
}
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
type NoticeOptions = { id?: string; duration?: number; action?: { label: string; onClick: (event: unknown) => void } }
const noticeOptions = (n = 0) => (waitNotices()[n]?.[1] ?? {}) as NoticeOptions

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

describe('같이 정한 것 — 결정 ③', () => {
  it('정리 중 알림에는 [취소]가 있고, 새 판이 시작하거나 취소될 때까지 알림이 남는다 — [취소]를 누르면 기다리던 누름이 서지 않는다', async () => {
    // 왜: 리드 11/14 결정 ③ — 다른 것이 안 돌면 정리를 기다리는 동안 [모두 멈추기]가 보이지 않는다. 답이 몇 분 매달리는
    //   드문 경우에도 기다리는 누름을 거둘 길이 있어야 한다 — 새 화면 요소 없이 지금 알림의 단추로(한국어 · 영어).
    // [취소]: 알림의 단추를 누르면 기다리던 누름은 정리 뒤에 서지 않는다.
    const first = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const cancelled = runRealBatch('p1', { shotIds: ['s2'] })
    await vi.advanceTimersByTimeAsync(10)
    const ko = noticeOptions()
    expect(ko.action?.label).toBe('취소')
    expect(ko.duration).toBe(Infinity)
    expect(toast.dismiss).not.toHaveBeenCalledWith(ko.id)
    ko.action!.onClick({})
    release.shift()!()
    await first
    expect(await cancelled).toEqual({ generated: 0, quotaBlocked: false })
    await vi.advanceTimersByTimeAsync(10)
    expect(bodies).toHaveLength(1)
    // 새 판이 시작하면 그때 알림을 거둔다 — 정리 중에는 남아 있다. 영어 화면의 단추는 [Cancel].
    useLocaleStore.setState({ locale: 'en' })
    vi.mocked(toast.info).mockClear()
    vi.mocked(toast.dismiss).mockClear()
    const again = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const waiting = runRealBatch('p1', { shotIds: ['s3'] })
    await vi.advanceTimersByTimeAsync(10)
    const en = noticeOptions()
    expect(en.action?.label).toBe('Cancel')
    expect(en.duration).toBe(Infinity)
    expect(toast.dismiss).not.toHaveBeenCalledWith(en.id)
    release.shift()!()
    await again
    await vi.advanceTimersByTimeAsync(10)
    expect(bodies.map((b) => b.shotIds)).toEqual([['s1'], ['s1'], ['s3']])
    expect(toast.dismiss).toHaveBeenCalledWith(en.id)
    release.shift()!()
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1000)
    await waiting
  })
})

describe('같이 정한 것 — S1e', () => {
  it('멈춘 판을 정리하는 몇 초 동안 누른 이미지 일은 낱장 길이든 이어 보내기든 말없이 빠지지 않는다 — 정리가 끝나면 그대로 시작한다', async () => {
    // 왜: 검토 a 낮음(S1 의 틈) — 툴바는 켜졌는데 "이미지 만드는 중"이 아직 켜져 있어 (a) 실패한 샷 · Director 에서 더한 샷의
    //   낱장이 일괄 막이에 걸려 콘솔 경고만 남기고 버려졌고, (b) 앞 판이 "만드는 중"을 내리고 기다리던 새 판이 다시 올리기 전 틈에
    //   이어 보내기가 기다리던 샷을 "이미지를 못 만들어 영상 시작 못 함"으로 버릴 수 있었다. Take 는 나가지 않는다.
    // (b) 앞 판이 끝나도 기다리던 새 판이 이어받는다 — "만드는 중"이 한 번도 꺼지지 않는다.
    const busyLog: boolean[] = []
    const first = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const next = runRealBatch('p1', { shotIds: ['s2'] })
    let unsubscribe = useDirectorCanvasStore.subscribe((state) => { busyLog.push(state.realBatchBusy) })
    release.shift()!()
    await first
    await vi.advanceTimersByTimeAsync(10)
    unsubscribe()
    expect(bodies.map((b) => b.shotIds)).toEqual([['s1'], ['s2']])
    expect(busyLog).not.toContain(false)
    release.shift()!()
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1000)
    await next
    // (a) 낱장: 정리 중에 누른 낱장 · 이어 보내기 기다림은 정리가 끝날 때 시작한다 — 낱장은 일괄 막이에 걸리지 않는다.
    const real = useDirectorCanvasStore.getState().generateStoryboardImage
    const single = vi.fn(async () => null)
    useDirectorCanvasStore.setState({ generateStoryboardImage: single })
    const order: string[] = []
    const again = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const press = afterStoppedRealBatch(() => {
      order.push('chain')
      startSingleImage('failed-shot')
      void runRealBatch('p1', { shotIds: ['s4'] })
    })
    await vi.advanceTimersByTimeAsync(10)
    expect(order).toEqual([])
    expect(single).not.toHaveBeenCalled()
    expect(waitNotices().length).toBeGreaterThan(0)
    busyLog.length = 0
    unsubscribe = useDirectorCanvasStore.subscribe((state) => { busyLog.push(state.realBatchBusy) })
    release.shift()!()
    await again
    await press
    await vi.advanceTimersByTimeAsync(10)
    unsubscribe()
    expect(order).toEqual(['chain'])
    expect(single).toHaveBeenCalledWith('failed-shot', { afterStoppedBatch: true })
    expect(bodies.at(-1)?.shotIds).toEqual(['s4'])
    expect(busyLog).not.toContain(false)
    release.shift()!()
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1000)
    // 낱장만 기다리던 누름이면 낱장을 낸 뒤 "만드는 중"을 내린다.
    const third = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const onlySingles = afterStoppedRealBatch(() => { startSingleImage('added-shot') })
    release.shift()!()
    await third
    await onlySingles
    expect(single).toHaveBeenLastCalledWith('added-shot', { afterStoppedBatch: true })
    expect(useDirectorCanvasStore.getState().realBatchBusy).toBe(false)
    // 낱장도 같은 알림의 [취소]로 거둔다 — 정리가 끝나도 내지 않고 "만드는 중"도 내린다.
    single.mockClear()
    const fourth = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const cancelledSingles = afterStoppedRealBatch(() => { startSingleImage('added-shot') })
    noticeOptions(waitNotices().length - 1).action!.onClick({})
    release.shift()!()
    await fourth
    await cancelledSingles
    expect(single).not.toHaveBeenCalled()
    expect(useDirectorCanvasStore.getState().realBatchBusy).toBe(false)
    useDirectorCanvasStore.setState({ generateStoryboardImage: real })
    // 일괄 막이: 도는 일괄 중 낱장은 지금처럼 막고, 넘겨받은 자리의 낱장만 지난다.
    useDirectorCanvasStore.setState({ realBatchBusy: true })
    expect(await real('no-such-shot')).toEqual({ jobId: null, status: 'deduped' })
    expect(await real('no-such-shot', { afterStoppedBatch: true })).toBeNull()
    useDirectorCanvasStore.setState({ realBatchBusy: false })
    // 화면: 툴바의 [이미지 만들기] · [이미지 다시 만들기]가 이 길을 탄다 — 낱장을 바로 내지 않고, 이어 보내기는 시작할 때 오른다.
    const src = page()
    const start = between(src, 'const startImages = (', '// [이미지 다시 만들기 · N] 확인 뒤')
    expect(start).toContain('void afterStoppedRealBatch(() => {')
    expect(start).toContain('for (const id of singles) startSingleImage(id)')
    expect(start).toContain('void runRealBatch(pid, { shotIds: batch })')
    expect(start).not.toContain('generateStoryboardImage(')
    const remake = between(src, 'const remakePicked = () => {', '// [영상 만들기 · N]')
    expect(remake).toContain('void afterStoppedRealBatch(() => {')
    expect(remake).toContain('for (const id of singles) startSingleImage(id)')
    expect(remake).toContain('void runRealBatch(pid, { force: true, shotIds: batch })')
    expect(remake).not.toContain('generateStoryboardImage(')
    expect(src).toContain('startImages(imageWork.slice(0, chainPlan.runCount))')
    expect(src).not.toContain('setChainWaitingShots([...chainWaitingShotIds, ...imageWork.slice(0, chainPlan.runCount)])')
  })
})

describe('같이 정한 것 — S1g', () => {
  it('정리를 기다리는 사이 다른 프로젝트로 옮기면 기다리던 일(일괄 · 낱장)은 서지 않고 알림도 내린다 — 옮긴 것을 [취소]로 본다', async () => {
    // 왜: 검토 b C5 — p1 정리 중 [이미지 만들기] → p2 로 옮기면 p1 판이 서서 p2 화면의 "이미지 만드는 중"이 켜졌다
    //   (p2 [이미지 만들기]가 꺼지고 진행 줄도 p2 에 떴다). 옮긴 순간 [취소]와 같이 알림을 내리고, 정리 뒤에도 서지 않는다.
    const real = useDirectorCanvasStore.getState().generateStoryboardImage
    const single = vi.fn(async () => null)
    useDirectorCanvasStore.setState({ generateStoryboardImage: single })
    const first = runRealBatch('p1', { shotIds: ['s1'] })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    const batchPress = runRealBatch('p1', { shotIds: ['s2'] })
    const singlePress = afterStoppedRealBatch(() => { startSingleImage('failed-shot') })
    const id = noticeOptions().id
    expect(id).toBeTruthy()
    expect(toast.dismiss).not.toHaveBeenCalledWith(id)
    useDirectorCanvasStore.getState().setProjectId('p2')
    expect(toast.dismiss).toHaveBeenCalledWith(id)
    release.shift()!()
    await first
    expect(await batchPress).toEqual({ generated: 0, quotaBlocked: false })
    await singlePress
    await vi.advanceTimersByTimeAsync(10)
    expect(bodies).toHaveLength(1)
    expect(single).not.toHaveBeenCalled()
    expect(useDirectorCanvasStore.getState().realBatchBusy).toBe(false)
    useDirectorCanvasStore.setState({ generateStoryboardImage: real })
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
