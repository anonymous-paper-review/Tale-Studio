// 남은 네 제출 경로도 완료 알림 주소에 예약한 작업 번호를 심는다
//
// 접수 번호 기록이 실패하면 fal 알림은 request_id 로 행을 찾을 수 없고, fal 은 알림을 다시 보내지 않는다.
//   주소에 심은 작업 번호가 그 잡을 되찾는 유일한 단서다(되찾는 쪽: tests/job/webhook-matches-by-job-id.test.ts).
//   이미 적용된 경로는 tests/job/submit-paths-carry-job-id*.test.ts 가 본다 — 이 파일은 남아 있던
//   프리비즈 영상 · 실사 시트 묶음 · 러프 시트 · 영상 다음 모델 네 경로다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  resolveWebhookUrl: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  syncFalKeyLimits: vi.fn(),
  createGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  getGenerationJobById: vi.fn(),
  falImageSubmit: vi.fn(),
  falVideoSubmit: vi.fn(),
  submitFalReferenceToVideo: vi.fn(),
  attachProviderRequestToReservedVideoJob: vi.fn(),
  markDirectorVideoAttemptFailed: vi.fn(),
  holdTakesForVideoJob: vi.fn(),
  releaseTakesForJob: vi.fn(),
  pickFalKey: vi.fn(),
  falKeyById: vi.fn(),
  recordWriterObservabilityEvent: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async (_req: Request, projectId: string) => ({
    ok: true as const,
    projectId,
    userId: 'user-1',
    viaShare: false,
  }),
}))
vi.mock('@/lib/fal/webhook-url', () => ({
  resolveWebhookUrl: mocks.resolveWebhookUrl,
  resolveWebhookBaseUrl: () => 'https://hook.test',
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  createGenerationJob: mocks.createGenerationJob,
  failGenerationJob: mocks.failGenerationJob,
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
  getGenerationJobById: mocks.getGenerationJobById,
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
  syncFalKeyLimits: mocks.syncFalKeyLimits,
}))
vi.mock('@/lib/writer/llm/fal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/writer/llm/fal')>()),
  falImageSubmit: mocks.falImageSubmit,
  falVideoSubmit: mocks.falVideoSubmit,
}))
vi.mock('@/lib/director/fal-video-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/director/fal-video-request')>()),
  submitFalReferenceToVideo: mocks.submitFalReferenceToVideo,
}))
vi.mock('@/lib/director-video-takes', () => ({
  attachProviderRequestToReservedVideoJob: mocks.attachProviderRequestToReservedVideoJob,
  markDirectorVideoAttemptFailed: mocks.markDirectorVideoAttemptFailed,
}))
vi.mock('@/lib/director/job-cancellations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/director/job-cancellations')>()),
  isJobCancelled: async () => false,
}))
vi.mock('@/lib/billing/take-hold', () => ({
  holdTakesForVideoJob: mocks.holdTakesForVideoJob,
  releaseTakesForJob: mocks.releaseTakesForJob,
}))
vi.mock('@/lib/fal/keys', () => ({
  pickFalKey: mocks.pickFalKey,
  falKeyById: mocks.falKeyById,
  FalUnknownKeyError: class FalUnknownKeyError extends Error {},
}))
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent,
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((i) => [i.id, i.native])),
}))
vi.mock('@/lib/style-anchor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/style-anchor')>()),
  resolveStyleAnchor: async () => null,
}))
// 시트 합성은 sharp 를 쓰는 무거운 순수 함수 — 이 파일의 검사 대상이 아니다.
vi.mock('@/lib/director/storyboard-strip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/director/storyboard-strip')>()),
  composeRoughReferenceGrid: async () => Buffer.from('grid'),
  buildRealGridPrompt: () => 'GRID PROMPT',
  realSheetCanvas: () => '2048x1536',
}))
vi.mock('@/lib/storage/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/media')>()),
  mediaUpload: async () => ({ error: null }),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
}))

import { POST as previzPOST } from '@/app/api/director/generate-previz-video/route'
import { POST as storyboardBatchPOST } from '@/app/api/director/generate-storyboard-batch/route'
import { submitRoughStoryboardGrid } from '@/lib/writer/rough-submit'
import { failDirectorVideoAttemptOrFallback } from '@/lib/director/video-fallback'
import type { GenerationJob } from '@/lib/generation-jobs'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE_ID = 'workspace-1'
const FAL_KEY_ID = 'prod-2000'
const START = 'https://media.test/shots/sh_01_01_rough_start.png'
const END = 'https://media.test/shots/sh_01_01_rough_end.png'

/** 주소에 작업 번호가 심겼는지만 본다 — 주소 모양 자체는 webhook-matches-by-job-id 가 본다. */
const hookFor = (jobId: string) => `https://hook.test/api/fal/webhook?jobId=${jobId}`

let db: Record<string, Array<Record<string, unknown>>>

/** 'target->>batchRunId' 같은 JSON 경로도 읽는다. */
function valueAt(row: Record<string, unknown>, column: string): unknown {
  const [base, key] = column.split('->>')
  const value = row[base]
  if (key === undefined) return value
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

/** supabase-js 체인 최소 스텁 — 생성 작업 표만 거르고, 바꾸는 호출은 "한 줄 바꿨다"로 답한다. */
function queryFor(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  let updating = false
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'order', 'gte', 'limit', 'not', 'is', 'contains']) q[name] = () => q
  q.update = () => {
    updating = true
    return q
  }
  q.eq = (column: string, value: unknown) => {
    filters.push((row) => valueAt(row, column) === value)
    return q
  }
  q.in = (column: string, values: unknown[]) => {
    filters.push((row) => values.includes(valueAt(row, column)))
    return q
  }
  // 영상 대체 경로는 바꾼 줄 수로 "내가 먼저 차지했다"를 판단한다 — 한 줄 바꿨다고 답해야 다음 모델을 낸다.
  const rows = () =>
    updating
      ? [{ id: 'updated' }]
      : (db[table] ?? []).filter((row) => table !== 'generation_jobs' || filters.every((f) => f(row)))
  q.maybeSingle = q.single = async () => ({ data: rows()[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve)
  return q
}

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    projects: [{ workspace_id: WORKSPACE_ID, style_anchor_key: null, custom_style_anchor: null, settings: null }],
    shots: [],
    scenes: [],
    locations: [],
    location_appearances: [],
    characters: [],
    character_appearances: [],
    generation_jobs: [],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.rpc.mockResolvedValue({ data: null, error: null })
  mocks.resolveWebhookUrl.mockImplementation((jobId?: string) =>
    jobId ? hookFor(jobId) : 'https://hook.test/api/fal/webhook',
  )
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.syncFalKeyLimits.mockResolvedValue(undefined)
  mocks.pickFalKey.mockResolvedValue({ id: FAL_KEY_ID })
  mocks.falKeyById.mockImplementation((id: string) => (id === FAL_KEY_ID ? { id: FAL_KEY_ID } : null))
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.rejectGenerationJobReservation.mockResolvedValue(undefined)
  mocks.holdTakesForVideoJob.mockResolvedValue({ ok: true, insufficient: false, balance: 100 })
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-image-1', model: 'openai/gpt-image-2/edit', fal_key_id: FAL_KEY_ID })
  mocks.falVideoSubmit.mockResolvedValue({ request_id: 'fal-video-1', model: 'happy-horse', fal_key_id: FAL_KEY_ID })
  mocks.recordWriterObservabilityEvent.mockResolvedValue(undefined)
})

describe('프리비즈 영상 제출의 완료 알림 주소', () => {
  const JOB_ID = 'previz-job-1'

  beforeEach(() => {
    db.shots = [{
      shot_id: 'sh_01_01',
      action_description: 'a man walks',
      duration_seconds: 5,
      rough_storyboard: { url: 'https://media.test/rough.png', frames: { start: START, end: END } },
    }]
    mocks.createGenerationJob.mockResolvedValue({ id: JOB_ID, fal_key_id: FAL_KEY_ID })
  })

  it('프리비즈 영상을 제출하면 완료 알림 주소에 예약한 작업 번호를 심는다', async () => {
    const response = await previzPOST(new Request('http://localhost/api/director/generate-previz-video', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: PROJECT_ID, writerShotId: 'sh_01_01' }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.resolveWebhookUrl).toHaveBeenCalledWith(JOB_ID)
    expect(mocks.falVideoSubmit.mock.calls[0][0]).toMatchObject({ webhookUrl: hookFor(JOB_ID) })
  })
})

describe('실사 시트 묶음 제출의 완료 알림 주소', () => {
  beforeEach(() => {
    // 한 씬에 러프 3장이 갖춰진 샷 8개 — 4개씩 시트 두 장이 된다.
    db.shots = Array.from({ length: 8 }, (_, i) => ({
      shot_id: `sh_01_${String(i + 1).padStart(2, '0')}`,
      scene_id: 'scene-1',
      characters: [],
      character_appearance_keys: {},
      rough_storyboard: {
        frames: { start: START, direction: 'https://media.test/d.png', end: END },
        generatedAt: 1000,
      },
      storyboard_image: null,
      static_spec: null,
      director_refs: null,
    }))
    let n = 0
    mocks.reserveGenerationJob.mockImplementation(async () => {
      n += 1
      return { id: `grid-job-${n}`, project_id: PROJECT_ID, fal_key_id: FAL_KEY_ID, request_id: `reserved:grid-job-${n}`, status: 'queued' }
    })
  })

  it('실사 시트를 묶음으로 낼 때 시트마다 그 시트의 작업 번호를 완료 알림 주소에 심는다', async () => {
    const response = await storyboardBatchPOST(new Request('http://localhost/api/director/generate-storyboard-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: PROJECT_ID }),
    }) as never)

    expect(response.status).toBe(200)
    expect(mocks.falImageSubmit).toHaveBeenCalledTimes(2)
    expect(mocks.falImageSubmit.mock.calls[0][0]).toMatchObject({ webhookUrl: hookFor('grid-job-1') })
    expect(mocks.falImageSubmit.mock.calls[1][0]).toMatchObject({ webhookUrl: hookFor('grid-job-2') })
  })
})

describe('러프 스토리보드 시트 제출의 완료 알림 주소', () => {
  const JOB_ID = 'rough-job-1'

  beforeEach(() => {
    mocks.rpc.mockResolvedValue({
      data: [{ job_id: JOB_ID, shot_ids: ['sh_01_01'], state: 'reserved' }],
      error: null,
    })
    mocks.getGenerationJobById.mockResolvedValue({ id: JOB_ID, project_id: PROJECT_ID, fal_key_id: FAL_KEY_ID })
  })

  it('러프 스토리보드 시트를 제출하면 완료 알림 주소에 예약한 작업 번호를 심는다', async () => {
    await submitRoughStoryboardGrid({
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      userId: 'user-1',
      shotIds: ['sh_01_01'],
      gridVariant: 'grid4',
      snapshot: { prompt: 'ROUGH PROMPT' },
      options: { model: 'openai/gpt-image-2/edit', prompt: 'ROUGH PROMPT' },
      moderation: MODERATION_FIXTURE,
    })

    expect(mocks.resolveWebhookUrl).toHaveBeenCalledWith(JOB_ID)
    expect(mocks.falImageSubmit.mock.calls[0][0]).toMatchObject({ webhookUrl: hookFor(JOB_ID) })
  })
})

describe('영상이 다음 모델로 넘어갈 때의 완료 알림 주소', () => {
  const JOB_ID = 'video-job-1'

  function seedanceJob(): GenerationJob {
    return {
      id: JOB_ID,
      project_id: PROJECT_ID,
      request_id: 'seedance-request-1',
      model: 'bytedance/seedance-2.0/reference-to-video',
      provider: 'fal',
      kind: 'shot_video',
      status: 'queued',
      video_clip_id: 'clip-1',
      target: { workspaceId: WORKSPACE_ID, writerShotId: 'sh_01_01', videoClipId: 'clip-1' },
      fal_key_id: FAL_KEY_ID,
      result_url: null,
      error: null,
      input_snapshot: {
        requestedModel: 'seedance',
        resolved_model_key: 'seedance',
        full_prompt: 'Motion contract: Camera: LOCKED tripod shot.',
        duration_seconds: 6,
        aspect_ratio: '16:9',
        reference_image_urls: [START, END],
        reference_image_roles: ['start', 'end'],
        moderation: MODERATION_FIXTURE,
      },
    } as unknown as GenerationJob
  }

  beforeEach(() => {
    mocks.submitFalReferenceToVideo.mockResolvedValue({
      taskId: 'fal-video-2',
      provider: 'fal',
      model: 'minimax/h3-max/image-to-video',
      falKeyId: FAL_KEY_ID,
    })
    mocks.attachProviderRequestToReservedVideoJob.mockResolvedValue(undefined)
  })

  it('영상이 다음 모델로 넘어갈 때도 완료 알림 주소에 작업 번호를 심는다', async () => {
    const result = await failDirectorVideoAttemptOrFallback(seedanceJob(), 'likeness rejected')

    expect(result.status).toBe('queued')
    expect(mocks.resolveWebhookUrl).toHaveBeenCalledWith(JOB_ID)
    expect(mocks.submitFalReferenceToVideo.mock.calls[0][1]).toBe(hookFor(JOB_ID))
  })
})
