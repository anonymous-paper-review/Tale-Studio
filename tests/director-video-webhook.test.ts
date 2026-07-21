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

describe('linked Director video webhook persistence', () => {
  it('keeps the job retryable when immutable upload succeeded but completion persistence failed', async () => {
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

  it('terminalizes an ordinary linked finalization failure', async () => {
    mocks.finalizeGeneration.mockRejectedValue(new Error('provider object unavailable'))
    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.failLinked).toHaveBeenCalledWith(
      'project-1',
      'job-1',
      'provider object unavailable',
    )
    expect(mocks.failLegacy).not.toHaveBeenCalled()
  })
})
describe('webhook identifiers and dispatch', () => {
  it.each([
    ['character_view', 'image', { image: { url: 'https://fal.test/image.png' } }],
    ['world_shot', 'image', { image: { url: 'https://fal.test/image.png' } }],
    ['shot_storyboard', 'image', { image: { url: 'https://fal.test/image.png' } }],
    ['shot_rough_storyboard', 'image', { image: { url: 'https://fal.test/image.png' } }],
    ['shot_video', 'video', { video: { url: 'https://fal.test/video.mp4' } }],
  ] as const)('dispatches %s through the exhaustive finalizer', async (kind, media, payload) => {
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
  ])('terminalizes a %s media mismatch without invoking the finalizer', async (kind, payload) => {
    mocks.getJob.mockResolvedValue({ ...job, kind, video_clip_id: kind === 'shot_video' ? 'clip-1' : null })
    const response = await POST(request({ request_id: 'request-1', status: 'OK', payload }))
    expect(response.status).toBe(200)
    expect(mocks.finalizeGeneration).not.toHaveBeenCalled()
  })

  it('rejects an unknown runtime job kind without dispatching a finalizer', async () => {
    mocks.getJob.mockResolvedValue({ ...job, kind: 'future_kind', video_clip_id: null })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.finalizeGeneration).not.toHaveBeenCalled()
  })

  it('rejects signed payloads with absent or malformed request identifiers', async () => {
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
