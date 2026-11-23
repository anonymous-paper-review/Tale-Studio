// 한 샷 · 네 샷 실사 요청을 실제로 돌려, 실사 그림체일 때만 새 지시문을 쓰고 다른 그림체는 지금 길 그대로인지 검사한다 (오너 2026-11-23 "1 이전은 일본 멜로, 2 모두 적용은 실사")
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
// 지시문은 진짜 함수로 만들고, 러프 세 장을 한 장으로 붙이는 일만 흉내 낸다.
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
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest } from '@/lib/style-facets/photo-look'
import { fakeFrom, OTHER_STYLES, STYLE_ROWS, type FakeDb } from '../fixtures/_fake-db'

const PREVIOUS = 'An old man with a frame of sieves sets a wooden bucket beside the kitchen door and wipes the sweat off his brow. Rain starts.'
const FRAMES = { start: 'https://r/s.png?v=900', direction: 'https://r/d.png?v=900', end: 'https://r/e.png?v=900' }
const LAYOUT = { characters: [{ character_id: 'jun', start: { in_frame: true, screen_x: -0.5, position_in_frame: 'left_third' }, end: { in_frame: false, position_in_frame: 'off_left', screen_x: -1.4 } }, { character_id: 'mina', start: { in_frame: false, position_in_frame: 'off_right', screen_x: 1.4 }, end: { in_frame: true, screen_x: 0.5 } }] }
const shot = (n: number, over: Record<string, unknown> = {}) => ({
  project_id: 'P', shot_id: `sh_0${n}`, scene_id: 'sc1', source: 'pipeline', sort_order: n, characters: ['jun'], character_appearance_keys: { jun: 'current' },
  rough_storyboard: { generatedAt: 1000, frames: FRAMES }, storyboard_image: null, static_spec: null, dynamic_spec: null, design_ref: null, director_refs: null, check_notes: null,
  prompt: 'Jun waits by the door.', action_description: null, action_description_native: null, ...over,
})
let db: FakeDb = {}
function seed(styleKey: string | null, custom: unknown = null, over: { format?: string; shots?: FakeDb[string]; character_appearances?: FakeDb[string] } = {}) {
  db = {
    projects: [{ id: 'P', workspace_id: 'W', style_anchor_key: styleKey, custom_style_anchor: custom, settings: { format: over.format ?? 'horizontal_16:9' }, series: null, optional_reference_frame_url: null }],
    style_anchors: STYLE_ROWS,
    shots: over.shots ?? [
      shot(0, { prompt: PREVIOUS }),
      shot(1, {
        prompt: 'Jun turns as Mina steps in.', action_description: 'Jun turns as Mina steps in.',
        static_spec: { shot_type: 'MS', lens_mm: 85, lighting: { color_temp_kelvin: 3200, quality: 'soft' }, color_grading_intent: 'muted teal', character_blocking: [{ character_id: 'jun', position_in_frame: 'left_third', pose: 'standing' }, { character_id: 'mina', position_in_frame: 'right_third', pose: 'walking in' }], screen_layout: LAYOUT },
        check_notes: [{ constraint_target: 'visual', category: 'action_budget', constraint: 'Keep the movement small.' }, { constraint_target: 'visual', category: 'continuity', constraint: 'The lamp stays lit.' }],
      }),
      shot(2, { characters: [], character_appearance_keys: {}, prompt: 'An empty street.', static_spec: { shot_type: 'WS', character_blocking: [] } }),
    ],
    scenes: [{ project_id: 'P', scene_id: 'sc1', sort_order: 0, time_of_day: '밤', location: 'l1', narrative_time: null }],
    locations: [{ project_id: 'P', location_id: 'l1', scene_id: 'sc1', wide_shot: 'https://w/1.png' }],
    location_appearances: [],
    characters: [{ project_id: 'P', character_id: 'jun', name: '준', name_en: 'Jun', name_en_source: '준' }, { project_id: 'P', character_id: 'mina', name: '미나', name_en: 'Mina', name_en_source: '미나' }],
    character_appearances: over.character_appearances ?? [
      { project_id: 'P', character_id: 'jun', appearance_key: 'current', is_default: true, sheet_url: 'https://s/jun.png', appearance: 'A tall man in a navy coat.' },
      { project_id: 'P', character_id: 'mina', appearance_key: 'young', is_default: true, sheet_url: 'https://s/mina.png', appearance: 'A woman in red.' },
    ],
    generation_jobs: [],
  }
}
interface Sent { prompt: string; refs: string[]; moderated: unknown[]; status: number; body: Record<string, unknown> }
async function send(route: typeof single | typeof batch, body: Record<string, unknown>): Promise<Sent[]> {
  mocks.fal.mockClear()
  mocks.moderated.length = 0
  const res = await (route as (req: Request) => Promise<Response>)(new Request('http://test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'P', ...body }) }))
  const json = (await res.json()) as Record<string, unknown>
  const calls = mocks.fal.mock.calls.map(([input], i) => {
    const sent = input as { prompt: string; reference_image_urls?: string[] }
    return { prompt: sent.prompt, refs: (sent.reference_image_urls ?? []).slice(1), moderated: mocks.moderated[i] ?? [], status: res.status, body: json }
  })
  return calls.length ? calls : [{ prompt: '', refs: [], moderated: [], status: res.status, body: json }]
}
const one = async (n: number, body: Record<string, unknown> = {}) => (await send(single, { writerShotId: `sh_0${n}`, prompt: db.shots.find((s) => s.shot_id === `sh_0${n}`)!.prompt, ...body }))[0]
const sheet = async (body: Record<string, unknown> = {}) => (await send(batch, body))[0]

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

describe('일본 멜로와 다른 그림체는 지금 길 그대로', () => {
  it.each(OTHER_STYLES)('%s 그림체의 한 샷 실사는 인물 목록 · 이름 · 시간대 · 앞 샷 인용 · 주의를 지금처럼 싣는다', async (_label, key, custom) => {
    // 왜: 오너가 일본 멜로는 "1 이전"으로 정했고 나머지는 정하지 않았다 — 실사에만 쓰는 고침이 다른 그림체로 새면 안 된다.
    seed(key, custom)
    const { prompt, refs, moderated } = await one(1)
    expect(prompt).toContain('reference image 2 = 준 (left third of the frame — standing)')
    expect(prompt).not.toMatch(/미나|Mina,|= Mina|real actors|true-to-life skin texture|Cinematography —/)
    expect(prompt).toContain('time of day: 밤')
    expect(prompt).toContain(`showed "${PREVIOUS.slice(0, 110)}".`)
    expect(prompt).toContain('Keep the movement small.; The lamp stays lit.')
    expect(refs.slice(0, 2)).toEqual(['https://s/jun.png', 'https://w/1.png'])
    expect(refs).not.toContain('https://s/mina.png')
    expect(moderated).toEqual(['Jun turns as Mina steps in.', 'Keep the movement small.', 'The lamp stays lit.', PREVIOUS.slice(0, 110), '준', 'standing'])
  })

  it.each(OTHER_STYLES)('%s 그림체의 네 샷 시트는 인물 목록 · 이름 · 시간대를 지금처럼 싣는다', async (_label, key, custom) => {
    // 왜: 한 샷 길만 지키고 네 샷 길이 새면 [전체 만들기]로 만든 그림이 바뀐다.
    seed(key, custom)
    const { prompt, refs, moderated } = await sheet()
    expect(prompt).toContain('reference image 2 = 준.')
    expect(prompt).toContain('Column 2: 준 (left third of the frame — standing)')
    expect(prompt).not.toMatch(/미나|Mina|real actors|true-to-life|Per-column cinematography/)
    expect(prompt).toContain('time of day: 밤')
    expect(refs.slice(0, 2)).toEqual(['https://s/jun.png', 'https://w/1.png'])
    expect(moderated).toEqual(['준', null, null, '준', 'standing', 'left_third', '밤'])
  })
})

describe('실사 그림체의 한 샷', () => {
  it('샷에 나오지만 인물 목록에 없는 인물의 시트를 붙이고, 이름 · 시간대 · 앞 샷 인용 · 주의를 새 규칙으로 싣는다', async () => {
    // 왜: "2 모두 적용"의 핵심 — 빠진 인물은 얼굴을 지어내고, 한국어 시간대와 잘린 인용은 그림에 그대로 실렸다.
    seed('real')
    const { prompt, refs, moderated } = await one(1)
    expect(refs).toEqual(['https://s/jun.png', 'https://s/mina.png', 'https://w/1.png'])
    expect(prompt).toContain('reference image 2 = Jun')
    expect(prompt).toContain('reference image 3 = Mina')
    expect(prompt).toContain('reference images 2 to 3 are the CHARACTER sheets; reference image 4 is the LOCATION reference')
    // 누가 어느 칸에 있고 없는지도 적는다(다른 그림체는 자리 말만).
    expect(prompt).toMatch(/Jun, a tall man in a navy coat \([^)]*(?:START|END) panel/)
    expect(prompt).toMatch(/Mina, a woman in red \([^)]*(?:START|END) panel/)
    expect(prompt).toContain('time of day: night')
    expect(prompt).toContain(`showed "${PREVIOUS}".`)
    expect(prompt).toContain('Continuity constraints: The lamp stays lit.')
    expect(prompt).not.toContain('Keep the movement small.')
    expect(prompt).toMatch(/Cinematography — [^\n]*85mm/)
    // 새로 싣는 글(빛 · 초점 줄, 인물 이름 · 겉모습)도 내용 검사에 들어간다.
    expect(moderated).toEqual(expect.arrayContaining(['Jun', 'a tall man in a navy coat', 'Mina', 'a woman in red', expect.stringContaining('85mm'), PREVIOUS]))
  })

  it('세로 영상이면 왼쪽 · 오른쪽 칸 이름으로 적는다', async () => {
    // 왜: 세로 포맷의 러프 띠는 가로 세 칸이다 — 위 · 아래 칸이라고 적으면 칸을 잘못 짝짓는다.
    seed('real', null, { format: 'vertical_9:16' })
    const { prompt } = await one(1)
    expect(prompt).toContain('Left panel = START frame')
    expect(prompt).not.toMatch(/Top panel|Bottom panel/)
  })

  it('추가 입력 그림이 있으면 몇 번째 그림인지 맞게 적는다', async () => {
    // 왜: 참고 그림 번호가 하나라도 어긋나면 배경을 인물로, 추가 그림을 배경으로 읽는다.
    seed('real')
    const { prompt, refs } = await one(1, { referenceImageUrls: ['https://s/jun.png', 'https://w/1.png', 'https://extra/frame.png'], characterRefCount: 1, worldRefCount: 1 })
    expect(refs).toEqual(['https://s/jun.png', 'https://s/mina.png', 'https://w/1.png', 'https://extra/frame.png'])
    expect(prompt).toContain('reference image 4 is the LOCATION reference')
    expect(prompt).toMatch(/reference image 5 /)
  })

  it('사람이 없는 샷은 사람을 그리지 말라고 하고, 배우 · 피부 · 사람 수 이야기를 하지 않는다', async () => {
    // 왜: "사람을 그리지 마라"와 "진짜 배우 · 피부 결"이 한 지시문에 같이 있으면 사람이 나온다.
    seed('real')
    const { prompt, refs } = await one(2)
    expect(prompt).toContain('This shot contains NO people')
    expect(prompt).not.toMatch(/real actors|real skin|skin texture|how many figures|who is in each panel/)
    expect(prompt).toMatch(/real surfaces/)
    expect(refs).toEqual(['https://w/1.png'])
  })

  it('인물 목록이 비었어도 샷에 나오는 인물을 찾으면 사람 없는 샷이 아니다', async () => {
    // 왜: 거울에 비친 얼굴 샷은 목록이 비어 있다 — "사람을 그리지 마라"가 붙으면 비친 얼굴이 사라진다.
    seed('real', null, { shots: [shot(1, { characters: [], character_appearance_keys: {}, prompt: 'Mina looks up.', action_description: 'Mina looks up.', static_spec: { shot_type: 'CU', character_blocking: [{ character_id: 'mina', pose: 'standing' }] } })] })
    const { prompt, refs } = await one(1)
    expect(refs).toEqual(['https://s/mina.png', 'https://w/1.png'])
    expect(prompt).not.toContain('NO people')
    expect(prompt).toContain('real actors')
  })

  it('그 인물의 시트가 없으면 지금처럼 시트를 먼저 만들라고 알린다', async () => {
    // 왜: 시트 없이 그리면 얼굴을 지어낸다 — 목록에 있는 인물과 같은 규칙.
    seed('real', null, { character_appearances: [{ project_id: 'P', character_id: 'jun', appearance_key: 'current', is_default: true, sheet_url: 'https://s/jun.png', appearance: null }, { project_id: 'P', character_id: 'mina', appearance_key: 'young', is_default: true, sheet_url: null, appearance: null }] })
    const { status, body } = await one(1)
    expect(status).toBe(409)
    expect(body.missing).toEqual([expect.objectContaining({ characterId: 'mina', appearanceKey: 'young' })])
  })

  it('샷 설계의 칸 모양이 이상해도 그림 요청이 실패하지 않는다', async () => {
    // 왜: 설계는 모델이 쓴 글이라 목록 칸에 글자가 들어올 수 있다 — 그 한 샷 때문에 요청이 500 으로 끊겼다(11/23 검토).
    seed('real', null, { shots: [shot(1, { static_spec: { shot_type: 'MS', palette_emphasis: 'teal', framing: 'thirds', lighting: [] } })] })
    expect((await one(1)).status).toBe(200)
    expect((await sheet()).status).toBe(200)
  })
})

describe('실사 그림체의 네 샷 시트', () => {
  it('샷에 나오지만 목록에 없는 인물을 그 칸에만 더하고, 기본 모습의 시트를 붙인다', async () => {
    // 왜: 두 길이 다른 규칙이면 같은 씬에서 그림이 갈린다.
    seed('real')
    const { prompt, refs, moderated } = await sheet()
    expect(refs).toEqual(['https://s/jun.png', 'https://s/mina.png', 'https://w/1.png'])
    expect(prompt).toContain('reference image 2 = Jun, a tall man in a navy coat; reference image 3 = Mina, a woman in red.')
    expect(prompt).toMatch(/Column 1: Jun\n/)
    expect(prompt).toMatch(/Column 2: Jun [^\n]*and Mina/)
    expect(prompt).toMatch(/Column 3: no character/)
    expect(prompt).toContain('time of day: night')
    expect(prompt).toMatch(/Column 2: [^\n]*85mm/)
    expect(moderated).toEqual(expect.arrayContaining(['Mina', 'a woman in red', expect.stringContaining('85mm'), 'night']))
  })

  it('더한 인물의 시트가 없으면 그 샷만 건너뛰고 이유를 알린다', async () => {
    // 왜: 한 명 때문에 나머지 샷까지 멈추면 안 된다(지금 규칙 그대로).
    seed('real', null, { character_appearances: [{ project_id: 'P', character_id: 'jun', appearance_key: 'current', is_default: true, sheet_url: 'https://s/jun.png', appearance: null }, { project_id: 'P', character_id: 'mina', appearance_key: 'young', is_default: true, sheet_url: null, appearance: null }] })
    const { body, refs } = await sheet()
    const data = body.data as { skipped: Array<{ shotId: string; reason: string; missing?: Array<{ characterId: string }> }> }
    expect(data.skipped).toEqual([expect.objectContaining({ shotId: 'sh_01', reason: 'missing_character_sheets', missing: [expect.objectContaining({ characterId: 'mina', appearanceKey: 'young' })] })])
    expect(refs).not.toContain('https://s/mina.png')
  })

  it('모든 칸에 사람이 없으면 시트 전체에 사람을 그리지 말라고 적고, 배경 그림이 무엇인지 적는다', async () => {
    // 왜: 칸 배정 줄이 통째로 빠져 사람을 막는 말이 없었고, 붙은 배경 그림이 무엇인지도 적지 않았다(11/23 검토).
    seed('real', null, { shots: [shot(1, { characters: [], character_appearance_keys: {}, prompt: 'An empty street.' }), shot(2, { characters: [], character_appearance_keys: {}, prompt: 'A lamp.' })] })
    const { prompt, refs } = await sheet()
    expect(refs).toEqual(['https://w/1.png'])
    expect(prompt).toMatch(/keep every panel of this sheet free of people/)
    expect(prompt).toContain('reference image 2 is the LOCATION reference')
    expect(prompt).not.toMatch(/real actors|real skin|skin texture|how many figures/)
  })

  it('인물이 화면 밖으로 계산된 샷뿐인 시트는 사람을 막지 않고, 배경 그림이 무엇인지는 적는다', async () => {
    // 왜: 그 사람의 눈으로 보는 샷은 손이나 팔이 나온다 — 인물 목록이 빈 샷이 아니므로 "사람을 그리지 마라"가 붙으면 안 된다(11/23 검토).
    seed('real', null, { shots: [shot(1, { static_spec: { shot_type: 'MS', character_blocking: [{ character_id: 'jun', pose: 'reaching' }], screen_layout: { off_frame: ['jun'], pov_of: 'jun' } } })] })
    const { prompt, refs } = await sheet()
    expect(refs).toEqual(['https://w/1.png'])
    expect(prompt).not.toMatch(/keep every panel of this sheet free of people/)
    expect(prompt).toContain('with real actors')
    expect(prompt).toContain('reference image 2 is the LOCATION reference')
  })

  it('사람이 없고 멈춘 샷은 "같은 사람"이라고 적지 않는다 (한 샷 · 네 샷)', async () => {
    // 왜: 사람이 더한 빈 샷에 "같은 사람이 같은 자리에"와 "사람을 그리지 마라"가 같이 실렸다(11/23 검토).
    seed('real', null, { shots: [shot(1, { source: 'manual', characters: [], character_appearance_keys: {}, prompt: 'An empty street.' })] })
    for (const prompt of [(await one(1)).prompt, (await sheet()).prompt]) {
      expect(prompt).toMatch(/static hold/)
      expect(prompt).toMatch(/no arrows/)
      expect(prompt).not.toMatch(/same people/)
    }
  })

  it('화살표는 둘째 줄에만 있다고 적는다', async () => {
    // 왜: 네 샷 시트는 줄로 나뉘는데 "가운데 칸"이라고 적혀 있었다(11/23 검토).
    seed('real')
    const { prompt } = await sheet()
    expect(prompt).toMatch(/Arrows belong only in row 2/)
    expect(prompt).not.toContain('middle (DIRECTION) panel')
  })
})
