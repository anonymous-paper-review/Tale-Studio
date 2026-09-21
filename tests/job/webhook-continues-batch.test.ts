// 영상 하나가 끝나면 같은 묶음의 다음 것을 낸다
// 다음 것을 내다 실패해도 알림에는 성공으로 답한다
//
// #batch-resume(2026-09-09) 슬라이스 B. 지금까지는 브라우저가 3개씩 내고 완료를 기다리며
// 8~10분 붙잡혀 있었다 — 그 사이 새로고침하면 아직 안 낸 것이 통째로 사라졌다.
// 이제 서버가 이어간다: 완료 알림이 올 때마다 같은 묶음에서 다음 것을 낸다.
//
// 알림에는 항상 성공으로 답한다. 실패로 답하면 생성 서비스가 같은 알림을 다시 보내고,
// 그러면 방금 저장한 영상을 또 저장하려 든다. 이어가기 실패는 주기 점검이 받는다(약속 10).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyFalWebhook: vi.fn(),
  getGenerationJobByRequestId: vi.fn(),
  finalizeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  markDirectorVideoAttemptFailed: vi.fn(),
  releaseTakesForJob: vi.fn(),
  reconcileJobFromFal: vi.fn(),
  continueVideoBatch: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => Promise.resolve(fn()),
}))
vi.mock('@/lib/fal/verify-webhook', () => ({
  verifyFalWebhook: mocks.verifyFalWebhook,
  readFalWebhookHeaders: () => ({}),
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  getGenerationJobByRequestId: mocks.getGenerationJobByRequestId,
  failGenerationJob: mocks.failGenerationJob,
}))
vi.mock('@/lib/fal/finalize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fal/finalize')>()),
  finalizeGenerationJob: mocks.finalizeGenerationJob,
}))
vi.mock('@/lib/director-video-takes', () => ({
  markDirectorVideoAttemptFailed: mocks.markDirectorVideoAttemptFailed,
}))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: mocks.releaseTakesForJob }))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcileJobFromFal }))
vi.mock('@/lib/director/batch-continue', () => ({ continueVideoBatch: mocks.continueVideoBatch }))

import { POST } from '@/app/api/fal/webhook/route'

function batchJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    project_id: 'project-1',
    kind: 'shot_video',
    status: 'queued',
    request_id: 'fal-1',
    video_clip_id: 'clip-1',
    batch_id: 'batch-1',
    batch_total: 10,
    ...overrides,
  }
}

function webhookRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/fal/webhook', {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'fal-1',
      status: 'OK',
      payload: { video: { url: 'https://fal/out.mp4' } },
      ...body,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyFalWebhook.mockResolvedValue(true)
  mocks.getGenerationJobByRequestId.mockResolvedValue(batchJob())
  mocks.finalizeGenerationJob.mockResolvedValue('https://cdn/out.mp4')
  mocks.continueVideoBatch.mockResolvedValue({ submitted: 1 })
})

describe('완료 알림이 일괄을 이어간다', () => {
  it('묶음에 속한 영상이 끝나면 다음 것을 낸다', async () => {
    const response = await POST(webhookRequest())

    expect(response.status).toBe(200)
    expect(mocks.continueVideoBatch).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: 'batch-1', projectId: 'project-1' }),
    )
  })

  it('묶음에 속하지 않은 영상은 이어가지 않는다', async () => {
    // 단건 생성은 batch_id 가 null 이다.
    mocks.getGenerationJobByRequestId.mockResolvedValue(
      batchJob({ batch_id: null, batch_total: null }),
    )

    await POST(webhookRequest())

    expect(mocks.continueVideoBatch).not.toHaveBeenCalled()
  })

  it('저장이 실패하면 이어가지 않는다', async () => {
    // 저장이 안 됐으면 이 영상은 아직 안 끝난 것이다 — 남은 개수 계산이 틀어진다.
    mocks.finalizeGenerationJob.mockRejectedValue(new Error('storage 503'))

    const response = await POST(webhookRequest())

    expect(response.status).toBe(200)
    expect(mocks.continueVideoBatch).not.toHaveBeenCalled()
  })

  it('다음 것을 내다 실패해도 알림에는 성공으로 답한다', async () => {
    // 실패로 답하면 생성 서비스가 같은 알림을 다시 보내고, 방금 저장한 영상을 또 저장하려 든다.
    //   이어가기 실패는 주기 점검이 받는다(약속 10).
    mocks.continueVideoBatch.mockRejectedValue(new Error('database offline'))

    const response = await POST(webhookRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
