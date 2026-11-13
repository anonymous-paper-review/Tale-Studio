// 실사 이미지 일괄이 끝나면 채팅에 "이미지 N장 완료, M장 실패" 한 줄이 남고, 채팅을 접어 둔 Director 면 Lumi 알림 카드도 뜨는지 검사한다 (약속 E4 · 11/13 시안 D8)
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
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

beforeEach(() => {
  vi.useFakeTimers()
  shared.client = new QueryClient()
  shared.notify.mockClear()
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  useProjectStore.setState({ projectId: 'p1', currentStage: 'director' })
  useLocaleStore.setState({ locale: 'en' })
  useChatUiStore.setState({ collapsed: true })
  useLumiNoticeStore.setState({ notice: null })
  // 시트 두 장 — 하나(샷 둘)는 끝나고 하나(샷 하나)는 실패한다.
  jobAnswers = { 'job-1': 'completed', 'job-2': 'failed' }
  let batchCalls = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      batchCalls += 1
      const data = batchCalls === 1
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

async function run() {
  let done = false
  const result = runRealBatch('p1').finally(() => { done = true })
  for (let i = 0; i < 200 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
  return result
}

describe('이미지 일괄이 끝났을 때', () => {
  // 왜: 영상 일괄은 끝나면 채팅에 한 줄을 남기는데(약속 E4) 이미지 일괄은 잠깐 뜨는 알림뿐이었다 — 채팅이 열려 있으면 이 줄로 알린다(시안 D8 · 추천).
  it('이미지 일괄이 끝나면 채팅에 "이미지 N장 완료, M장 실패" 한 줄이 남는다', async () => {
    await run()
    expect(shared.notify).toHaveBeenCalledWith('director', '✓ 2 images done, 1 failed')
  })

  // 왜: 시안 D8 — 채팅을 접어 둔 채 끝나면 오른쪽 아래 카드로 끝난 수 · 실패 수를 알린다.
  it('채팅을 접어 둔 Director 에서 이미지 일괄이 끝나면 Lumi 알림 카드가 뜬다', async () => {
    await run()
    expect(useLumiNoticeStore.getState().notice).toEqual({ projectId: 'p1', kind: 'image', done: 2, failed: 1 })
  })
})
