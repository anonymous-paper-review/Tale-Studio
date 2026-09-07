// 영상 생성은 선택한 장면과 설정을 지키고, 실패한 요청은 안전하게 다시 이어간다
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), userOwnsProject: vi.fn(), checkGenerationCapacity: vi.fn(),
  reserveTake: vi.fn(), reserveRegeneration: vi.fn(), getJob: vi.fn(), attach: vi.fn(), fail: vi.fn(),
  updateMetadata: vi.fn(), from: vi.fn(), rpc: vi.fn(), submit: vi.fn(), finalize: vi.fn(), reconcile: vi.fn(), buildPrompt: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject, getGenerationJobById: mocks.getJob, getGenerationJobByRequestId: mocks.getJob }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: mocks.checkGenerationCapacity, quotaExceededBody: () => ({ error: 'quota' }), checkProjectVideoBudget: async () => ({ ok: true, used: 0, limit: 100 }), videoBudgetExceededBody: () => ({ error: 'video budget' }) }))
vi.mock('@/lib/director-video-takes', () => ({ reserveDirectorVideoTake: mocks.reserveTake, reserveDirectorVideoRegeneration: mocks.reserveRegeneration, updateDirectorVideoTakeMetadata: mocks.updateMetadata, attachProviderRequestToReservedVideoJob: mocks.attach, markDirectorVideoAttemptFailed: mocks.fail }))
vi.mock('@/lib/director/video-prompt', () => ({ buildVideoPrompt: mocks.buildPrompt }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://webhook.test' }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/fal/finalize', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/fal/finalize')>(),
  finalizeShotVideoJob: mocks.finalize,
}))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcile }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/fal/keys', () => ({
  pickFalKey: vi.fn(async () => ({ id: 'prod-2000', maxInflight: 40, client: { queue: { submit: mocks.submit } } })),
}))

import { POST } from '@/app/api/director/generate-video/route'
import { GET as pollVideo } from '@/app/api/director/generate-video/[taskId]/route'

const key = '123e4567-e89b-12d3-a456-426614174000'
// shots.storyboard_image 의 실제 JSONB 형태(src/lib/fal/finalize.ts strip 완료 시점) — 전 프로젝트 실측 전부 객체.
const PRODUCTION_STORYBOARD_IMAGE = {
  url: 'https://storage.test/shot-1_storyboard_start.png',
  frames: {
    start: 'https://storage.test/shot-1_storyboard_start.png',
    direction: 'https://storage.test/shot-1_storyboard_direction.png',
    end: 'https://storage.test/shot-1_storyboard_end.png',
  },
  status: 'completed',
  errorMessage: null,
  generatedAt: 1756800000000,
}
function request(extra: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/generate-video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'project-1', shotId: 'shot-1', prompt: 'A scene', idempotencyKey: key, ...extra }) })
}
function query(data: unknown) {
  // order/limit: #motion-contract state 폴백(writer_runs 조회)의 체인 지원 — await 시 data 없음 = 빈 결과.
  if (data && typeof data === 'object' && !Array.isArray(data) && 'shot_id' in data && !('character_appearance_keys' in data)) {
    data = { ...data, character_appearance_keys: {} }
  }
  // #ref-gate(2026-09-02): writer 샷의 실사 영상은 실사 스토리보드가 있어야 한다 — 픽스처가 명시하지 않으면 있는 것으로.
  //   실제 저장 형태(finalize.ts JSONB)로 채운다 — 첫 판이 문자열로 채워 "문자열만 인정" 결함을 못 잡았다.
  if (data && typeof data === 'object' && !Array.isArray(data) && 'shot_id' in data && !('storyboard_image' in data)) {
    data = { ...data, storyboard_image: PRODUCTION_STORYBOARD_IMAGE }
  }
  const result = { data, error: null }
  const value = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), contains: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), limit: vi.fn(),
    then: (resolve: (resolved: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  value.select.mockReturnValue(value); value.eq.mockReturnValue(value); value.in.mockReturnValue(value); value.is.mockReturnValue(value); value.contains.mockReturnValue(value)
  value.order.mockReturnValue(value); value.limit.mockReturnValue(value)
  value.maybeSingle.mockResolvedValue(result)
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
      resolved_model_key: 'seedance', // 2026-08-31 오너 확정: 기본 생성기 전환
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
  mocks.getUser.mockResolvedValue({ id: 'user-1' }); mocks.userOwnsProject.mockResolvedValue(true); mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.buildPrompt.mockReturnValue({ fullPrompt: 'prompt', prompt_parts: [] })
  mocks.from.mockReturnValueOnce(query({ workspace_id: 'workspace-1' })).mockReturnValueOnce(query({ shot_id: 'shot-1', character_appearance_keys: {} })).mockReturnValueOnce(query(null))
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})
describe('U16 대화 기록 연결 (2026-08-31 복원)', () => {
  it('형식이 잘못된 대화 추적 번호는 요청 전에 거절한다', async () => {
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    const res = await POST(request({ traceId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('traceId')
  })
})

describe('영상 생성 요청을 예약하는 약속', () => {
  it('독립 영상은 저장된 설정을 사용하고 장면을 불러오지 않는다', async () => {
    const standaloneKey =
      'standalone:123e4567-e89b-42d3-a456-426614174000'
    const persistedConfig = {
      prompt: 'Stored standalone motion',
      camera: {
        horizontal: 0,
        vertical: 0,
        pan: 1,
        tilt: 0,
        roll: 0,
        zoom: 0,
      },
      lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
      cameraPreset: {
        brand: 'arri',
        focalLength: 35,
        aperture: 2.8,
        whiteBalance: 5600,
      },
      provider: 'happy-horse',
      durationSeconds: 7,
    }
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(
        query({
          id: 'clip-standalone',
          shot_id: standaloneKey,
          override: persistedConfig,
        }),
      )
      .mockReturnValueOnce(query(null))
    mocks.reserveRegeneration.mockImplementation(
      async (args: { inputSnapshot: unknown; model: string }) => {
        mocks.getJob.mockResolvedValueOnce({
          id: 'job-standalone',
          request_id: 'reserved:job-standalone',
          provider: 'fal',
          model: args.model,
          status: 'queued',
          input_snapshot: args.inputSnapshot,
        })
        return {
          video_clip_id: 'clip-standalone',
          job_id: 'job-standalone',
          take_number: 1,
          replayed: false,
        }
      },
    )
    mocks.submit.mockRejectedValue(new Error('stop after metadata save'))

    const response = await POST(
      request({
        standaloneVideoKey: standaloneKey,
        standaloneConfig: persistedConfig,
        videoClipId: 'clip-standalone',
        prompt: 'Client spoof',
        model: 'local',
      }),
    )

    expect(response.status).toBe(500)
    expect(mocks.buildPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Stored standalone motion',
        camera: persistedConfig.camera,
        cameraPreset: persistedConfig.cameraPreset,
        durationSeconds: 7,
      }),
    )
    expect(mocks.reserveRegeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        videoClipId: 'clip-standalone',
        target: expect.objectContaining({
          writerShotId: standaloneKey,
          retakeMode: 'regeneration',
        }),
      }),
    )
    expect(mocks.updateMetadata).toHaveBeenCalledWith(
      'project-1',
      'clip-standalone',
      { override: persistedConfig },
    )
    expect(mocks.reserveTake).not.toHaveBeenCalled()
  })

  it('대화하는 인물은 저장된 모습 그대로 사용한다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({
        shot_id: 'shot-1',
        dynamic_spec: {},
        dialogue_lines: [{ characterId: 'char-1', text: 'When I was young.' }],
        character_appearance_keys: { 'char-1': 'young' },
      }))
      .mockReturnValueOnce(query(null))
      .mockReturnValueOnce(query([{ character_id: 'char-1', name: 'Jiho' }]))
      .mockReturnValueOnce(query([{ character_id: 'char-1', appearance_key: 'young', appearance: 'young face and school uniform' }]))
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockResolvedValue({ request_id: 'fal-1' })

    await POST(request())

    expect(mocks.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      dialogueSpeakers: { 'char-1': { name: 'Jiho', appearance: 'young face and school uniform' } },
    }))
  })

  it('대화하는 인물의 모습이 없으면 비용이 드는 영상 작업을 시작하지 않는다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({
        shot_id: 'shot-1',
        dynamic_spec: {},
        dialogue_lines: [{ characterId: 'char-1', text: 'When I was young.' }],
        character_appearance_keys: { 'char-1': 'young' },
      }))
      .mockReturnValueOnce(query(null))
      .mockReturnValueOnce(query([{ character_id: 'char-1', name: 'Jiho' }]))
      .mockReturnValueOnce(query([]))

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Character appearance contract error: char-1/young has no required appearance',
    })
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('인물 모습 기록이 없으면 비용이 드는 영상 작업을 시작하지 않는다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({
        shot_id: 'shot-1',
        dynamic_spec: {},
        character_appearance_keys: null,
      }))

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Character appearance contract error: shot shot-1 has no character_appearance_keys snapshot',
    })
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('#ref-gate: 승인된 장면 그림이 없으면 영상 작업을 시작하지 않는다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({
        shot_id: 'shot-1',
        dynamic_spec: {},
        character_appearance_keys: { 'char-1': 'young' },
        storyboard_image: null,
      }))

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'missing_storyboard', shotId: 'shot-1' })
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('#ref-gate: 장면 그림이 만들어지는 중이면 아직 영상 작업을 시작하지 않는다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({
        shot_id: 'shot-1',
        dynamic_spec: {},
        character_appearance_keys: { 'char-1': 'young' },
        storyboard_image: { url: '', status: 'generating', errorMessage: null, generatedAt: 0 },
      }))

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'missing_storyboard' })
    expect(mocks.reserveTake).not.toHaveBeenCalled()
  })

  it('#ref-gate 회귀: 완성된 장면 그림 형식이면 영상 작업을 예약한다', async () => {
    // 2026-09-02 실측: 게이트가 문자열만 인정해 실사가 있는 30샷 전부 영상이 409 로 막혔다(겨울_4).
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({
        shot_id: 'shot-1',
        dynamic_spec: {},
        character_appearance_keys: { 'char-1': 'young' },
        storyboard_image: PRODUCTION_STORYBOARD_IMAGE,
      }))
      .mockReturnValue(query(null))
    mocks.reserveTake.mockResolvedValueOnce({ ok: false, status: 402, error: 'stop here' })

    const response = await POST(request())

    expect(response.status).not.toBe(409)
    expect(mocks.reserveTake).toHaveBeenCalledTimes(1)
  })

  it('#ref-gate: 그림 한 장만 저장된 예전 장면도 영상 작업에 사용한다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({
        shot_id: 'shot-1',
        dynamic_spec: {},
        character_appearance_keys: { 'char-1': 'young' },
        storyboard_image: { url: 'https://storage.test/shot-1_storyboard_image.png', status: 'completed', errorMessage: null, generatedAt: 1 },
      }))
      .mockReturnValue(query(null))
    mocks.reserveTake.mockResolvedValueOnce({ ok: false, status: 402, error: 'stop here' })

    const response = await POST(request())

    expect(response.status).not.toBe(409)
    expect(mocks.reserveTake).toHaveBeenCalledTimes(1)
  })

  it('새 영상을 예약하면 선택한 제작 방식과 요청 내용을 저장한다', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 2, replayed: false })
    mocks.getJob.mockResolvedValueOnce(reservedFalJob())
    mocks.submit.mockResolvedValue({ request_id: 'fal-1' })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.reserveTake).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', shotId: 'shot-1', provider: 'fal' }))
    expect(mocks.attach).toHaveBeenCalledWith('project-1', 'job-1', 'fal-1', expect.objectContaining({ provider: 'fal' }))
  })
  it('다시 만들기 요청은 이미 이어진 작업이면 새 제출 없이 결과를 돌려준다', async () => {
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
    expect(mocks.checkGenerationCapacity).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ replayed: true, taskId: 'fal-existing', model: 'stored-model' })
  })
  it('다시 만들기 복구는 원래 영상에 속한 요청인지 확인한다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(query({ id: 'other-job', video_clip_id: 'clip-2', target: { retakeMode: 'regeneration' } }))
      .mockReturnValueOnce(query({ id: 'clip-2', shot_id: 'other-shot' }))

    const response = await POST(request({ videoClipId: 'clip-2', recoveryReceipt: 'wrong.receipt' }))

    expect(response.status).toBe(400)
    expect(mocks.checkGenerationCapacity).not.toHaveBeenCalled()
    expect(mocks.reserveRegeneration).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('다른 영상의 같은 재요청 표시는 새 작업으로 처리한다', async () => {
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
    // split pools (2026-08-26): video routes check the video category
    expect(mocks.checkGenerationCapacity).toHaveBeenCalledWith('user-1', 'video')
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })
  it('영상 제출이 실패하면 실패한 작업으로 기록한다', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockRejectedValue(new Error('FAL terminal error'))
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(mocks.fail).toHaveBeenCalledWith('project-1', 'job-1', 'FAL terminal error')
    await expect(response.json()).resolves.toMatchObject({ status: 'failed' })
  })
  it('결과를 알 수 없는 제출은 대기 상태로 두고 자동 재제출하지 않는다', async () => {
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
  it('제출 결과를 확인하지 못한 기록 실패는 다시 시도할 수 있게 남긴다', async () => {
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
  it('같은 요청의 순서가 달라도 작업을 두 번 제출하지 않는다', async () => {
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
describe('예약된 요청을 다시 이어가는 약속', () => {
  it('제작 결과를 알 수 없는 재요청은 다시 제출하지 않는다', async () => {
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
  it('이전 형식의 새 영상 정보가 없으면 다시 제출하지 않는다', async () => {
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

  it('저장된 새 영상 정보가 다르면 재요청을 거절한다', async () => {
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
      error: 'Invalid request: idempotencyKey replay does not match the reserved video input',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('실패 기록도 저장하지 못하면 다시 이어갈 정보를 돌려준다', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
    mocks.getJob.mockResolvedValue(reservedFalJob())
    mocks.submit.mockRejectedValue(new Error('provider unavailable'))
    mocks.fail.mockRejectedValue(new Error('fail RPC unavailable'))
    const response = await POST(request())
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ status: 'generating', retryable: true, transitionError: 'fail RPC unavailable' })
  })
  it('새 예약은 처음 확정한 요청 내용으로 제출한다', async () => {
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

  it('다시 요청한 내용이 달라지면 제작 작업을 제출하지 않는다', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob())

    const response = await POST(request({ prompt: 'Changed scene' }))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid request: idempotencyKey replay does not match the reserved video input',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('끝난 작업은 예약된 자리만 남아 있어도 다시 제출하지 않는다', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob({ status: 'failed' }))

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.submit).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ status: 'failed' })
  })

  it('작업 연결에 실패하면 다시 이어갈 복구 증표를 돌려준다', async () => {
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
  it('작업 연결이 실패해도 서명된 복구 증표로 한 번만 제출하고 이어간다', async () => {
    mocks.from.mockReset()
    mocks.from
      .mockReturnValueOnce(query({ workspace_id: 'workspace-1' }))
      .mockReturnValueOnce(query({ shot_id: 'shot-1' }))
      .mockReturnValueOnce(query(null))
      // #motion-contract: 신규 제출은 dynamic_spec 부재 시 writer_runs state 폴백을 1회 조회한다
      //   (복구 POST 는 exactReplay 라 건너뜀 — 아래 2차 시퀀스엔 없음).
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
    expect(mocks.checkGenerationCapacity).toHaveBeenCalledTimes(1)
    expect(mocks.attach).toHaveBeenLastCalledWith('project-1', 'job-1', 'fal-live', expect.objectContaining({ provider: 'fal' }))
    await expect(recovered.json()).resolves.toMatchObject({ jobId: 'job-1', videoClipId: 'clip-1', status: 'generating' })
  })

  it.each([
    ['take label', { takeLabel: 'Alternate cut' }],
    ['override', { override: { seed: 7 } }],
    ['canvas position', { canvasPosition: { x: 12, y: 24 } }],
  ])('새 영상 정보의 %s가 달라진 재요청은 작업을 제출하지 않는다', async (_name, changedMetadata) => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob())

    const response = await POST(request(changedMetadata))

    expect(response.status).toBe(409)
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
  })

  it('알 수 없는 작업 번호는 이미 진행 중인 요청과 충돌하므로 거절한다', async () => {
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
      error: 'Invalid request: idempotencyKey is already reserved for a different video operation',
    })
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
  })

  it('영상 파일은 올라갔지만 완료 기록 저장이 실패하면 작업을 대기 상태로 둔다', async () => {
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
describe('복구 입력을 안전하게 확인하는 약속', () => {
  it('변조된 복구 정보는 대기 중인 작업을 끝내지 않는다', async () => {
    mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: true })
    mocks.getJob.mockResolvedValue(reservedFalJob())

    const response = await POST(request({ recoveryReceipt: 'tampered.receipt' }))

    expect([400, 409]).toContain(response.status)
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
  })

  it('허용되지 않은 영상 주소가 오면 작업을 실패로 끝내고 방치하지 않는다', async () => {
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
describe('영상 생성 결과를 확인하는 약속', () => {
  const poll = (taskId = 'fal-1') => pollVideo(new Request(`http://test/api/director/generate-video/${taskId}`), { params: Promise.resolve({ taskId }) })

  it.each([
    ['unauthenticated', null, undefined, 401, { error: 'Unauthorized' }],
    ['missing', { id: 'user-1' }, null, 404, { error: 'Video job not found' }],
  ])('로그인이나 작업이 %s이면 상태를 다시 확인하지 않고 결과를 돌려준다', async (_name, user, job, status, body) => {
    mocks.getUser.mockResolvedValue(user)
    mocks.getJob.mockResolvedValue(job)
    const response = await poll()
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toMatchObject(body)
  })

  it('다른 사람의 작업은 결과를 확인하기 전에 거절한다', async () => {
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
  ])('작업이 %s 상태이면 그 상태를 결과로 보여준다', async (_name, initial, reconciled, body) => {
    mocks.getJob.mockResolvedValue(initial)
    mocks.reconcile.mockResolvedValue(reconciled ?? initial)
    const response = await poll()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(body)
  })

  it('서버에서 작업 상태를 확인할 수 없으면 오류를 돌려준다', async () => {
    mocks.getJob.mockResolvedValue({ ...reservedFalJob(), request_id: 'fal-1', status: 'queued' })
    mocks.reconcile.mockRejectedValue(new Error('reconciliation unavailable'))
    const response = await poll()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'reconciliation unavailable' })
  })
  it.each([
    ['completed', { ...reservedFalJob(), request_id: 'fal-1', status: 'completed', result_url: 'https://media.test/video.mp4' }, { status: 'completed', url: 'https://media.test/video.mp4' }],
    ['failed', { ...reservedFalJob(), request_id: 'fal-1', status: 'failed', error: 'provider failed' }, { status: 'failed', error: 'provider failed' }],
  ])('대기 중인 작업을 다시 확인해 %s 상태를 보여준다', async (_name, reconciled, expected) => {
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
describe('서명된 복구 증표를 확인하는 약속', () => {
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

  it('조건에 맞는 복구 증표만 연결하고 작업을 다시 제출하지 않는다', async () => {
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
  ])('유효하지 않은 %s 복구 증표는 연결하거나 제출하지 않는다', async (_name, mutate, expectedStatus) => {
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
  ])('복구 증표의 %s가 다르면 연결하거나 제출하지 않는다', async (_name, override, expectedStatus) => {
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
