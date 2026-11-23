// 인물 시트 · 배경을 그리는 네 길(시트 단추 · 배경 단추 · [만들기] 첫 시트 · 첫 배경)을 실제로 돌려, 실사 그림체만 사진 글을 싣는지 검사한다 (오너 2026-11-23)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), reserve: vi.fn(), fal: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: async () => ({ data: null, error: null }) } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true as const, projectId: 'P', userId: 'U', viaShare: false }) }))
vi.mock('@/lib/generation-quota', async (original) => ({ ...(await original<object>()), checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/generation-jobs', async (original) => ({
  ...(await original<object>()), reserveGenerationJob: mocks.reserve, confirmGenerationJobReceipt: async () => {}, rejectGenerationJobReservation: async () => {},
  hasQueuedCharacterViewJob: async () => false, hasQueuedWorldShotJob: async () => false, countFailedJobsForTarget: async () => 0, listFailedCharacterViewJobs: async () => [], listFailedWorldShotJobs: async () => [],
}))
vi.mock('@/lib/writer/llm/fal', async (original) => ({ ...(await original<object>()), falImageSubmit: mocks.fal }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: async () => {} }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined, resolveWebhookBaseUrl: () => undefined }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => 'https://tpl/t.png' }))
vi.mock('@/lib/api/moderation', async (original) => ({ ...(await original<object>()), recordModerationPass: () => {} }))

import { POST as sheetRoute } from '@/app/api/artist/generate-sheet/route'
import { POST as worldRoute } from '@/app/api/artist/generate-world/route'
import { triggerCharacterDrafts, triggerWorldDrafts } from '@/lib/artist/draft-trigger'
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest, PHOTO_SHEET_LINE, PHOTO_WORLD_LEAD } from '@/lib/style-facets/photo-look'
import { fakeFrom, OTHER_STYLES, STYLE_ROWS, type FakeDb } from '../fixtures/_fake-db'

let db: FakeDb = {}
function seed(styleKey: string | null, custom: unknown = null) {
  db = {
    projects: [{ id: 'P', workspace_id: 'W', design_tokens: { l1: { art_style: 'live_action', texture_philosophy: 'photorealistic' } }, style_anchor_key: styleKey, custom_style_anchor: custom, settings: null, series: null }],
    style_anchors: STYLE_ROWS,
    characters: [{ project_id: 'P', character_id: 'mina', name: 'Mina', role: 'lead', costume: ['coat'], entity_type: 'person' }],
    character_appearances: [{ project_id: 'P', character_id: 'mina', appearance_key: 'current', is_default: true, appearance: 'A tall woman in red.', costume: ['coat'], sheet_url: null, portrait_url: null, derived_from_url: null }],
    character_image_candidates: [],
    locations: [{ project_id: 'P', location_id: 'l1', scene_id: null, name: 'Porch', visual_description: 'Old porch', style_description: null, lighting_direction: null, lighting_sources: [], time_of_day: null, purpose: null, props: [], wide_shot: null }],
    location_appearances: [],
    generation_jobs: [],
  }
}
const post = (route: unknown, body: Record<string, unknown>) => (route as (req: Request) => Promise<Response>)(new Request('http://test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'P', ...body }) }))
const WAYS: Array<[string, () => Promise<unknown>]> = [
  ['시트 단추', () => post(sheetRoute, { characterId: 'mina', appearanceKey: 'current', view: 'main', actor: 'ui' })],
  ['[만들기] 첫 시트', () => triggerCharacterDrafts('P')],
  ['배경 단추', () => post(worldRoute, { locationId: 'l1', column: 'wide_shot', prompt: 'Old porch', aspectRatio: '16:9', actor: 'ui' })],
  ['[만들기] 첫 배경', () => triggerWorldDrafts('P')],
]
async function promptOf(way: () => Promise<unknown>): Promise<string> {
  mocks.fal.mockClear()
  await way()
  expect(mocks.fal).toHaveBeenCalledTimes(1)
  return String((mocks.fal.mock.calls[0][0] as { prompt: string }).prompt)
}

beforeEach(() => {
  vi.clearAllMocks()
  _clearReferenceImageCacheForTest()
  _clearPhotoLookCacheForTest()
  for (const method of ['warn', 'error', 'log'] as const) vi.spyOn(console, method).mockImplementation(() => {})
  mocks.from.mockImplementation(fakeFrom(() => db))
  let n = 0
  mocks.reserve.mockImplementation(async () => ({ id: `job-${++n}`, project_id: 'P', fal_key_id: 'k', request_id: `reserved:job-${n}`, status: 'queued' }))
  mocks.fal.mockImplementation(async (input: { model?: string }) => ({ request_id: 'f', model: input.model ?? 'm', fal_key_id: 'k', fal_request: {} }))
})

describe('실사 그림체의 시트와 배경', () => {
  it.each(WAYS)('%s 길의 지시문에 사진 글과 "실제 사진" 문장을 싣는다', async (_label, way) => {
    // 왜: 한 길이라도 빠지면 같은 작품 안에서 그림과 사진이 섞인다.
    seed('real')
    const prompt = await promptOf(way)
    expect(prompt.includes(PHOTO_SHEET_LINE) || prompt.startsWith(PHOTO_WORLD_LEAD)).toBe(true)
    expect(prompt).toContain('A real photograph, not an illustration, painting or anime')
  })
})

describe('일본 멜로와 다른 그림체의 시트와 배경', () => {
  it.each(WAYS.flatMap(([label, way]) => OTHER_STYLES.map(([style, key, custom]) => [label, style, way, key, custom] as const)))('%s 길 · %s 그림체의 지시문에는 사진 글을 싣지 않는다', async (_label, _style, way, key, custom) => {
    // 왜: 오너가 실사만 바꾸라고 했다 — 다른 그림체의 시트 · 배경은 지금 그대로다.
    seed(key, custom)
    expect(await promptOf(way)).not.toMatch(/studio photograph|photographed on location|A real photograph, not/)
  })
})
