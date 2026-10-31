// 영상 만들기 요청은 고른 해상도로 영상 생성처에 보내고, 화면에 보인 것과 같은 Take 를 잡는다 (오너 2026-10-31 1080p)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  syncFalKeyLimits: vi.fn(),
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
  buildPrompt: vi.fn(),
  falKeyById: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
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
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/director-video-takes', () => ({
  reserveDirectorVideoTake: mocks.reserveTake,
  reserveDirectorVideoRegeneration: mocks.reserveRegeneration,
  updateDirectorVideoTakeMetadata: mocks.updateMetadata,
  attachProviderRequestToReservedVideoJob: mocks.attach,
  markDirectorVideoAttemptFailed: mocks.fail,
}))
vi.mock('@/lib/billing/take-hold', () => ({ holdTakesForVideoJob: mocks.holdTakesForVideoJob }))
vi.mock('@/lib/director/video-prompt', () => ({ buildVideoPrompt: mocks.buildPrompt }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://webhook.test' }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/fal/keys', () => ({
  falKeyById: mocks.falKeyById,
  FalUnknownKeyError: class FalUnknownKeyError extends Error {},
}))

import {
  prepareDirectorVideoSubmission,
  submitDirectorVideoRequest,
  submitPreparedDirectorVideo,
  type PreparedDirectorVideoSubmission,
} from '@/lib/director/video-submit'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { FAL_VIDEO_MODEL_ORDER } from '@/lib/video-models'

const key = '123e4567-e89b-12d3-a456-426614174000'
const START = 'https://storage.test/shot-1_storyboard_start.png'
const END = 'https://storage.test/shot-1_storyboard_end.png'
const STORYBOARD = {
  url: START,
  frames: { start: START, direction: 'https://storage.test/shot-1_storyboard_direction.png', end: END },
  status: 'completed',
  errorMessage: null,
  generatedAt: 1756800000000,
}
const STANDALONE_KEY = 'standalone:123e4567-e89b-42d3-a456-426614174000'
const STANDALONE_CONFIG = {
  prompt: 'Stored standalone motion',
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
  cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 },
  provider: 'happy-horse',
  durationSeconds: 5,
}

function request(extra: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/generate-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: 'project-1',
      shotId: 'shot-1',
      prompt: 'A quiet harbor at dawn',
      idempotencyKey: key,
      // Director 화면은 늘 프레임 출처를 보낸다 — 서버가 DB 실사로 시작·끝 그림을 정한다.
      frameSource: 'auto',
      ...extra,
    }),
  })
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

/** 샷 영상 준비가 읽는 행: 프로젝트 → 샷(실사 스토리보드 있음) → 그 뒤 조회는 비어 있음. */
function seedShotRows(storyboardImage: unknown = STORYBOARD) {
  mocks.from.mockReset()
  mocks.from
    .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
    .mockReturnValueOnce(query({ shot_id: 'shot-1', dynamic_spec: {}, character_appearance_keys: {}, storyboard_image: storyboardImage }))
    .mockReturnValue(query(null))
}

async function prepare(req: Request): Promise<PreparedDirectorVideoSubmission> {
  const prepared = await prepareDirectorVideoSubmission(req, 'user-1')
  if (prepared instanceof Response) {
    throw new Error(`prepare failed unexpectedly: ${prepared.status} ${await prepared.clone().text()}`)
  }
  return prepared
}

function falInput(prepared: PreparedDirectorVideoSubmission) {
  return (prepared.inputSnapshot.fal_request as { input: Record<string, unknown> }).input
}

/** 고정한 입력을 실제로 제출하고, 잡은 Take 양을 돌려준다. */
async function submitAndReadHold(prepared: PreparedDirectorVideoSubmission): Promise<number> {
  mocks.from.mockReset()
  mocks.from.mockReturnValue(query(null))
  mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
  mocks.getJob.mockResolvedValue({
    id: 'job-1', request_id: 'reserved:job-1', provider: 'fal', fal_key_id: 'prod-2000',
    model: 'stored-model', status: 'queued', input_snapshot: prepared.inputSnapshot,
  })
  mocks.submit.mockResolvedValue({ request_id: 'fal-1' })
  mocks.holdTakesForVideoJob.mockClear()
  const response = await submitPreparedDirectorVideo(prepared)
  expect(response.status).toBe(200)
  expect(mocks.holdTakesForVideoJob).toHaveBeenCalledTimes(1)
  return mocks.holdTakesForVideoJob.mock.calls[0][0].amount as number
}

/** 화면 한 편 경로(POST 한 번에 준비 + 제출). 예약에 실린 입력 그대로 작업 행을 돌려준다. */
async function submitSingle(req: Request) {
  mocks.reserveTake.mockImplementation(async (args: { inputSnapshot: unknown }) => {
    mocks.getJob.mockResolvedValueOnce({
      id: 'job-1', request_id: 'reserved:job-1', provider: 'fal', fal_key_id: 'prod-2000',
      model: 'stored-model', status: 'queued', input_snapshot: args.inputSnapshot,
    })
    return { video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false }
  })
  mocks.submit.mockResolvedValue({ request_id: 'fal-1' })
  return submitDirectorVideoRequest(req)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'resolution-test-signing-key')
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.syncFalKeyLimits.mockResolvedValue(undefined)
  mocks.falKeyById.mockImplementation((id: string) => id === 'prod-2000'
    ? { id: 'prod-2000', maxInflight: 40, client: { queue: { submit: mocks.submit } } }
    : null)
  mocks.buildPrompt.mockImplementation((input: { prompt: string }) => ({ fullPrompt: input.prompt, prompt_parts: [] }))
  mocks.holdTakesForVideoJob.mockResolvedValue({ ok: true, insufficient: false, balance: 100 })
  seedShotRows()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('같이 정한 것', () => {
  // 왜: 사용자가 영상 노드에서 1080p 를 고르고 [영상 생성]을 누를 때 — 정상 경로 고정.
  it('1080p를 고르고 영상을 만들면 1080p 영상을 만든다', async () => {
    const prepared = await prepare(request({ model: 'seedance', resolution: '1080p' }))

    expect(falInput(prepared).resolution).toBe('1080p')
    await submitAndReadHold(prepared)
    expect(mocks.submit).toHaveBeenCalledWith(
      'bytedance/seedance-2.0/reference-to-video',
      expect.objectContaining({ input: expect.objectContaining({ resolution: '1080p', image_urls: [START, END] }) }),
    )
  })

  // 왜: 화면(영상 노드 · 팝업 · 일괄 확인 창)이 보여준 Take 와 서버가 실제로 잡는 Take 가 다르면 종량제 신뢰가 깨진다.
  it('1080p 영상은 720p 영상의 두 배 Take를 쓰고, 서버가 잡는 Take는 화면에 보인 값과 같다', async () => {
    for (const model of FAL_VIDEO_MODEL_ORDER) {
      for (const resolution of ['720p', '1080p'] as const) {
        seedShotRows()
        const prepared = await prepare(request({ model, resolution }))
        const held = await submitAndReadHold(prepared)
        expect({ model, resolution, held }).toEqual({ model, resolution, held: takeCostForVideo(model, resolution) })
        expect(prepared.takeAmount).toBe(held)
      }
    }
    seedShotRows()
    expect(await submitAndReadHold(await prepare(request({ model: 'seedance', resolution: '1080p' })))).toBe(10)
    seedShotRows()
    expect(await submitAndReadHold(await prepare(request({ model: 'seedance', resolution: '720p' })))).toBe(5)
  })
})

describe('혼자 정한 것', () => {
  // 왜: 1080p 를 남겨 둔 영상 노드에서 모델만 Kling O3 Pro 로 바꿔 만들 때 — 그 모델 요청에는 해상도 칸이 없다.
  it('해상도를 고를 수 없는 모델은 1080p를 골라 두어도 해상도를 보내지 않고 기본 Take를 잡는다', async () => {
    const prepared = await prepare(request({ model: 'kling-o3', resolution: '1080p' }))

    expect(falInput(prepared)).not.toHaveProperty('resolution')
    expect(prepared.inputSnapshot).not.toHaveProperty('resolution')
    expect(await submitAndReadHold(prepared)).toBe(5)
  })

  // 왜: 화면이 아닌 곳(옛 화면·직접 호출)이 4k 같은 값을 보내면 — 몇 배를 잡아야 할지 정해진 적이 없는 값이다.
  it('720p와 1080p 밖의 해상도를 보내면 Take를 잡거나 영상을 맡기기 전에 거절한다', async () => {
    for (const resolution of ['4k', '480p', 1080, { value: '1080p' }]) {
      seedShotRows()
      const result = await prepareDirectorVideoSubmission(request({ model: 'veo', resolution }), 'user-1')
      expect(result).toBeInstanceOf(Response)
      expect((result as Response).status).toBe(400)
    }
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  // 왜: 자동 대체 · 다시 이어 내기 · 멈춘 작업 복구가 처음 요청과 같은 해상도를 다시 쓰려면 작업 기록에 남아 있어야 한다.
  //   720p 는 이 기능 전 작업과 같은 모양으로 둔다 — 배포 직후 같은 요청을 다시 낼 때 서버가 기록을 비교하다 어긋나지 않게.
  it('1080p로 만들면 작업 기록에 1080p를 남기고, 720p는 지금처럼 따로 적지 않는다', async () => {
    const hd = await prepare(request({ model: 'happy-horse', resolution: '1080p' }))
    expect(hd.inputSnapshot.resolution).toBe('1080p')

    seedShotRows()
    const plain = await prepare(request({ model: 'happy-horse' }))
    expect(plain.inputSnapshot).not.toHaveProperty('resolution')
    expect(falInput(plain).resolution).toBe('720p')
  })

  // 왜: 캔버스 빈 곳에서 만든 독립 영상(샷 없는 영상)은 해상도 단추가 없다 — 설정 전체를 그 영상이 갖고 있고 해상도는 그 안에 없다.
  it('독립 영상은 해상도를 고르지 않고 지금처럼 720p로 만든다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ id: 'clip-standalone', shot_id: STANDALONE_KEY, override: STANDALONE_CONFIG }))
      .mockReturnValue(query(null))

    const prepared = await prepare(request({
      standaloneVideoKey: STANDALONE_KEY,
      standaloneConfig: STANDALONE_CONFIG,
      videoClipId: 'clip-standalone',
      frameSource: 'manual',
      referenceImageUrl: 'https://storage.test/standalone-start.png',
      referenceImageUrls: ['https://storage.test/standalone-start.png'],
      referenceImageRoles: ['start'],
      resolution: '1080p',
    }))

    expect(falInput(prepared).resolution).toBe('720p')
    expect(prepared.inputSnapshot).not.toHaveProperty('resolution')
    expect(prepared.takeAmount).toBe(takeCostForVideo('happy-horse', '720p'))
  })

  // 왜: [모든 샷 영상 만들기]는 서버가 준비해 둔 입력으로 새 테이크를 예약한다 — 그 예약에 설정이 실려야
  //   새 테이크 노드가 1080p · 해피홀스로 보이고 리테이크도 같은 설정으로 만든다(2026-10-31 리뷰).
  it('일괄로 준비한 입력을 낼 때 새 테이크 기록에 그 테이크의 설정(모델 · 해상도)을 남긴다', async () => {
    const override = { provider: 'happy-horse', resolution: '1080p' }
    const prepared = await prepare(request({ model: 'happy-horse', resolution: '1080p', override }))
    expect(prepared.override).toEqual(override)

    mocks.from.mockReset()
    mocks.from.mockReturnValue(query(null))
    const reserve = vi.fn().mockResolvedValue({ video_clip_id: 'clip-new', job_id: 'job-1', take_number: 2, replayed: false })
    mocks.getJob.mockResolvedValue({
      id: 'job-1', request_id: 'reserved:job-1', provider: 'fal', fal_key_id: 'prod-2000',
      model: 'stored-model', status: 'queued', input_snapshot: prepared.inputSnapshot,
    })
    mocks.submit.mockResolvedValue({ request_id: 'fal-1' })

    const response = await submitPreparedDirectorVideo(prepared, { reserve })

    expect(response.status).toBe(200)
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ override }))
    expect(mocks.holdTakesForVideoJob).toHaveBeenCalledWith(expect.objectContaining({ amount: 2 }))
  })

  // 왜: 화면이 같은 요청 키로 다시 낼 때(응답 유실 뒤 이어 내기) 처음 예약과 해상도가 다르면 다른 요청이다 —
  //   그대로 이어 내면 720p 값으로 1080p 를 받거나 그 반대가 된다.
  it('같은 요청 키로 다시 낼 때 작업 기록의 해상도가 다르면 처음 예약과 다른 요청으로 보고 이어 내지 않는다', async () => {
    const prepared = await prepare(request({ model: 'seedance', resolution: '720p' }))

    mocks.from.mockReset()
    mocks.from.mockReturnValue(query({ id: 'job-1', video_clip_id: 'clip-1', target: { retakeMode: 'new_take', writerShotId: 'shot-1' } }))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue({
      id: 'job-1', request_id: 'reserved:job-1', provider: 'fal', fal_key_id: 'prod-2000',
      model: 'stored-model', status: 'queued', input_snapshot: { ...prepared.inputSnapshot, resolution: '1080p' },
    })

    const response = await submitPreparedDirectorVideo(prepared)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('does not match the reserved video input') })
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
  })

  // 왜: 이 기능 전에 예약된 작업은 기록에 해상도 칸이 없다(720p). 배포 직후 그 작업을 이어 낼 때 다른 요청으로 보면 안 된다.
  it('해상도 기록이 없는 예전 720p 예약 작업은 같은 요청으로 이어 낼 수 있다', async () => {
    const prepared = await prepare(request({ model: 'seedance' }))
    expect(prepared.inputSnapshot).not.toHaveProperty('resolution')
    mocks.from.mockReset()
    mocks.from.mockReturnValue(query(null))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    const oldJob = {
      id: 'job-1', request_id: 'reserved:job-1', provider: 'fal', fal_key_id: 'prod-2000',
      model: 'stored-model', status: 'queued', input_snapshot: { ...prepared.inputSnapshot },
    }
    mocks.getJob.mockResolvedValue(oldJob)
    mocks.submit.mockResolvedValue({ request_id: 'fal-already-submitted' })
    mocks.attach.mockRejectedValueOnce(new Error('database temporarily unavailable'))
    const first = await submitPreparedDirectorVideo(prepared)
    const { recoveryReceipt } = await first.json()
    expect(typeof recoveryReceipt).toBe('string')

    mocks.from.mockReturnValue(query({ id: 'job-1', video_clip_id: 'clip-1', target: { retakeMode: 'new_take', writerShotId: 'shot-1' } }))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    const resumed = await submitPreparedDirectorVideo(prepared, { recoveryReceipt })

    expect(resumed.status).toBe(200)
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.attach).toHaveBeenLastCalledWith('project-1', 'job-1', 'fal-already-submitted', expect.objectContaining({ provider: 'fal' }))
  })

  // 왜: 새 테이크 설정(override)은 노드가 보여줄 기록일 뿐이다. 설정 칸에 1080p 를 적어 보내는 요청(조작된 화면 · 옛 화면)이
  //   720p 값으로 1080p 를 받아 가면 안 된다 — Take 와 영상 생성처에 보내는 해상도는 서버가 검사한 요청 해상도 하나로 정한다.
  it('새 테이크 설정에 1080p가 적혀 있어도 요청 해상도가 720p거나 없으면 720p로 만들고 한 배 Take를 잡는다', async () => {
    for (const resolution of ['720p', undefined]) {
      seedShotRows()
      const prepared = await prepare(request({ model: 'seedance', resolution, override: { resolution: '1080p' } }))
      expect(falInput(prepared).resolution).toBe('720p')
      expect(await submitAndReadHold(prepared)).toBe(5)
    }

    seedShotRows()
    mocks.holdTakesForVideoJob.mockClear()
    mocks.submit.mockClear()
    const single = await submitSingle(request({ model: 'seedance', override: { resolution: '1080p' } }))
    expect(single.status).toBe(200)
    expect(mocks.submit).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ input: expect.objectContaining({ resolution: '720p' }) }))
    expect(mocks.holdTakesForVideoJob).toHaveBeenCalledWith(expect.objectContaining({ amount: 5 }))
  })

  // 왜: 반대로 설정 칸에 720p 가 남아 있어도 요청이 1080p 면 1080p 로 만들고 그만큼 잡는다 — 받는 영상과 내는 Take 가 늘 같다.
  it('새 테이크 설정에 720p가 적혀 있어도 요청 해상도가 1080p면 1080p로 만들고 두 배 Take를 잡는다', async () => {
    const prepared = await prepare(request({ model: 'seedance', resolution: '1080p', override: { resolution: '720p' } }))
    expect(falInput(prepared).resolution).toBe('1080p')
    expect(await submitAndReadHold(prepared)).toBe(10)

    seedShotRows()
    mocks.holdTakesForVideoJob.mockClear()
    mocks.submit.mockClear()
    const single = await submitSingle(request({ model: 'seedance', resolution: '1080p', override: { resolution: '720p' } }))
    expect(single.status).toBe(200)
    expect(mocks.submit).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ input: expect.objectContaining({ resolution: '1080p' }) }))
    expect(mocks.holdTakesForVideoJob).toHaveBeenCalledWith(expect.objectContaining({ amount: 10 }))
  })

  // 왜: 새 테이크 설정은 영상 테이크 기록에 그대로 남는다 — 객체가 아닌 값이 남으면 화면이 그 테이크를 읽지 못해 캔버스에서 사라진다.
  //   테이크 설정 저장 칸(video-takes PATCH)과 같은 규칙 · 같은 안내로 거절한다.
  it('새 테이크 설정이 평범한 객체가 아니면 Take를 잡거나 영상을 맡기기 전에 거절한다', async () => {
    for (const override of [['1080p'], '1080p', 5, true]) {
      seedShotRows()
      const batch = await prepareDirectorVideoSubmission(request({ model: 'seedance', override }), 'user-1')
      expect(batch).toBeInstanceOf(Response)
      expect((batch as Response).status).toBe(400)
      await expect((batch as Response).json()).resolves.toEqual({ error: 'Invalid request: override must be a plain JSON object or null' })
      seedShotRows()
      expect((await submitDirectorVideoRequest(request({ model: 'seedance', override }))).status).toBe(400)
    }
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.holdTakesForVideoJob).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()

    seedShotRows()
    const empty = await prepare(request({ model: 'seedance', override: null }))
    expect(empty.override).toEqual({})
  })

  // 왜: 영상 노드 설정에 없는 칸이나 고를 수 없는 해상도가 테이크 기록에 남으면 노드가 엉뚱한 값을 보여준다 — 아는 칸만 남긴다.
  it('새 테이크 설정에서 모르는 칸과 고를 수 없는 해상도는 버리고 아는 칸만 남긴다', async () => {
    const camera = { horizontal: 1, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
    const prepared = await prepare(request({
      model: 'happy-horse',
      override: { provider: 'happy-horse', prompt: 'Rain on the harbor', camera, resolution: '4k', seed: 7, takeAmount: 0 },
    }))

    const kept = { provider: 'happy-horse', prompt: 'Rain on the harbor', camera }
    expect(prepared.override).toEqual(kept)
    expect(prepared.inputSnapshot.new_take_metadata).toMatchObject({ override: kept })
  })

  // 왜: 참고 그림이 하나도 없으면 글만으로 만드는 다른 입구로 나가고, 그 입구에는 해상도 칸이 없다 — 받지 못할 1080p 값을 받지 않는다.
  it('참고 그림 없이 글로만 만드는 영상은 해상도를 보내지 않으므로 기본 Take를 잡는다', async () => {
    const prepared = await prepare(request({ model: 'seedance', resolution: '1080p', frameSource: undefined }))

    expect(prepared.inputSnapshot.generation_method).toBe('T2V')
    expect(falInput(prepared)).not.toHaveProperty('resolution')
    expect(prepared.inputSnapshot).not.toHaveProperty('resolution')
    expect(prepared.takeAmount).toBe(5)
  })
})
