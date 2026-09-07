// 작업을 중복으로 끝내지 않고, 결과와 실패를 정확히 기록하며 잘못된 요청은 실행하지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))

import {
  completeGenerationJob,
  countFailedJobsForTarget,
  countQueuedJobsByUser,
  createGenerationJob,
  failGenerationJob,
  GenerationJobLinkedVideoTerminalizationError,
  GenerationJobTerminalTransitionError,
  listQueuedMainJobs,
  patchGenerationJobResponseSnapshotByRequestId,
  getGenerationJobById,
  userOwnsProject,
} from '@/lib/generation-jobs'

function query(result: unknown) {
  const value = {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    contains: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  value.insert.mockReturnValue(value)
  value.update.mockReturnValue(value)
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.gte.mockReturnValue(value)
  value.order.mockReturnValue(value)
  value.in.mockReturnValue(value)
  value.contains.mockReturnValue(value)
  value.is.mockReturnValue(value)
  value.maybeSingle.mockResolvedValue(result)
  value.single.mockResolvedValue(result)
  return value
}

describe('작업 종료 처리', () => {
  beforeEach(() => vi.resetAllMocks())
  it('처음 만들 때 내용이 없으면 빈 내용으로 기록한다', async () => {
    const creation = query({ data: { id: 'job-1' }, error: null })
    mocks.from.mockReturnValueOnce(creation)

    await createGenerationJob({
      projectId: 'project-1',
      requestId: 'request-1',
      model: 'model-1',
      kind: 'character_view',
      target: {
        workspaceId: 'workspace-1',
        characterId: 'character-1',
        appearanceKey: 'current',
        view: 'main',
      },
      workspaceId: 'workspace-1',
      userId: 'user-1',
      falKeyId: 'prod-2000',
    })

    expect(creation.insert).toHaveBeenCalledWith(expect.objectContaining({
      input_snapshot: {},
      fal_key_id: 'prod-2000',
    }))
  })

  it('이미 끝난 작업은 같은 결과 주소일 때만 그대로 인정한다', async () => {
    const casMiss = query({ data: null, error: null })
    const exactReplay = query({ data: { status: 'completed', result_url: 'https://media.test/a.mp4', error: null, last_error: 'old failure' }, error: null })
    mocks.from.mockReturnValueOnce(casMiss).mockReturnValueOnce(exactReplay)

    await expect(completeGenerationJob('job-1', 'https://media.test/a.mp4')).resolves.toBeUndefined()

    const mismatch = query({ data: null, error: null })
    const mismatchedReplay = query({ data: { status: 'completed', result_url: 'https://media.test/b.mp4', error: null, last_error: null }, error: null })
    mocks.from.mockReturnValueOnce(mismatch).mockReturnValueOnce(mismatchedReplay)
    await expect(completeGenerationJob('job-1', 'https://media.test/a.mp4'))
      .rejects.toBeInstanceOf(GenerationJobTerminalTransitionError)
  })

  it('이미 끝난 작업의 결과가 다르면 거절하고, 같은 실패만 그대로 인정한다', async () => {
    const completedMiss = query({ data: null, error: null })
    const failedCurrent = query({ data: { status: 'failed', result_url: null, error: 'provider failed', last_error: 'provider failed' }, error: null })
    mocks.from.mockReturnValueOnce(completedMiss).mockReturnValueOnce(failedCurrent)
    await expect(completeGenerationJob('job-1', 'https://media.test/a.mp4'))
      .rejects.toBeInstanceOf(GenerationJobTerminalTransitionError)

    const failedMiss = query({ data: null, error: null })
    const completedCurrent = query({ data: { status: 'completed', result_url: 'https://media.test/a.mp4', error: null, last_error: null }, error: null })
    mocks.from.mockReturnValueOnce(failedMiss).mockReturnValueOnce(completedCurrent)
    await expect(failGenerationJob('job-1', 'provider failed'))
      .rejects.toBeInstanceOf(GenerationJobTerminalTransitionError)

    const exactMiss = query({ data: null, error: null })
    const exactFailure = query({ data: { status: 'failed', result_url: null, error: 'provider failed', last_error: 'provider failed' }, error: null })
    mocks.from.mockReturnValueOnce(exactMiss).mockReturnValueOnce(exactFailure)
    await expect(failGenerationJob('job-1', 'provider failed')).resolves.toBeUndefined()
  })

  it('대기 중인 작업이 실패하면 끝난 시각을 기록한다', async () => {
    const transition = query({ data: { id: 'job-1' }, error: null })
    mocks.from.mockReturnValueOnce(transition)
    await failGenerationJob('job-1', 'provider failed')
    expect(transition.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      completed_at: expect.any(String),
    }))
  })
  it('끝난 근거가 비어 있으면 아무것도 바꾸지 않고 거절한다', async () => {
    await expect(completeGenerationJob('job-1', '   ')).rejects.toThrow(/nonblank/)
    await expect(failGenerationJob('job-1', '\t')).rejects.toThrow(/nonblank/)
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('영상 조각에 연결된 작업은 일반 종료 처리로 바꾸지 않고 연결되지 않은 작업만 처리한다', async () => {
    const completionMiss = query({ data: null, error: null })
    const linkedCompletion = query({
      data: { kind: 'shot_video', video_clip_id: 'clip-1', status: 'completed', result_url: 'https://media.test/a.mp4', error: null, last_error: null },
      error: null,
    })
    mocks.from.mockReturnValueOnce(completionMiss).mockReturnValueOnce(linkedCompletion)

    await expect(completeGenerationJob('job-1', 'https://media.test/a.mp4'))
      .rejects.toBeInstanceOf(GenerationJobLinkedVideoTerminalizationError)
    expect(completionMiss.is).toHaveBeenCalledWith('video_clip_id', null)

    const failureMiss = query({ data: null, error: null })
    const linkedFailure = query({
      data: { kind: 'shot_video', video_clip_id: 'clip-1', status: 'failed', result_url: null, error: 'provider failed', last_error: 'provider failed' },
      error: null,
    })
    mocks.from.mockReturnValueOnce(failureMiss).mockReturnValueOnce(linkedFailure)

    await expect(failGenerationJob('job-1', 'provider failed'))
      .rejects.toBeInstanceOf(GenerationJobLinkedVideoTerminalizationError)
    expect(failureMiss.is).toHaveBeenCalledWith('video_clip_id', null)
    expect(linkedCompletion.select).toHaveBeenCalledWith(expect.stringContaining('video_clip_id'))
    expect(linkedCompletion.select).toHaveBeenCalledWith(expect.stringContaining('kind'))
  })

  it('작업을 조회하면 응답 내용을 함께 보여준다', async () => {
    const read = query({
      data: {
        id: 'job-1',
        response_snapshot: {
          submission_resolution: { state: 'manual_recovery_required' },
        },
      },
      error: null,
    })
    mocks.from.mockReturnValueOnce(read)

    await expect(getGenerationJobById('job-1')).resolves.toMatchObject({
      response_snapshot: { submission_resolution: { state: 'manual_recovery_required' } },
    })
    expect(read.select).toHaveBeenCalledWith(expect.stringContaining('response_snapshot'))
  })
  it('응답 내용 일부를 바꿀 때 한 번에 안전하게 처리하고 요청 형식을 확인한다', async () => {
    mocks.rpc.mockResolvedValue({ error: null })

    await Promise.all([
      patchGenerationJobResponseSnapshotByRequestId('request-1', { callback: { state: 'received' } }),
      patchGenerationJobResponseSnapshotByRequestId('request-1', { provider: { requestId: 'provider-1' } }),
    ])
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'patch_generation_job_response_snapshot', {
      p_request_id: 'request-1',
      p_patch: { callback: { state: 'received' } },
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'patch_generation_job_response_snapshot', {
      p_request_id: 'request-1',
      p_patch: { provider: { requestId: 'provider-1' } },
    })
    expect(mocks.from).not.toHaveBeenCalled()

    await expect(patchGenerationJobResponseSnapshotByRequestId('request-1', [])).rejects.toThrow(/JSON object/)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('응답 내용을 바꿀 요청 번호가 비어 있으면 실행하지 않고 거절한다', async () => {
    await expect(patchGenerationJobResponseSnapshotByRequestId('   ', { callback: true }))
      .rejects.toThrow(/request ID must be nonblank/)
    expect(mocks.rpc).not.toHaveBeenCalled()
    await expect(patchGenerationJobResponseSnapshotByRequestId(undefined as unknown as string, { callback: true }))
      .rejects.toThrow(/request ID must be nonblank/)
  })

  it('대상 작업이 없거나 응답 내용 변경 중 다른 오류가 나면 그대로 알린다', async () => {
    const rpcError = { message: 'generation job request ID was not found' }
    mocks.rpc.mockResolvedValue({ error: rpcError })

    await expect(patchGenerationJobResponseSnapshotByRequestId('request-1', { callback: true }))
      .rejects.toBe(rpcError)
  })

  it('권한 확인과 목록·개수 확인에서 난 오류를 그대로 알린다', async () => {
    const ownershipError = { message: 'project unavailable' }
    const listError = { message: 'list unavailable' }
    const countError = { message: 'count unavailable' }
    mocks.from.mockReturnValueOnce(query({ data: null, error: ownershipError }))
    await expect(userOwnsProject('project-1', 'user-1')).rejects.toBe(ownershipError)
    mocks.from.mockReturnValueOnce(query({ data: null, error: listError }))
    await expect(listQueuedMainJobs('project-1')).rejects.toBe(listError)
    mocks.from.mockReturnValueOnce(query({ count: null, error: countError }))
    await expect(countFailedJobsForTarget('project-1', 'shot_video', {})).rejects.toBe(countError)
  })

  it('제공처나 시스템에서 난 일시 오류는 포기 횟수에 세지 않는다 (#error-class 오너 정책 2026-08-13)', async () => {
    // 일시 인프라 실패는 예산 무차감 — 빈칸 자율 채움이 백그라운드에서 계속 재시도한다.
    // 미태깅(null)은 보수적으로 센다(게이트가 약해지는 방향의 실수 방지).
    mocks.from.mockReturnValueOnce(
      query({
        data: [
          { error_class: 'provider' },
          { error_class: 'infra' },
          { error_class: 'bad_request' },
          { error_class: null },
        ],
        error: null,
      }),
    )
    await expect(countFailedJobsForTarget('project-1', 'shot_video', {})).resolves.toBe(2)
  })

  it('작업 수 확인에서 예전 형식의 특정 오류일 때만 다른 방식으로 다시 확인한다', async () => {
    const legacyError = { code: 'PGRST204', message: "Could not find the 'user_id' column of 'generation_jobs' in the schema cache" }
    mocks.from
      .mockReturnValueOnce(query({ count: null, error: legacyError }))
      .mockReturnValueOnce(query({ data: [], error: null }))
    await expect(countQueuedJobsByUser('user-1')).resolves.toBe(0)

    const nearMiss = { code: 'PGRST204', message: 'different schema cache error' }
    mocks.from.mockReturnValueOnce(query({ count: null, error: nearMiss }))
    await expect(countQueuedJobsByUser('user-1')).rejects.toBe(nearMiss)

    const fallbackError = { message: 'workspace unavailable' }
    mocks.from
      .mockReturnValueOnce(query({ count: null, error: legacyError }))
      .mockReturnValueOnce(query({ data: null, error: fallbackError }))
    await expect(countQueuedJobsByUser('user-1')).rejects.toBe(fallbackError)
  })
})
