// 실사 스토리보드는 자리를 먼저 예약하고, 거절되면 제출하지 않으며, 제출 뒤 접수 번호를 채운다
//
// 감사(2026-09-11) + 오너 결정(2026-09-11): DB 트리거가 자리를 넘는 기록을 거절하게 됐는데 이미지
//   경로는 fal 에 먼저 제출하고 기록해서, 거절되면 이미 돈이 나간 뒤였다. 순서를 뒤집어야 트리거가
//   의미를 갖는다. 자동 재시도는 없다 — 접수 여부를 모르면 예약을 남기고 사람이 판단한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  falImageSubmit: vi.fn(),
  recordWriterObservabilityEvent: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
// 접근 가드는 이 파일의 관심사 아님 — 소유자 통과로 고정(가드 자체는 api-project-access-guard.test.ts 전담).
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: USER_ID, viaShare: false }),
}))
// 사전 한도 검사만 목으로 고정하고 429 본문·관측 규약(api/quota)은 실제 모듈을 쓴다.
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.falImageSubmit }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent }))
vi.mock('@/lib/style-anchor', () => ({
  resolveStyleAnchor: async () => null,
  applyStyleAnchor: (_anchor: unknown, opts: unknown) => opts,
}))
vi.mock('@/lib/fal/webhook-url', () => ({
  resolveWebhookUrl: () => WEBHOOK_URL,
  resolveWebhookBaseUrl: () => 'https://base.test',
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((i) => [i.id, i.native])),
}))
// 시트 합성은 sharp 를 쓰는 무거운 순수 함수 — 이 파일의 검사 대상이 아니다.
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

import { POST as generateStoryboardPOST } from '@/app/api/director/generate-storyboard/route'
import { POST as generateStoryboardBatchPOST } from '@/app/api/director/generate-storyboard-batch/route'
import { GenerationCapacityError } from '@/lib/generation-jobs'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'user-1'
const WORKSPACE_ID = 'workspace-1'
const WEBHOOK_URL = 'https://hook.test/webhook'
const JOB_ID = 'job-1'
/** 예약 행이 들고 있는 키 — 트리거가 여유 있는 계정으로 바꿔 넣었을 수 있어 제출은 이 값으로 한다. */
const RESERVED_KEY_ID = 'key-2'

let db: Record<string, Array<Record<string, unknown>>>

/** supabase-js 체인 최소 스텁 — 라우트가 실제로 쓰는 메서드만. */
function queryFor(table: string) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit', 'not', 'is']) q[name] = () => q
  q.maybeSingle = q.single = async () => ({ data: db[table]?.[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: db[table] ?? [], error: null }).then(resolve)
  return q
}

function storyboardRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/director/generate-storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      writerShotId: 'sh_01_01',
      prompt: 'SHOT PROMPT',
      referenceImageUrls: ['https://ref/a.png'],
      aspectRatio: '16:9',
      ...body,
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

/** 러프 3프레임이 갖춰진 배치 대상 샷 — 그리드 두 장(4+4)이 되게 8개를 한 씬에 둔다. */
function gridShots(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    shot_id: `sh_01_${String(i + 1).padStart(2, '0')}`,
    scene_id: 'scene-1',
    characters: [],
    character_appearance_keys: {},
    rough_storyboard: {
      frames: { start: 'https://r/s.png', direction: 'https://r/d.png', end: 'https://r/e.png' },
      generatedAt: 1000,
    },
    storyboard_image: null,
    static_spec: null,
    director_refs: null,
  }))
}

function capacityRejection() {
  return new GenerationCapacityError('image_user_at_capacity', 'user_image', 6, 6)
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
  }
  mocks.from.mockImplementation(queryFor)
  mocks.checkGenerationCapacity.mockResolvedValue({
    ok: true,
    queued: 0,
    limit: 6,
    scope: 'user',
    category: 'image',
    axis: 'user_image',
  })
  mocks.reserveGenerationJob.mockResolvedValue({
    id: JOB_ID,
    project_id: PROJECT_ID,
    fal_key_id: RESERVED_KEY_ID,
    request_id: `reserved:${JOB_ID}`,
    status: 'queued',
  })
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.rejectGenerationJobReservation.mockResolvedValue(undefined)
  mocks.falImageSubmit.mockResolvedValue({
    request_id: 'fal-1',
    model: 'openai/gpt-image-2/edit',
    fal_key_id: RESERVED_KEY_ID,
    fal_request: { prompt: 'SHOT PROMPT' },
  })
})

describe('실사 스토리보드의 자리 예약 선행', () => {
  it('같은 샷의 이미지가 이미 접수됐으면 새로 제출하지 않고 기존 작업을 돌려준다', async () => {
    const jobId = '22222222-2222-4222-8222-222222222222'
    mocks.reserveGenerationJob.mockRejectedValue({ code: 'P0001', message: 'storyboard_already_generating', details: jobId })
    const response = await generateStoryboardPOST(storyboardRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ jobId, status: 'queued', replayed: true })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  it('일괄 이미지와 개별 이미지의 대상이 겹치면 중복 제출 없이 기존 작업을 기다린다', async () => {
    db.shots = gridShots(4)
    mocks.reserveGenerationJob.mockRejectedValue({ code: 'P0001', message: 'storyboard_already_generating', details: '22222222-2222-4222-8222-222222222222' })
    const response = await generateStoryboardBatchPOST(batchRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { submitted: [], remaining: 4 } })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: fal 에 먼저 내면 트리거가 기록을 거절해도 돈은 이미 나간 뒤다 — 순서가 곧 방어다.
  it('실사 단건은 외부 제출 전에 자리를 예약한다', async () => {
    const response = await generateStoryboardPOST(storyboardRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, jobId: JOB_ID, status: 'queued' })
    expect(mocks.reserveGenerationJob).toHaveBeenCalledTimes(1)
    expect(mocks.reserveGenerationJob.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT_ID,
      kind: 'shot_storyboard',
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    })
    // 예약이 제출보다 먼저다.
    expect(mocks.reserveGenerationJob.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.falImageSubmit.mock.invocationCallOrder[0],
    )
    // 재시도 금지(응답을 잃은 유료 접수의 복제 방지) + 예약 행이 들고 있는 키로 제출.
    expect(mocks.falImageSubmit.mock.calls[0][1]).toEqual({ retry: false, falKeyId: RESERVED_KEY_ID })
  })

  // 왜: 자리 판정은 DB 가 원자적으로 한다 — 거절을 무시하고 제출하면 상한이 다시 뚫린다.
  it('자리가 없어 예약이 거절되면 제출 없이 자리 없음으로 응답한다', async () => {
    mocks.reserveGenerationJob.mockRejectedValue(capacityRejection())

    const response = await generateStoryboardPOST(storyboardRequest())

    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({
      code: 'quota_exceeded',
      axis: 'user_image',
      scope: 'user',
      category: 'image',
      queued: 6,
      limit: 6,
    })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    // 어느 축에서 막혔는지 관측에 남는다 — 자동 재시도가 없어 거절이 곧 사용자 문장이다.
    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_rejected_quota',
      expect.objectContaining({ kind: 'shot_storyboard', axis: 'user_image' }),
    )
  })

  // 왜: 접수 번호가 예약에 연결돼야 웹훅·폴링이 그 자리의 결과를 찾는다.
  it('제출 뒤 접수 번호를 예약에 채운다', async () => {
    const response = await generateStoryboardPOST(storyboardRequest())

    expect(response.status).toBe(200)
    expect(mocks.confirmGenerationJobReceipt).toHaveBeenCalledWith(
      JOB_ID,
      PROJECT_ID,
      expect.objectContaining({ request_id: 'fal-1', model: 'openai/gpt-image-2/edit', fal_key_id: RESERVED_KEY_ID }),
    )
    expect(mocks.confirmGenerationJobReceipt.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.falImageSubmit.mock.invocationCallOrder[0],
    )
  })

  // 왜: 확실히 거절된 자리를 queued 로 두면 상한만 먹고 영원히 끝나지 않는다.
  it('외부가 명확히 거절하면 예약을 실패로 닫는다', async () => {
    mocks.falImageSubmit.mockRejectedValue(Object.assign(new Error('invalid input'), { status: 422 }))

    const response = await generateStoryboardPOST(storyboardRequest())

    expect(response.status).toBe(500)
    expect(mocks.rejectGenerationJobReservation).toHaveBeenCalledWith(
      JOB_ID,
      PROJECT_ID,
      expect.stringContaining('invalid input'),
    )
    expect(mocks.confirmGenerationJobReceipt).not.toHaveBeenCalled()
  })

  // 왜: 응답을 잃었을 뿐 이미 접수됐을 수 있다 — 새 번호로 다시 내면 이중 발주·이중 과금이다.
  it('접수 응답을 잃으면 예약을 남기고 다시 내지 않는다', async () => {
    mocks.falImageSubmit.mockRejectedValue(new TypeError('fetch failed'))

    const response = await generateStoryboardPOST(storyboardRequest())

    expect(response.status).toBe(200)
    // 잡은 예약 id 그대로 — 클라는 이 번호로 상태를 본다.
    expect(await response.json()).toMatchObject({ ok: true, jobId: JOB_ID, status: 'queued' })
    expect(mocks.falImageSubmit).toHaveBeenCalledTimes(1)
    expect(mocks.rejectGenerationJobReservation).not.toHaveBeenCalled()
    expect(mocks.confirmGenerationJobReceipt).not.toHaveBeenCalled()
  })

  // 왜: 일괄이라고 한 번에 자리를 잡지 않는다 — 앞 장이 자리를 먹으면 뒤 장은 그 사실을 보고 멈춰야 한다.
  it('그리드 일괄은 한 장씩 예약하고 자리가 없는 장만 건너뛴다', async () => {
    db.shots = gridShots(8)
    mocks.reserveGenerationJob
      .mockResolvedValueOnce({ id: JOB_ID, project_id: PROJECT_ID, fal_key_id: RESERVED_KEY_ID })
      .mockRejectedValueOnce(capacityRejection())

    const response = await generateStoryboardBatchPOST(batchRequest())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(mocks.reserveGenerationJob).toHaveBeenCalledTimes(2)
    // 두 번째 자리가 없으면 그 시트는 외부에 내지 않는다 — 첫 시트는 그대로 진행.
    expect(mocks.falImageSubmit).toHaveBeenCalledTimes(1)
    expect(body.data.submitted).toEqual([{ jobId: JOB_ID, shotIds: db.shots.slice(0, 4).map((s) => s.shot_id) }])
    // 건너뛴 4샷은 잔량으로 돌아온다 — 다음 라운드가 다시 잡는다.
    expect(body.data.remaining).toBe(4)
    expect(body.data.skipped).toEqual([])
  })
})
