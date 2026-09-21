// 수동 이미지·단일 러프 편집은 예약한 FAL 키로 한 번 제출하고, 완료 URL만 기록한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  submit: vi.fn(),
  confirm: vi.fn(),
  fetch: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  reject: vi.fn(),
  dbFrom: vi.fn(),
  patchSnapshot: vi.fn(),
}))

vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: mocks.reserve,
  confirmGenerationJobReceipt: mocks.confirm,
  completeGenerationJob: mocks.complete,
  failGenerationJob: mocks.fail,
  rejectGenerationJobReservation: mocks.reject,
  patchGenerationJobResponseSnapshotByRequestId: mocks.patchSnapshot,
}))
vi.mock('@/lib/writer/llm/fal', () => ({
  DEFAULT_IMAGE_MODEL: 'openai/gpt-image-2',
  falImageSubmit: mocks.submit,
  falImageFetch: mocks.fetch,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.dbFrom } }))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: vi.fn(() => ({})) }))

import { finalizeGenerationJob } from '@/lib/fal/finalize'
import { generateReservedImage } from '@/lib/fal/generate-image'

const options = {
  model: 'xai/grok-imagine-image/edit',
  prompt: 'clean this frame',
  reference_image_urls: ['https://media.example/reference.png'],
}
const context = {
  projectId: 'project-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
}
const job = {
  id: 'job-1',
  project_id: context.projectId,
  request_id: 'reserved:job-1',
  model: options.model,
  kind: 'image_generation' as const,
  status: 'queued' as const,
  target: {},
  video_clip_id: null,
  idempotency_key: null,
  result_url: null,
  error: null,
  fal_key_id: 'key-b',
  provider: 'fal',
  input_snapshot: {},
  response_snapshot: null,
}
const receipt = {
  request_id: 'fal-request-1',
  model: options.model,
  fal_request: { prompt: options.prompt },
  fal_key_id: 'key-b',
}
const completed = {
  status: 'COMPLETED' as const,
  url: 'https://cdn.example/result.png',
  width: 1024,
  height: 768,
  raw: { images: [{ url: 'https://cdn.example/result.png' }] },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  mocks.reserve.mockResolvedValue(job)
  mocks.submit.mockResolvedValue(receipt)
  mocks.confirm.mockResolvedValue(undefined)
  mocks.fetch.mockResolvedValue(completed)
  mocks.complete.mockResolvedValue(undefined)
  mocks.fail.mockResolvedValue(undefined)
  mocks.reject.mockResolvedValue(undefined)
  mocks.patchSnapshot.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('예약된 동기 이미지 생성', () => {
  it('예약→제출→접수 확인→조회→완료 순서를 지킨다', async () => {
    const result = await generateReservedImage(options, context)

    expect(result).toEqual({
      url: completed.url,
      width: completed.width,
      height: completed.height,
      raw: completed.raw,
    })
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      projectId: context.projectId,
      userId: context.userId,
      workspaceId: context.workspaceId,
      kind: 'image_generation',
      model: options.model,
      target: {},
    }))
    expect(mocks.submit).toHaveBeenCalledWith(options, { retry: false, falKeyId: 'key-b' })
    expect(mocks.confirm).toHaveBeenCalledWith(job.id, context.projectId, receipt)
    expect(mocks.fetch).toHaveBeenCalledWith(receipt.model, receipt.request_id, 'key-b')
    expect(mocks.complete).toHaveBeenCalledWith(job.id, completed.url)
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.submit.mock.invocationCallOrder[0])
    expect(mocks.submit.mock.invocationCallOrder[0]).toBeLessThan(mocks.confirm.mock.invocationCallOrder[0])
    expect(mocks.confirm.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0])
    expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0])
  })

  it('예약 행이 고른 B 키를 제출과 모든 조회에 사용한다', async () => {
    await generateReservedImage({ prompt: 'one image' }, { projectId: context.projectId })

    expect(mocks.submit).toHaveBeenCalledWith(
      { prompt: 'one image' },
      { retry: false, falKeyId: 'key-b' },
    )
    expect(mocks.fetch).toHaveBeenCalledWith(receipt.model, receipt.request_id, 'key-b')
  })

  it('자리 예약이 꽉 차면 외부 유료 호출을 하지 않는다', async () => {
    const error = new Error('image_user_at_capacity')
    mocks.reserve.mockRejectedValue(error)

    await expect(generateReservedImage(options, context)).rejects.toBe(error)
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('키 조회처럼 접수 여부가 불명확한 제출 오류는 예약을 유지하고 재제출하지 않는다', async () => {
    const error = new Error('fal key lookup failed')
    mocks.submit.mockRejectedValue(error)

    await expect(generateReservedImage(options, context)).rejects.toBe(error)
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })

  it('확인 번호 기록이 실패하면 예약을 유지하고 조회·재제출하지 않는다', async () => {
    const error = new Error('receipt persistence failed')
    mocks.confirm.mockRejectedValue(error)

    await expect(generateReservedImage(options, context)).rejects.toBe(error)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })

  it('명시적인 4xx 제출 거절만 예약을 실패로 닫는다', async () => {
    const error = Object.assign(new Error('bad request'), { status: 400 })
    mocks.submit.mockRejectedValue(error)

    await expect(generateReservedImage(options, context)).rejects.toBe(error)
    expect(mocks.reject).toHaveBeenCalledWith(job.id, context.projectId, error.message)
  })

  it('5xx 조회 오류는 실패 전이 없이 예약을 보존한다', async () => {
    const error = Object.assign(new Error('provider unavailable'), { status: 503 })
    mocks.fetch.mockRejectedValue(error)

    await expect(generateReservedImage(options, context)).rejects.toBe(error)
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('조회 시간 초과는 실패 전이 없이 예약을 보존한다', async () => {
    vi.useFakeTimers()
    mocks.fetch.mockResolvedValue({ status: 'IN_PROGRESS' as const })

    const pending = generateReservedImage(options, context)
    const rejected = expect(pending).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(90 * 1000 + 1)

    await rejected
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })

  it('제공자가 명시적으로 FAILED를 반환할 때만 실패 전이하고 유료 호출은 한 번이다', async () => {
    mocks.fetch.mockResolvedValue({ status: 'FAILED' as const, error: 'provider rejected image' })

    await expect(generateReservedImage(options, context)).rejects.toThrow('provider rejected image')
    expect(mocks.fail).toHaveBeenCalledWith(job.id, 'provider rejected image')
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })

  it('완료되면 URL만 image_generation 작업에 기록하고 반환한다', async () => {
    const result = await finalizeGenerationJob(
      job,
      { media: 'image', url: completed.url, payload: completed.raw },
    )

    expect(result).toBe(completed.url)
    expect(mocks.complete).toHaveBeenCalledWith(job.id, completed.url)
    expect(mocks.dbFrom).not.toHaveBeenCalled()
  })
})
