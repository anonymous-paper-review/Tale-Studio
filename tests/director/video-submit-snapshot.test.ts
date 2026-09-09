// #batch-resume(2026-09-09): 일괄 이어가기의 준비/제출 분리 — 처음 그림·설정대로 만들고, 수정 내용은
//   다음 요청에 반영한다(오너 결정). prepareDirectorVideoSubmission 은 입력 검증·프롬프트 조립만 하고
//   reserve/hold/provider 를 부르지 않는다. submitPreparedDirectorVideo 는 고정된 입력으로 기존과
//   같은 소유권·한도·예산 검사를 거쳐 실제 예약·Take hold·유료 제출을 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  reserveTake: vi.fn(),
  reserveRegeneration: vi.fn(),
  getJob: vi.fn(),
  attach: vi.fn(),
  fail: vi.fn(),
  updateMetadata: vi.fn(),
  holdTakesForVideoJob: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  submit: vi.fn(),
  finalize: vi.fn(),
  buildPrompt: vi.fn(),
  recordObservability: vi.fn(),
}))

vi.mock('@/lib/generation-jobs', () => ({
  userOwnsProject: mocks.userOwnsProject,
  getGenerationJobById: mocks.getJob,
}))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  quotaExceededBody: () => ({ error: 'quota' }),
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
  videoBudgetExceededBody: () => ({ error: 'video budget' }),
}))
// 새 videoCapacityReservationRejection(error, ctx) 는 actual quota.ts 에서 그대로 재사용한다 —
//   부모가 그 헬퍼를 구현하면 이 spread 로 자동 반영되고, 여기서 하드코딩한 가짜 count 는 없다.
//   기존 두 헬퍼는 기존 계약대로 계속 오버라이드한다(약화 없음).
vi.mock('@/lib/api/quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/quota')>()),
  quotaRejectionResponse: () => new Response(JSON.stringify({ error: 'quota' }), { status: 429 }),
  videoBudgetRejectionResponse: () => new Response(JSON.stringify({ error: 'video budget' }), { status: 429 }),
}))
// 관측 기록만 목 — 실제 DB 접속 금지. quotaRejectionResponse(actual, importOriginal 경유)가
//   이 함수를 부르므로 큐/한도/스코프 인자를 여기서 검사할 수 있다.
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: mocks.recordObservability,
}))
vi.mock('@/lib/director-video-takes', () => ({
  reserveDirectorVideoTake: mocks.reserveTake,
  reserveDirectorVideoRegeneration: mocks.reserveRegeneration,
  updateDirectorVideoTakeMetadata: mocks.updateMetadata,
  attachProviderRequestToReservedVideoJob: mocks.attach,
  markDirectorVideoAttemptFailed: mocks.fail,
}))
vi.mock('@/lib/billing/take-hold', () => ({
  holdTakesForVideoJob: mocks.holdTakesForVideoJob,
}))
vi.mock('@/lib/director/video-prompt', () => ({
  buildVideoPrompt: mocks.buildPrompt,
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://webhook.test' }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/fal/finalize', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/fal/finalize')>(),
  finalizeShotVideoJob: mocks.finalize,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/fal/keys', () => ({
  pickFalKey: vi.fn(async () => ({ id: 'prod-2000', maxInflight: 40, client: { queue: { submit: mocks.submit } } })),
}))

import {
  prepareDirectorVideoSubmission,
  submitPreparedDirectorVideo,
} from '@/lib/director/video-submit'

const key = '123e4567-e89b-12d3-a456-426614174000'
const PRODUCTION_STORYBOARD_IMAGE = {
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

function request(extra: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/generate-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: 'project-1',
      shotId: 'shot-1',
      prompt: 'Original scene',
      camera: { pan: 0, zoom: 0 },
      idempotencyKey: key,
      ...extra,
    }),
  })
}

function query(data: unknown) {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'shot_id' in data && !('character_appearance_keys' in data)) {
    data = { ...data, character_appearance_keys: {} }
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'shot_id' in data && !('storyboard_image' in data)) {
    data = { ...data, storyboard_image: PRODUCTION_STORYBOARD_IMAGE }
  }
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

function reservedFalJobFromSnapshot(inputSnapshot: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    request_id: 'reserved:job-1',
    provider: 'fal',
    model: 'stored-model',
    status: 'queued',
    input_snapshot: inputSnapshot,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'batch-snapshot-test-signing-key')
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.buildPrompt.mockImplementation((input: { prompt: string }) => ({ fullPrompt: input.prompt, prompt_parts: [] }))
  mocks.from
    .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
    .mockReturnValueOnce(query({ shot_id: 'shot-1', dynamic_spec: {}, character_appearance_keys: {} }))
    .mockReturnValue(query(null))
  mocks.holdTakesForVideoJob.mockResolvedValue({ ok: true, insufficient: false, balance: 100 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function requirePrepared(req: Request, userId = 'user-1') {
  const prepared = await prepareDirectorVideoSubmission(req, userId)
  if (prepared instanceof Response) {
    throw new Error(`prepare failed unexpectedly: ${prepared.status} ${await prepared.clone().text()}`)
  }
  return prepared
}

describe('일괄 준비는 유료 제출을 하지 않는 약속', () => {
  it('입력을 기록할 때는 Take를 쓰거나 영상을 제출하지 않는다', async () => {
    await requirePrepared(request())

    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.reserveRegeneration).not.toHaveBeenCalled()
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.checkGenerationCapacity).not.toHaveBeenCalled()
    expect(mocks.checkProjectVideoBudget).not.toHaveBeenCalled()
  })

  it('준비 단계에서 확정한 입력에는 유료 제출에 필요한 모든 값이 담긴다', async () => {
    const prepared = await requirePrepared(request())

    expect(prepared).toMatchObject({
      ownerId: 'user-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      writerShotId: 'shot-1',
      standalone: false,
      idempotencyKey: key,
    })
    expect(prepared.inputSnapshot).toMatchObject({
      full_prompt: 'Original scene',
      generation_method: 'T2V',
    })
    // JSON 저장 가능해야 한다 — 직렬화 왕복이 원본과 동일해야 함.
    expect(JSON.parse(JSON.stringify(prepared))).toEqual(prepared)
  })
})

describe('고정한 입력을 그대로 제출하는 약속', () => {
  it('새 예약을 시작한 뒤 그림이나 설정이 바뀌어도 처음 확정한 내용으로 제출한다', async () => {
    const prepared = await requirePrepared(request({ prompt: 'Original scene', frameSource: 'auto' }))

    // 준비 이후 같은 샷의 DB 내용이 바뀌었다고 가정 — submit 은 이 값을 다시 읽지 않아야 한다.
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query(null)) // idempotencyKey 재사용 조회
      .mockReturnValue(query({ shot_id: 'shot-1', dynamic_spec: {}, character_appearance_keys: {}, prompt: 'Changed scene later' }))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJobFromSnapshot(prepared.inputSnapshot))
    mocks.submit.mockResolvedValue({ request_id: 'fal-1' })

    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(200)
    // buildVideoPrompt 는 준비 단계에서 이미 호출됐고, 제출 단계에서 다시 호출되지 않는다 — 프롬프트를
    // 새로 조립하지 않는다는 뜻.
    expect(mocks.buildPrompt).toHaveBeenCalledTimes(1)
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ input: expect.objectContaining({
        prompt: 'Original scene',
        image_urls: [
          PRODUCTION_STORYBOARD_IMAGE.frames.start,
          PRODUCTION_STORYBOARD_IMAGE.frames.end,
        ],
      }) }),
    )
  })

  it('고정한 입력도 제출 시점의 소유권 검사를 통과해야 한다', async () => {
    const prepared = await requirePrepared(request())

    mocks.userOwnsProject.mockResolvedValue(false)
    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(403)
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('고정한 입력도 제출 시점의 프로젝트 생성 한도 검사를 통과해야 한다', async () => {
    const prepared = await requirePrepared(request())

    mocks.checkProjectVideoBudget.mockResolvedValue({ ok: false, used: 100, limit: 100 })
    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(429)
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('고정한 입력도 제출 시점의 잔액 검사를 통과해야 한다', async () => {
    const prepared = await requirePrepared(request())
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJobFromSnapshot(prepared.inputSnapshot))
    mocks.holdTakesForVideoJob.mockResolvedValue({ ok: false, insufficient: true, balance: 0 })

    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(402)
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('고정한 입력도 제출 시점의 동시 생성 한도 검사를 통과해야 한다', async () => {
    const prepared = await requirePrepared(request())

    mocks.checkGenerationCapacity.mockResolvedValue({ ok: false, scope: 'user', queued: 3, limit: 3 })
    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(429)
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})

describe('복구 증표로 이어가는 약속', () => {
  it('오래 뒤에 복구해도 서버에 저장한 같은 일괄의 기존 영상에만 연결한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const prepared = await requirePrepared(request())
    const job = reservedFalJobFromSnapshot(prepared.inputSnapshot, { batch_id: 'batch-1' })
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(job)
    mocks.submit.mockResolvedValue({ request_id: 'fal-paid-once' })
    mocks.attach.mockRejectedValueOnce(new Error('attachment storage unavailable'))
    const first = await submitPreparedDirectorVideo(prepared)
    const { recoveryReceipt } = await first.json()
    expect(typeof recoveryReceipt).toBe('string')
    mocks.from.mockReturnValue(query({
      id: 'job-1', video_clip_id: 'clip-1',
      target: { retakeMode: 'new_take', writerShotId: 'shot-1' },
    }))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    vi.setSystemTime(Date.now() + 16 * 60_000)
    // 화면 요청에는 원래 만료 제한을 유지한다.
    expect((await submitPreparedDirectorVideo(prepared, { recoveryReceipt })).status).toBe(409)
    expect((await submitPreparedDirectorVideo(prepared, {
      recoveryReceipt, batchRecoveryId: 'other-batch', reserve: mocks.reserveTake,
    })).status).toBe(409)
    const recovered = await submitPreparedDirectorVideo(prepared, {
      recoveryReceipt, batchRecoveryId: 'batch-1', reserve: mocks.reserveTake,
    })
    expect(recovered.status).toBe(200)
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.attach).toHaveBeenLastCalledWith('project-1', 'job-1', 'fal-paid-once', expect.objectContaining({ provider: 'fal' }))
  })

  it('제출 결과를 알 수 없는 재시도는 복구 증표 없이 다시 제출하지 않는다', async () => {
    const prepared = await requirePrepared(request())
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJobFromSnapshot(prepared.inputSnapshot))
    const ambiguous = Object.assign(new Error('gateway timeout'), { status: 503 })
    mocks.submit.mockRejectedValue(ambiguous)
    mocks.rpc.mockResolvedValue({ data: true, error: null })

    const first = await submitPreparedDirectorVideo(prepared)
    expect(first.status).toBe(503)
    await expect(first.json()).resolves.toMatchObject({ status: 'queued', unresolved: true, retryable: false })

    // 같은 준비본으로 다시 제출을 시도해도(알림 재시도 등) 결과 불명은 재제출로 이어지지 않는다.
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    const second = await submitPreparedDirectorVideo(prepared)
    expect(second.status).toBe(409)
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.attach).not.toHaveBeenCalled()
  })

  it('서명된 복구 증표가 있으면 이미 나간 제출에 연결만 하고 다시 제출하지 않는다', async () => {
    const prepared = await requirePrepared(request())
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJobFromSnapshot(prepared.inputSnapshot))
    mocks.submit.mockResolvedValue({ request_id: 'fal-already-submitted' })
    mocks.attach.mockRejectedValueOnce(new Error('database temporarily unavailable'))
    const first = await submitPreparedDirectorVideo(prepared)
    expect(first.status).toBe(500)
    const body = await first.json()
    expect(typeof body.recoveryReceipt).toBe('string')

    // 첫 제출에서 실제 DB에 생긴 예약 행도 조회 mock에 반영한다.
    mocks.from.mockReturnValue(query({
      id: 'job-1', video_clip_id: 'clip-1',
      target: { retakeMode: 'new_take', writerShotId: 'shot-1' },
    }))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    const response = await submitPreparedDirectorVideo(prepared, {
      recoveryReceipt: body.recoveryReceipt,
    })

    expect(response.status).toBe(200)
    expect(mocks.attach).toHaveBeenLastCalledWith('project-1', 'job-1', 'fal-already-submitted', expect.objectContaining({ provider: 'fal' }))
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })
})

describe('독립 영상 재생성 설정을 보존하는 약속', () => {
  it('독립 영상의 재생성 설정을 고정본에 그대로 저장한다', async () => {
    const standaloneKey = 'standalone:123e4567-e89b-42d3-a456-426614174000'
    const persistedConfig = {
      prompt: 'Stored standalone motion',
      camera: { horizontal: 0, vertical: 0, pan: 1, tilt: 0, roll: 0, zoom: 0 },
      lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
      cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 },
      provider: 'happy-horse',
      durationSeconds: 7,
    }
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ id: 'clip-standalone', shot_id: standaloneKey, override: persistedConfig }))
      .mockReturnValue(query(null))

    const prepared = await requirePrepared(request({
      standaloneVideoKey: standaloneKey,
      standaloneConfig: persistedConfig,
      videoClipId: 'clip-standalone',
      prompt: 'Client spoof — should be ignored',
      model: 'local',
    }))

    expect(prepared.standalone).toBe(true)
    expect(prepared.videoClipId).toBe('clip-standalone')
    expect(prepared.inputSnapshot).toMatchObject({
      full_prompt: 'Stored standalone motion',
      duration_seconds: 7,
    })

    mocks.from.mockReset()
    mocks.from.mockReturnValue(query(null))
    mocks.reserveRegeneration.mockResolvedValue({ video_clip_id: 'clip-standalone', job_id: 'job-standalone', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJobFromSnapshot(prepared.inputSnapshot, { id: 'job-standalone', request_id: 'reserved:job-standalone' }))
    mocks.submit.mockResolvedValue({ request_id: 'fal-standalone' })

    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(200)
    expect(mocks.reserveRegeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        videoClipId: 'clip-standalone',
        target: expect.objectContaining({ writerShotId: standaloneKey, retakeMode: 'regeneration' }),
      }),
    )
    expect(mocks.updateMetadata).toHaveBeenCalledWith('project-1', 'clip-standalone', { override: persistedConfig })
  })
})

describe('예약 경쟁에서 한도에 걸리면 대기 안내를 보내는 약속', () => {
  it.each(['batch_shot_busy', 'batch_shot_already_completed', 'batch is not running'])(
    '예약이 거절되면 이유를 잃지 않고 전달한다 (%s)',
    async (message) => {
      const prepared = await requirePrepared(request())
      const reserve = vi.fn().mockRejectedValue({ message, code: 'P0001', details: null })
      const response = await submitPreparedDirectorVideo(prepared, { reserve })
      expect(await response.json()).toMatchObject({ error: message })
      expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
      expect(mocks.submit).not.toHaveBeenCalled()
    },
  )

  it('reserveTake 가 DB trigger 로 한도 거절되면 429 를 돌려주고 Take 를 잡거나 제출하지 않는다', async () => {
    const prepared = await requirePrepared(request())
    // #video-capacity-trigger(후속): 최근 30분 영상 3개 원자 강제 — 예약(RPC) 이 이 예외로 거절한다.
    mocks.reserveTake.mockRejectedValue(Object.assign(new Error('video_user_at_capacity'), { details: '3' }))

    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(429)
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
    // 관측: quotaRejectionResponse 를 거쳐 실제 큐/한도/스코프 인자로 기록됐는지 검사한다 —
    //   임의의 가짜 count 가 아니라 trigger 가 준 details 값이 그대로 실려야 한다.
    expect(mocks.recordObservability).toHaveBeenCalledWith(
      'project-1',
      'generation_submit_rejected_quota',
      expect.objectContaining({ scope: 'user', queued: 3, limit: 3 }),
    )
  })
})

describe('기존 단건 요청과 같은 오류를 지키는 약속', () => {
  it('필수 입력이 빠지면 준비 단계에서 기존과 같은 오류로 거절한다', async () => {
    const response = await prepareDirectorVideoSubmission(request({ projectId: '' }), 'user-1')

    expect(response instanceof Response).toBe(true)
    expect((response as Response).status).toBe(400)
    const body = await (response as Response).json()
    expect(body.error).toContain('projectId')
    expect(mocks.reserveTake).not.toHaveBeenCalled()
  })

  it('idempotencyKey 재요청 내용이 처음 확정한 입력과 다르면 제출을 거절한다', async () => {
    const prepared = await requirePrepared(request())
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJobFromSnapshot({
      ...prepared.inputSnapshot,
      full_prompt: 'Reserved with a different prompt',
    }))

    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid request: idempotencyKey replay does not match the reserved video input',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})
