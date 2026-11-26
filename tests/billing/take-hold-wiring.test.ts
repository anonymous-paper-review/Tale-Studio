// 영상 생성이 시작될 때 Take를 안전하게 처리하고, 실패하면 사용량을 되돌린다 (#payments-phase-2 #gen-quota-atomic-gate)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Take hold 배선 (#payments-phase-2 #gen-quota-atomic-gate) — release 가 실패 마킹 경로(director-video-takes,
//   fal/reconcile, fal/webhook)에서 호출되는지를 고정한다.
//   generate-previz-video 라우트의 Take 처리 시험 3개는 오너 T1(2026-11-22 — 목각 영상 길을 닫음)로 지웠다
//   (닫힌 길의 시험: tests/billing/previz-record-before-submit.test.ts).
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
  syncFalKeyLimits: async () => {},
}))
vi.mock('@/lib/api/quota', () => ({
  quotaRejectionResponse: () => new Response(JSON.stringify({ error: 'quota' }), { status: 429 }),
  videoBudgetRejectionResponse: () => new Response(JSON.stringify({ error: 'video budget' }), { status: 429 }),
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined }))
// #previz-record-before-submit: 라우트가 제출 전에 키를 골라 작업 행에 기록한다.
vi.mock('@/lib/fal/keys', () => ({
  pickFalKey: async () => ({ id: 'key-1', client: { queue: { submit: vi.fn() } } }),
  falKeyById: (id: string) => id === 'key-1' ? { id, client: { queue: { submit: vi.fn() } } } : null,
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc, auth: { admin: { getUserById: mocks.getUserById } } },
}))
vi.mock('@/lib/admin', () => ({ isAdminEmail: () => false }))
// #D(2026-09-02): take-hold.ts 거절 순간 관측 이벤트를 기록하다 — 이 파일이 감시하는 mocks.from 호출
//   순서(shots.update 등)량 무관하도록 별도로 무려화(순서 직접 검증은 take-hold.test.ts 전담).
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))

// 아래 '사용량 반환' 시험은 vi.resetModules + vi.doMock 으로 가짜 DB 를 바꿔 끼운다 — 파일을 읽을 때 가짜 DB 가 한 번 올라와 있어야
//   바꿔 끼운 가짜가 먹는다. 예전에는 목각 라우트 import 가 그 일을 했고, 그 시험을 지운 뒤(오너 T1 2026-11-22)에도 같은 순서로 둔다.
import '@/lib/supabase/admin'

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

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, projectId: PROJECT_ID, userId: 'user-1', viaShare: false })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.deriveEnBatch.mockResolvedValue(new Map([['a', 'walks forward']]))
  mocks.falVideoSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'happy-horse-model', fal_key_id: 'key-1' })
  mocks.createGenerationJob.mockResolvedValue({ id: 'job-1', fal_key_id: 'key-1' })
  mocks.failGenerationJob.mockResolvedValue(undefined)
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
