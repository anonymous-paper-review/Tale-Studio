// 예약 트리거가 FAL 계정을 옆 키로 바꿔도 본영상·재생성·일괄 제출은 예약 행의 키만 사용한다.
// 예약 행의 키를 읽지 못한 경우에는 유료 FAL 제출을 하지 않고 실패 경계를 남긴다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  syncFalKeyLimits: vi.fn(),
  reserveTake: vi.fn(),
  reserveRegeneration: vi.fn(),
  reserveBatch: vi.fn(),
  getJob: vi.fn(),
  attach: vi.fn(),
  fail: vi.fn(),
  hold: vi.fn(),
  from: vi.fn(),
  submitA: vi.fn(),
  submitB: vi.fn(),
  falKeyById: vi.fn(),
  pickFalKey: vi.fn(),
}))

vi.mock('@/lib/generation-jobs', () => ({
  userOwnsProject: mocks.userOwnsProject,
  getGenerationJobById: mocks.getJob,
}))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
  syncFalKeyLimits: mocks.syncFalKeyLimits,
}))
vi.mock('@/lib/api/quota', () => ({
  quotaRejectionResponse: () => new Response(JSON.stringify({ error: 'quota' }), { status: 429 }),
  videoBudgetRejectionResponse: () => new Response(JSON.stringify({ error: 'video budget' }), { status: 429 }),
  capacityReservationRejection: () => null,
}))
vi.mock('@/lib/director-video-takes', () => ({
  reserveDirectorVideoTake: mocks.reserveTake,
  reserveDirectorVideoRegeneration: mocks.reserveRegeneration,
  attachProviderRequestToReservedVideoJob: mocks.attach,
  markDirectorVideoAttemptFailed: mocks.fail,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/keys', () => ({
  falKeyById: mocks.falKeyById,
  pickFalKey: mocks.pickFalKey,
  FalUnknownKeyError: class FalUnknownKeyError extends Error {
    constructor(id: string | null | undefined) {
      super(`unknown fal key id: ${id ?? '(missing)'}`)
      this.name = 'FalUnknownKeyError'
    }
  },
}))
vi.mock('@/lib/billing/take-hold', () => ({ holdTakesForVideoJob: mocks.hold }))

import { submitPreparedDirectorVideo, type PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'

const idempotencyKey = '123e4567-e89b-12d3-a456-426614174000'
const keyA = {
  id: 'key-a',
  maxInflight: 40,
  client: { queue: { submit: mocks.submitA } },
}
const keyB = {
  id: 'key-b',
  maxInflight: 40,
  client: { queue: { submit: mocks.submitB } },
}
const falSnapshot = {
  prompt: 'scene',
  full_prompt: 'scene',
  prompt_parts: [],
  camera: null,
  duration_seconds: 5,
  aspect_ratio: '16:9',
  generation_method: 'T2V',
  provider: null,
  model: null,
  resolved_model_key: 'seedance',
  reference_image_url: null,
  movement_preset: null,
  camera_preset: null,
  new_take_metadata: {
    take_label: null,
    override: {},
    canvas_position: null,
  },
  fal_request: {
    model: 'fal-model',
    input: { prompt: 'scene' },
  },
}
const { new_take_metadata: _regenerationMetadata, ...regenerationSnapshot } = falSnapshot
void _regenerationMetadata

function prepared(inputSnapshot: Record<string, unknown> = falSnapshot, videoClipId: string | null = null) {
  return {
    ownerId: 'user-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    writerShotId: 'shot-1',
    videoClipId,
    standalone: false,
    standaloneConfig: null,
    modelKey: 'seedance',
    takeAmount: 1,
    provider: 'fal',
    idempotencyKey,
    traceId: null,
    jobActor: 'ui',
    inputSnapshot,
    takeLabel: null,
    override: {},
    canvasPosition: null,
    recoveryReceipt: null,
  } as unknown as PreparedDirectorVideoSubmission
}

function reservedJob(
  inputSnapshot: Record<string, unknown>,
  falKeyId: string | null = 'key-a',
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'job-1',
    request_id: 'reserved:job-1',
    provider: 'fal',
    model: 'fal-model',
    status: 'queued',
    fal_key_id: falKeyId,
    input_snapshot: inputSnapshot,
    ...overrides,
  }
}

function nullReplayQuery() {
  const result = { data: null, error: null }
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    contains: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.contains.mockReturnValue(query)
  return query
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.syncFalKeyLimits.mockResolvedValue(undefined)
  mocks.hold.mockResolvedValue({ ok: true, insufficient: false, balance: 100 })
  mocks.attach.mockResolvedValue(undefined)
  mocks.fail.mockResolvedValue(undefined)
  mocks.reserveTake.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })
  mocks.reserveRegeneration.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 2, replayed: false })
  mocks.submitA.mockResolvedValue({ request_id: 'fal-a' })
  mocks.submitB.mockResolvedValue({ request_id: 'fal-b' })
  mocks.falKeyById.mockImplementation((id: string) => id === keyA.id ? keyA : id === keyB.id ? keyB : null)
  mocks.pickFalKey.mockResolvedValue(keyA)
  mocks.from.mockReturnValue(nullReplayQuery())
})

describe('영상 예약 트리거의 FAL 키 경계', () => {
  it('본영상은 trigger가 B로 재배정한 예약 행의 키로만 제출한다', async () => {
    const input = prepared()
    mocks.getJob.mockResolvedValue(reservedJob(falSnapshot, keyB.id))

    const response = await submitPreparedDirectorVideo(input)

    expect(response.status).toBe(200)
    expect(mocks.syncFalKeyLimits.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reserveTake.mock.invocationCallOrder[0],
    )
    expect(mocks.falKeyById).toHaveBeenCalledWith(keyB.id)
    expect(mocks.submitB).toHaveBeenCalledTimes(1)
    expect(mocks.submitB).toHaveBeenCalledWith(
      'fal-model',
      expect.objectContaining({ input: falSnapshot.fal_request.input }),
    )
    expect(mocks.attach).toHaveBeenCalledWith(
      'project-1',
      'job-1',
      'fal-b',
      expect.objectContaining({ provider: 'fal', falKeyId: keyB.id }),
    )
    expect(mocks.submitA).not.toHaveBeenCalled()
    expect(mocks.pickFalKey).not.toHaveBeenCalled()
  })

  it('재생성도 예약 행의 B 키를 사용하고 재생성 RPC 입력은 바꾸지 않는다', async () => {
    const input = prepared(regenerationSnapshot, 'clip-1')
    mocks.getJob.mockResolvedValue(reservedJob(regenerationSnapshot, keyB.id))

    const response = await submitPreparedDirectorVideo(input)

    expect(response.status).toBe(200)
    expect(mocks.syncFalKeyLimits.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reserveRegeneration.mock.invocationCallOrder[0],
    )
    expect(mocks.reserveRegeneration).toHaveBeenCalledTimes(1)
    expect(mocks.submitB).toHaveBeenCalledTimes(1)
    expect(mocks.submitA).not.toHaveBeenCalled()
    expect(mocks.pickFalKey).not.toHaveBeenCalled()
  })

  it('일괄 callback 예약도 같은 B 키 경계를 지킨다', async () => {
    const input = prepared()
    mocks.getJob.mockResolvedValue(reservedJob(falSnapshot, keyB.id))
    mocks.reserveBatch.mockResolvedValue({ video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false })

    const response = await submitPreparedDirectorVideo(input, { reserve: mocks.reserveBatch })

    expect(response.status).toBe(200)
    expect(mocks.syncFalKeyLimits.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reserveBatch.mock.invocationCallOrder[0],
    )
    expect(mocks.reserveBatch).toHaveBeenCalledTimes(1)
    expect(mocks.submitB).toHaveBeenCalledTimes(1)
    expect(mocks.submitA).not.toHaveBeenCalled()
    expect(mocks.pickFalKey).not.toHaveBeenCalled()
  })

  it('예약 행의 키 조회가 실패하면 FAL 제출을 0회로 두고 예약을 실패 처리한다', async () => {
    const input = prepared()
    mocks.getJob.mockResolvedValue(reservedJob(falSnapshot, null))
    mocks.falKeyById.mockReturnValue(null)

    const response = await submitPreparedDirectorVideo(input)

    expect(response.status).toBe(500)
    expect(mocks.submitA).not.toHaveBeenCalled()
    expect(mocks.submitB).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(
      'project-1',
      'job-1',
      expect.stringContaining('unknown fal key id'),
    )
  })
})
