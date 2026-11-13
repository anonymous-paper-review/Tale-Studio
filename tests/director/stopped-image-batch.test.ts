// [이미지 만들기] 일괄은 화면에서 멈춘 이미지 작업을 "이미 그리는 중"으로 세지 않는다 — 같은 샷 하나만 검사(가드)와 같은 규칙, 멈춤 표를 못 읽으면 지금처럼 (오너 2026-11-14 7번 · 검토 a)
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  reserveGenerationJob: vi.fn(),
  resolveStyleAnchor: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: 'user-1', viaShare: false }) }))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: async () => ({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' }),
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: async () => undefined,
  rejectGenerationJobReservation: async () => undefined,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: async () => ({ request_id: 'fal-1', model: 'm', fal_key_id: 'key-1', fal_request: {} }) }))
vi.mock('@/lib/style-anchor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/style-anchor')>()),
  resolveStyleAnchor: mocks.resolveStyleAnchor,
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://hook.test/webhook', resolveWebhookBaseUrl: () => 'https://base.test' }))
vi.mock('@/lib/director/storyboard-strip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/director/storyboard-strip')>()),
  composeRoughReferenceGrid: async () => Buffer.from('grid'),
}))
vi.mock('@/lib/storage/media', () => ({ mediaUpload: async () => ({ error: null }), mediaPublicUrl: (path: string) => `https://media.test/${path}` }))

import { POST } from '@/app/api/director/generate-storyboard-batch/route'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const STOPPED_JOB = '22222222-2222-4222-8222-222222222222'

let db: Record<string, Array<Record<string, unknown>>>
/** 읽지 못하는 표(운영 DB 에 아직 없음 등) — 그 표는 오류로 답한다. */
let unreadable: Set<string>
function queryFor(table: string) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit', 'not', 'is']) q[name] = () => q
  q.maybeSingle = q.single = async () => ({ data: db[table]?.[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(
    unreadable.has(table) ? { data: null, error: { message: `relation "${table}" does not exist` } } : { data: db[table] ?? [], error: null },
  ).then(resolve)
  return q
}
const shots = (count: number) => Array.from({ length: count }, (_, i) => ({
  shot_id: `sh_01_0${i + 1}`,
  scene_id: 'scene-1',
  characters: [],
  character_appearance_keys: {},
  rough_storyboard: { frames: { start: 'https://r/s.png', direction: 'https://r/d.png', end: 'https://r/e.png' }, generatedAt: 1000 },
  storyboard_image: null,
  static_spec: null,
  director_refs: null,
}))
const request = () => new Request('http://localhost/api/director/generate-storyboard-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT_ID }) }) as never
const sentShots = () => mocks.reserveGenerationJob.mock.calls.flatMap((call) => ((call[0] as { target?: { writerShotIds?: string[] } }).target?.writerShotIds ?? []))

beforeEach(() => {
  vi.clearAllMocks()
  unreadable = new Set()
  db = {
    projects: [{ workspace_id: 'ws-1', style_anchor_key: 'jp_anime', settings: null, custom_style_anchor: null }],
    shots: shots(4), scenes: [], locations: [], location_appearances: [], characters: [], character_appearances: [],
    // 화면에서 멈춘 Shot 1 의 그림 작업 — fal 에서 끝날 때까지 queued 로 남는다.
    generation_jobs: [{ id: STOPPED_JOB, target: { writerShotId: 'sh_01_01' }, created_at: new Date().toISOString() }],
    director_job_cancellations: [{ job_id: STOPPED_JOB, cancelled_at: '2026-11-14T03:00:00Z' }],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.resolveStyleAnchor.mockResolvedValue({ key: 'jp_anime', imageUrl: 'https://media.test/jp.png', styleClause: 'Preset style clause.', facets: { probeAnchors: 'Preset anchors.', figure: null, priority: 'Priority order: a', negative: 'Avoid preset things.' } })
  mocks.reserveGenerationJob.mockResolvedValue({ id: 'job-1', project_id: PROJECT_ID, fal_key_id: 'key-1', request_id: 'reserved:job-1', status: 'queued' })
})

it('멈춘 이미지 작업만 남은 샷은 새 [이미지 만들기] 일괄이 "이미 그리는 중"으로 건너뛰지 않고 그린다', async () => {
  // 왜: 검토 a — 멈춘 작업은 fal 에서 끝날 때까지(몇 분) queued 로 남아, 툴바는 "이미지 필요"로 세는데 일괄은 그 샷을 그리는 중으로 빼고 그리지 않았다.
  //   낱개 다시 만들기는 같은 샷 하나만 검사가 멈춘 작업을 빼서 됐다 — 일괄도 같은 규칙.
  const res = await POST(request())
  expect(res.status).toBe(200)
  const body = await res.json() as { data: { inProgress: Array<{ jobId: string }> } }
  expect(sentShots()).toContain('sh_01_01')
  expect(body.data.inProgress.map((entry) => entry.jobId)).not.toContain(STOPPED_JOB)
})

it('멈춤 표를 읽지 못하면(운영 DB 에 아직 없음) 지금처럼 그 샷을 그리는 중으로 보고 건너뛴다', async () => {
  // 왜: 정상 경로 고정 — 멈춤 표가 없는 DB 에서도 일괄이 깨지지 않고, 도는 작업이 있는 샷을 두 번 그리지 않는다.
  unreadable.add('director_job_cancellations')
  const res = await POST(request())
  expect(res.status).toBe(200)
  const body = await res.json() as { data: { inProgress: Array<{ jobId: string; shotIds: string[] }> } }
  expect(sentShots()).not.toContain('sh_01_01')
  expect(body.data.inProgress).toContainEqual(expect.objectContaining({ jobId: STOPPED_JOB, shotIds: ['sh_01_01'] }))
})
