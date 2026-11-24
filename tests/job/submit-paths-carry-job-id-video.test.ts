// 영상 제출은 완료 알림 주소에 예약한 작업 번호를 심어 보낸다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  syncFalKeyLimits: vi.fn(),
  reserveTake: vi.fn(),
  getJob: vi.fn(),
  holdTakesForVideoJob: vi.fn(),
  from: vi.fn(),
  submit: vi.fn(),
  buildPrompt: vi.fn(),
  falKeyById: vi.fn(),
  pickFalKey: vi.fn(),
  resolveWebhookUrl: vi.fn(),
}))

vi.mock('@/lib/generation-jobs', () => ({
  userOwnsProject: mocks.userOwnsProject,
  getGenerationJobById: mocks.getJob,
}))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  quotaExceededBody: () => ({ error: 'quota' }),
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
  syncFalKeyLimits: mocks.syncFalKeyLimits,
  videoBudgetExceededBody: () => ({ error: 'video budget' }),
}))
vi.mock('@/lib/api/quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/quota')>()),
  quotaRejectionResponse: () => new Response(JSON.stringify({ error: 'quota' }), { status: 429 }),
  videoBudgetRejectionResponse: () => new Response(JSON.stringify({ error: 'video budget' }), { status: 429 }),
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/director-video-takes', () => ({
  reserveDirectorVideoTake: mocks.reserveTake,
  reserveDirectorVideoRegeneration: vi.fn(),
  updateDirectorVideoTakeMetadata: vi.fn(),
  attachProviderRequestToReservedVideoJob: vi.fn(),
  markDirectorVideoAttemptFailed: vi.fn(),
}))
vi.mock('@/lib/billing/take-hold', () => ({ holdTakesForVideoJob: mocks.holdTakesForVideoJob }))
vi.mock('@/lib/director/video-prompt', () => ({ buildVideoPrompt: mocks.buildPrompt }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: mocks.resolveWebhookUrl }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: vi.fn() } }))
vi.mock('@/lib/fal/keys', () => ({
  pickFalKey: mocks.pickFalKey,
  falKeyById: mocks.falKeyById,
  FalUnknownKeyError: class FalUnknownKeyError extends Error {},
}))

import { prepareDirectorVideoSubmission, submitPreparedDirectorVideo } from '@/lib/director/video-submit'

const key = '123e4567-e89b-12d3-a456-426614174000'
const RESERVED_JOB_ID = 'reserved-video-job-9'
const STORYBOARD_IMAGE = {
  url: 'https://storage.test/shot-1_storyboard_start.png',
  frames: {
    start: 'https://storage.test/shot-1_storyboard_start.png',
    direction: 'https://storage.test/shot-1_storyboard_direction.png',
    end: 'https://storage.test/shot-1_storyboard_end.png',
  },
  status: 'completed',
  errorMessage: null,
  generatedAt: 1756800000000,
}

function query(data: unknown) {
  const result = { data, error: null }
  const value = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), contains: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), limit: vi.fn(),
    then: (resolve: (resolved: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  value.select.mockReturnValue(value); value.eq.mockReturnValue(value); value.in.mockReturnValue(value); value.is.mockReturnValue(value); value.contains.mockReturnValue(value)
  value.order.mockReturnValue(value); value.limit.mockReturnValue(value)
  value.maybeSingle.mockResolvedValue(result)
  return value
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'submit-job-id-test-signing-key')
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.syncFalKeyLimits.mockResolvedValue(undefined)
  const keyRow = { id: 'prod-2000', maxInflight: 40, client: { queue: { submit: mocks.submit } } }
  mocks.pickFalKey.mockResolvedValue(keyRow)
  mocks.falKeyById.mockImplementation((id: string) => (id === 'prod-2000' ? keyRow : null))
  mocks.buildPrompt.mockImplementation((input: { prompt: string }) => ({ fullPrompt: input.prompt, prompt_parts: [] }))
  mocks.resolveWebhookUrl.mockImplementation((jobId?: string) => (jobId ? `https://hook.test/api/fal/webhook?jobId=${jobId}` : 'https://hook.test/api/fal/webhook'))
  mocks.from
    .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
    .mockReturnValueOnce(query({ shot_id: 'shot-1', dynamic_spec: {}, character_appearance_keys: {}, storyboard_image: STORYBOARD_IMAGE }))
    .mockReturnValue(query(null))
  mocks.holdTakesForVideoJob.mockResolvedValue({ ok: true, insufficient: false, balance: 100 })
})

describe('영상 제출의 완료 알림 주소', () => {
  it('영상 제출 주소에 작업 번호가 들어간다', async () => {
    const prepared = await prepareDirectorVideoSubmission(new Request('http://test/api/director/generate-video', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-1', shotId: 'shot-1', prompt: 'Original scene', camera: { pan: 0, zoom: 0 }, idempotencyKey: key }),
    }), 'user-1')
    if (prepared instanceof Response) throw new Error(`prepare failed: ${prepared.status}`)

    mocks.from.mockReset()
    mocks.from.mockReturnValueOnce(query(null)).mockReturnValue(query(null))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: RESERVED_JOB_ID, take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue({
      id: RESERVED_JOB_ID,
      request_id: `reserved:${RESERVED_JOB_ID}`,
      provider: 'fal',
      fal_key_id: 'prod-2000',
      model: 'stored-model',
      status: 'queued',
      input_snapshot: prepared.inputSnapshot,
    })
    mocks.submit.mockResolvedValue({ request_id: 'fal-1' })

    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(200)
    expect(mocks.resolveWebhookUrl).toHaveBeenCalledWith(RESERVED_JOB_ID)
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ webhookUrl: `https://hook.test/api/fal/webhook?jobId=${RESERVED_JOB_ID}` }),
    )
  })
})
