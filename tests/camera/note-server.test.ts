// 그림 만들기 서버가 사람 말(바꿀 점 · 채팅으로 부탁한 말)을 작업 기록에 적고, 잘못 온 말은 버린 채 그림은 그대로 만드는지 검사한다 (오너 2026-11-22 결정 4 · 리드 답 e)
//   모의 설정은 tests/director/storyboard-reserve-before-submit.test.ts 와 같다(라우트가 실제로 쓰는 것만).
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

describe('사람 말을 작업 기록에', () => {
  it('바꿀 점 · 채팅으로 부탁한 말을 받으면 그 말과 어디서 왔는지를 이번 그림 작업 기록에 적는다', async () => {
    // 왜: 결정 4 — 완료(finalize)가 그 기록을 보고 다 그린 판에 note · via 로 옮긴다.
    const response = await generateStoryboardPOST(storyboardRequest({ note: ' 하늘을 더 어둡게 ', via: 'button' }))
    expect(response.status).toBe(200)
    expect(mocks.reserveGenerationJob.mock.calls[0][0].target).toMatchObject({ writerShotId: 'sh_01_01', imageNote: { note: '하늘을 더 어둡게', via: 'button' } })
  })

  it('사람 말이 잘못 왔거나 없으면 기록에 남기지 않고 그림은 그대로 만든다', async () => {
    // 왜: 사람 말은 덧붙이는 기록일 뿐이다 — 그 때문에 그림 만들기가 막히면 안 된다.
    for (const extra of [{ note: '더 밝게', via: 'batch' }, { note: 7, via: 'chat' }, {}]) {
      mocks.reserveGenerationJob.mockClear()
      const response = await generateStoryboardPOST(storyboardRequest(extra))
      expect(response.status).toBe(200)
      expect(mocks.reserveGenerationJob.mock.calls[0][0].target).not.toHaveProperty('imageNote')
    }
  })
})
