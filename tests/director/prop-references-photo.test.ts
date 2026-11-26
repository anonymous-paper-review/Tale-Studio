// 실사 그림체(사진 지시문 길)와 일본 멜로 · 다른 그림체 모두, 소품이 나오는 샷만 지시문 끝에 소품 줄이 붙고 소품 그림이 참고 그림에 더해지며, 소품이 없는 샷은 글자까지 그대로인지 실제 라우트로 검사한다 (m1126 리드 R1 2026-11-26 · D7 2단계)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), reserve: vi.fn(), fal: vi.fn(), moderated: [] as unknown[][] }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: async () => ({ data: null, error: null }) } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true as const, projectId: 'P', userId: 'U', viaShare: false }) }))
vi.mock('@/lib/generation-quota', async (original) => ({ ...(await original<object>()), checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/generation-jobs', async (original) => ({ ...(await original<object>()), reserveGenerationJob: mocks.reserve, confirmGenerationJobReceipt: async () => {}, rejectGenerationJobReservation: async () => {} }))
vi.mock('@/lib/writer/llm/fal', async (original) => ({ ...(await original<object>()), falImageSubmit: mocks.fal }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: async () => {} }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined, resolveWebhookBaseUrl: () => undefined }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((i) => [i.id, i.native])) }))
// 지시문은 진짜 함수로 만들고, 러프 세 장을 한 장으로 붙이는 일만 흉내 낸다(real-style-routes 와 같다).
vi.mock('@/lib/director/storyboard-strip', async (original) => ({
  ...(await original<object>()),
  composeRoughReferenceGrid: async () => Buffer.from('grid'),
  composeRoughReferenceStrip: async (_frames: unknown, format: unknown) => ({ buffer: Buffer.from('strip'), sheetFormat: format, geometry: { frameAxis: String(format).startsWith('vertical') ? 'cols' : 'rows', repaintCanvas: '1024x1712' } }),
}))
vi.mock('@/lib/storage/media', () => ({ mediaUpload: async () => ({ error: null }), mediaPublicUrl: (path: string) => `https://media.test/${path}` }))
vi.mock('@/lib/moderation/creem', async (original) => {
  const actual = await original<{ assertUserTextAllowed: (parts: unknown[], context: unknown) => unknown }>()
  return { ...actual, assertUserTextAllowed: async (parts: unknown[], context: unknown) => { mocks.moderated.push(parts); return actual.assertUserTextAllowed(parts, context) } }
})
vi.mock('@/lib/api/moderation', async (original) => ({ ...(await original<object>()), recordModerationPass: () => {} }))

import { POST as single } from '@/app/api/director/generate-storyboard/route'
import { POST as batch } from '@/app/api/director/generate-storyboard-batch/route'
import { propReferenceLines } from '@/lib/director/shot-prop-refs'
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest } from '@/lib/style-facets/photo-look'
import { fakeFrom, OTHER_STYLES, STYLE_ROWS, type FakeDb } from '../fixtures/_fake-db'

const FRAMES = { start: 'https://r/s.png?v=900', direction: 'https://r/d.png?v=900', end: 'https://r/e.png?v=900' }
const LAMP = 'https://media.test/props/lamp.png'
const BOX = 'https://media.test/props/box.png'
const shot = (n: number, over: Record<string, unknown> = {}) => ({
  project_id: 'P', shot_id: `sh_0${n}`, scene_id: 'sc1', source: 'pipeline', sort_order: n, characters: ['jun'], character_appearance_keys: { jun: 'current' },
  rough_storyboard: { generatedAt: 1000, frames: FRAMES }, storyboard_image: null, dynamic_spec: null, design_ref: null, director_refs: null, check_notes: null,
  static_spec: { shot_type: 'MS', character_blocking: [{ character_id: 'jun', position_in_frame: 'center', pose: 'standing' }] },
  prompt: `Jun waits by the door in shot ${n}.`, action_description: null, action_description_native: null, ...over,
})
/** 그 샷 소품 칸 — 소품 id 와 자리. */
const withProps = (n: number, ...props: string[]) =>
  shot(n, { static_spec: { shot_type: 'MS', character_blocking: [{ character_id: 'jun', position_in_frame: 'center', pose: 'standing' }], prop_placement: props.map((prop) => ({ prop, position_in_frame: 'left_third' })) } })

let db: FakeDb = {}
function seed(styleKey: string | null, custom: unknown, shots: FakeDb[string], props: FakeDb[string]) {
  db = {
    projects: [{ id: 'P', workspace_id: 'W', style_anchor_key: styleKey, custom_style_anchor: custom, settings: { format: 'horizontal_16:9' }, series: null, optional_reference_frame_url: null }],
    style_anchors: STYLE_ROWS,
    shots,
    scenes: [{ project_id: 'P', scene_id: 'sc1', sort_order: 0, time_of_day: '밤', location: 'l1', narrative_time: null }],
    locations: [{ project_id: 'P', location_id: 'l1', scene_id: 'sc1', wide_shot: 'https://w/1.png' }],
    location_appearances: [],
    characters: [{ project_id: 'P', character_id: 'jun', name: '준', name_en: 'Jun', name_en_source: '준' }],
    character_appearances: [{ project_id: 'P', character_id: 'jun', appearance_key: 'current', is_default: true, sheet_url: 'https://s/jun.png', appearance: 'A tall man in a navy coat.' }],
    props,
    generation_jobs: [],
  }
}
const PROPS = [
  { project_id: 'P', prop_id: 'lamp', name: '등잔', image_url: LAMP },
  { project_id: 'P', prop_id: 'box', name: '나무 상자', image_url: BOX },
  { project_id: 'P', prop_id: 'cup', name: '컵', image_url: null },
]
interface Sent { prompt: string; refs: string[]; moderated: unknown[] }
async function send(route: typeof single | typeof batch, body: Record<string, unknown>): Promise<Sent> {
  mocks.fal.mockClear()
  mocks.moderated.length = 0
  const res = await (route as (req: Request) => Promise<Response>)(new Request('http://test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'P', ...body }) }))
  expect(res.status).toBe(200)
  const sent = mocks.fal.mock.calls[0][0] as { prompt: string; reference_image_urls?: string[] }
  return { prompt: sent.prompt, refs: (sent.reference_image_urls ?? []).slice(1), moderated: mocks.moderated[0] ?? [] }
}
const one = (n: number) => send(single, { writerShotId: `sh_0${n}`, prompt: db.shots.find((s) => s.shot_id === `sh_0${n}`)!.prompt })
const sheet = () => send(batch, {})

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

describe('실사 그림체(사진 지시문 길)의 소품 참고', () => {
  // 왜: 리드 R1(2026-11-26) — main 의 실사 그림체는 사진 지시문(photo-strip)으로 그린다. 그 길에도 dev 2단계처럼 소품 그림을 붙여야 샷마다 같은 물건이 나온다.
  //   참고 순서는 [러프, 인물, 배경, 추가 입력, 소품](실사는 화풍 그림이 없다), 소품 줄은 지시문 맨 끝 — 앞 글자는 소품이 없을 때와 같다.
  it('실사 그림체의 한 샷 실사도 그 샷에 나오는 소품 그림을 인물 · 배경 뒤에 붙이고, 지시문 끝에 그 번호와 이름을 적는다', async () => {
    seed('real', null, [shot(1)], PROPS)
    const before = await one(1)
    seed('real', null, [withProps(1, 'lamp', 'cup')], PROPS)
    const after = await one(1)
    expect(before.prompt).toContain('real actors')
    expect(after.refs).toEqual([...before.refs, LAMP])
    const lines = propReferenceLines(2 + before.refs.length, [{ propId: 'lamp', name: '등잔', url: LAMP, position: null }])
    expect(after.prompt).toBe(`${before.prompt}\n${lines.join('\n')}`)
    expect(after.prompt).toContain('reference image 4 = 등잔.')
    expect(after.prompt).not.toContain('컵')
    // 사용자가 쓴 소품 이름도 내용 검사에 함께 보낸다(dev 와 같다).
    expect(after.moderated).toEqual([...before.moderated, '등잔'])
  })

  // 왜: [전체 만들기](네 샷 한 장)도 같은 길이다 — 칸마다 그 칸의 소품을 적어야 다른 칸에 끼어들지 않는다.
  it('실사 그림체의 네 샷 시트도 칸마다 그 칸에 나오는 소품을 적고 소품 그림을 인물 · 배경 뒤에 붙인다', async () => {
    seed('real', null, [shot(1), shot(2)], PROPS)
    const before = await sheet()
    seed('real', null, [withProps(1, 'lamp'), withProps(2, 'box', 'lamp')], PROPS)
    const after = await sheet()
    expect(after.refs).toEqual([...before.refs, LAMP, BOX])
    expect(after.prompt.startsWith(before.prompt)).toBe(true)
    expect(after.prompt).toContain('reference image 4 = 등잔; reference image 5 = 나무 상자.')
    expect(after.prompt).toContain('Column 1: 등잔')
    expect(after.prompt).toContain('Column 2: 나무 상자 and 등잔')
  })

  // 왜: 정상 경로 고정 — 지금 만든 실사 프로젝트 대부분은 소품 그림이 없다. 소품 행이 있어도 그 샷에 안 나오면 실사 지시문 · 참고 그림이 한 글자도 바뀌면 안 된다(11/23 오너 "모두 적용" 그대로).
  it('실사 그림체에서 소품이 없는 샷의 지시문과 참고 그림은 소품을 더하기 전과 글자까지 같다', async () => {
    seed('real', null, [shot(1), shot(2)], [])
    const [beforeOne, beforeSheet] = [await one(1), await sheet()]
    seed('real', null, [shot(1), withProps(2, 'cup')], PROPS)
    const [afterOne, afterSheet] = [await one(1), await sheet()]
    expect(afterOne).toEqual(beforeOne)
    expect(afterSheet.prompt).toBe(beforeSheet.prompt)
    expect(afterSheet.refs).toEqual(beforeSheet.refs)
  })
})

describe('일본 멜로 · 다른 그림체의 소품 참고', () => {
  // 왜: dev 2단계 그대로 — 그림체 길에서도 소품 그림은 인물 · 배경 · 추가 입력 뒤, 화풍 그림 앞에 붙고(화풍은 여전히 마지막), 소품 줄은 지시문 맨 끝이다.
  it.each(OTHER_STYLES)('%s 그림체도 소품이 나오는 샷은 지시문 끝에 소품 줄을 붙이고, 소품 그림을 화풍 그림 앞에 넣는다', async (_label, key, custom) => {
    seed(key, custom, [shot(1)], PROPS)
    const before = await one(1)
    seed(key, custom, [withProps(1, 'lamp')], PROPS)
    const after = await one(1)
    const styleRefs = before.refs.filter((url) => url.startsWith('https://style.test/') || url.startsWith('https://user.test/'))
    const otherRefs = before.refs.filter((url) => !styleRefs.includes(url))
    expect(after.refs).toEqual([...otherRefs, LAMP, ...styleRefs])
    const lines = propReferenceLines(2 + otherRefs.length, [{ propId: 'lamp', name: '등잔', url: LAMP, position: null }])
    expect(after.prompt).toBe(`${before.prompt}\n${lines.join('\n')}`)
  })

  // 왜: 오너 11/23 "1 이전은 일본 멜로" — 다른 그림체 지시문은 글자까지 지금 그대로다. 소품이 없는 샷은 한 글자도 바뀌지 않는다.
  it.each(OTHER_STYLES)('%s 그림체에서 소품이 없는 샷의 지시문과 참고 그림은 글자까지 그대로다', async (_label, key, custom) => {
    seed(key, custom, [shot(1), shot(2)], [])
    const [beforeOne, beforeSheet] = [await one(1), await sheet()]
    seed(key, custom, [shot(1), shot(2)], PROPS)
    const [afterOne, afterSheet] = [await one(1), await sheet()]
    expect(afterOne).toEqual(beforeOne)
    expect(afterSheet).toEqual(beforeSheet)
  })
})
