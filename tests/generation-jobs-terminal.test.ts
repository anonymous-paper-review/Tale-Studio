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

describe('generation job terminal CAS helpers', () => {
  beforeEach(() => vi.resetAllMocks())
  it('stores an empty object when inputSnapshot is omitted at creation', async () => {
    const creation = query({ data: { id: 'job-1' }, error: null })
    mocks.from.mockReturnValueOnce(creation)

    await createGenerationJob({
      projectId: 'project-1',
      requestId: 'request-1',
      model: 'model-1',
      kind: 'character_view',
      target: {},
      workspaceId: 'workspace-1',
      userId: 'user-1',
    })

    expect(creation.insert).toHaveBeenCalledWith(expect.objectContaining({
      input_snapshot: {},
    }))
  })

  it('accepts only an exact completed replay with its result URL', async () => {
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

  it('rejects opposite terminal outcomes and only replays the exact failure', async () => {
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

  it('records completed_at when failing a queued job', async () => {
    const transition = query({ data: { id: 'job-1' }, error: null })
    mocks.from.mockReturnValueOnce(transition)
    await failGenerationJob('job-1', 'provider failed')
    expect(transition.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      completed_at: expect.any(String),
    }))
  })
  it('rejects blank terminal evidence before issuing mutations', async () => {
    await expect(completeGenerationJob('job-1', '   ')).rejects.toThrow(/nonblank/)
    await expect(failGenerationJob('job-1', '\t')).rejects.toThrow(/nonblank/)
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('refuses linked shot_video jobs through generic terminal helpers and scopes both CAS mutations to unlinked rows', async () => {
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

  it('projects response_snapshot when reading a generation job by ID', async () => {
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
  it('delegates response-snapshot patches to the atomic RPC and validates patch shape', async () => {
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

  it('rejects blank response-snapshot request IDs before issuing the RPC', async () => {
    await expect(patchGenerationJobResponseSnapshotByRequestId('   ', { callback: true }))
      .rejects.toThrow(/request ID must be nonblank/)
    expect(mocks.rpc).not.toHaveBeenCalled()
    await expect(patchGenerationJobResponseSnapshotByRequestId(undefined as unknown as string, { callback: true }))
      .rejects.toThrow(/request ID must be nonblank/)
  })

  it('propagates missing-row and other response-snapshot RPC errors', async () => {
    const rpcError = { message: 'generation job request ID was not found' }
    mocks.rpc.mockResolvedValue({ error: rpcError })

    await expect(patchGenerationJobResponseSnapshotByRequestId('request-1', { callback: true }))
      .rejects.toBe(rpcError)
  })

  it('propagates ownership, list, and count query errors', async () => {
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

  it('uses the quota fallback only for the exact legacy schema-cache error', async () => {
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
