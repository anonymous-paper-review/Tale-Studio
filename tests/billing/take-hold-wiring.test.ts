// 영상 생성이 시작될 때 Take를 안전하게 처리하고, 실패하면 사용량을 되돌린다 (#payments-phase-2 #gen-quota-atomic-gate)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Take hold 배선 (#payments-phase-2 #gen-quota-atomic-gate) — generate-previz-video 라우트가
//   enforce 부족 시 402 + 잡을 failed 로 마킹하는지, release 가 실패 마킹 경로(director-video-takes,
//   fal/reconcile, fal/webhook)에서 호출되는지를 고정한다.
const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  falVideoSubmit: vi.fn(),
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  deriveEnBatch: vi.fn(),
  getUserById: vi.fn(),
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/writer/llm/fal', () => ({ falVideoSubmit: mocks.falVideoSubmit }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  createGenerationJob: mocks.createGenerationJob,
  failGenerationJob: mocks.failGenerationJob,
}))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
}))
vi.mock('@/lib/api/quota', () => ({
  quotaRejectionResponse: () => new Response(JSON.stringify({ error: 'quota' }), { status: 429 }),
  videoBudgetRejectionResponse: () => new Response(JSON.stringify({ error: 'video budget' }), { status: 429 }),
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined }))
// #previz-record-before-submit: 라우트가 제출 전에 키를 골라 작업 행에 기록한다.
vi.mock('@/lib/fal/keys', () => ({
  pickFalKey: async () => ({ id: 'key-1', client: { queue: { submit: vi.fn() } } }),
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc, auth: { admin: { getUserById: mocks.getUserById } } },
}))
vi.mock('@/lib/admin', () => ({ isAdminEmail: () => false }))
// #D(2026-09-02): take-hold.ts 거절 순간 관측 이벤트를 기록하다 — 이 파일이 감시하는 mocks.from 호출
//   순서(shots.update 등)량 무관하도록 별도로 무려화(순서 직접 검증은 take-hold.test.ts 전담).
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))

import { POST } from '@/app/api/director/generate-previz-video/route'

function query(result: unknown) {
  const value = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    contains: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  value.select.mockReturnValue(value)
  value.update.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.gte.mockReturnValue(value)
  value.contains.mockReturnValue(value)
  value.maybeSingle.mockResolvedValue(result)
  return value
}

const PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000'

function request(body: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/generate-previz-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      writerShotId: 'shot-1',
      ...body,
    }),
  })
}

const projectRow = { workspace_id: 'workspace-1' }
const shotRow = {
  shot_id: 'shot-1',
  action_description: 'walks forward',
  duration_seconds: 5,
  rough_storyboard: { frames: { start: 'https://x/start.png', end: 'https://x/end.png' } },
}

function mockProjectShotQueued() {
  mocks.from
    .mockReturnValueOnce(query({ data: projectRow, error: null }))
    .mockReturnValueOnce(query({ data: shotRow, error: null }))
    .mockReturnValueOnce(query({ data: [], error: null }))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, projectId: PROJECT_ID, userId: 'user-1', viaShare: false })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.deriveEnBatch.mockResolvedValue(new Map([['a', 'walks forward']]))
  mocks.falVideoSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'happy-horse-model', fal_key_id: 'key-1' })
  mocks.createGenerationJob.mockResolvedValue({ id: 'job-1' })
  mocks.failGenerationJob.mockResolvedValue(undefined)
})

describe('영상 미리보기 생성 — Take 사용량 처리', () => {
  it('사용량을 받지 않는 모드에서는 영상 생성을 정상 제출한다', async () => {
    delete process.env.TAKE_BILLING_MODE
    mockProjectShotQueued()
    // generation_jobs.update (제출 뒤 request_id 교체, #previz-record-before-submit)
    mocks.from.mockReturnValueOnce(query({ data: null, error: null }))
    // shots.update (낙관 상태 기록)
    mocks.from.mockReturnValueOnce(query({ data: null, error: null }))

    const res = await POST(request())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ jobId: 'job-1' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
  })

  it('사용량을 실제로 차감하는 모드에서 잔액이 부족하면 생성을 막고 실패로 기록하며 상태를 바꾸지 않는다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mockProjectShotQueued()
    mocks.rpc.mockResolvedValue({ data: { ok: false, balance: 0, held: 0, insufficient: true }, error: null })

    const res = await POST(request())
    expect(res.status).toBe(402)
    await expect(res.json()).resolves.toEqual({ error: 'insufficient_takes', required: 1, balance: 0 })
    expect(mocks.rpc).toHaveBeenCalledWith('take_hold', {
      p_workspace: 'workspace-1',
      p_amount: 1,
      p_job: 'job-1',
      p_enforce: true,
    })
    expect(mocks.failGenerationJob).toHaveBeenCalledWith('job-1', 'insufficient_takes')
    // 낙관 상태 update(from 4번째 호출)는 hold 실패 후 도달하지 않는다.
    expect(mocks.from).toHaveBeenCalledTimes(3)
  })

  it('기록만 하는 모드에서는 잔액이 부족해도 생성을 정상 제출한다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'shadow')
    mockProjectShotQueued()
    mocks.from.mockReturnValueOnce(query({ data: null, error: null })) // generation_jobs.update (request_id 교체)
    mocks.from.mockReturnValueOnce(query({ data: null, error: null })) // shots.update
    mocks.rpc.mockResolvedValue({ data: { ok: true, balance: -1, held: 1, insufficient: false }, error: null })

    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('take_hold', {
      p_workspace: 'workspace-1',
      p_amount: 1,
      p_job: 'job-1',
      p_enforce: false,
    })
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
  })
})

describe('사용량 반환 — 생성 실패 처리', () => {
  it('영상 생성 실패를 기록하면 사용량 반환도 요청한다', async () => {
    vi.resetModules()
    const rpcMock = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null }) // fail_director_video_attempt
      .mockResolvedValueOnce({ data: null, error: null }) // update error_class (via .from, not rpc)
    const fromMock = vi.fn().mockReturnValue(query({ data: null, error: null }))
    vi.doMock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: rpcMock, from: fromMock } }))
    const releaseMock = vi.fn().mockResolvedValue(2)
    vi.doMock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: releaseMock }))
    const { markDirectorVideoAttemptFailed } = await import('@/lib/director-video-takes')

    await markDirectorVideoAttemptFailed('project-1', 'job-1', 'provider error')

    expect(rpcMock).toHaveBeenCalledWith('fail_director_video_attempt', {
      p_project_id: 'project-1',
      p_job_id: 'job-1',
      p_error: 'provider error',
    })
    expect(releaseMock).toHaveBeenCalledWith('job-1')
    vi.doUnmock('@/lib/supabase/admin')
    vi.doUnmock('@/lib/billing/take-hold')
  })

  it('사용량 반환에 실패해도 생성 실패 기록은 성공한다', async () => {
    vi.resetModules()
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const fromMock = vi.fn().mockReturnValue(query({ data: null, error: null }))
    vi.doMock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: rpcMock, from: fromMock } }))
    const releaseMock = vi.fn().mockRejectedValue(new Error('db down'))
    vi.doMock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: releaseMock }))
    const { markDirectorVideoAttemptFailed } = await import('@/lib/director-video-takes')

    await expect(markDirectorVideoAttemptFailed('project-1', 'job-1', 'provider error')).resolves.toBeUndefined()
    expect(releaseMock).toHaveBeenCalledWith('job-1')
    vi.doUnmock('@/lib/supabase/admin')
    vi.doUnmock('@/lib/billing/take-hold')
  })
})
