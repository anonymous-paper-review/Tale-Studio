// 러프·실사 스토리보드 경로는 Creem 검사에 막히면 자리 예약도 외부 제출도 하지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 러프 그리드와 실사 시트는 한 호출이 여러 샷을 묶는다 — 막힌 글이 하나라도 있으면 그 호출은
//   자리(generation_jobs)를 잡지 않고 끝나야 한다. 이미 낸 시트가 있으면 그것만 진행시킨다.
const mocks = vi.hoisted(() => ({
  assertUserTextAllowed: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  reserveGenerationJob: vi.fn(),
  falImageSubmit: vi.fn(),
  recordWriterObservabilityEvent: vi.fn(),
  syncFalKeyLimits: vi.fn(),
}))

vi.mock('@/lib/moderation/creem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation/creem')>()),
  assertUserTextAllowed: mocks.assertUserTextAllowed,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: USER_ID, viaShare: false }),
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: async () => ({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' }),
  syncFalKeyLimits: mocks.syncFalKeyLimits,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  getGenerationJobById: async () => ({ id: 'job-1', project_id: PROJECT_ID, request_id: 'reserved:job-1', status: 'queued', fal_key_id: 'key-1' }),
}))
vi.mock('@/lib/writer/llm/fal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/writer/llm/fal')>()),
  falImageSubmit: mocks.falImageSubmit,
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent }))
vi.mock('@/lib/fal/webhook-url', () => ({
  resolveWebhookUrl: () => 'https://hook.test/webhook',
  resolveWebhookBaseUrl: () => 'https://base.test',
}))
vi.mock('@/lib/style-anchor', () => ({
  resolveStyleAnchor: async () => null,
  applyStyleAnchor: (_anchor: unknown, opts: unknown) => opts,
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((i) => [i.id, i.native])),
}))
vi.mock('@/lib/writer/i18n/entity-names', () => ({
  ensureEntityNamesEn: async () => ({ characters: new Map() }),
  ensureStageLandmarkLabelsEn: async () => new Map(),
  sceneLocationLabelsEn: async () => new Map(),
}))
vi.mock('@/lib/writer/shot-design-state', () => ({
  loadShotDesignByMainId: async () => new Map(),
  resolveShotDesign: () => null,
}))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/director/storyboard-strip', () => ({
  composeRoughReferenceGrid: async () => Buffer.from('grid'),
  composeRoughReferenceStrip: async () => ({ buffer: Buffer.from('strip'), sheetFormat: null, geometry: { frameAxis: 'x', repaintCanvas: '1024x1024' } }),
  buildRealGridPrompt: () => 'GRID PROMPT',
  buildRealStripPrompt: () => 'STRIP PROMPT',
  realSheetCanvas: () => '2048x1536',
}))
vi.mock('@/lib/storage/media', () => ({
  mediaUpload: async () => ({ error: null }),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
}))

import { POST as roughStoryboardPOST } from '@/app/api/writer/rough-storyboard/route'
import { POST as generateStoryboardPOST } from '@/app/api/director/generate-storyboard/route'
import { POST as generateStoryboardBatchPOST } from '@/app/api/director/generate-storyboard-batch/route'
import { ModerationBlockedError, ModerationUnavailableError } from '@/lib/moderation/creem'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'user-1'
const WORKSPACE_ID = 'workspace-1'

let db: Record<string, Array<Record<string, unknown>>>

function queryFor(table: string) {
  let single = false
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit', 'not', 'is', 'update', 'like']) q[name] = () => q
  q.single = q.maybeSingle = () => {
    single = true
    return q
  }
  q.then = (resolve: (value: unknown) => unknown) => {
    const rows = db[table] ?? []
    return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve)
  }
  return q
}

/** 러프 3프레임이 갖춰진 샷 — 실사 그리드는 4개를 한 씬에 둔다. */
function gridShots(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    project_id: PROJECT_ID,
    shot_id: `sh_01_${String(i + 1).padStart(2, '0')}`,
    scene_id: 'scene-1',
    sort_order: i,
    action_description: '칼을 내려놓는다',
    characters: [],
    character_appearance_keys: {},
    check_notes: null,
    prompt: null,
    static_spec: null,
    dynamic_spec: null,
    design_ref: null,
    rough_storyboard: {
      frames: { start: 'https://r/s.png', direction: 'https://r/d.png', end: 'https://r/e.png' },
      generatedAt: 1000,
    },
    storyboard_image: null,
    director_refs: null,
  }))
}

/** 러프가 아직 없는 샷 — 러프 라우트의 생성 대상. */
function roughPendingShots(count: number) {
  return gridShots(count).map((shot) => ({ ...shot, rough_storyboard: null }))
}

function roughRequest() {
  return new Request('http://localhost/api/writer/rough-storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  })
}

function storyboardRequest() {
  return new Request('http://localhost/api/director/generate-storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      writerShotId: 'sh_01_01',
      prompt: 'SHOT PROMPT',
      referenceImageUrls: ['https://ref/a.png'],
      aspectRatio: '16:9',
    }),
  })
}

function batchRequest() {
  return new Request('http://localhost/api/director/generate-storyboard-batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    projects: [{ id: PROJECT_ID, workspace_id: WORKSPACE_ID, style_anchor_key: null, custom_style_anchor: null, settings: null }],
    shots: gridShots(4),
    scenes: [{ scene_id: 'scene-1', time_of_day: 'night' }],
    locations: [],
    location_appearances: [],
    characters: [],
    character_appearances: [],
    generation_jobs: [],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.syncFalKeyLimits.mockResolvedValue(undefined)
  mocks.rpc.mockResolvedValue({ data: [{ job_id: 'job-1', shot_ids: ['sh_01_01'], state: 'reserved' }], error: null })
  mocks.reserveGenerationJob.mockResolvedValue({
    id: 'job-1',
    project_id: PROJECT_ID,
    fal_key_id: 'key-1',
    request_id: 'reserved:job-1',
    status: 'queued',
  })
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'm', fal_key_id: 'key-1' })
  mocks.assertUserTextAllowed.mockRejectedValue(new ModerationBlockedError('flag', 'mod_1'))
})

describe('스토리보드 경로의 내용 규칙 차단', () => {
  // 왜: 러프는 예약 RPC 가 자리를 잡는다 — 막힌 호출이 RPC 까지 가면 결과 없는 유료 작업이 남는다.
  it('러프 스토리보드가 검사에 막히면 예약도 제출도 하지 않는다', async () => {
    db.shots = roughPendingShots(4)

    const response = await roughStoryboardPOST(roughRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'content_policy_blocked' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 실사 단건도 같은 관문을 지난다 — 러프만 막으면 실사 경로로 그대로 빠져나간다.
  it('실사 스토리보드가 검사에 막히면 예약도 제출도 하지 않는다', async () => {
    const response = await generateStoryboardPOST(storyboardRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'content_policy_blocked' })
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 일괄은 시트마다 자리를 잡는다 — 첫 시트가 막히면 아무것도 접수하지 않고 거절로 답해야 한다.
  it('실사 일괄이 검사에 막히면 예약도 제출도 하지 않는다', async () => {
    const response = await generateStoryboardBatchPOST(batchRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'content_policy_blocked' })
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 검사 장애를 통과로 보면 장애 시간대 러프가 전부 검사 없이 나간다.
  it('검사 장애면 러프를 제출하지 않고 잠시 후 다시 시도로 답한다', async () => {
    db.shots = roughPendingShots(4)
    mocks.assertUserTextAllowed.mockRejectedValue(new ModerationUnavailableError('http_error', 502))

    const response = await roughStoryboardPOST(roughRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'moderation_unavailable' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('스토리보드 경로가 검사에 보내는 글', () => {
  beforeEach(() => {
    mocks.assertUserTextAllowed.mockResolvedValue({
      decision: 'allow',
      id: 'mod_ok',
      checked_at: '2026-10-11T00:00:00.000Z',
      chars: 10,
    })
  })

  // 왜: 그리드·스트립 지시문은 우리 고정 템플릿이다 — 보내면 오탐을 만들고 글자 수만큼 단가가 붙는다.
  it('러프 스토리보드는 샷 설명만 보내고 그리드 템플릿은 보내지 않는다', async () => {
    db.shots = roughPendingShots(4)

    await roughStoryboardPOST(roughRequest())

    const parts = (mocks.assertUserTextAllowed.mock.calls[0][0] as Array<string | null | undefined>)
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    expect(parts).toContain('칼을 내려놓는다')
    expect(parts.join('\n')).not.toMatch(/mannequin|pencil|storyboard/i)
    expect(mocks.assertUserTextAllowed.mock.calls[0][1]).toMatchObject({
      projectId: PROJECT_ID,
      kind: 'shot_rough_storyboard',
      userId: USER_ID,
    })
  })

  // 왜: "이 작업이 무엇으로 통과했나"를 나중에 읽을 수 있어야 한다. 예약 스냅샷은 같은 요구면 같은
  //   내용이어야 하므로(리플레이 대조) 영수증은 작업 기록 이벤트에 남긴다.
  it('러프는 통과한 검사를 작업 id 와 함께 기록한다', async () => {
    db.shots = roughPendingShots(4)

    await roughStoryboardPOST(roughRequest())

    expect(mocks.rpc).toHaveBeenCalled()
    expect(mocks.rpc.mock.calls[0][1].p_input_snapshot).not.toHaveProperty('moderation')
    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_moderation_passed',
      expect.objectContaining({ jobId: 'job-1', kind: 'shot_rough_storyboard', moderationId: 'mod_ok', decision: 'allow' }),
      expect.objectContaining({ generationJobId: 'job-1' }),
    )
  })

  // 왜: 실사 단건의 검사 대상은 샷 산문이다 — 앵커·무인물 절은 서버가 붙인 우리 문구다.
  it('실사 스토리보드는 샷 산문만 보내고 앵커 절은 보내지 않는다', async () => {
    await generateStoryboardPOST(storyboardRequest())

    const parts = (mocks.assertUserTextAllowed.mock.calls[0][0] as Array<string | null | undefined>)
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    expect(parts).toEqual(['SHOT PROMPT'])
    expect(mocks.reserveGenerationJob.mock.calls[0][0].inputSnapshot).not.toHaveProperty('moderation')
    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_moderation_passed',
      expect.objectContaining({ kind: 'shot_storyboard', moderationId: 'mod_ok', decision: 'allow' }),
      expect.anything(),
    )
  })
})
