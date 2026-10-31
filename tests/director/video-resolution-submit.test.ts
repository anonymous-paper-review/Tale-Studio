// 영상 만들기 요청은 고른 해상도로 영상 생성처에 보내고, 화면에 보인 것과 같은 Take 를 잡는다 (오너 2026-10-31 1080p)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
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

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'resolution-test-signing-key')
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

  // 왜: 참고 그림이 하나도 없으면 글만으로 만드는 다른 입구로 나가고, 그 입구에는 해상도 칸이 없다 — 받지 못할 1080p 값을 받지 않는다.
  it('참고 그림 없이 글로만 만드는 영상은 해상도를 보내지 않으므로 기본 Take를 잡는다', async () => {
    const prepared = await prepare(request({ model: 'seedance', resolution: '1080p', frameSource: undefined }))

    expect(prepared.inputSnapshot.generation_method).toBe('T2V')
    expect(falInput(prepared)).not.toHaveProperty('resolution')
    expect(prepared.inputSnapshot).not.toHaveProperty('resolution')
    expect(prepared.takeAmount).toBe(5)
  })
})
