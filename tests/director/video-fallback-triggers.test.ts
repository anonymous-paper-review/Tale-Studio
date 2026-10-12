// 영상 생성처가 실패를 알리면 다음 모델로 넘기고, 우리 쪽 저장 실패는 넘기지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  getJob: vi.fn(),
  failLegacy: vi.fn(),
  markFailed: vi.fn(),
  fallback: vi.fn(),
  finalize: vi.fn(),
  reconcile: vi.fn(),
  falVideoFetch: vi.fn(),
  classify: vi.fn(),
}))

vi.mock('@/lib/fal/verify-webhook', () => ({
  readFalWebhookHeaders: () => ({}),
  verifyFalWebhook: mocks.verify,
}))
vi.mock('@/lib/generation-jobs', () => ({
  getGenerationJobByRequestId: mocks.getJob,
  getGenerationJobById: vi.fn(),
  failGenerationJob: mocks.failLegacy,
  classifyFalFailure: mocks.classify,
  STALE_QUEUED_MS: 600_000,
  GenerationJobTerminalTransitionError: class GenerationJobTerminalTransitionError extends Error {},
}))
vi.mock('@/lib/director-video-takes', () => ({ markDirectorVideoAttemptFailed: mocks.markFailed }))
vi.mock('@/lib/director/video-fallback', () => ({ failDirectorVideoAttemptOrFallback: mocks.fallback }))
vi.mock('@/lib/fal/finalize', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/fal/finalize')>(),
  finalizeGenerationJob: mocks.finalize,
}))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcile }))
vi.mock('@/lib/writer/llm/fal', () => ({ falVideoFetch: mocks.falVideoFetch, falImageFetch: vi.fn() }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: vi.fn() }))
vi.mock('@/lib/director/batch-continue', () => ({ continueVideoBatch: vi.fn() }))

import { POST } from '@/app/api/fal/webhook/route'

const job = {
  id: 'job-1',
  project_id: 'project-1',
  request_id: 'request-1',
  model: 'bytedance/seedance-2.0/reference-to-video',
  provider: 'fal',
  kind: 'shot_video',
  status: 'queued',
  video_clip_id: 'clip-1',
  target: { workspaceId: 'workspace-1' },
  input_snapshot: {},
  fal_key_id: 'prod-2000',
}

function webhook(body: Record<string, unknown>) {
  return new Request('http://test/api/fal/webhook', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.verify.mockResolvedValue(true)
  mocks.getJob.mockResolvedValue(job)
  mocks.fallback.mockResolvedValue({ ...job, request_id: 'fallback-request-1' })
})

describe('영상 생성 실패를 다음 모델로 넘기는 자리', () => {
  it('생성처가 콘텐츠 정책으로 거절했다고 알리면 다음 모델로 넘긴다', async () => {
    mocks.classify.mockReturnValue('moderation')
    const raw = 'The images or videos provided may contain likenesses of real people'

    const response = await POST(webhook({ request_id: 'request-1', status: 'ERROR', payload_error: raw }))

    expect(response.status).toBe(200)
    expect(mocks.fallback).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }), `[moderation] ${raw}`)
    expect(mocks.markFailed).not.toHaveBeenCalled()
  })

  it('작업 상태를 확인했더니 생성처에서 실패했으면 다음 모델로 넘긴다', async () => {
    const { reconcileJobFromFal } = await vi.importActual<typeof import('@/lib/fal/reconcile')>('@/lib/fal/reconcile')
    mocks.falVideoFetch.mockResolvedValue({ status: 'FAILED', error: 'provider failed' })

    const result = await reconcileJobFromFal(job as never)

    expect(mocks.fallback).toHaveBeenCalledWith(job, 'provider failed')
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(result).toMatchObject({ request_id: 'fallback-request-1' })
  })

  it('영상이 만들어진 뒤 우리 쪽 저장에 실패하면 다른 모델로 다시 만들지 않는다', async () => {
    mocks.finalize.mockRejectedValue(new Error('provider object unavailable'))

    const response = await POST(webhook({ request_id: 'request-1', status: 'OK', payload: { video: { url: 'https://fal.test/video.mp4' } } }))

    expect(response.status).toBe(200)
    expect(mocks.fallback).not.toHaveBeenCalled()
    expect(mocks.markFailed).toHaveBeenCalledWith('project-1', 'job-1', '[finalize] provider object unavailable')
  })
})
