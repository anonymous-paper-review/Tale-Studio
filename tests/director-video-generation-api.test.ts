import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), userOwnsProject: vi.fn(), checkUserQuota: vi.fn(),
  reserveTake: vi.fn(), reserveRegeneration: vi.fn(), getJob: vi.fn(), attach: vi.fn(), fail: vi.fn(),
  from: vi.fn(), rpc: vi.fn(), submit: vi.fn(), finalize: vi.fn(), reconcile: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject, getGenerationJobById: mocks.getJob, getGenerationJobByRequestId: mocks.getJob }))
vi.mock('@/lib/generation-quota', () => ({ checkUserQuota: mocks.checkUserQuota, quotaExceededBody: () => ({ error: 'quota' }) }))
vi.mock('@/lib/director-video-takes', () => ({ reserveDirectorVideoTake: mocks.reserveTake, reserveDirectorVideoRegeneration: mocks.reserveRegeneration, attachProviderRequestToReservedVideoJob: mocks.attach, markDirectorVideoAttemptFailed: mocks.fail }))
vi.mock('@/lib/director/video-prompt', () => ({ buildVideoPrompt: () => ({ fullPrompt: 'prompt', prompt_parts: [] }) }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://webhook.test' }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/fal/finalize', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/fal/finalize')>(),
  finalizeShotVideoJob: mocks.finalize,
}))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcile }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), queue: { submit: mocks.submit } } }))

import { POST } from '@/app/api/director/generate-video/route'
import { GET as pollVideo } from '@/app/api/director/generate-video/[taskId]/route'

const key = '123e4567-e89b-12d3-a456-426614174000'
function request(extra: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/generate-video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'project-1', shotId: 'shot-1', prompt: 'A scene', idempotencyKey: key, ...extra }) })
}
function query(data: unknown) {
  const value = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), contains: vi.fn(), maybeSingle: vi.fn() }
  value.select.mockReturnValue(value); value.eq.mockReturnValue(value); value.is.mockReturnValue(value); value.contains.mockReturnValue(value)
  value.maybeSingle.mockResolvedValue({ data, error: null })
  return value
}
function reservedFalJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    request_id: 'reserved:job-1',
    provider: 'fal',
    model: 'stored-model',
    status: 'queued',
    input_snapshot: {
      prompt: 'A scene',
      full_prompt: 'prompt',
      prompt_parts: [],
      camera: null,
      duration_seconds: 5,
      aspect_ratio: '16:9',
      generation_method: 'T2V',
      provider: null,
      model: null,
      resolved_model_key: 'happy-horse',
      reference_image_url: null,
      movement_preset: null,
      camera_preset: null,
      new_take_metadata: {
        take_label: null,
        override: {},
        canvas_position: null,
      },
      fal_request: {
        model: 'fal-ai/kling-video/v2.1/master/text-to-video',
        input: {
          prompt: 'prompt',
          negative_prompt: 'blurry, low quality, distorted, deformed',
          duration: '5',
          aspect_ratio: '16:9',
        },
      },
    },
    ...overrides,
  }
}
function reservedRegenerationFalJob(overrides: Record<string, unknown> = {}) {
  const job = reservedFalJob(overrides)
  const { new_take_metadata: _newTakeMetadata, ...inputSnapshot } = job.input_snapshot
  void _newTakeMetadata
  return { ...job, input_snapshot: inputSnapshot }
}

function reservedLocalJob(overrides: Record<string, unknown> = {}) {
  const { fal_request: _falRequest, ...snapshot } = reservedFalJob().input_snapshot
  void _falRequest
  return reservedFalJob({
    provider: 'local',
    model: 'local',
    input_snapshot: {
      ...snapshot,
      provider: 'local',
      model: 'local',
      resolved_model_key: 'local',
    },
    ...overrides,
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' }); mocks.userOwnsProject.mockResolvedValue(true); mocks.checkUserQuota.mockResolvedValue({ ok: true })
  mocks.from.mockReturnValueOnce(query({ workspace_id: 'workspace-1' })).mockReturnValueOnce(query({ shot_id: 'shot-1' })).mockReturnValueOnce(query(null))
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})
describe('director video generation reservation', () => {
  it('reserves a new take and persists the provider-authoritative request', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 2, replayed: false })
    mocks.getJob.mockResolvedValueOnce(reservedFalJob())
    mocks.submit.mockResolvedValue({ request_id: 'fal-1' })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.reserveTake).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', shotId: 'shot-1', provider: 'fal' }))
    expect(mocks.attach).toHaveBeenCalledWith('project-1', 'job-1', 'fal-1', expect.objectContaining({ provider: 'fal' }))
  })
  it('uses regeneration reservation and returns attached replay without resubmitting', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(query({ id: 'job-1', video_clip_id: 'clip-1', target: { retakeMode: 'regeneration', writerShotId: 'shot-1', videoClipId: 'clip-1' } }))
      .mockReturnValueOnce(query({ id: 'clip-1', shot_id: 'shot-1' }))
    mocks.reserveRegeneration.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 2, replayed: true })
    mocks.getJob.mockResolvedValue({ id: 'job-1', request_id: 'fal-existing', provider: 'fal', model: 'stored-model', status: 'queued' })
    const response = await POST(request({ videoClipId: 'clip-1' }))
    expect(response.status).toBe(200)
    expect(mocks.reserveRegeneration).toHaveBeenCalledWith(expect.objectContaining({ videoClipId: 'clip-1', target: expect.objectContaining({ videoClipId: 'clip-1' }) }))
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.checkUserQuota).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ replayed: true, taskId: 'fal-existing', model: 'stored-model' })
  })
  it('validates regeneration ancestry before accepting a same-key recovery replay', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(query({ id: 'other-job', video_clip_id: 'clip-2', target: { retakeMode: 'regeneration' } }))
      .mockReturnValueOnce(query({ id: 'clip-2', shot_id: 'other-shot' }))

    const response = await POST(request({ videoClipId: 'clip-2', recoveryReceipt: 'wrong.receipt' }))

    expect(response.status).toBe(400)
    expect(mocks.checkUserQuota).not.toHaveBeenCalled()
    expect(mocks.reserveRegeneration).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('does not treat a same-key regeneration on another clip as a replay', async () => {
    mocks.from.mockReset()
    const replayLookup = query(null)
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(replayLookup)
      .mockReturnValueOnce(query({ id: 'clip-2', shot_id: 'shot-1' }))
    mocks.reserveRegeneration.mockResolvedValue({ video_clip_id: 'clip-2', job_id: 'job-2', take_number: 2, replayed: false })
    mocks.getJob.mockResolvedValue(reservedRegenerationFalJob({ id: 'job-2', request_id: 'reserved:job-2' }))
    mocks.submit.mockResolvedValue({ request_id: 'fal-2' })

    const response = await POST(request({ videoClipId: 'clip-2' }))

    expect(response.status).toBe(200)
    expect(replayLookup.eq).toHaveBeenCalledWith('video_clip_id', 'clip-2')
    expect(mocks.checkUserQuota).toHaveBeenCalledWith('user-1')
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })
  it('persists a submission failure and reports a failed attempt', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockRejectedValue(new Error('FAL terminal error'))
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(mocks.fail).toHaveBeenCalledWith('project-1', 'job-1', 'FAL terminal error')
    await expect(response.json()).resolves.toMatchObject({ status: 'failed' })
  })
  it('leaves a truly ambiguous submission queued for manual recovery without auto-resubmitting', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    const ambiguous = Object.assign(new Error('gateway timeout'), { status: 503 })
    mocks.submit.mockRejectedValue(ambiguous)
    mocks.rpc.mockResolvedValue({ data: true, error: null })

    const response = await POST(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ status: 'queued', unresolved: true, retryable: false })
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.attach).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('record_director_video_submission_resolution', {
      p_project_id: 'project-1',
      p_job_id: 'job-1',
      p_provider_status: 503,
      p_cause: 'gateway timeout',
      p_code: 'HTTP_503',
    })
  })
  it('treats a zero-row ambiguity resolution CAS as retryable persistence failure', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockRejectedValue(Object.assign(new Error('gateway timeout'), { status: 503 }))
    mocks.rpc.mockResolvedValue({ data: false, error: null })

    const response = await POST(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      status: 'queued',
      retryable: true,
      unresolved: true,
    })
  })
  it('accepts reordered JSON replay snapshots without submitting twice', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    const baseJob = reservedFalJob()
    const job = {
      ...baseJob,
      input_snapshot: {
        ...baseJob.input_snapshot,
        camera: { zoom: 1, pan: 'left' },
      },
    }
    mocks.getJob.mockResolvedValue(job)

    const response = await POST(request({ camera: { pan: 'left', zoom: 1 } }))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Reserved video submission state is unknown; a valid recovery receipt is required',
      status: 'queued',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
})
})
describe('reserved replay recovery', () => {
  it('does not resubmit a replayed reservation whose provider state is unknown', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValueOnce(reservedFalJob())

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      jobId: 'job-1',
      status: 'queued',
      retryable: false,
    })
  })
  it('accepts a replayed pre-438 new-take snapshot without metadata', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    const job = reservedFalJob()
    const { new_take_metadata: _legacyMetadata, ...legacySnapshot } = job.input_snapshot
    void _legacyMetadata
    mocks.getJob.mockResolvedValue({ ...job, input_snapshot: legacySnapshot })

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Reserved video submission state is unknown; a valid recovery receipt is required',
      status: 'queued',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('rejects a replayed new-take snapshot whose stored metadata differs', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    const job = reservedFalJob()
    mocks.getJob.mockResolvedValue({
      ...job,
      input_snapshot: {
        ...job.input_snapshot,
        new_take_metadata: { take_label: 'Stored', override: {}, canvas_position: null },
      },
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'idempotencyKey replay does not match the reserved video input',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('returns recovery details when the failure transition itself cannot persist', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockRejectedValue(new Error('provider unavailable'))
    mocks.fail.mockRejectedValue(new Error('fail RPC unavailable'))
    const response = await POST(request())
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ status: 'generating', retryable: true, transitionError: 'fail RPC unavailable' })
  })
  it('submits a fresh reservation from its immutable FAL snapshot', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockResolvedValue({ request_id: 'fal-replayed' })

    await POST(request())

    expect(mocks.submit).toHaveBeenCalledWith(
      'fal-ai/kling-video/v2.1/master/text-to-video',
      expect.objectContaining({
        input: {
          prompt: 'prompt',
          negative_prompt: 'blurry, low quality, distorted, deformed',
          duration: '5',
          aspect_ratio: '16:9',
        },
      }),
    )
  })

  it('rejects changed replay inputs without submitting provider work', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob())

    const response = await POST(request({ prompt: 'Changed scene' }))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'idempotencyKey replay does not match the reserved video input',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('returns terminal jobs without resubmitting reserved placeholders', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob({ status: 'failed' }))

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.submit).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ status: 'failed' })
  })

  it('returns the provider recovery handle when request attachment fails', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockResolvedValue({ request_id: 'fal-live' })
    mocks.attach.mockRejectedValue(new Error('attach RPC unavailable'))

    const response = await POST(request())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      recoveryReceipt: expect.any(String),
      status: 'generating',
      retryable: true,
    })
    expect(mocks.fail).not.toHaveBeenCalled()
  })
  it('recovers a failed FAL attachment from its signed receipt without a second submission', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(query(null))
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(query({ id: 'job-1', video_clip_id: 'clip-1', target: { retakeMode: 'new_take', writerShotId: 'shot-1' } }))
    mocks.reserveTake
      .mockResolvedValueOnce({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
      .mockResolvedValueOnce({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockResolvedValue({ request_id: 'fal-live' })
    mocks.attach.mockRejectedValueOnce(new Error('attach RPC unavailable')).mockResolvedValueOnce(undefined)

    const first = await POST(request())
    expect(first.status).toBe(500)
    const { recoveryReceipt } = await first.json() as { recoveryReceipt: string }

    const recovered = await POST(request({ recoveryReceipt }))

    expect(recovered.status).toBe(200)
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.checkUserQuota).toHaveBeenCalledTimes(1)
    expect(mocks.attach).toHaveBeenLastCalledWith('project-1', 'job-1', 'fal-live', expect.objectContaining({ provider: 'fal' }))
    await expect(recovered.json()).resolves.toMatchObject({ jobId: 'job-1', videoClipId: 'clip-1', status: 'generating' })
  })

  it.each([
    ['take label', { takeLabel: 'Alternate cut' }],
    ['override', { override: { seed: 7 } }],
    ['canvas position', { canvasPosition: { x: 12, y: 24 } }],
  ])('rejects changed new-take %s on a replay without submitting provider work', async (_name, changedMetadata) => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob())

    const response = await POST(request(changedMetadata))

    expect(response.status).toBe(409)
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized raw provider handle as a conflicting operation', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(query({ id: 'job-1' }))
    mocks.reserveTake.mockResolvedValue({
      video_clip_id: 'clip-1',
      job_id: 'job-1',
      take_number: 1,
      replayed: true,
    })
    mocks.getJob.mockResolvedValue(reservedFalJob())

    const response = await POST(request({ providerTaskId: 'fal-live' }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'idempotencyKey is already reserved for a different video operation',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
  })

  it('keeps a local job queued when immutable upload landed but completion persistence failed', async () => {
    const { DirectorVideoCompletionPersistenceError } = await import('@/lib/fal/finalize')
    mocks.reserveTake.mockResolvedValue({
      video_clip_id: 'clip-1',
      job_id: 'job-1',
      take_number: 1,
      replayed: false,
    })
    mocks.getJob
      .mockResolvedValueOnce(reservedLocalJob())
      .mockResolvedValueOnce({
        id: 'job-1',
        request_id: 'http://local.test/video.mp4',
        provider: 'local',
        model: 'hunyuan-t2v',
      })
    mocks.finalize.mockRejectedValue(
      new DirectorVideoCompletionPersistenceError(
        'provider_fetch_retryable',
        new Error('database temporarily unavailable'),
      ),
    )
    vi.stubEnv('TAILSCALE_VIDEO_API_URL', 'http://local.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ output_url: '/video.mp4' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    try {
      const response = await POST(request({ provider: 'local', model: 'local' }))
      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toMatchObject({
        status: 'generating',
        retryable: true,
        jobId: 'job-1',
        videoClipId: 'clip-1',
      })
      expect(mocks.fail).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })
})
describe('recovery input safety', () => {
  it('rejects tampered recovery input without terminalizing the queued attempt', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob())

    const response = await POST(request({ recoveryReceipt: 'tampered.receipt' }))

    expect([400, 409]).toContain(response.status)
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
  })

  it('terminalizes fresh off-origin local provider output rather than stranding the attempt', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedLocalJob())
    vi.stubEnv('TAILSCALE_VIDEO_API_URL', 'http://local.test/api')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_url: 'http://evil.test/video.mp4' }), { headers: { 'content-type': 'application/json' } })))
    try {
      const response = await POST(request({ provider: 'local', model: 'local' }))
      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toMatchObject({ status: 'failed' })
      expect(mocks.fail).toHaveBeenCalledWith(
        'project-1',
        'job-1',
        expect.stringContaining('Local provider returned invalid output URL'),
      )
      expect(mocks.attach).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })
})
describe('director video polling contract', () => {
  const poll = (taskId = 'fal-1') => pollVideo(new Request(`http://test/api/director/generate-video/${taskId}`), { params: Promise.resolve({ taskId }) })

  it.each([
    ['unauthenticated', null, undefined, 401, { error: 'Unauthorized' }],
    ['missing', { id: 'user-1' }, null, 404, { error: 'Video job not found' }],
  ])('returns %s polling result without reconciliation', async (_name, user, job, status, body) => {
    mocks.getUser.mockResolvedValue(user)
    mocks.getJob.mockResolvedValue(job)
    const response = await poll()
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toMatchObject(body)
  })

  it('rejects a job owned by another user before reconciling it', async () => {
    mocks.getJob.mockResolvedValue({ ...reservedFalJob(), request_id: 'fal-1', project_id: 'project-1' })
    mocks.userOwnsProject.mockResolvedValue(false)
    const response = await poll()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it.each([
    ['pending', { ...reservedFalJob(), request_id: 'fal-1', status: 'queued' }, { ...reservedFalJob(), request_id: 'fal-1', status: 'queued' }, { status: 'generating' }],
    ['completed', { ...reservedFalJob(), request_id: 'fal-1', status: 'completed', result_url: 'https://media.test/video.mp4' }, undefined, { status: 'completed', url: 'https://media.test/video.mp4' }],
    ['failed', { ...reservedFalJob(), request_id: 'fal-1', status: 'failed', error: 'provider failed' }, undefined, { status: 'failed', error: 'provider failed' }],
  ])('returns %s provider state', async (_name, initial, reconciled, body) => {
    mocks.getJob.mockResolvedValue(initial)
    mocks.reconcile.mockResolvedValue(reconciled ?? initial)
    const response = await poll()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(body)
  })

  it('returns a server error when reconciliation cannot establish state', async () => {
    mocks.getJob.mockResolvedValue({ ...reservedFalJob(), request_id: 'fal-1', status: 'queued' })
    mocks.reconcile.mockRejectedValue(new Error('reconciliation unavailable'))
    const response = await poll()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'reconciliation unavailable' })
  })
  it.each([
    ['completed', { ...reservedFalJob(), request_id: 'fal-1', status: 'completed', result_url: 'https://media.test/video.mp4' }, { status: 'completed', url: 'https://media.test/video.mp4' }],
    ['failed', { ...reservedFalJob(), request_id: 'fal-1', status: 'failed', error: 'provider failed' }, { status: 'failed', error: 'provider failed' }],
  ])('reconciles a queued poll to %s provider state', async (_name, reconciled, expected) => {
    mocks.getJob.mockResolvedValue({ ...reservedFalJob(), request_id: 'fal-1', status: 'queued' })
    mocks.reconcile.mockResolvedValue(reconciled)
    const response = await pollVideo(
      new Request('http://test/api/director/generate-video/fal-1'),
      { params: Promise.resolve({ taskId: 'fal-1' }) },
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(expected)
  })
})
describe('signed recovery receipts', () => {
  function receipt(payload: Record<string, unknown>) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = createHmac('sha256', 'director-video-recovery:test-service-role-key').update(encoded).digest('base64url')
    return `${encoded}.${signature}`
  }

  function replayedLocalReservation() {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(query({ id: 'job-1', video_clip_id: 'clip-1', target: { retakeMode: 'new_take', writerShotId: 'shot-1' } }))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedLocalJob())
  }

  it('attaches only a valid matching local receipt and never resubmits provider work', async () => {
    replayedLocalReservation()
    vi.stubEnv('TAILSCALE_VIDEO_API_URL', 'http://local.test/api')
    try {
      const response = await POST(request({
        provider: 'local',
        model: 'local',
        recoveryReceipt: receipt({
          projectId: 'project-1', jobId: 'job-1', provider: 'local', model: 'hunyuan-t2v',
          taskId: 'http://local.test/api/tasks/1', exp: Date.now() + 60_000,
        }),
      }))
      expect(response.status).toBe(200)
      expect(mocks.attach).toHaveBeenCalledWith('project-1', 'job-1', 'http://local.test/api/tasks/1', expect.objectContaining({ provider: 'local', model: 'hunyuan-t2v' }))
      expect(mocks.submit).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ['tampered', (value: string) => `${value}x`, 400],
    ['expired', () => receipt({ projectId: 'project-1', jobId: 'job-1', provider: 'local', model: 'hunyuan-t2v', taskId: 'http://local.test/api/tasks/1', exp: Date.now() - 1 }), 409],
  ])('rejects %s receipts without attaching or submitting', async (_name, mutate, expectedStatus) => {
    replayedLocalReservation()
    vi.stubEnv('TAILSCALE_VIDEO_API_URL', 'http://local.test/api')
    try {
      const valid = receipt({ projectId: 'project-1', jobId: 'job-1', provider: 'local', model: 'hunyuan-t2v', taskId: 'http://local.test/api/tasks/1', exp: Date.now() + 60_000 })
      const response = await POST(request({ provider: 'local', model: 'local', recoveryReceipt: mutate(valid) }))
      expect(response.status).toBe(expectedStatus)
      expect(mocks.attach).not.toHaveBeenCalled()
      expect(mocks.submit).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ['project', { projectId: 'project-2' }, 409],
    ['job', { jobId: 'job-2' }, 409],
    ['provider', { provider: 'fal', model: 'hunyuan-t2v', taskId: 'fal-1' }, 409],
    ['model', { provider: 'local', model: 'other', taskId: 'http://local.test/api/tasks/1' }, 409],
    ['off-origin local task', { provider: 'local', model: 'hunyuan-t2v', taskId: 'http://evil.test/api/tasks/1' }, 400],
  ])('rejects %s receipt mismatches without attaching or submitting', async (_name, override, expectedStatus) => {
    replayedLocalReservation()
    vi.stubEnv('TAILSCALE_VIDEO_API_URL', 'http://local.test/api')
    try {
      const response = await POST(request({
        provider: 'local',
        model: 'local',
        recoveryReceipt: receipt({
          projectId: 'project-1',
          jobId: 'job-1',
          provider: 'local',
          model: 'hunyuan-t2v',
          taskId: 'http://local.test/api/tasks/1',
          exp: Date.now() + 60_000,
          ...override,
        }),
      }))
      expect(response.status).toBe(expectedStatus)
      expect(mocks.attach).not.toHaveBeenCalled()
      expect(mocks.submit).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
