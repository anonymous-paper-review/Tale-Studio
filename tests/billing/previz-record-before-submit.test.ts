// 미리보기 영상은 서비스에 보내기 전에 먼저 기록하고, 잔액이 모자라면 보내지 않는다
//
// 예전 순서는 "제출 → 작업 행 만들기 → Take 잡기" 였다. 그래서 두 가지가 새었다.
//   1) 제출과 행 생성 사이에 요청이 죽으면 fal 은 만들고 과금하는데 우리에겐 추적 행이 없다.
//      나중에 webhook 이 와도 매칭할 잡이 없어 조용히 버려진다.
//   2) 잔액이 0 인 사용자도 fal 제출이 먼저 나가 회사 비용만 나가고 402 를 받았다.
// 본 영상은 이미 반대 순서다(예약 → 제출). previz 도 같은 규칙을 따른다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  falVideoSubmit: vi.fn(),
  pickFalKey: vi.fn(),
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  holdTakesForVideoJob: vi.fn(),
  releaseTakesForJob: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  deriveEnBatch: vi.fn(),
  recordObservability: vi.fn(),
  order: [] as string[],
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/writer/llm/fal', () => ({ falVideoSubmit: mocks.falVideoSubmit }))
vi.mock('@/lib/fal/keys', () => ({ pickFalKey: mocks.pickFalKey }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  createGenerationJob: mocks.createGenerationJob,
  failGenerationJob: mocks.failGenerationJob,
}))
// videoCapacityReservationRejection 이 actual quota.ts 를 거쳐 quotaExceededBody 를 부르므로 이 머지 export 도
//   importOriginal 로 보존한다 — 기존 두 check 함수 mock 은 그대로 유지(약화 없음).
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
}))
// 새 videoCapacityReservationRejection(error, ctx) 는 actual quota.ts 에서 그대로 재사용한다 —
//   부모가 그 헬퍼를 구현하면 이 spread 로 자동 반영되고, 여기서 하드코딩한 가짜 count 는 없다.
//   기존 두 헬퍼는 기존 계약대로 계속 오버라이드한다(약화 없음).
vi.mock('@/lib/api/quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/quota')>()),
  quotaRejectionResponse: () => new Response(JSON.stringify({ error: 'quota' }), { status: 429 }),
  videoBudgetRejectionResponse: () => new Response(JSON.stringify({ error: 'budget' }), { status: 429 }),
}))
// 관측 기록만 목 — 실제 DB 접속 금지.
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: mocks.recordObservability,
}))
vi.mock('@/lib/billing/take-hold', () => ({
  holdTakesForVideoJob: mocks.holdTakesForVideoJob,
  releaseTakesForJob: mocks.releaseTakesForJob,
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://example.test/api/fal/webhook' }))

import { POST } from '@/app/api/director/generate-previz-video/route'

function query(rows: unknown, single?: unknown) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'gte', 'contains', 'update', 'order', 'limit']) {
    q[name] = vi.fn(() => q)
  }
  q.maybeSingle = vi.fn(async () => ({ data: single ?? null, error: null }))
  q.single = q.maybeSingle
  ;(q as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows, error: null })
  return q
}

function request() {
  return new Request('http://localhost/api/director/generate-previz-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: '11111111-2222-4333-8444-555555555555', writerShotId: 'sh_01' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order = []
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1' })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true })
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.deriveEnBatch.mockResolvedValue(new Map([['a', 'a man walks']]))
  mocks.pickFalKey.mockResolvedValue({ id: 'key-1' })
  mocks.createGenerationJob.mockImplementation(async () => {
    mocks.order.push('create-job')
    return { id: 'job-1' }
  })
  mocks.holdTakesForVideoJob.mockImplementation(async () => {
    mocks.order.push('hold')
    return { ok: true, insufficient: false, balance: 10 }
  })
  mocks.falVideoSubmit.mockImplementation(async () => {
    mocks.order.push('submit')
    return { request_id: 'fal-1', model: 'happy-horse', fal_key_id: 'key-1' }
  })
  mocks.rpc.mockResolvedValue({ data: null, error: null })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'projects') return query(null, { workspace_id: 'workspace-1' })
    if (table === 'shots')
      return query(null, {
        shot_id: 'sh_01',
        action_description: '남자가 걷는다',
        duration_seconds: 5,
        rough_storyboard: { url: 'https://cdn/rough.png', frames: { start: 'https://cdn/s.png', end: 'https://cdn/e.png' } },
      })
    if (table === 'generation_jobs') return query([])
    throw new Error(`unexpected table: ${table}`)
  })
})

describe('미리보기 영상 만들기 순서', () => {
  it('작업을 먼저 기록하고 Take 를 잡은 뒤에 서비스로 보낸다', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.order).toEqual(['create-job', 'hold', 'submit'])
  })

  it('잔액이 모자라면 서비스로 보내지 않는다', async () => {
    mocks.holdTakesForVideoJob.mockImplementation(async () => {
      mocks.order.push('hold')
      return { ok: false, insufficient: true, balance: 0 }
    })

    const response = await POST(request())

    expect(response.status).toBe(402)
    // 예전에는 여기서 이미 fal 이 돌아 회사 비용이 나갔다.
    expect(mocks.falVideoSubmit).not.toHaveBeenCalled()
    expect(mocks.failGenerationJob).toHaveBeenCalledWith('job-1', 'insufficient_takes')
  })

  it('보내기가 실패하면 잡아둔 Take 를 돌려준다', async () => {
    mocks.falVideoSubmit.mockRejectedValue(new Error('fal unavailable'))

    const response = await POST(request())

    expect(response.status).toBe(500)
    expect(mocks.releaseTakesForJob).toHaveBeenCalledWith('job-1')
  })
})

describe('예약 경쟁에서 한도에 걸리면 Take 를 잡거나 제출하지 않고 대기 안내를 보내는 약속', () => {
  it('createGenerationJob 이 DB trigger 로 한도 거절되면 429 를 돌려주고 hold/provider 를 부르지 않는다', async () => {
    // #video-capacity-trigger(후속): 최근 30분 영상 3개 원자 강제 — 기록(createGenerationJob) 이 이 예외로 거절한다.
    mocks.createGenerationJob.mockRejectedValue(Object.assign(new Error('video_user_at_capacity'), { details: '3' }))

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.falVideoSubmit).not.toHaveBeenCalled()
    // 관측: quotaRejectionResponse 를 거쳐 실제 큐/한도/스코프 인자로 기록됐는지 검사한다 —
    //   임의의 가짜 count 가 아니라 trigger 가 준 details 값이 그대로 실려야 한다.
    expect(mocks.recordObservability).toHaveBeenCalledWith(
      '11111111-2222-4333-8444-555555555555',
      'generation_submit_rejected_quota',
      expect.objectContaining({ scope: 'user', queued: 3, limit: 3 }),
    )
  })
})
