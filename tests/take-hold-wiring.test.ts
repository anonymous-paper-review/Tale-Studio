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
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc, auth: { admin: { getUserById: mocks.getUserById } } },
}))
vi.mock('@/lib/admin', () => ({ isAdminEmail: () => false }))

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

describe('generate-previz-video — Take hold 배선', () => {
  it('mode=off 는 hold RPC 를 타지 않고 정상 제출한다', async () => {
    delete process.env.TAKE_BILLING_MODE
    mockProjectShotQueued()
    // shots.update (낙관 상태 기록)
    mocks.from.mockReturnValueOnce(query({ data: null, error: null }))

    const res = await POST(request())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ jobId: 'job-1' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
  })

  it('enforce 모드에서 잔액 부족이면 402 + 잡을 failed 로 마킹하고 shots 낙관 갱신을 하지 않는다', async () => {
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

  it('shadow 모드는 잔액 부족이어도 통과시켜 잡을 정상 제출한다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'shadow')
    mockProjectShotQueued()
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

describe('release wiring — 실패 마킹 경로', () => {
  it('director-video-takes.markDirectorVideoAttemptFailed 는 fail RPC 후 release RPC 를 부른다', async () => {
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

  it('release 실패는 삼키고 실패 마킹 자체는 성공한다', async () => {
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
