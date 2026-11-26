// 고른 방식으로 만든 영상이 실패해 미니맥스로 넘어가도 그림의 역할을 지키고, 미들 스케치는 보내지 않는다 (오너 2026-11-27 N4a)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  falKeyById: vi.fn(),
  markFailed: vi.fn(),
  attach: vi.fn(),
  getJob: vi.fn(),
}))

vi.mock('@/lib/fal/keys', () => ({ falKeyById: mocks.falKeyById, FalUnknownKeyError: class FalUnknownKeyError extends Error {} }))
vi.mock('@/lib/director-video-takes', () => ({ markDirectorVideoAttemptFailed: mocks.markFailed, attachProviderRequestToReservedVideoJob: mocks.attach }))
vi.mock('@/lib/generation-jobs', () => ({ getGenerationJobById: mocks.getJob }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: vi.fn(), holdTakesForVideoJob: vi.fn() }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://app.test/api/fal/webhook' }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => {
      const chain = { update: () => chain, eq: () => chain, select: () => Promise.resolve({ data: [{ id: 'job-1' }], error: null }) }
      return chain
    },
  },
}))

import { failDirectorVideoAttemptOrFallback } from '@/lib/director/video-fallback'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'

const START = 'https://media.test/shot_start.png'
const MIDDLE = 'https://media.test/shot_direction.png'
const SHEET = 'https://media.test/mina_sheet.png'
const LIKENESS = 'status=422 | likenesses of real people'

function job(snapshot: Record<string, unknown>) {
  return {
    id: 'job-1', project_id: 'project-1', request_id: 'seedance-request-1', model: 'bytedance/seedance-2.0/reference-to-video',
    provider: 'fal', kind: 'shot_video', status: 'queued', video_clip_id: 'clip-1', fal_key_id: 'prod-2000',
    target: { workspaceId: 'workspace-1', writerShotId: 'shot-2', videoClipId: 'clip-1' },
    input_snapshot: {
      resolved_model_key: 'seedance', full_prompt: 'prompt', duration_seconds: 5, aspect_ratio: '16:9', generation_method: 'I2V',
      fal_request: { model: 'bytedance/seedance-2.0/reference-to-video', input: { prompt: 'x' } }, moderation: MODERATION_FIXTURE,
      ...snapshot,
    },
  } as never
}

const submitted = () => mocks.submit.mock.calls.map(([endpoint, payload]) => ({ endpoint: endpoint as string, input: (payload as { input: Record<string, unknown> }).input }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.falKeyById.mockImplementation((id: string) => ({ id, client: { queue: { submit: mocks.submit } } }))
  mocks.submit.mockResolvedValue({ request_id: 'fallback-request-1' })
  mocks.attach.mockResolvedValue(undefined)
})

describe('혼자 정한 것', () => {
  // 왜: 미니맥스의 참고 칸은 인물 · 화풍용이다 — 연필 · 화살표 스케치를 넣으면 그 모양이 영상에 찍힌다. 시작 그림만 첫 장면 칸으로 간다.
  it('시작+미들 영상이 미니맥스로 넘어가면 미들 스케치는 보내지 않고 시작 그림만 보낸다', async () => {
    await failDirectorVideoAttemptOrFallback(job({
      video_mode: 'start_middle', reference_image_url: START, reference_image_urls: [START, MIDDLE], reference_image_roles: ['start', 'direction'],
    }), LIKENESS)

    const [first] = submitted()
    expect(first!.endpoint).toBe('minimax/h3-max/image-to-video')
    expect(first!.input).toMatchObject({ image_url: START })
    expect(JSON.stringify(first!.input)).not.toContain(MIDDLE)
  })

  // 왜: 레퍼런스는 시작 · 끝 장면이 없는 방식이다 — 넘어간 모델에서도 그림을 첫 장면으로 쓰지 않는다.
  it('레퍼런스 영상이 미니맥스로 넘어가면 그림을 참고 칸으로만 보낸다', async () => {
    await failDirectorVideoAttemptOrFallback(job({
      video_mode: 'reference', reference_image_url: START, reference_image_urls: [START, SHEET], reference_image_roles: ['ref', 'ref'],
    }), LIKENESS)

    const [first] = submitted()
    expect(first!.endpoint).toBe('minimax/h3-max/reference-to-video')
    expect(first!.input).toMatchObject({ reference_image_urls: [START, SHEET] })
    expect(first!.input).not.toHaveProperty('image_url')
  })
})
