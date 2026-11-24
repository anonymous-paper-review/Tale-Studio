// 그림·영상 제출은 완료 알림 주소에 예약한 작업 번호를 심어 보낸다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
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
  resolveWebhookUrl: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({
    ok: true as const,
    projectId,
    userId: 'user-1',
    viaShare: false,
  })),
}))
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
vi.mock('@/lib/fal/webhook-url', () => ({
  resolveWebhookUrl: mocks.resolveWebhookUrl,
  resolveWebhookBaseUrl: () => null,
}))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/style-anchor', () => ({
  resolveStyleAnchor: async () => null,
  applyStyleAnchor: (_anchor: unknown, base: unknown) => base,
}))

import { POST as generateSheetPOST } from '@/app/api/artist/generate-sheet/route'
import { submitWorldShotJob } from '@/lib/artist/world-submit'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'
import type { GenerationJob } from '@/lib/generation-jobs'

const PROJECT_ID = 'project-1'
const WORKSPACE_ID = 'workspace-1'
const CHARACTER_ID = 'character-1'
const RESERVED_JOB_ID = 'reserved-job-777'
const DESIGN_TOKENS = { l1: { art_style: 'ink storybook' }, palette: { primary: 'cobalt' } }

const dbState: {
  projects: Array<Record<string, unknown>>
  characters: Array<Record<string, unknown>>
  appearances: Array<Record<string, unknown>>
} = { projects: [], characters: [], appearances: [] }

function reservation(kind: string): GenerationJob {
  return {
    id: RESERVED_JOB_ID,
    project_id: PROJECT_ID,
    request_id: `reserved:${RESERVED_JOB_ID}`,
    model: 'pending',
    kind,
    status: 'queued',
    target: {},
    video_clip_id: null,
    idempotency_key: null,
    result_url: null,
    error: null,
    fal_key_id: 'prod-2000',
  } as GenerationJob
}

beforeEach(() => {
  dbState.projects = [{ id: PROJECT_ID, workspace_id: WORKSPACE_ID, design_tokens: DESIGN_TOKENS, style_anchor_key: null, custom_style_anchor: null }]
  dbState.characters = [{ project_id: PROJECT_ID, character_id: CHARACTER_ID, name: '카이', role: 'protagonist', costume: null, entity_type: 'person' }]
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
  vi.resetAllMocks()
  mocks.from.mockImplementation((table: string) => queryFor(table))
  mocks.resolveWebhookUrl.mockImplementation((jobId?: string) => (jobId ? `https://hook.test/api/fal/webhook?jobId=${jobId}` : 'https://hook.test/api/fal/webhook'))
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.rejectGenerationJobReservation.mockResolvedValue(undefined)
  mocks.falImageSubmit.mockImplementation(async (opts: { model?: string }) => ({
    request_id: 'fal-request-1',
    model: opts.model ?? 'openai/gpt-image-2',
    fal_key_id: 'prod-2000',
  }))
  mocks.hasQueuedCharacterViewJob.mockResolvedValue(false)
  mocks.hasQueuedWorldShotJob.mockResolvedValue(false)
  mocks.countFailedJobsForTarget.mockResolvedValue(0)
  mocks.listFailedCharacterViewJobs.mockResolvedValue([])
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' })
  mocks.recordWriterObservabilityEvent.mockResolvedValue(undefined)
})

describe('그림 제출의 완료 알림 주소', () => {
  it('인물 시트 제출 주소에 작업 번호가 들어간다', async () => {
    mocks.reserveGenerationJob.mockResolvedValue(reservation('character_view'))

    const response = await generateSheetPOST(new Request('http://localhost/api/artist/generate-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: PROJECT_ID, characterId: CHARACTER_ID, appearanceKey: 'current', view: 'main' }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.resolveWebhookUrl).toHaveBeenCalledWith(RESERVED_JOB_ID)
    expect(mocks.falImageSubmit.mock.calls[0][0]).toMatchObject({
      webhookUrl: `https://hook.test/api/fal/webhook?jobId=${RESERVED_JOB_ID}`,
    })
    // 예약 입력 기록에는 주소를 남기지 않는다(같은 요구면 같은 내용).
    expect(JSON.stringify(mocks.reserveGenerationJob.mock.calls[0][0])).not.toContain('webhook')
  })

  it('배경 제출 주소에 작업 번호가 들어간다', async () => {
    mocks.reserveGenerationJob.mockResolvedValue(reservation('world_shot'))

    await submitWorldShotJob({
      projectId: PROJECT_ID,
      locationId: 'location-1',
      column: 'wide_shot' as const,
      prompt: 'a quiet harbor at dawn',
      actor: 'ui' as const,
      userId: 'user-1',
      workspaceId: WORKSPACE_ID,
      moderation: MODERATION_FIXTURE,
    })

    expect(mocks.resolveWebhookUrl).toHaveBeenCalledWith(RESERVED_JOB_ID)
    expect(mocks.falImageSubmit.mock.calls[0][0]).toMatchObject({
      webhookUrl: `https://hook.test/api/fal/webhook?jobId=${RESERVED_JOB_ID}`,
    })
  })
})

function queryFor(table: string) {
  const filters: Array<{ column: string; value: unknown; op: 'eq' | 'is' }> = []
  let limitValue: number | null = null
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => { filters.push({ column, value, op: 'eq' }); return query }),
    is: vi.fn((column: string, value: unknown) => { filters.push({ column, value, op: 'is' }); return query }),
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
  return []
}
