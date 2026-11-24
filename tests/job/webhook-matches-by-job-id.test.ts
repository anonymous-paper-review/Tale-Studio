// 접수 번호 기록을 놓친 예약 작업도 완료 알림 주소에 심은 작업 번호로 되찾아 끝낸다
//
// 예약 뒤 fal 제출은 됐는데 접수 번호 기록이 실패하면 fal request_id 로는 행을 못 찾는다.
// fal 은 알림을 다시 보내지 않으므로, 주소에 심은 jobId 로 잡을 찾아 번호를 늦게라도 기록한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyFalWebhook: vi.fn(),
  getGenerationJobByRequestId: vi.fn(),
  getGenerationJobById: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  finalizeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  markDirectorVideoAttemptFailed: vi.fn(),
  releaseTakesForJob: vi.fn(),
  reconcileJobFromFal: vi.fn(),
  after: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => {
    mocks.after(fn)
    return Promise.resolve(fn())
  },
}))
vi.mock('@/lib/fal/verify-webhook', () => ({
  verifyFalWebhook: mocks.verifyFalWebhook,
  readFalWebhookHeaders: () => ({}),
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  getGenerationJobByRequestId: mocks.getGenerationJobByRequestId,
  getGenerationJobById: mocks.getGenerationJobById,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
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

import { POST } from '@/app/api/fal/webhook/route'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'

function reservedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job 1',
    project_id: 'project-1',
    kind: 'shot_video',
    status: 'queued',
    request_id: 'reserved:job 1',
    model: 'fal-ai/model',
    fal_key_id: 'key-1',
    video_clip_id: 'clip-1',
    ...overrides,
  }
}

function webhookRequest(query = '?jobId=job%201') {
  return new Request(`http://localhost/api/fal/webhook${query}`, {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'fal-1',
      status: 'OK',
      payload: { video: { url: 'https://fal/out.mp4' } },
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyFalWebhook.mockResolvedValue(true)
  mocks.getGenerationJobByRequestId.mockResolvedValue(null)
  mocks.getGenerationJobById.mockResolvedValue(reservedJob())
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.finalizeGenerationJob.mockResolvedValue('https://cdn/out.mp4')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('작업 번호로 되찾기', () => {
  it('완료 알림 주소에 작업 번호를 심는다', () => {
    vi.stubEnv('WEBHOOK_BASE_URL', 'https://app.example.com/')

    expect(resolveWebhookUrl('job 1')).toBe('https://app.example.com/api/fal/webhook?jobId=job%201')
    expect(resolveWebhookUrl()).toBe('https://app.example.com/api/fal/webhook')
  })

  it('접수 번호로 못 찾은 알림은 주소의 작업 번호로 예약 작업을 찾아 접수 번호를 기록하고 이어간다', async () => {
    const response = await POST(webhookRequest())

    expect(response.status).toBe(200)
    expect(mocks.getGenerationJobById).toHaveBeenCalledWith('job 1')
    expect(mocks.confirmGenerationJobReceipt).toHaveBeenCalledWith('job 1', 'project-1', {
      request_id: 'fal-1',
      model: 'fal-ai/model',
      fal_key_id: 'key-1',
    })
    expect(mocks.finalizeGenerationJob).toHaveBeenCalledTimes(1)
    expect(mocks.finalizeGenerationJob.mock.calls[0][0]).toMatchObject({ id: 'job 1', request_id: 'fal-1' })
  })

  it('접수 번호 기록이 실패해도 성공으로 답하고 저장은 하지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.confirmGenerationJobReceipt.mockRejectedValue(new Error('db down'))

    const response = await POST(webhookRequest())

    expect(response.status).toBe(200)
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('작업 번호로 찾은 작업이 예약 상태가 아니면 접수 번호를 덧쓰지 않는다', async () => {
    mocks.getGenerationJobById.mockResolvedValue(reservedJob({ request_id: 'fal-other' }))
    const response = await POST(webhookRequest())
    expect(response.status).toBe(200)

    mocks.getGenerationJobById.mockResolvedValue(reservedJob({ status: 'completed' }))
    await POST(webhookRequest())

    mocks.getGenerationJobById.mockResolvedValue(reservedJob({ fal_key_id: null }))
    await POST(webhookRequest())

    expect(mocks.confirmGenerationJobReceipt).not.toHaveBeenCalled()
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
  })

  it('작업 번호도 없거나 그 작업도 없으면 종전처럼 무시하고 성공으로 답한다', async () => {
    const noParam = await POST(webhookRequest(''))
    expect(noParam.status).toBe(200)
    expect(mocks.getGenerationJobById).not.toHaveBeenCalled()

    mocks.getGenerationJobById.mockResolvedValue(null)
    const noJob = await POST(webhookRequest())
    expect(noJob.status).toBe(200)

    expect(mocks.confirmGenerationJobReceipt).not.toHaveBeenCalled()
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
  })
})
