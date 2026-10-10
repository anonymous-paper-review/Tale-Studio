// 영상 경로(샷 영상·목각 previz)는 Creem 검사에 막히면 자리 예약도 Take 잡음도 제출도 하지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 영상은 가장 비싼 생성이다 — 검사는 최종 프롬프트가 확정된 직후, 예약 RPC·Take hold·provider 제출보다
//   앞에서 끝난다. 통과 영수증은 준비 입력(input_snapshot)에 남아 일괄 이어가기가 같은 프롬프트로
//   다시 낼 때 재사용된다.
const mocks = vi.hoisted(() => ({
  assertUserTextAllowed: vi.fn(),
  userOwnsProject: vi.fn(),
  getJob: vi.fn(),
  reserveTake: vi.fn(),
  reserveRegeneration: vi.fn(),
  updateMetadata: vi.fn(),
  attach: vi.fn(),
  fail: vi.fn(),
  holdTakesForVideoJob: vi.fn(),
  releaseTakesForJob: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  submit: vi.fn(),
  buildPrompt: vi.fn(),
  recordObservability: vi.fn(),
  falKeyById: vi.fn(),
  pickFalKey: vi.fn(),
  syncFalKeyLimits: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  falVideoSubmit: vi.fn(),
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  deriveEnBatch: vi.fn(),
  requireProjectAccess: vi.fn(),
}))

vi.mock('@/lib/moderation/creem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation/creem')>()),
  assertUserTextAllowed: mocks.assertUserTextAllowed,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  userOwnsProject: mocks.userOwnsProject,
  getGenerationJobById: mocks.getJob,
  createGenerationJob: mocks.createGenerationJob,
  failGenerationJob: mocks.failGenerationJob,
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
  syncFalKeyLimits: mocks.syncFalKeyLimits,
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordObservability }))
vi.mock('@/lib/director-video-takes', () => ({
  reserveDirectorVideoTake: mocks.reserveTake,
  reserveDirectorVideoRegeneration: mocks.reserveRegeneration,
  updateDirectorVideoTakeMetadata: mocks.updateMetadata,
  attachProviderRequestToReservedVideoJob: mocks.attach,
  markDirectorVideoAttemptFailed: mocks.fail,
}))
vi.mock('@/lib/billing/take-hold', () => ({
  holdTakesForVideoJob: mocks.holdTakesForVideoJob,
  releaseTakesForJob: mocks.releaseTakesForJob,
}))
vi.mock('@/lib/director/video-prompt', () => ({ buildVideoPrompt: mocks.buildPrompt }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://webhook.test' }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/fal/keys', () => ({
  pickFalKey: mocks.pickFalKey,
  falKeyById: mocks.falKeyById,
  FalUnknownKeyError: class FalUnknownKeyError extends Error {},
}))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchorByKey: async () => null }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/writer/llm/fal', () => ({ falVideoSubmit: mocks.falVideoSubmit }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))

import { POST as previzPOST } from '@/app/api/director/generate-previz-video/route'
import { ModerationBlockedError, ModerationUnavailableError } from '@/lib/moderation/creem'
import { prepareDirectorVideoSubmission, submitPreparedDirectorVideo } from '@/lib/director/video-submit'

const PROJECT_ID = '11111111-2222-4333-8444-555555555555'
const IDEMPOTENCY_KEY = '123e4567-e89b-12d3-a456-426614174000'
const STORYBOARD_IMAGE = {
  url: 'https://storage.test/shot-1_start.png',
  frames: {
    start: 'https://storage.test/shot-1_start.png',
    direction: 'https://storage.test/shot-1_direction.png',
    end: 'https://storage.test/shot-1_end.png',
  },
  status: 'completed',
  errorMessage: null,
  generatedAt: 1756800000000,
}

function query(data: unknown) {
  const result = { data, error: null }
  const value: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'is', 'contains', 'order', 'limit', 'not', 'gte', 'update']) {
    value[name] = () => value
  }
  value.maybeSingle = value.single = async () => result
  value.then = (resolve: (resolved: typeof result) => unknown) => Promise.resolve(result).then(resolve)
  return value
}

function videoRequest(extra: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/generate-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      shotId: 'shot-1',
      prompt: 'she steps into the rain',
      camera: { pan: 0, zoom: 0 },
      idempotencyKey: IDEMPOTENCY_KEY,
      ...extra,
    }),
  })
}

function previzRequest() {
  return new Request('http://localhost/api/director/generate-previz-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID, writerShotId: 'sh_01' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'moderation-video-test-signing-key')
  mocks.assertUserTextAllowed.mockRejectedValue(new ModerationBlockedError('deny', 'mod_1'))
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.syncFalKeyLimits.mockResolvedValue(undefined)
  mocks.pickFalKey.mockResolvedValue({ id: 'key-1', client: { queue: { submit: mocks.submit } } })
  mocks.falKeyById.mockImplementation((id: string) =>
    id === 'key-1' ? { id: 'key-1', client: { queue: { submit: mocks.submit } } } : null,
  )
  mocks.buildPrompt.mockImplementation((input: { prompt: string }) => ({ fullPrompt: input.prompt, prompt_parts: [] }))
  mocks.deriveEnBatch.mockResolvedValue(new Map([['a', 'a man walks'], ['p', 'she steps into the rain']]))
  mocks.holdTakesForVideoJob.mockResolvedValue({ ok: true, insufficient: false, balance: 100 })
  mocks.createGenerationJob.mockResolvedValue({ id: 'job-1', fal_key_id: 'key-1' })
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, userId: 'user-1' })
  mocks.rpc.mockResolvedValue({ data: null, error: null })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'projects') return query({ workspace_id: 'workspace-1', settings: null })
    if (table === 'shots')
      return query({
        shot_id: 'shot-1',
        action_description: '남자가 걷는다',
        duration_seconds: 5,
        dynamic_spec: {},
        character_appearance_keys: {},
        storyboard_image: STORYBOARD_IMAGE,
        rough_storyboard: { frames: { start: 'https://r/s.png', end: 'https://r/e.png' } },
      })
    return query(null)
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('영상 경로의 내용 규칙 차단', () => {
  // 왜: 영상은 한 번 제출되면 되돌릴 수 없는 유료 작업이다 — 예약·Take 보다 앞에서 끊어야 한다.
  it('샷 영상이 검사에 막히면 자리 예약도 Take 잡음도 제출도 하지 않는다', async () => {
    const prepared = await prepareDirectorVideoSubmission(videoRequest(), 'user-1')

    expect(prepared).toBeInstanceOf(Response)
    const response = prepared as Response
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'content_policy_blocked' })
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.recordObservability).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_rejected_content_policy',
      expect.objectContaining({ kind: 'shot_video', decision: 'deny' }),
    )
  })

  // 왜: previz 는 러프 액션 설명을 그대로 싣는 또 하나의 유료 영상 입구다.
  it('목각 previz 영상이 검사에 막히면 작업 기록도 Take 잡음도 제출도 하지 않는다', async () => {
    const response = await previzPOST(previzRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'content_policy_blocked' })
    expect(mocks.createGenerationJob).not.toHaveBeenCalled()
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.falVideoSubmit).not.toHaveBeenCalled()
  })

  // 왜: 검사 장애를 통과로 보면 장애 시간대의 영상이 전부 검사 없이 나간다.
  it('검사 장애면 영상을 제출하지 않고 잠시 후 다시 시도로 답한다', async () => {
    mocks.assertUserTextAllowed.mockRejectedValue(new ModerationUnavailableError('network'))

    const prepared = await prepareDirectorVideoSubmission(videoRequest(), 'user-1')

    expect(prepared).toBeInstanceOf(Response)
    expect((prepared as Response).status).toBe(503)
    await expect((prepared as Response).json()).resolves.toMatchObject({ code: 'moderation_unavailable' })
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})

describe('영상 경로가 검사에 보내는 글과 영수증', () => {
  beforeEach(() => {
    mocks.assertUserTextAllowed.mockResolvedValue({
      decision: 'allow',
      id: 'mod_ok',
      checked_at: '2026-10-11T00:00:00.000Z',
      chars: 12,
      text_sha256: 'a'.repeat(64),
    })
  })

  // 왜: 모션 계약·카메라 기재·negative_prompt 는 우리 고정 문구다 — 보내면 오탐과 단가만 늘어난다.
  it('샷 영상은 샷 산문과 대사만 보내고 모션 계약 문구는 보내지 않는다', async () => {
    await prepareDirectorVideoSubmission(videoRequest(), 'user-1')

    const parts = (mocks.assertUserTextAllowed.mock.calls[0][0] as Array<string | null | undefined>)
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    expect(parts).toEqual(['she steps into the rain'])
    expect(parts.join('\n')).not.toMatch(/negative_prompt|camera motion|shot on/i)
    expect(mocks.assertUserTextAllowed.mock.calls[0][1]).toMatchObject({
      projectId: PROJECT_ID,
      kind: 'shot_video',
      userId: 'user-1',
    })
  })

  // 왜: 일괄 이어가기는 저장한 입력을 그대로 다시 낸다 — 영수증이 그 안에 없으면 검사 없는 제출이 된다.
  it('준비한 영상 입력에 통과 영수증을 담아 일괄 이어가기가 재사용한다', async () => {
    const prepared = await prepareDirectorVideoSubmission(videoRequest(), 'user-1')

    expect(prepared).not.toBeInstanceOf(Response)
    if (prepared instanceof Response) return
    expect(prepared.inputSnapshot).toMatchObject({ moderation: { decision: 'allow', id: 'mod_ok' } })

    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      request_id: 'reserved:job-1',
      provider: 'fal',
      fal_key_id: 'key-1',
      model: 'stored-model',
      status: 'queued',
      input_snapshot: prepared.inputSnapshot,
    })
    mocks.submit.mockResolvedValue({ request_id: 'fal-1' })
    mocks.assertUserTextAllowed.mockClear()

    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(200)
    // 저장된 영수증을 그대로 쓴다 — 같은 프롬프트를 다시 검사해 비용을 또 쓰지 않는다.
    expect(mocks.assertUserTextAllowed).not.toHaveBeenCalled()
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    // 작업 행(generation_jobs)에 검사 id · 판정 · 시각이 그대로 남는다 — 나중에 "이 영상은 무엇으로
    //   통과했나"를 행만 보고 답할 수 있어야 한다.
    expect(mocks.reserveTake.mock.calls[0][0].inputSnapshot.moderation).toMatchObject({
      id: 'mod_ok',
      decision: 'allow',
      checked_at: '2026-10-11T00:00:00.000Z',
    })
  })

  // 왜: 이 배포 전에 저장된 일괄 항목에는 영수증이 없다 — 검사 없는 제출이 되지 않게 멈춘다.
  it('영수증 없는 준비 입력은 자리 예약 없이 제출을 멈춘다', async () => {
    const prepared = await prepareDirectorVideoSubmission(videoRequest(), 'user-1')
    expect(prepared).not.toBeInstanceOf(Response)
    if (prepared instanceof Response) return
    const legacy = { ...prepared, inputSnapshot: { ...prepared.inputSnapshot, moderation: undefined } }

    const response = await submitPreparedDirectorVideo(legacy)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('moderation receipt'),
    })
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  // 왜: 영수증이 어떤 글의 것인지 밝히지 못하면(해시 없음) 다른 글에 쓰인 옛 영수증과 구분할 수 없다.
  it('검사한 글의 해시가 없는 영수증은 제출을 멈춘다', async () => {
    const prepared = await prepareDirectorVideoSubmission(videoRequest(), 'user-1')
    expect(prepared).not.toBeInstanceOf(Response)
    if (prepared instanceof Response) return
    const unbound = {
      ...prepared,
      inputSnapshot: {
        ...prepared.inputSnapshot,
        moderation: { decision: 'allow', id: 'mod_ok', checked_at: '2026-10-11T00:00:00.000Z', chars: 12 },
      },
    }

    const response = await submitPreparedDirectorVideo(unbound)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('moderation receipt'),
    })
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  // 왜: previz 는 같은 요구 안에서 바로 제출한다 — 영수증은 작업 기록 이벤트에 남고 제출 인자로 넘어간다.
  it('previz 영상은 액션 설명만 보내고 통과한 검사를 작업 id 와 함께 기록한다', async () => {
    mocks.falVideoSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'happy-horse', fal_key_id: 'key-1' })

    await previzPOST(previzRequest())

    expect(mocks.assertUserTextAllowed.mock.calls[0][0]).toEqual(['a man walks'])
    expect(mocks.createGenerationJob.mock.calls[0][0].inputSnapshot).not.toHaveProperty('moderation')
    expect(mocks.recordObservability).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_moderation_passed',
      expect.objectContaining({ jobId: 'job-1', kind: 'shot_previz_video', moderationId: 'mod_ok', decision: 'allow' }),
      expect.objectContaining({ generationJobId: 'job-1' }),
    )
    // 검사가 제출보다 먼저다. 제출 인자에는 영수증이 섞이지 않는다(fal 로는 보낼 입력만 간다) —
    //   검사를 건너뛴 제출은 타입 표식이 없어 타입 오류가 난다.
    expect(mocks.assertUserTextAllowed.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.falVideoSubmit.mock.invocationCallOrder[0],
    )
    expect(mocks.falVideoSubmit.mock.calls[0][0]).not.toHaveProperty('moderation')
  })
})
