// 스토리보드 생성은 한 번 누르면 요청 하나가 실패하거나 샷이 많아도 중간에 멈추지 않고 끝까지 낸다 (오너 제보 2026-10-10)
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
const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { runRealBatch } from '@/lib/director/real-batch-client'

type Round = { status?: number; data?: Record<string, unknown>; error?: string; text?: string }
let rounds: Round[]
let batchBodies: Array<Record<string, unknown>>
let polled: string[]
let batchTimes: number[]

/** 일괄 요청은 rounds 를 차례로 돌려주고(다 쓰면 낼 것 없음), 작업 조회는 바로 끝났다고 답한다. */
function stubServer() {
  batchBodies = []
  batchTimes = []
  polled = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      batchBodies.push(JSON.parse(String(init?.body ?? '{}')))
      batchTimes.push(Date.now())
      const round = rounds.shift() ?? { data: { submitted: [], remaining: 0 } }
      if (round.text !== undefined) return new Response(round.text, { status: round.status ?? 504 })
      return new Response(JSON.stringify(round.data ? { ok: true, data: round.data } : { error: round.error }), { status: round.status ?? 200 })
    }
    if (url.startsWith('/api/generation-jobs/')) {
      polled.push(decodeURIComponent(url.split('/').pop() ?? ''))
      return new Response(JSON.stringify({ data: { status: 'completed', resultUrl: 'https://img/new.png' } }), { status: 200 })
    }
    if (url.startsWith('/api/director/video-takes?')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
    return new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 })
  }))
}

/** 기다림(5초 간격)을 가짜 시계로 흘려보내며 판이 끝날 때까지 돌린다. */
async function run(opts?: Parameters<typeof runRealBatch>[1]) {
  let done = false
  const result = runRealBatch('p1', opts).finally(() => { done = true })
  for (let i = 0; i < 2000 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
  return result
}

const job = (jobId: string, ...shotIds: string[]) => ({ jobId, shotIds })
const timeout = (): Round => ({ status: 504, text: 'An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT' })

beforeEach(() => {
  vi.useFakeTimers()
  shared.client = new QueryClient()
  toast.success.mockClear(); toast.info.mockClear(); toast.error.mockClear()
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  stubServer()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('스토리보드 생성은 중간에 멈추지 않는다', () => {
  it('요청 하나가 서버 시간 초과로 실패해도 멈추지 않고 5초 뒤 다시 물어 남은 샷을 이어서 낸다', async () => {
    // 왜: 10/10 운영 806e2cc2 — 첫 요청이 60초에 끊기자 시트 한 장(4샷)만 그리고 판이 끝났다. 이미 낸 그림은 서버 실패와 상관없이 그려진다.
    rounds = [timeout(), { data: { submitted: [job('job-2', 's5', 's6')], remaining: 0 } }]
    const result = await run()
    expect(batchBodies).toHaveLength(2)
    expect(batchTimes[1] - batchTimes[0]).toBeGreaterThanOrEqual(5000)
    expect(result.generated).toBe(2)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('요청이 세 번 연달아 실패하면 더 묻지 않고 멈춘 뒤 알린다', async () => {
    // 왜: 서버가 계속 실패하면 끝없이 묻지 않는다 — 몇 번 다시 물었는지 정해 둔다.
    rounds = [timeout(), timeout(), timeout(), { data: { submitted: [job('job-9', 's9')], remaining: 0 } }]
    await run()
    expect(batchBodies).toHaveLength(3)
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('서버가 요청을 거절하면 다시 묻지 않고 바로 멈춘 뒤 알린다', async () => {
    // 정상 경로 고정 — 인물 모습이 샷과 안 맞는 것 같은 거절은 다시 물어도 같다.
    rounds = [{ status: 409, error: 'Character appearance contract error: shot sh_01_01 character_appearance_keys does not match its characters' }]
    await run()
    expect(batchBodies).toHaveLength(1)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Character appearance contract error'))
  })

  it('서버가 이미 그리는 중이라고 알려 준 그림은 끝날 때까지 기다린 뒤 다음 차례를 묻는다', async () => {
    // 왜: 지금은 앞쪽 샷이 아직 그려지는 중이면 낼 것이 없다는 답에 판 전체가 끝났다.
    rounds = [
      { data: { submitted: [], remaining: 2, inProgress: [job('job-x', 's1', 's2')] } },
      { data: { submitted: [job('job-2', 's3', 's4')], remaining: 0 } },
    ]
    const result = await run()
    expect(polled).toContain('job-x')
    expect(batchBodies).toHaveLength(2)
    expect(result.generated).toBe(2)
  })

  it('이번 판에 이미 낸 샷은 다음 요청에서 빼 달라고 서버에 알린다 (전체 재생성도 같다)', async () => {
    // 왜: 실패한 샷이 판이 끝날 때까지 요청마다 다시 나갔고, 전체 재생성은 맨 앞 8개 샷만 거듭 다시 그렸다.
    for (const force of [false, true]) {
      rounds = [
        { data: { submitted: [job('job-1', 's1', 's2', 's3', 's4')], remaining: 4 } },
        { data: { submitted: [job('job-2', 's5', 's6', 's7', 's8')], remaining: 0 } },
      ]
      batchBodies.length = 0
      await run(force ? { force: true } : undefined)
      expect(batchBodies).toHaveLength(2)
      expect(batchBodies[0].skipShotIds).toBeUndefined()
      expect(batchBodies[1]).toMatchObject({ ...(force ? { force: true } : {}), skipShotIds: ['s1', 's2', 's3', 's4'] })
    }
  })

  it('샷이 많아도 열 번째 요청에서 멈추지 않고 남은 샷이 없을 때까지 묻는다', async () => {
    // 왜: 요청 한 번에 시트 2장이라 10번이면 많아야 80샷이고, 씬이 바뀌면 시트가 나뉘어 더 적다(운영 7ad4d3a2 72샷은 11번이 필요했다).
    rounds = Array.from({ length: 12 }, (_, i) => ({ data: { submitted: [job(`job-${i}`, `s${i}`)], remaining: 11 - i } }))
    const result = await run()
    expect(batchBodies).toHaveLength(12)
    expect(result.generated).toBe(12)
  })
})
