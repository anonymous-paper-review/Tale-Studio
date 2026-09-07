// 영상 제작 결과 알림이 오면 확인된 결과만 반영하고, 저장 실패는 다시 처리할 수 있게 남긴다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  getJob: vi.fn(),
  failLegacy: vi.fn(),
  failLinked: vi.fn(),
  finalizeGeneration: vi.fn(),
  reconcile: vi.fn(),
}))

vi.mock('@/lib/fal/verify-webhook', () => ({
  readFalWebhookHeaders: () => ({}),
  verifyFalWebhook: mocks.verify,
}))
vi.mock('@/lib/generation-jobs', () => ({
  getGenerationJobByRequestId: mocks.getJob,
  failGenerationJob: mocks.failLegacy,
  classifyFalFailure: () => 'generic',
  // webhook 의 터미널 전이 dedupe(2026-07-22)가 instanceof 로 판별하는 클래스 — 목에도 제공.
  GenerationJobTerminalTransitionError: class GenerationJobTerminalTransitionError extends Error {},
}))
vi.mock('@/lib/director-video-takes', () => ({
  markDirectorVideoAttemptFailed: mocks.failLinked,
}))
vi.mock('@/lib/fal/finalize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fal/finalize')>()
  return {
    ...actual,
    finalizeGenerationJob: mocks.finalizeGeneration,
  }
})
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcile }))

import { POST } from '@/app/api/fal/webhook/route'

const job = {
  id: 'job-1',
  project_id: 'project-1',
  request_id: 'request-1',
  kind: 'shot_video',
  status: 'queued',
  video_clip_id: 'clip-1',
}

function request(body: Record<string, unknown> = {
  request_id: 'request-1',
  status: 'OK',
  payload: { video: { url: 'https://fal.test/video.mp4' } },
}) {
  return new Request('http://test/api/fal/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.verify.mockResolvedValue(true)
  mocks.getJob.mockResolvedValue(job)
})

describe('연결된 Director 영상 결과 저장', () => {
  it('파일을 올린 뒤 완료 정보 저장에 실패하면 다시 시도할 수 있게 남긴다', async () => {
    const { DirectorVideoCompletionPersistenceError } = await import('@/lib/fal/finalize')
    mocks.finalizeGeneration.mockRejectedValue(
      new DirectorVideoCompletionPersistenceError(
        'provider_fetch_retryable',
        new Error('database temporarily unavailable'),
      ),
    )

    await expect(POST(request())).rejects.toBeInstanceOf(
      DirectorVideoCompletionPersistenceError,
    )
    expect(mocks.failLinked).not.toHaveBeenCalled()
    expect(mocks.failLegacy).not.toHaveBeenCalled()
  })

  it('연결된 영상 결과 반영에 실패하면 처리를 끝내고 실패로 남긴다', async () => {
    mocks.finalizeGeneration.mockRejectedValue(new Error('provider object unavailable'))
    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.failLinked).toHaveBeenCalledWith(
      'project-1',
      'job-1',
      // [finalize] prefix marks the failing stage (#a2-observability 2026-08-26)
      '[finalize] provider object unavailable',
    )
    expect(mocks.failLegacy).not.toHaveBeenCalled()
  })
})
describe('영상 결과 알림의 종류별 처리', () => {
  it.each([
    ['character_view', 'image', { image: { url: 'https://fal.test/image.png' } }],
    ['world_shot', 'image', { image: { url: 'https://fal.test/image.png' } }],
    ['shot_storyboard', 'image', { image: { url: 'https://fal.test/image.png' } }],
    ['shot_rough_storyboard', 'image', { image: { url: 'https://fal.test/image.png' } }],
    ['shot_video', 'video', { video: { url: 'https://fal.test/video.mp4' } }],
  ] as const)('%s 결과가 오면 알맞은 방식으로 최종 반영한다', async (kind, media, payload) => {
    mocks.getJob.mockResolvedValue({ ...job, kind, video_clip_id: kind === 'shot_video' ? 'clip-1' : null })
    const response = await POST(request({ request_id: 'request-1', status: 'OK', payload }))
    expect(response.status).toBe(200)
    expect(mocks.finalizeGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ kind }),
      expect.objectContaining({ media }),
    )
  })

  it.each([
    ['shot_video', { image: { url: 'https://fal.test/image.png' } }],
    ['world_shot', { video: { url: 'https://fal.test/video.mp4' } }],
  ])('%s 결과와 내용이 맞지 않으면 실패로 끝내고 반영하지 않는다', async (kind, payload) => {
    mocks.getJob.mockResolvedValue({ ...job, kind, video_clip_id: kind === 'shot_video' ? 'clip-1' : null })
    const response = await POST(request({ request_id: 'request-1', status: 'OK', payload }))
    expect(response.status).toBe(200)
    expect(mocks.finalizeGeneration).not.toHaveBeenCalled()
  })

  it('알 수 없는 작업 종류는 반영하지 않고 거절한다', async () => {
    mocks.getJob.mockResolvedValue({ ...job, kind: 'future_kind', video_clip_id: null })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.finalizeGeneration).not.toHaveBeenCalled()
  })

  it('확인된 결과에 요청 이름이 없거나 올바르지 않으면 거절한다', async () => {
    for (const body of [
      { status: 'OK', payload: {} },
      { request_id: 42, status: 'OK', payload: {} },
      { request_id: '', status: 'OK', payload: {} },
    ]) {
      const response = await POST(request(body))
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { code: 'missing_request_id' },
      })
    }
    expect(mocks.getJob).not.toHaveBeenCalled()
  })
})
