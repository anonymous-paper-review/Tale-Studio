// 영상 생성이 실패하면 같은 테이크를 미니맥스, 그다음 해피홀스로 다시 만든다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  falKeyById: vi.fn(),
  markFailed: vi.fn(),
  attach: vi.fn(),
  getJob: vi.fn(),
  release: vi.fn(),
  hold: vi.fn(),
  settle: vi.fn(),
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
vi.mock('@/lib/billing/take-hold', () => ({
  releaseTakesForJob: mocks.release,
  holdTakesForVideoJob: mocks.hold,
  settleTakesForJob: mocks.settle,
}))
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
  mocks.settle.mockResolvedValue(4)
})

describe('같이 정한 것', () => {
  it('Seedance 영상이 실패하면 같은 테이크를 미니맥스로 다시 만든다', async () => {
    const result = await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(submittedEndpoints()).toEqual(['minimax/h3-max/image-to-video'])
    expect(mocks.attach).toHaveBeenCalledWith('project-1', 'job-1', 'fallback-request-1', {
      provider: 'fal',
      model: 'minimax/h3-max/image-to-video',
      falKeyId: 'prod-2000',
    })
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: 'job-1', status: 'queued', request_id: 'fallback-request-1' })
  })

  it('대체 모델로 넘기면 처음 모델 값과의 차액을 돌려주고 대체 모델 값만 받는다', async () => {
    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)
    expect(mocks.settle).toHaveBeenCalledWith('job-1', 1)

    vi.clearAllMocks()
    await failDirectorVideoAttemptOrFallback(seedanceJob({
      video_fallback: { steps: [{ model: 'minimax', endpoint: 'minimax/h3-max/image-to-video', reason: LIKENESS, started_at: '2026-10-12T10:03:03.000Z' }] },
    }), 'minimax failed')
    expect(submittedEndpoints()).toEqual(['alibaba/happy-horse/reference-to-video'])
    expect(mocks.settle).toHaveBeenCalledWith('job-1', 1)
  })

  it('미니맥스도 실패하면 해피홀스로 다시 만든다', async () => {
    const job = seedanceJob({
      video_fallback: { steps: [{ model: 'minimax', endpoint: 'minimax/h3-max/image-to-video', reason: LIKENESS, started_at: '2026-10-12T10:03:03.000Z' }] },
    })

    await failDirectorVideoAttemptOrFallback(job, 'minimax failed')

    expect(submittedEndpoints()).toEqual(['alibaba/happy-horse/reference-to-video'])
    expect(submittedInput()).toMatchObject({ image_urls: [START, END], duration: 6 })
    expect(mocks.markFailed).not.toHaveBeenCalled()
  })

  it('해피홀스까지 실패하면 더 넘기지 않고 테이크를 실패로 끝낸다', async () => {
    const job = seedanceJob({
      video_fallback: {
        steps: [
          { model: 'minimax', endpoint: 'minimax/h3-max/image-to-video', reason: LIKENESS, started_at: '2026-10-12T10:03:03.000Z' },
          { model: 'happy-horse', endpoint: 'alibaba/happy-horse/reference-to-video', reason: 'minimax failed', started_at: '2026-10-12T10:06:00.000Z' },
        ],
      },
    })

    const result = await failDirectorVideoAttemptOrFallback(job, 'happy horse failed')

    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.markFailed).toHaveBeenCalledWith('project-1', 'job-1', 'happy horse failed')
    expect(result).toMatchObject({ status: 'failed', error: 'happy horse failed' })
  })
})

describe('혼자 정한 것', () => {
  it('다른 모델로 넘겨도 잡아둔 이용권은 돌려주거나 더 잡지 않는다', async () => {
    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.hold).not.toHaveBeenCalled()
  })

  it('처음부터 해피홀스로 만들다 실패하면 미니맥스만 시도한다', async () => {
    const happyHorseJob = seedanceJob({ requestedModel: 'happy-horse', resolved_model_key: 'happy-horse' })
    await failDirectorVideoAttemptOrFallback(happyHorseJob, 'happy horse failed')
    expect(submittedEndpoints()).toEqual(['minimax/h3-max/image-to-video'])

    vi.clearAllMocks()
    const afterMinimax = seedanceJob({
      requestedModel: 'happy-horse',
      resolved_model_key: 'happy-horse',
      video_fallback: { steps: [{ model: 'minimax', endpoint: 'minimax/h3-max/image-to-video', reason: 'happy horse failed', started_at: '2026-10-12T10:03:03.000Z' }] },
    })
    await failDirectorVideoAttemptOrFallback(afterMinimax, 'minimax failed')
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.markFailed).toHaveBeenCalledWith('project-1', 'job-1', 'minimax failed')
  })

  it('다른 처리가 이미 다음 모델로 넘겼으면 또 보내지 않는다', async () => {
    mocks.claimResult.mockReturnValue({ data: [], error: null })
    mocks.getJob.mockResolvedValue({ id: 'job-1', status: 'queued', request_id: 'reserved:job-1' })

    const result = await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'queued', request_id: 'reserved:job-1' })
  })

  it('다음 모델로 넘길 때는 아직 실패한 요청을 들고 있는 작업만 차지한다', async () => {
    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(mocks.claims[0].filters).toEqual([
      ['id', 'job-1'],
      ['status', 'queued'],
      ['request_id', 'seedance-request-1'],
    ])
    expect(mocks.claims[0].patch).toMatchObject({ request_id: 'reserved:job-1' })
  })

  it('미니맥스 요청이 바로 거절되면 기다리지 않고 해피홀스로 넘어간다', async () => {
    mocks.submit
      .mockRejectedValueOnce(Object.assign(new Error('Unprocessable Entity'), { status: 422 }))
      .mockResolvedValueOnce({ request_id: 'happy-horse-request-1' })

    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(submittedEndpoints()).toEqual([
      'minimax/h3-max/image-to-video',
      'alibaba/happy-horse/reference-to-video',
    ])
    expect(mocks.claims[1].filters).toContainEqual(['request_id', 'reserved:job-1'])
    expect(mocks.attach).toHaveBeenCalledTimes(1)
    expect(mocks.attach).toHaveBeenCalledWith('project-1', 'job-1', 'happy-horse-request-1', expect.objectContaining({
      model: 'alibaba/happy-horse/reference-to-video',
    }))
  })

  it('미니맥스에는 시작 그림을 첫 장면, 끝 그림을 마지막 장면으로 보낸다', async () => {
    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    const input = submittedInput()
    expect(input).toMatchObject({
      prompt: 'Motion contract: Camera: LOCKED tripod shot.',
      image_url: START,
      end_image_url: END,
      duration: 6,
      resolution: '768P',
      prompt_expansion_mode: 'disabled',
    })
    expect(input).not.toHaveProperty('image_urls')
    expect(input).not.toHaveProperty('reference_image_urls')
    expect(mocks.submit.mock.calls[0][1]).toMatchObject({ webhookUrl: 'https://app.test/api/fal/webhook' })
  })

  it('인물·화풍 참고 그림이 있으면 미니맥스 참고 영상 모드로 참고 그림까지 함께 보낸다', async () => {
    const REF = 'https://media.test/characters/hero.png'
    await failDirectorVideoAttemptOrFallback(seedanceJob({
      reference_image_urls: [START, REF, END],
      reference_image_roles: ['start', 'ref', 'end'],
    }), LIKENESS)

    expect(submittedEndpoints()).toEqual(['minimax/h3-max/reference-to-video'])
    expect(submittedInput()).toMatchObject({ image_url: START, end_image_url: END, reference_image_urls: [REF] })
    expect(submittedInput()).not.toHaveProperty('aspect_ratio')
  })

  it('참고 그림이 없는 영상은 미니맥스까지만 시도한다', async () => {
    const textOnly = { reference_image_url: null, reference_image_urls: undefined, reference_image_roles: undefined, generation_method: 'T2V' }
    await failDirectorVideoAttemptOrFallback(seedanceJob(textOnly), LIKENESS)
    expect(submittedEndpoints()).toEqual(['minimax/h3-max/text-to-video'])
    expect(submittedInput()).not.toHaveProperty('image_url')
    expect(submittedInput()).toMatchObject({ aspect_ratio: '16:9' })

    vi.clearAllMocks()
    const afterMinimax = seedanceJob({
      ...textOnly,
      video_fallback: { steps: [{ model: 'minimax', endpoint: 'minimax/h3-max/image-to-video', reason: LIKENESS, started_at: '2026-10-12T10:03:03.000Z' }] },
    })
    await failDirectorVideoAttemptOrFallback(afterMinimax, 'minimax failed')
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.markFailed).toHaveBeenCalledWith('project-1', 'job-1', 'minimax failed')
  })

  it('차액은 대체 요청을 실제로 보낸 뒤에 돌려준다', async () => {
    mocks.attach.mockImplementation(async () => {
      expect(mocks.settle).not.toHaveBeenCalled()
    })
    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)
    expect(mocks.attach).toHaveBeenCalledTimes(1)
    expect(mocks.settle).toHaveBeenCalledTimes(1)
  })

  it('대체 요청을 하나도 보내지 못하면 차액이 아니라 잡아둔 Take를 전부 돌려준다', async () => {
    mocks.submit.mockRejectedValue(Object.assign(new Error('Unprocessable Entity'), { status: 422 }))

    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(mocks.settle).not.toHaveBeenCalled()
    expect(mocks.markFailed).toHaveBeenCalledTimes(1)
  })

  it('차액 반환에 실패해도 대체 생성은 계속한다', async () => {
    mocks.settle.mockRejectedValue(new Error('db down'))

    const result = await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(result).toMatchObject({ status: 'queued', request_id: 'fallback-request-1' })
    expect(mocks.markFailed).not.toHaveBeenCalled()
  })

  it('내용 검사 영수증이 없는 예전 작업은 다른 모델로 넘기지 않고 실패로 끝낸다', async () => {
    await failDirectorVideoAttemptOrFallback(seedanceJob({ moderation: undefined }), LIKENESS)

    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.markFailed).toHaveBeenCalledWith('project-1', 'job-1', LIKENESS)
  })

  it('어느 모델에서 왜 실패해 넘어갔는지 작업 기록에 남긴다', async () => {
    await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    const snapshot = mocks.claims[0].patch.input_snapshot as Record<string, unknown>
    expect(snapshot.requestedModel).toBe('seedance')
    expect(snapshot.video_fallback).toMatchObject({
      steps: [{ model: 'minimax', endpoint: 'minimax/h3-max/image-to-video', reason: LIKENESS }],
    })
    expect(mocks.claims[0].patch).toMatchObject({ last_error: LIKENESS })
  })
})
