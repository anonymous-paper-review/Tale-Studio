// 스토리보드 생성은 한 번 누르면 요청 하나가 실패하거나 샷이 많아도 중간에 멈추지 않고 끝까지 낸다 (오너 제보 2026-10-10)
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient, sheets: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'is', 'in', 'not', 'maybeSingle', 'update']) chain[m] = () => chain
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === 'character_appearances' ? shared.sheets : [], error: null }).then(resolve)
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
let batchTimes: number[]
/** 작업별 조회 답(차례로) — 다 쓰거나 없으면 끝났다고 답한다. */
let jobAnswers: Record<string, string[]>
/** 일괄 요청 · 작업 조회가 일어난 순서 */
let events: string[]

function stubServer() {
  batchBodies = []
  batchTimes = []
  jobAnswers = {}
  events = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      batchBodies.push(JSON.parse(String(init?.body ?? '{}')))
      batchTimes.push(Date.now())
      events.push('batch')
      const round = rounds.shift() ?? { data: { submitted: [], remaining: 0 } }
      if (round.text !== undefined) return new Response(round.text, { status: round.status ?? 504 })
      return new Response(JSON.stringify(round.data ? { ok: true, data: round.data } : { error: round.error }), { status: round.status ?? 200 })
    }
    if (url.startsWith('/api/generation-jobs/')) {
      const jobId = decodeURIComponent(url.split('/').pop() ?? '')
      const status = jobAnswers[jobId]?.shift() ?? 'completed'
      events.push(`poll:${jobId}:${status}`)
      return new Response(JSON.stringify({ data: { status, resultUrl: 'https://img/new.png' } }), { status: 200 })
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

beforeEach(() => {
  vi.useFakeTimers()
  shared.client = new QueryClient()
  shared.sheets = []
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
    jobAnswers = { 'job-x': ['queued', 'queued', 'completed'] }
    const result = await run()
    expect(batchBodies).toHaveLength(2)
    // 두 번째 요청은 그리던 그림이 끝났다는 답을 받은 뒤에 나간다.
    expect(events.indexOf('poll:job-x:completed')).toBeGreaterThan(-1)
    expect(events.indexOf('poll:job-x:completed')).toBeLessThan(events.lastIndexOf('batch'))
    // 남이 그리던 그림은 이 판이 만든 수에 넣지 않는다.
    expect(result.generated).toBe(2)
  })

  it('앞 요청의 답을 못 받았어도 이 판이 낸 그림은 끝날 때까지 기다리고 만든 수에 넣는다', async () => {
    // 왜: 시간 초과로 답을 잃은 요청도 시트를 이미 냈을 수 있다. 화면이 그 그림을 모르면 만든 수와 채팅 기록에서 빠진다.
    rounds = [timeout(), { data: { submitted: [], remaining: 0, inProgress: [{ ...job('job-lost', 's1', 's2'), sameRun: true }] } }]
    const onJob = vi.fn()
    const result = await run({ onJob })
    expect(events).toContain('poll:job-lost:completed')
    expect(result.generated).toBe(2)
    expect(onJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-lost', status: 'completed' }))
  })

  it('한 판의 요청에는 모두 같은 판 표시를 붙이고, 버튼을 다시 누르면 새 판이 된다 (전체 재생성도 같다)', async () => {
    // 왜: 서버가 이 판이 이미 낸 샷을 알아보고 다시 내지 않게 한다 — 실패한 샷이 요청마다 다시 나갔고, 전체 재생성은 맨 앞 8개 샷만 거듭 다시 그렸다.
    const runIds: unknown[] = []
    for (const force of [false, true]) {
      rounds = [
        { data: { submitted: [job('job-1', 's1', 's2', 's3', 's4')], remaining: 4 } },
        { data: { submitted: [job('job-2', 's5', 's6', 's7', 's8')], remaining: 0 } },
      ]
      batchBodies.length = 0
      await run(force ? { force: true } : undefined)
      expect(batchBodies).toHaveLength(2)
      expect(batchBodies[0].runId).toMatch(UUID)
      expect(batchBodies[1]).toMatchObject({ ...(force ? { force: true } : {}), runId: batchBodies[0].runId })
      runIds.push(batchBodies[0].runId)
    }
    expect(runIds[0]).not.toBe(runIds[1])
  })

  it('샷이 많아도 열 번째 요청에서 멈추지 않고 남은 샷이 없을 때까지 묻는다', async () => {
    // 왜: 요청 한 번에 시트 2장이라 10번이면 많아야 80샷이고, 씬이 바뀌면 시트가 나뉘어 더 적다(운영 7ad4d3a2 72샷은 11번이 필요했다).
    rounds = Array.from({ length: 12 }, (_, i) => ({ data: { submitted: [job(`job-${i}`, `s${i}`)], remaining: 11 - i } }))
    const result = await run()
    expect(batchBodies).toHaveLength(12)
    expect(result.generated).toBe(12)
  })

  it('인물 시트를 기다리는 샷이 여럿이어도 시트가 준비되면 판을 다시 시작한다', async () => {
    // 왜: 같은 인물을 기다리는 샷마다 따로 기다리면 먼저 취소된 기다림이 이겨 "자동으로 이어서 만든다"던 판이 다시 시작하지 않았다.
    const missing = [{ characterId: 'char', appearanceKey: 'current', name: '소녀' }]
    rounds = [{
      data: {
        submitted: [],
        remaining: 0,
        skipped: [
          { shotId: 's1', reason: 'missing_character_sheets', missing },
          { shotId: 's2', reason: 'missing_character_sheets', missing },
        ],
      },
    }]
    await run()
    expect(batchBodies).toHaveLength(1)
    // 시트가 생긴 뒤 다음 확인(10초 간격)에서 판이 다시 시작한다.
    rounds.push({ data: { submitted: [job('job-r', 's1', 's2')], remaining: 0 } })
    shared.sheets = [{ character_id: 'char', appearance_key: 'current', sheet_url: 'https://img/sheet.png' }]
    for (let i = 0; i < 60 && batchBodies.length < 2; i++) await vi.advanceTimersByTimeAsync(1000)
    expect(batchBodies).toHaveLength(2)
  })
})
