// 화면에서 멈춘 영상이 생성처에서 거절되면 다른 모델로 다시 보내지 않고 실패 규칙대로 끝낸다 (영어 재점검 · 리드 11/14)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  falKeyById: vi.fn(),
  markFailed: vi.fn(),
  attach: vi.fn(),
  getJob: vi.fn(),
  release: vi.fn(),
  hold: vi.fn(),
  cancellation: vi.fn(),
  claims: [] as Array<Record<string, unknown>>,
  // 작업 행 하나 — 웹훅 · reconcile 이 같은 행을 두고 차지를 다툰다.
  row: { status: 'queued', request_id: 'seedance-request-1' },
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
// 멈춤 표는 진짜 읽기 함수(isJobCancelled)로 읽는다 — 표가 없는 DB 의 길까지 그대로 본다.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'director_job_cancellations') {
        const read = {
          select: () => read,
          eq: () => read,
          maybeSingle: () => Promise.resolve(mocks.cancellation()),
        }
        return read
      }
      if (table !== 'generation_jobs') throw new Error(`unexpected table ${table}`)
      let patch: Record<string, unknown> = {}
      const filters: Record<string, unknown> = {}
      const claim = {
        update(next: Record<string, unknown>) {
          patch = next
          mocks.claims.push(next)
          return claim
        },
        eq(column: string, value: unknown) {
          filters[column] = value
          return claim
        },
        // 차지는 queued 이고 요청 id 가 본 값 그대로일 때만 된다 — 이긴 쪽이 요청 id 를 바꾼다.
        select() {
          const won = mocks.row.status === filters.status && mocks.row.request_id === filters.request_id
          if (won) mocks.row.request_id = patch.request_id as string
          return Promise.resolve({ data: won ? [{ id: 'job-1' }] : [], error: null })
        },
      }
      return claim
    },
  },
}))

import { failDirectorVideoAttemptOrFallback } from '@/lib/director/video-fallback'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'

const START = 'https://media.test/shots/sh_01_01_storyboard_start.png'
const END = 'https://media.test/shots/sh_01_01_storyboard_end.png'
const LIKENESS = 'status=422 | Unprocessable Entity | body={"detail":[{"msg":"The images or videos provided may contain likenesses of real people","type":"content_policy_violation"}]}'
const STOPPED = { data: { job_id: 'job-1' }, error: null }
const NOT_STOPPED = { data: null, error: null }
const NO_TABLE = { data: null, error: { code: '42P01', message: 'relation "public.director_job_cancellations" does not exist' } }

function seedanceJob() {
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
    },
  } as never
}

function submittedEndpoints(): string[] {
  return mocks.submit.mock.calls.map(([endpoint]) => endpoint as string)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.claims.length = 0
  mocks.row.status = 'queued'
  mocks.row.request_id = 'seedance-request-1'
  mocks.falKeyById.mockImplementation((id: string) => ({ id, client: { queue: { submit: mocks.submit } } }))
  mocks.submit.mockResolvedValue({ request_id: 'fallback-request-1' })
  // 대체 요청을 붙이면 작업 행의 요청 id 가 새 요청 id 로 바뀐다.
  mocks.attach.mockImplementation(async (_project: string, _job: string, taskId: string) => { mocks.row.request_id = taskId })
  mocks.getJob.mockImplementation(async () => ({ ...(seedanceJob() as object), status: mocks.row.status, request_id: mocks.row.request_id }))
  mocks.markFailed.mockResolvedValue(undefined)
  mocks.cancellation.mockReturnValue(NOT_STOPPED)
})

describe('같이 정한 것', () => {
  it('멈춘 영상이 생성처에서 거절되면 대체 모델로 다시 보내지 않고 실패로 끝낸다 — 실패 규칙대로 Take 를 돌려준다', async () => {
    // 왜: 영어 재점검(리드 11/14) — [Stop making] 뒤 Seedance 2.0 이 내용 규칙으로 거절하자 MiniMax H3 Max 로 다시 나가 26초 뒤 완성됐다.
    //   멈춘 작업이 뒤에서 실패하면 지금 실패 규칙 그대로다(리드 확인 3).
    mocks.cancellation.mockReturnValue(STOPPED)

    const result = await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(mocks.submit).not.toHaveBeenCalled()
    // 멈춤으로 끝낼 때도 대체를 내는 쪽과 같은 차지를 거친다(검토 a · 리드 11/14) — 대체 단계는 적지 않는다.
    expect(mocks.claims).toHaveLength(1)
    expect(mocks.claims[0]).toMatchObject({ request_id: 'reserved:job-1' })
    expect(mocks.claims[0].input_snapshot).not.toHaveProperty('video_fallback')
    // markDirectorVideoAttemptFailed 가 실패 처리와 함께 잡아둔 Take 를 전부 돌려준다.
    expect(mocks.markFailed).toHaveBeenCalledWith('project-1', 'job-1', LIKENESS)
    expect(result).toMatchObject({ status: 'failed', error: LIKENESS })
  })

  it('대체 모델이 바로 거절해 그다음 모델로 넘어가기 직전에 멈췄으면 더 보내지 않고 실패로 끝낸다', async () => {
    // 왜: 미니맥스 요청이 바로 거절돼 해피홀스로 넘어가는 사이에도 [멈추기]를 누를 수 있다 — 넘어가기 직전마다 다시 본다(리드 11/14).
    mocks.cancellation.mockReturnValueOnce(NOT_STOPPED).mockReturnValue(STOPPED)
    mocks.submit.mockRejectedValueOnce(Object.assign(new Error('Unprocessable Entity'), { status: 422 }))

    const result = await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(submittedEndpoints()).toEqual(['minimax/h3-max/image-to-video'])
    expect(mocks.attach).not.toHaveBeenCalled()
    expect(mocks.markFailed).toHaveBeenCalledWith('project-1', 'job-1', '[fallback:minimax] Unprocessable Entity (status 422)')
    expect(result).toMatchObject({ status: 'failed' })
  })

  it('멈춤 기록을 읽지 못하면(운영 DB 에 표가 아직 없음) 멈추지 않은 것으로 보고 지금처럼 대체 모델로 다시 보낸다', async () => {
    // 왜: 화면이 운영 DB 보다 먼저 나가면 멈춤 표가 없다 — 그때는 지금 동작 그대로다(리드 11/14).
    mocks.cancellation.mockReturnValue(NO_TABLE)

    const result = await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(submittedEndpoints()).toEqual(['minimax/h3-max/image-to-video'])
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'queued', request_id: 'fallback-request-1' })
  })

  it('멈춤으로 끝낼 때도 대체를 내는 쪽과 같은 차지를 거친다 — 다른 쪽(웹훅 · reconcile)이 이미 대체 요청을 차지했으면 그 작업을 실패로 덮지 않고 지금 작업을 다시 읽어 돌려준다', async () => {
    // 왜: 검토 a(리드 11/14) — 웹훅과 reconcile 이 같은 거절을 함께 다루는 사이 멈춤이 적히면, 멈춤을 못 본 쪽은 차지에 이겨 대체를 내고
    //   멈춤을 본 쪽은 차지 없이 실패로 끝내 그 작업을 실패 · Take 반환으로 덮었다 — 대체 요청은 생성처에서 그대로 돌고 결과는 어디에도 안 붙는다.
    let answer: (value: { request_id: string }) => void = () => {}
    mocks.submit.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    mocks.cancellation.mockReturnValueOnce(NOT_STOPPED).mockReturnValue(STOPPED)

    // 한쪽(멈춤 전에 읽음)이 먼저 차지해 대체 요청을 보내는 중이다.
    const first = failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)
    await vi.waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1))
    expect(mocks.row.request_id).toBe('reserved:job-1')
    // 다른 쪽은 같은 거절을 늦게 다루고, 그사이 멈춤이 적혔다.
    const second = await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(second).toMatchObject({ status: 'queued', request_id: 'reserved:job-1' })
    answer({ request_id: 'fallback-request-1' })
    expect(await first).toMatchObject({ status: 'queued', request_id: 'fallback-request-1' })
    expect(mocks.attach).toHaveBeenCalledWith('project-1', 'job-1', 'fallback-request-1', expect.objectContaining({ model: 'minimax/h3-max/image-to-video' }))
  })
})

describe('혼자 정한 것', () => {
  it('멈추지 않은 영상이 거절되면 지금처럼 대체 모델로 다시 보낸다', async () => {
    // 왜: 정상 경로 고정 — 멈춤 표가 있는 DB 에서도 멈춘 적 없는 작업은 그대로 미니맥스로 넘어간다.
    const result = await failDirectorVideoAttemptOrFallback(seedanceJob(), LIKENESS)

    expect(submittedEndpoints()).toEqual(['minimax/h3-max/image-to-video'])
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'queued', request_id: 'fallback-request-1' })
  })
})
