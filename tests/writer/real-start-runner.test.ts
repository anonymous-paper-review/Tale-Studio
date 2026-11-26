// Storyboard [시작]이 Director [이미지 만들기]와 같은 실사 일괄 러너 · 같은 서버 요청 · 같은 진행 깃발을 쓰고, 끝 알림 한 줄만 Storyboard 채팅에 남기는지 검사한다
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient, notify: vi.fn() }))
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

import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLumiNoticeStore } from '@/stores/lumi-notice-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { runRealBatch } from '@/lib/director/real-batch-client'

/** 작업별 조회 답 — 없으면 끝났다고 답한다. */
let jobAnswers: Record<string, string>
/** 일괄 요청에 실려 간 몸통. */
let batchBodies: Array<Record<string, unknown>>
/** 일괄 요청이 도는 동안 본 진행 깃발. */
let busyDuringRequest: boolean[]

beforeEach(() => {
  vi.useFakeTimers()
  shared.client = new QueryClient()
  shared.notify.mockClear()
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  // Storyboard 화면(단계 id writer) — Director 는 열어 본 적이 없다.
  useProjectStore.setState({ projectId: 'p1', currentStage: 'writer' })
  useLocaleStore.setState({ locale: 'en' })
  useChatUiStore.setState({ collapsed: true })
  useLumiNoticeStore.setState({ notice: null })
  // 시트 두 장 — 하나(샷 둘)는 끝나고 하나(샷 하나)는 실패한다.
  jobAnswers = { 'job-1': 'completed', 'job-2': 'failed' }
  batchBodies = []
  busyDuringRequest = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      batchBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      busyDuringRequest.push(useDirectorCanvasStore.getState().realBatchBusy)
      const data = batchBodies.length === 1
        ? { submitted: [{ jobId: 'job-1', shotIds: ['w1', 'w2'] }, { jobId: 'job-2', shotIds: ['w3'] }], remaining: 0 }
        : { submitted: [], remaining: 0 }
      return new Response(JSON.stringify({ ok: true, data }), { status: 200 })
    }
    if (url.startsWith('/api/generation-jobs/')) {
      const jobId = decodeURIComponent(url.split('/').pop() ?? '')
      return new Response(JSON.stringify({ data: { status: jobAnswers[jobId] ?? 'completed', resultUrl: 'https://img/new.png' } }), { status: 200 })
    }
    if (url.startsWith('/api/director/video-takes?')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
    return new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 })
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function run(options?: Parameters<typeof runRealBatch>[1]) {
  let done = false
  const result = runRealBatch('p1', options).finally(() => { done = true })
  for (let i = 0; i < 200 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
  return result
}

describe('Storyboard [시작]의 실사 일괄', () => {
  // 왜: Storyboard 에서 시작한 일괄의 끝 알림이 Director 채팅에 쓰여, Storyboard 채팅을 보는 사람은 끝난 줄을 못 봤다(m-conti 조사).
  //   언제: Storyboard [시작]으로 만든 일괄이 끝날 때.
  it('Storyboard 에서 시작한 실사 일괄이 끝나면 "이미지 N장 완료, M장 실패" 한 줄은 Storyboard 채팅에 남는다', async () => {
    await run({ stage: 'writer', shotIds: ['w1', 'w2', 'w3'] })
    expect(shared.notify).toHaveBeenCalledTimes(1)
    expect(shared.notify).toHaveBeenCalledWith('writer', '✓ 2 images done, 1 failed')
  })

  // 왜(오너 S2 "지금 Director 스토리보드처럼"): 같은 서버 요청이면 같은 지시문(main d4f57647)으로 그린다 — 화면이 센 샷만 싣는다.
  it('Storyboard 에서 시작한 실사 일괄은 Director [이미지 만들기]와 같은 서버 요청에 화면이 센 샷을 싣는다', async () => {
    await run({ stage: 'writer', shotIds: ['w1', 'w2', 'w3'] })
    expect(batchBodies[0]).toMatchObject({ projectId: 'p1', shotIds: ['w1', 'w2', 'w3'] })
    expect(typeof batchBodies[0].runId).toBe('string')
    expect(batchBodies[0]).not.toHaveProperty('force')
  })

  // 왜: 한 탭에 일괄은 하나 — Storyboard 에서 시작한 일괄이 Director 툴바 · 카드의 "만드는 중 · 차례 기다림"과 [모두 멈추기]에도 그대로 보인다.
  it('Storyboard 에서 시작한 실사 일괄이 도는 동안 Director 와 같은 진행 깃발이 켜져 있고 끝나면 꺼진다', async () => {
    await run({ stage: 'writer', shotIds: ['w1', 'w2', 'w3'] })
    expect(busyDuringRequest[0]).toBe(true)
    expect(useDirectorCanvasStore.getState().realBatchBusy).toBe(false)
  })

  // 왜: Lumi 알림 카드는 채팅을 접어 둔 Director 의 것이다(11/13 시안 D8) — Storyboard 화면에는 띄우지 않는다.
  it('Storyboard 에서 실사 일괄이 끝나도 Director 의 오른쪽 아래 Lumi 알림 카드는 뜨지 않는다', async () => {
    await run({ stage: 'writer', shotIds: ['w1', 'w2', 'w3'] })
    expect(useLumiNoticeStore.getState().notice).toBeNull()
  })

  // 왜(정상 경로 고정): 단계를 주지 않은 일괄(Director 툴바 · 채팅)은 지금처럼 Director 채팅에 끝 줄을 남긴다.
  it('단계를 주지 않은 실사 일괄의 끝 알림은 지금처럼 Director 채팅에 남는다', async () => {
    await run()
    expect(shared.notify).toHaveBeenCalledWith('director', '✓ 2 images done, 1 failed')
  })
})
