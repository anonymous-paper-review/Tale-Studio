// 올린 그림체의 분석 결과가 있으면 스토리보드 시트(4샷 묶음)에도 그림체 앵커와 피할 것을 싣는다 (오너 결정 2026-10-10)
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
// 시트 합성(sharp)만 빼고 프롬프트는 실제 함수로 만든다 — 이 파일은 프롬프트에 무엇이 실리는지 본다.
vi.mock('@/lib/director/storyboard-strip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/director/storyboard-strip')>()),
  composeRoughReferenceGrid: async () => Buffer.from('grid'),
}))
vi.mock('@/lib/storage/media', () => ({ mediaUpload: async () => ({ error: null }), mediaPublicUrl: (path: string) => `https://media.test/${path}` }))

import { POST } from '@/app/api/director/generate-storyboard-batch/route'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const STYLE_URL = 'https://media.test/style.png'
const ANCHORS = 'Thin red brown colour outlines with hard cel fills; detail budget sparse.'
const AVOID = 'Avoid generic modern anime rendering, thick black outlines, readable text.'
const FIGURE = 'Anime face on a compressed chibi body about 2.8 heads tall.'
const PRIORITY = 'Priority order: thin colour lines → big heads'

let db: Record<string, Array<Record<string, unknown>>>
function queryFor(table: string) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit', 'not', 'is']) q[name] = () => q
  q.maybeSingle = q.single = async () => ({ data: db[table]?.[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: db[table] ?? [], error: null }).then(resolve)
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
const sheetPrompt = () => (mocks.reserveGenerationJob.mock.calls[0][0] as { inputSnapshot: { prompt: string } }).inputSnapshot.prompt

beforeEach(() => {
  vi.clearAllMocks()
  db = { projects: [], shots: shots(4), scenes: [], locations: [], location_appearances: [], characters: [], character_appearances: [], generation_jobs: [] }
  mocks.from.mockImplementation(queryFor)
  mocks.reserveGenerationJob.mockResolvedValue({ id: 'job-1', project_id: PROJECT_ID, fal_key_id: 'key-1', request_id: 'reserved:job-1', status: 'queued' })
})

describe('스토리보드 시트의 그림체', () => {
  it('올린 그림체의 분석 결과가 있으면 스토리보드 시트에 그림체 앵커와 피할 것을 싣는다', async () => {
    // 왜: 지금은 그림체 그림 한 장만 참조로 붙여, 분석이 찾은 선 굵기 · 밝기 · 강조색 규칙이 스토리보드에는 하나도 가지 않았다.
    //   시트는 러프 4장을 한 번에 다시 그리는 형식이라 긴 인물 조각과 우선순위 줄은 넣지 않는다.
    db.projects = [{ workspace_id: 'ws-1', style_anchor_key: 'custom_1', settings: null, custom_style_anchor: { url: STYLE_URL, facets: { probe_anchors: ANCHORS, negative: AVOID } } }]
    mocks.resolveStyleAnchor.mockResolvedValue({ key: 'custom_1', imageUrl: STYLE_URL, facets: { probeAnchors: ANCHORS, figure: FIGURE, priority: PRIORITY, negative: AVOID } })
    expect((await POST(request())).status).toBe(200)
    const prompt = sheetPrompt()
    expect(prompt).toContain(`Style anchors: ${ANCHORS}`)
    expect(prompt).toContain(AVOID)
    expect(prompt).not.toContain(FIGURE)
    expect(prompt).not.toContain(PRIORITY)
  })

  it('프리셋 그림체의 스토리보드 시트에는 지금처럼 손으로 쓴 그림체 문장만 싣는다', async () => {
    // 정상 경로 고정 — 이번 결정은 올린 그림체만 바꾼다.
    db.projects = [{ workspace_id: 'ws-1', style_anchor_key: 'jp_anime', settings: null, custom_style_anchor: null }]
    mocks.resolveStyleAnchor.mockResolvedValue({ key: 'jp_anime', imageUrl: 'https://media.test/jp.png', styleClause: 'Preset style clause.', facets: { probeAnchors: 'Preset anchors.', figure: null, priority: 'Priority order: a', negative: 'Avoid preset things.' } })
    await POST(request())
    const prompt = sheetPrompt()
    expect(prompt).toContain('Preset style clause.')
    expect(prompt).not.toContain('Style anchors:')
    expect(prompt).not.toContain('Avoid preset things.')
  })
})
