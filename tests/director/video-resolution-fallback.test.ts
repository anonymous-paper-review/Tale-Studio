// 고른 모델이 실패해 다음 모델로 넘어가도 그 모델이 낼 수 있는 해상도로 만들고, 처음 잡은 Take 는 그대로 둔다 (오너 2026-10-31 1080p)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  falKeyById: vi.fn(),
  markFailed: vi.fn(),
  attach: vi.fn(),
  getJob: vi.fn(),
  release: vi.fn(),
  hold: vi.fn(),
}))

vi.mock('@/lib/fal/keys', () => ({
  falKeyById: mocks.falKeyById,
  FalUnknownKeyError: class FalUnknownKeyError extends Error {},
}))
vi.mock('@/lib/director-video-takes', () => ({
  markDirectorVideoAttemptFailed: mocks.markFailed,
  attachProviderRequestToReservedVideoJob: mocks.attach,
}))
vi.mock('@/lib/generation-jobs', () => ({ getGenerationJobById: mocks.getJob }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: mocks.release, holdTakesForVideoJob: mocks.hold }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://app.test/api/fal/webhook' }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => {
      const chain = {
        update: () => chain,
        eq: () => chain,
        select: () => Promise.resolve({ data: [{ id: 'job-1' }], error: null }),
      }
      return chain
    },
  },
}))

import { failDirectorVideoAttemptOrFallback } from '@/lib/director/video-fallback'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'

const START = 'https://media.test/shots/sh_01_01_storyboard_start.png'
const END = 'https://media.test/shots/sh_01_01_storyboard_end.png'
const LIKENESS = 'status=422 | body={"detail":[{"msg":"The images or videos provided may contain likenesses of real people"}]}'
const AFTER_MINIMAX = {
  video_fallback: { steps: [{ model: 'minimax', endpoint: 'minimax/h3-max/image-to-video', reason: LIKENESS, started_at: '2026-10-31T10:00:00.000Z' }] },
}

/** 1080p 로 Seedance 에 맡겼던 영상 작업 — 처음 제출 때 Take 10 을 잡아 두었다. */
function seedance1080Job(snapshotPatch: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    project_id: 'project-1',
    request_id: 'seedance-request-1',
    model: 'bytedance/seedance-2.0/reference-to-video',
    provider: 'fal',
    kind: 'shot_video',
    status: 'queued',
    video_clip_id: 'clip-1',
    target: { workspaceId: 'workspace-1', writerShotId: 'sh_01_01', videoClipId: 'clip-1' },
    fal_key_id: 'prod-2000',
    idempotency_key: 'idem-1',
    result_url: null,
    error: null,
    input_snapshot: {
      requestedModel: 'seedance',
      resolved_model_key: 'seedance',
      resolution: '1080p',
      full_prompt: 'Motion contract: Camera: LOCKED tripod shot.',
      duration_seconds: 6,
      aspect_ratio: '16:9',
      generation_method: 'I2V',
      reference_image_url: START,
      reference_image_urls: [START, END],
      reference_image_roles: ['start', 'end'],
      fal_request: { model: 'bytedance/seedance-2.0/reference-to-video', input: { prompt: 'x', resolution: '1080p' } },
      moderation: MODERATION_FIXTURE,
      ...snapshotPatch,
    },
  } as never
}

function submitted(call = 0): { endpoint: string; input: Record<string, unknown> } {
  const [endpoint, body] = mocks.submit.mock.calls[call] as [string, { input: Record<string, unknown> }]
  return { endpoint, input: body.input }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.falKeyById.mockImplementation((id: string) => ({ id, client: { queue: { submit: mocks.submit } } }))
  mocks.submit.mockResolvedValue({ request_id: 'fallback-request-1' })
  mocks.attach.mockResolvedValue(undefined)
  mocks.markFailed.mockResolvedValue(undefined)
})

describe('같이 정한 것', () => {
  // 왜: Seedance 가 실사 인물 닮음으로 거절해 해피홀스까지 넘어간 1080p 영상 — 해피홀스는 1080p 를 낼 수 있다.
  it('고른 모델이 실패해 자동 대체로 넘어가면 대체 모델이 낼 수 있는 해상도로 만들고 Take는 처음 잡은 값 그대로다', async () => {
    await failDirectorVideoAttemptOrFallback(seedance1080Job(), LIKENESS)
    await failDirectorVideoAttemptOrFallback(seedance1080Job(AFTER_MINIMAX), 'minimax failed')

    expect(submitted(0).endpoint).toBe('minimax/h3-max/image-to-video')
    expect(submitted(0).input.resolution).toBe('768P')
    expect(submitted(1).endpoint).toBe('alibaba/happy-horse/reference-to-video')
    expect(submitted(1).input.resolution).toBe('1080p')
    expect(mocks.hold).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })
})

describe('혼자 정한 것', () => {
  // 왜: 해상도를 고른 적 없는 영상이나 이 기능 전에 맡긴 작업(기록에 해상도가 없음)이 해피홀스로 넘어갈 때 — 정상 경로 고정.
  it('해상도 기록이 없는 작업이 해피홀스로 넘어가면 지금처럼 720p로 만든다', async () => {
    const job = seedance1080Job({ ...AFTER_MINIMAX, resolution: undefined })

    await failDirectorVideoAttemptOrFallback(job, 'minimax failed')

    expect(submitted(0).endpoint).toBe('alibaba/happy-horse/reference-to-video')
    expect(submitted(0).input.resolution).toBe('720p')
  })
})
