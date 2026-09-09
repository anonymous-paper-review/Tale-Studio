// 생성 완료 알림은 받은 사실만 적고 바로 답한다
//
// 예전에는 응답 전에 finalize 를 통째로 돌렸다 — 영상 다운로드(최대 128MB, 제한 45초) + 스토리지
// 업로드 + DB 갱신. fal 은 15초만 기다리므로(route.ts:7 주석) 그걸 넘기면 실패로 보고 같은 알림을
// 다시 보냈고, 우리 함수 자체도 maxDuration 60 초라 그마저 넘기면 죽었다. 그 사이 멱등 가드
// (status==='queued' 검사)와 실제 상태 변경 사이가 벌어져 재전송이 둘 다 통과할 수 있었다.
//
// 이제 응답을 먼저 보내고 after() 안에서 finalize 를 돌린다. fal 은 즉시 2xx 를 받고 재전송하지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyFalWebhook: vi.fn(),
  getGenerationJobByRequestId: vi.fn(),
  finalizeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  markDirectorVideoAttemptFailed: vi.fn(),
  releaseTakesForJob: vi.fn(),
  reconcileJobFromFal: vi.fn(),
  after: vi.fn(),
  order: [] as string[],
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => {
    mocks.after(fn)
    // 실제 after 는 응답이 나간 뒤 실행한다. 여기서는 등록만 기록하고 즉시 돌려 결과를 확인한다.
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

function queuedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    project_id: 'project-1',
    kind: 'shot_video',
    status: 'queued',
    request_id: 'fal-1',
    video_clip_id: 'clip-1',
    ...overrides,
  }
}

function webhookRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/fal/webhook', {
    method: 'POST',
    body: JSON.stringify({ request_id: 'fal-1', status: 'OK', ...body }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order = []
  mocks.verifyFalWebhook.mockResolvedValue(true)
  mocks.getGenerationJobByRequestId.mockResolvedValue(queuedJob())
  mocks.finalizeGenerationJob.mockImplementation(async () => {
    mocks.order.push('finalize')
    return 'https://cdn/out.mp4'
  })
})

describe('생성 완료 알림 처리', () => {
  it('무거운 저장 작업은 응답을 보낸 뒤에 한다', async () => {
    const response = await POST(webhookRequest({ payload: { video: { url: 'https://fal/out.mp4' } } }))

    expect(response.status).toBe(200)
    // finalize 를 응답 전에 부르면 fal 15초·자체 60초 예산을 넘겨 재전송 루프가 된다.
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })

  it('결과 주소가 없으면 저장을 시도하지 않는다', async () => {
    const response = await POST(webhookRequest({ payload: {} }))

    expect(response.status).toBe(200)
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
  })

  it('서명이 맞지 않으면 아무것도 하지 않는다', async () => {
    mocks.verifyFalWebhook.mockResolvedValue(false)

    const response = await POST(webhookRequest({ payload: { video: { url: 'https://fal/out.mp4' } } }))

    expect(response.status).toBe(401)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('이미 처리된 작업은 다시 저장하지 않는다', async () => {
    mocks.getGenerationJobByRequestId.mockResolvedValue(queuedJob({ status: 'completed' }))

    const response = await POST(webhookRequest({ payload: { video: { url: 'https://fal/out.mp4' } } }))

    expect(response.status).toBe(200)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('저장이 실패해도 알림에는 성공으로 답한다', async () => {
    // 실패를 알리면 fal 이 같은 알림을 다시 보낸다. 재시도는 우리 쪽 구제 경로가 맡는다.
    mocks.finalizeGenerationJob.mockRejectedValue(new Error('storage 503'))

    const response = await POST(webhookRequest({ payload: { video: { url: 'https://fal/out.mp4' } } }))

    expect(response.status).toBe(200)
  })
})
