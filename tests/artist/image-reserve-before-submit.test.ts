// 인물·배경 이미지는 자리를 먼저 예약하고, 거절되면 제출하지 않으며, 제출 뒤 접수 번호를 채운다
import { beforeEach, describe, expect, it, vi } from 'vitest'

// #generation-capacity-trigger(2026-09-14): 이미지 경로는 fal 에 먼저 제출하고 나서 작업을 기록했다 —
//   DB 트리거가 자리를 넘는 기록을 거절하면 돈은 이미 나간 뒤였다. 순서를 뒤집은 계약을 여기서 잠근다.
//   러프(rough-submit.ts)가 먼저 쓴 순서와 같다: 예약 → 1회 제출 → 접수 번호 채움.
const mocks = vi.hoisted(() => ({
  order: [] as string[],
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  hasQueuedCharacterViewJob: vi.fn(),
  hasQueuedWorldShotJob: vi.fn(),
  countFailedJobsForTarget: vi.fn(),
  listFailedCharacterViewJobs: vi.fn(),
  falImageSubmit: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  recordWriterObservabilityEvent: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
// 접근 가드는 이 파일의 관심사 아님 — 소유자 통과로 고정(가드 검증은 api-project-access-guard.test.ts 전담).
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({
    ok: true as const,
    projectId,
    userId: 'user-1',
    viaShare: false,
  })),
}))
// 예약/접수/거절만 목으로 바꾼다 — GenerationCapacityError 는 실제 클래스를 써야 제품과 같은 판정이 된다.
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
  hasQueuedCharacterViewJob: mocks.hasQueuedCharacterViewJob,
  hasQueuedWorldShotJob: mocks.hasQueuedWorldShotJob,
  countFailedJobsForTarget: mocks.countFailedJobsForTarget,
  listFailedCharacterViewJobs: mocks.listFailedCharacterViewJobs,
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
}))
vi.mock('@/lib/writer/llm/fal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/writer/llm/fal')>()),
  falImageSubmit: mocks.falImageSubmit,
}))
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent,
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined, resolveWebhookBaseUrl: () => null }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/style-anchor', () => ({
  resolveStyleAnchor: async () => null,
  applyStyleAnchor: (_anchor: unknown, base: unknown) => base,
}))

import { POST as generateSheetPOST } from '@/app/api/artist/generate-sheet/route'
import { triggerCharacterDrafts } from '@/lib/artist/draft-trigger'
import { submitWorldShotJob } from '@/lib/artist/world-submit'
import { GenerationCapacityError, type GenerationJob } from '@/lib/generation-jobs'

const PROJECT_ID = 'project-1'
const WORKSPACE_ID = 'workspace-1'
const CHARACTER_ID = 'character-1'
const LOCATION_ID = 'location-1'
const RESERVED_KEY = 'key-rotated-by-trigger'
const DESIGN_TOKENS = { l1: { art_style: 'ink storybook' }, palette: { primary: 'cobalt' } }

const dbState: {
  projects: Array<Record<string, unknown>>
  characters: Array<Record<string, unknown>>
  appearances: Array<Record<string, unknown>>
  candidates: Array<Record<string, unknown>>
} = { projects: [], characters: [], appearances: [], candidates: [] }

function reservation(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: 'reserved-job-1',
    project_id: PROJECT_ID,
    request_id: 'reserved:reserved-job-1',
    model: 'pending',
    kind: 'world_shot',
    status: 'queued',
    target: {},
    video_clip_id: null,
    idempotency_key: null,
    result_url: null,
    error: null,
    fal_key_id: RESERVED_KEY,
    ...overrides,
  } as GenerationJob
}

function capacityRejection(): GenerationCapacityError {
  return new GenerationCapacityError('image_user_at_capacity', 'user_image', 6, 6)
}

function providerFailure(status: number): Error {
  // 라우트가 보는 오류는 falImageSubmit 이 감싼 것이다 — status 는 cause 에만 있다.
  return new Error(`fal submit (model): ${status}`, { cause: Object.assign(new Error('rejected'), { status }) })
}

function worldInput() {
  return {
    projectId: PROJECT_ID,
    locationId: LOCATION_ID,
    column: 'wide_shot' as const,
    prompt: 'a quiet harbor at dawn',
    actor: 'ui' as const,
    userId: 'user-1',
    workspaceId: WORKSPACE_ID,
  }
}

function sheetRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/artist/generate-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      characterId: CHARACTER_ID,
      appearanceKey: 'current',
      view: 'main',
      ...body,
    }),
  })
}

beforeEach(() => {
  mocks.order.length = 0
  dbState.projects = [{
    id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    design_tokens: DESIGN_TOKENS,
    style_anchor_key: null,
    custom_style_anchor: null,
  }]
  dbState.characters = [{
    project_id: PROJECT_ID,
    character_id: CHARACTER_ID,
    name: '카이',
    role: 'protagonist',
    costume: null,
    entity_type: 'person',
  }]
  dbState.appearances = [{
    project_id: PROJECT_ID,
    character_id: CHARACTER_ID,
    appearance_key: 'current',
    is_default: true,
    appearance: '은발 검사',
    costume: null,
    sheet_url: null,
    portrait_url: null,
  }]
  dbState.candidates = []

  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => queryFor(table))
  mocks.reserveGenerationJob.mockReset()
  mocks.reserveGenerationJob.mockImplementation(async () => {
    mocks.order.push('reserve')
    return reservation()
  })
  mocks.confirmGenerationJobReceipt.mockReset()
  mocks.confirmGenerationJobReceipt.mockImplementation(async () => {
    mocks.order.push('confirm')
  })
  mocks.rejectGenerationJobReservation.mockReset()
  mocks.rejectGenerationJobReservation.mockImplementation(async () => {
    mocks.order.push('reject')
  })
  mocks.falImageSubmit.mockReset()
  mocks.falImageSubmit.mockImplementation(async (opts: { model?: string }) => {
    mocks.order.push('submit')
    return { request_id: 'fal-request-1', model: opts.model ?? 'openai/gpt-image-2', fal_key_id: RESERVED_KEY }
  })
  mocks.hasQueuedCharacterViewJob.mockReset()
  mocks.hasQueuedCharacterViewJob.mockResolvedValue(false)
  mocks.hasQueuedWorldShotJob.mockReset()
  mocks.hasQueuedWorldShotJob.mockResolvedValue(false)
  mocks.countFailedJobsForTarget.mockReset()
  mocks.countFailedJobsForTarget.mockResolvedValue(0)
  mocks.listFailedCharacterViewJobs.mockReset()
  mocks.listFailedCharacterViewJobs.mockResolvedValue([])
  mocks.checkGenerationCapacity.mockReset()
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' })
  mocks.recordWriterObservabilityEvent.mockReset()
  mocks.recordWriterObservabilityEvent.mockResolvedValue(undefined)
})

describe('이미지 생성은 자리를 예약한 뒤에만 외부에 접수한다', () => {
  // 왜: 제출이 먼저면 트리거가 기록을 거절하는 순간 이미 유료 요청이 나간 뒤다(감사 2026-09-11).
  it('배경 이미지는 외부 제출 전에 자리를 예약한다', async () => {
    await submitWorldShotJob(worldInput())

    expect(mocks.order).toEqual(['reserve', 'submit', 'confirm'])
    // 트리거가 여유 있는 계정으로 바꿔 넣을 수 있어 제출 키는 반드시 예약 행의 값이다.
    expect(mocks.falImageSubmit.mock.calls[0][1]).toEqual({ retry: false, falKeyId: RESERVED_KEY })
  })

  // 왜: 자리 판정은 예약 insert 한 걸음에서 끝난다 — 거절됐으면 돈 쓰는 호출로 넘어가면 안 된다.
  it('자리가 없어 예약이 거절되면 배경 이미지를 제출하지 않는다', async () => {
    mocks.reserveGenerationJob.mockRejectedValueOnce(capacityRejection())

    await expect(submitWorldShotJob(worldInput())).rejects.toThrow('image_user_at_capacity')
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 'reserved:<id>' 그대로면 webhook 이 매칭할 request_id 가 없어 그 작업은 영원히 대기로 남는다.
  it('제출 뒤 접수 번호를 예약에 채운다', async () => {
    await submitWorldShotJob(worldInput())

    expect(mocks.confirmGenerationJobReceipt).toHaveBeenCalledTimes(1)
    expect(mocks.confirmGenerationJobReceipt).toHaveBeenCalledWith('reserved-job-1', PROJECT_ID, {
      request_id: 'fal-request-1',
      model: 'openai/gpt-image-2',
      fal_key_id: RESERVED_KEY,
    })
  })

  // 왜: 명확한 4xx 거절은 접수가 없었다는 뜻이다 — 자리를 붙잡아 두면 다음 생성이 막힌다.
  it('외부가 명확히 거절하면 예약을 실패로 닫는다', async () => {
    mocks.falImageSubmit.mockRejectedValueOnce(providerFailure(400))

    await expect(submitWorldShotJob(worldInput())).rejects.toThrow()
    expect(mocks.rejectGenerationJobReservation).toHaveBeenCalledTimes(1)
    expect(mocks.rejectGenerationJobReservation.mock.calls[0].slice(0, 2)).toEqual(['reserved-job-1', PROJECT_ID])
    expect(mocks.confirmGenerationJobReceipt).not.toHaveBeenCalled()
  })

  // 왜: 5xx·통신 오류는 이미 접수됐을 수 있다. 실패로 닫고 다시 내면 같은 그림을 두 번 결제한다.
  it('접수 응답을 잃으면 예약을 남기고 다시 내지 않는다', async () => {
    mocks.falImageSubmit.mockRejectedValueOnce(providerFailure(503))

    await expect(submitWorldShotJob(worldInput())).rejects.toThrow()
    expect(mocks.rejectGenerationJobReservation).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).toHaveBeenCalledTimes(1)
  })

  // 왜: 트리거 거절은 사전 검사와 같은 429 로 보여야 클라이언트가 "자리 없음"으로 안내한다.
  it('인물 시트도 자리가 없으면 제출 없이 자리 없음으로 응답한다', async () => {
    mocks.reserveGenerationJob.mockRejectedValueOnce(capacityRejection())

    const response = await generateSheetPOST(sheetRequest())

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      code: 'quota_exceeded',
      axis: 'user_image',
      queued: 6,
      limit: 6,
    })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 초안은 여러 장을 연달아 낸다 — 한 장이 자리에 걸렸다고 나머지를 버리면 빈칸이 남는다.
  it('초안 여러 개 중 자리가 없는 것만 건너뛰고 나머지는 제출한다', async () => {
    dbState.characters = ['char-1', 'char-2'].map((id) => ({
      project_id: PROJECT_ID,
      character_id: id,
      name: id,
      role: 'supporting',
      costume: null,
      entity_type: 'person',
    }))
    dbState.appearances = ['char-1', 'char-2'].map((id) => ({
      project_id: PROJECT_ID,
      character_id: id,
      appearance_key: 'current',
      is_default: true,
      appearance: '은발 검사',
      costume: null,
      sheet_url: null,
      portrait_url: null,
    }))
    mocks.reserveGenerationJob.mockImplementationOnce(async () => {
      mocks.order.push('reserve')
      return reservation({ kind: 'character_view' })
    })
    mocks.reserveGenerationJob.mockRejectedValueOnce(capacityRejection())

    const result = await triggerCharacterDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 1, skipped: 1, failed: 0 })
    expect(mocks.falImageSubmit).toHaveBeenCalledTimes(1)
    const blocked = mocks.recordWriterObservabilityEvent.mock.calls.filter(([, event]) => event === 'asset_trigger_blocked')
    expect(blocked).toHaveLength(1)
    expect(blocked[0][2]).toMatchObject({ reason: 'capacity', axis: 'user_image', characterId: 'char-2' })
  })
})

function queryFor(table: string) {
  const filters: Array<{ column: string; value: unknown; op: 'eq' | 'is' }> = []
  let limitValue: number | null = null
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value, op: 'eq' })
      return query
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value, op: 'is' })
      return query
    }),
    limit: vi.fn((value: number) => {
      limitValue = value
      return Promise.resolve({ data: resolveRows(table, filters, limitValue, 'many'), error: null })
    }),
    maybeSingle: vi.fn(async () => ({ data: resolveRows(table, filters, limitValue, 'single'), error: null })),
    single: vi.fn(async () => ({ data: resolveRows(table, filters, limitValue, 'single'), error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: resolveRows(table, filters, limitValue, 'many'), error: null }).then(resolve, reject),
  }
  return query
}

function resolveRows(
  table: string,
  filters: Array<{ column: string; value: unknown; op: 'eq' | 'is' }>,
  limitValue: number | null,
  mode: 'single' | 'many',
): unknown {
  const rows = rowsForTable(table).filter((row) =>
    filters.every(({ column, value, op }) => (op === 'is' && value === null ? row[column] == null : row[column] === value)),
  )
  const limited = limitValue == null ? rows : rows.slice(0, limitValue)
  return mode === 'single' ? limited[0] ?? null : limited
}

function rowsForTable(table: string): Array<Record<string, unknown>> {
  if (table === 'projects') return dbState.projects
  if (table === 'characters') return dbState.characters
  if (table === 'character_appearances') return dbState.appearances
  if (table === 'character_image_candidates') return dbState.candidates
  return []
}
