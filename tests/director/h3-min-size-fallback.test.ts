// H3 로 낸 영상이 실패해 대체 모델(미니맥스 · Happy Horse)로 넘길 때, H3 에 보내려고 키운 그림 주소가 작업 기록에 있으면 그 주소를 쓴다 (m-qa 2026-11-27 — 미니맥스도 256 보다 작은 그림을 거절)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  falKeyById: vi.fn(),
  markFailed: vi.fn(),
  attach: vi.fn(),
  getJob: vi.fn(),
  release: vi.fn(),
  hold: vi.fn(),
  claimResult: vi.fn(),
  claims: [] as Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }>,
}))

vi.mock('@/lib/fal/keys', () => ({
  falKeyById: mocks.falKeyById,
  FalUnknownKeyError: class FalUnknownKeyError extends Error {
    constructor(id: string | null) {
      super(`unknown fal key id: ${id ?? '(missing)'}`)
      this.name = 'FalUnknownKeyError'
    }
  },
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
    from: (table: string) => {
      if (table !== 'generation_jobs') throw new Error(`unexpected table ${table}`)
      const claim = { patch: {} as Record<string, unknown>, filters: [] as Array<[string, unknown]> }
      const chain = {
        update(patch: Record<string, unknown>) {
          claim.patch = patch
          return chain
        },
        eq(column: string, value: unknown) {
          claim.filters.push([column, value])
          return chain
        },
        select() {
          mocks.claims.push(claim)
          return Promise.resolve(mocks.claimResult())
        },
      }
      return chain
    },
  },
}))

import { failDirectorVideoAttemptOrFallback } from '@/lib/director/video-fallback'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'

const START = 'https://media.test/shots/sh_01_01_storyboard_start.png'
const END = 'https://media.test/shots/sh_01_01_storyboard_end.png'
const LIKENESS = 'status=422 | Unprocessable Entity | body={"detail":[{"msg":"The images or videos provided may contain likenesses of real people","type":"content_policy_violation"}]}'

function seedanceJob(snapshotPatch: Record<string, unknown> = {}) {
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
      full_prompt: 'Motion contract: Camera: LOCKED tripod shot.',
      duration_seconds: 6,
      aspect_ratio: '16:9',
      generation_method: 'I2V',
      reference_image_url: START,
      reference_image_urls: [START, END],
      reference_image_roles: ['start', 'end'],
      fal_request: { model: 'bytedance/seedance-2.0/reference-to-video', input: { prompt: 'x' } },
      moderation: MODERATION_FIXTURE,
      ...snapshotPatch,
    },
  } as never
}

function submittedEndpoints(): string[] {
  return mocks.submit.mock.calls.map(([endpoint]) => endpoint as string)
}

function submittedInput(call = 0): Record<string, unknown> {
  return (mocks.submit.mock.calls[call][1] as { input: Record<string, unknown> }).input
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.claims.length = 0
  mocks.falKeyById.mockImplementation((id: string) => ({ id, client: { queue: { submit: mocks.submit } } }))
  mocks.submit.mockResolvedValue({ request_id: 'fallback-request-1' })
  mocks.claimResult.mockReturnValue({ data: [{ id: 'job-1' }], error: null })
  mocks.attach.mockResolvedValue(undefined)
  mocks.markFailed.mockResolvedValue(undefined)
})


const BIG_START = 'https://media.test/video-refs/v1-start_min256.png'
const BIG_END = 'https://media.test/video-refs/v1-end_min256.png'

describe('H3 에 보내려고 키운 그림으로 대체 모델 만들기', () => {
  it('H3 에 보내려고 키운 그림 주소가 작업 기록에 있으면 대체 미니맥스는 그 주소를 시작 · 끝 장면 칸에 싣는다', async () => {
    // 왜(m-qa): H3 Turbo 가 작은 그림으로 422 → 대체 미니맥스(H3 Max 그림→영상)도 end_image_url 에서 같은 422 → Happy Horse 로 넘어갔다.
    await failDirectorVideoAttemptOrFallback(seedanceJob({
      requestedModel: 'h3-max-turbo', resolved_model_key: 'h3-max-turbo',
      fal_reference_image_urls: [BIG_START, BIG_END],
    }), 'status=422 | Minimum dimensions are 256x256')
    expect(submittedEndpoints()).toEqual(['minimax/h3-max/image-to-video'])
    expect(submittedInput()).toMatchObject({ image_url: BIG_START, end_image_url: BIG_END })
  })

  it('키운 그림 주소가 없는 작업(다른 모델 · 큰 그림)은 지금처럼 작업 기록의 원래 그림으로 대체 모델을 만든다', async () => {
    // 왜: 정상 경로 고정 — H3 가 아닌 작업의 대체 요청은 한 글자도 안 바뀐다.
    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)
    expect(submittedInput()).toMatchObject({ image_url: START, end_image_url: END })
  })
})
