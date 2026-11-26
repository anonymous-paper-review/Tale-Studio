// 실사 샷 이미지의 소품 참고 — 그 샷에 나오는 소품의 그림(한 샷 2장 · 일괄 한 장 3장까지)을 참고 그림으로 넣고, 지시문에 번호 · 이름 · 역할을 적으며, 소품이 없으면 지금과 같다 (D7 2단계, 오너 2026-11-22 · m1126 리드 R1 2026-11-26)
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
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: 'user-1', viaShare: false }) }))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/generation-quota')>()), checkGenerationCapacity: mocks.checkGenerationCapacity }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.falImageSubmit }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null, applyStyleAnchor: (_a: unknown, opts: unknown) => opts }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://hook.test/webhook', resolveWebhookBaseUrl: () => 'https://base.test' }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((i) => [i.id, i.native])) }))
vi.mock('@/lib/director/storyboard-strip', () => ({
  composeRoughReferenceGrid: async () => Buffer.from('grid'),
  composeRoughReferenceStrip: async () => ({ buffer: Buffer.from('strip'), sheetFormat: null, geometry: { frameAxis: 'x', repaintCanvas: '1024x1024' } }),
  buildRealGridPrompt: () => 'GRID PROMPT',
  buildRealStripPrompt: (shotPrompt: string) => `STRIP PROMPT ${shotPrompt}`,
  realSheetCanvas: () => '2048x1536',
}))
vi.mock('@/lib/storage/media', () => ({ mediaUpload: async () => ({ error: null }), mediaPublicUrl: (path: string) => `https://media.test/${path}` }))

import { POST as generateStoryboardPOST } from '@/app/api/director/generate-storyboard/route'
import { POST as generateStoryboardBatchPOST } from '@/app/api/director/generate-storyboard-batch/route'
import { planSheetPropRefs, planShotPropRefs, propRefRoom, propReferenceLines } from '@/lib/director/shot-prop-refs'

const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const RING = 'https://media.test/props/ring.png'
const KEY = 'https://media.test/props/key.png'
const COIN = 'https://media.test/props/coin.png'
const CUP = 'https://media.test/props/cup.png'
let db: Record<string, Array<Record<string, unknown>>>

function queryFor(table: string) {
  const filters: Array<[string, unknown, 'eq' | 'in' | 'not-null']> = []
  let max: number | null = null
  const rows = () => {
    const out = (db[table] ?? []).filter((row) => filters.every(([column, value, op]) => (op === 'in' ? (value as unknown[]).includes(row[column]) : op === 'not-null' ? row[column] != null : row[column] === value)))
    return max === null ? out : out.slice(0, max)
  }
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'is', 'gte', 'update', 'order']) q[name] = () => q
  q.eq = (column: string, value: unknown) => { filters.push([column, value, 'eq']); return q }
  q.in = (column: string, values: unknown[]) => { filters.push([column, values, 'in']); return q }
  q.not = (column: string) => { filters.push([column, null, 'not-null']); return q }
  q.limit = (n: number) => { max = n; return q }
  q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
  q.single = q.maybeSingle
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve)
  return q
}
const placement = (...props: Array<[string, string]>) => ({ prop_placement: props.map(([prop, position_in_frame]) => ({ prop, position_in_frame })) })
function shotRow(shotId: string, sortOrder: number, staticSpec: unknown) {
  return {
    project_id: PROJECT_ID, shot_id: shotId, scene_id: 'scene-1', sort_order: sortOrder, characters: [], character_appearance_keys: {},
    rough_storyboard: { frames: { start: 'https://r/s.png', direction: 'https://r/d.png', end: 'https://r/e.png' }, generatedAt: 1000 },
    storyboard_image: null, static_spec: staticSpec, director_refs: null, check_notes: null,
  }
}
const prop = (prop_id: string, name: string, image_url: string | null) => ({ project_id: PROJECT_ID, prop_id, name, image_url })
const storyboardRequest = (writerShotId: string) => new Request('http://localhost/api/director/generate-storyboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT_ID, writerShotId, prompt: 'SHOT PROMPT', aspectRatio: '16:9' }) })
const batchRequest = () => new Request('http://localhost/api/director/generate-storyboard-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT_ID }) }) as never
const submitted = () => mocks.falImageSubmit.mock.calls[0][0] as { prompt: string; reference_image_urls?: string[] }

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    projects: [{ id: PROJECT_ID, workspace_id: 'ws-1', style_anchor_key: null, custom_style_anchor: null, settings: null, series: null, optional_reference_frame_url: null }],
    scenes: [{ project_id: PROJECT_ID, scene_id: 'scene-1', sort_order: 0, time_of_day: null, location: null, narrative_time: null }],
    shots: [shotRow('sh_01_01', 0, placement(['obj_ring', 'left_third'], ['Paper cup', 'center']))],
    locations: [], location_appearances: [], characters: [], character_appearances: [], generation_jobs: [],
    props: [prop('obj_ring', '은반지', RING), prop('obj_key', '열쇠', KEY), prop('paper_cup', 'Paper cup', null)],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' })
  mocks.reserveGenerationJob.mockResolvedValue({ id: 'job-1', project_id: PROJECT_ID, fal_key_id: 'key-1', request_id: 'reserved:job-1', status: 'queued' })
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'openai/gpt-image-2/edit', fal_key_id: 'key-1', fal_request: {} })
})

describe('실사 한 장의 소품 참고', () => {
  // 왜: D7 2단계 — 오너 "배경처럼 소품도 shot 이미지 생성 시 참조". 소품 그림이 있어야 샷마다 같은 모습으로 나온다. 번호 · 이름이 있어야 모델이 어느 물건인지 안다.
  it('실사 한 장 그리기는 그 샷에 나오는 소품의 그림을 참고 그림으로 넣고, 지시문에 그 번호와 이름을 적는다', async () => {
    expect((await generateStoryboardPOST(storyboardRequest('sh_01_01'))).status).toBe(200)
    const refs = submitted().reference_image_urls ?? []
    expect(refs.slice(1)).toEqual([RING])
    expect(submitted().prompt).toContain('in order: reference image 2 = 은반지.')
  })

  // 왜: 혼자 정한 것 — 소품이 안 보이는 샷에 끼어들지 않게, 그 샷 소품 칸에 나오는 것만. 그림이 아직 없는 소품은 막지 않고 건너뛴다(인물 시트처럼 필수가 아니다).
  it('그 샷에 안 나오는 소품이나 그림이 없는 소품은 붙이지 않는다', async () => {
    expect((await generateStoryboardPOST(storyboardRequest('sh_01_01'))).status).toBe(200)
    expect(submitted().reference_image_urls ?? []).not.toContain(KEY)
    expect(submitted().prompt).not.toContain('열쇠')
    expect(submitted().prompt).not.toContain('Paper cup')
  })

  // 왜: 정상 경로 고정 — 소품이 없거나 샷에 소품이 없으면 참고 그림 · 지시문이 지금과 같다(지금 만든 프로젝트 전부가 이 경우다).
  it('소품이 없는 샷의 실사 참고 그림과 지시문은 지금과 같다', async () => {
    db.shots = [shotRow('sh_01_01', 0, null)]
    expect((await generateStoryboardPOST(storyboardRequest('sh_01_01'))).status).toBe(200)
    expect((submitted().reference_image_urls ?? []).length).toBe(1)
    expect(submitted().prompt).not.toContain('PROP reference')
    expect(submitted().prompt.startsWith('STRIP PROMPT SHOT PROMPT')).toBe(true)
  })
})

describe('실사 일괄 한 장의 소품 참고', () => {
  // 왜: 일괄은 네 샷을 한 장에 그린다 — 칸마다 그 칸에 나오는 소품을 적어야 다른 칸에 끼어들지 않는다. 참고 그림이 늘면 인물이 섞여 한 장에 3장까지만.
  it('일괄 한 장(4샷)은 칸마다 그 칸에 나오는 소품을 적고, 소품 그림은 최대 3장이다', async () => {
    db.props = [prop('obj_ring', '은반지', RING), prop('obj_key', '열쇠', KEY), prop('obj_coin', '동전', COIN), prop('obj_cup', '컵', CUP)]
    db.shots = [
      shotRow('sh_01_01', 0, placement(['obj_ring', 'center'])),
      shotRow('sh_01_02', 1, placement(['obj_key', 'right_third'], ['obj_ring', 'left_third'])),
      shotRow('sh_01_03', 2, placement(['obj_coin', 'center'])),
      shotRow('sh_01_04', 3, placement(['obj_cup', 'center'])),
    ]
    expect((await generateStoryboardBatchPOST(batchRequest())).status).toBe(200)
    const refs = submitted().reference_image_urls ?? []
    expect(refs.filter((url) => url.startsWith('https://media.test/props/'))).toEqual([RING, KEY, COIN])
    const text = submitted().prompt
    expect(text).toContain('Column 1: 은반지')
    expect(text).toContain('Column 2: 열쇠 and 은반지')
    expect(text).toContain('Column 4: no prop reference')
  })
})

describe('소품 참고 규칙', () => {
  // 왜: 참고 그림이 늘면 인물이 섞이고 모델 한도에 걸린다 — 한 샷 2장, 모자라면 소품부터 뺀다(인물 · 배경 · 화풍 참고는 그대로).
  it('한 샷에 소품 그림은 최대 2장이고, 참고 그림이 많으면 소품부터 뺀다', () => {
    const props = [{ propId: 'a', name: 'A', imageUrl: 'https://a' }, { propId: 'b', name: 'B', imageUrl: 'https://b' }, { propId: 'c', name: 'C', imageUrl: 'https://c' }]
    expect(planShotPropRefs(placement(['a', 'left'], ['b', 'right'], ['c', 'center']), props).map((ref) => ref.propId)).toEqual(['a', 'b'])
    expect(propRefRoom(9)).toBe(3)
    expect(propRefRoom(12)).toBe(0)
    expect(propRefRoom(15)).toBe(0)
    const sheet = planSheetPropRefs([placement(['c', 'center']), placement(['a', 'left'], ['c', 'right']), null], props)
    expect(sheet.refs.map((ref) => ref.propId)).toEqual(['c', 'a'])
    expect(sheet.columnProps.map((column) => column.map((ref) => ref.propId))).toEqual([['c'], ['a', 'c'], []])
  })

  // 왜: 소품 그림을 사람으로 바꾸거나 연필 그림에 없는 칸에 물건을 더하면 안 된다. 지금 지시문은 인물 시트가 "들고 있는 물건"까지 정하므로, 소품 그림이 있는 물건은 소품 그림이 앞선다고 적는다.
  //   Writer 소품 칸의 자리(left_third 등)는 적지 않는다 — 연필 그림과 어긋나면 모델이 물건을 옮긴다(2026-11-22 실측: 러프 오른쪽 끝 자판기가 3번 모두 왼쪽 · 가운데로 옮겨짐).
  it('소품 그림은 사람이 아니고, 생김새는 소품 그림이 · 자리는 연필 그림이 정하며, 인물 시트 규칙보다 앞선다고 지시문에 적는다', () => {
    const lines = propReferenceLines(4, [{ propId: 'a', name: '은반지', url: 'https://a', position: 'left_third' }]).join('\n')
    expect(lines).toContain('in order: reference image 4 = 은반지.')
    expect(lines).not.toMatch(/third of the frame/)
    expect(lines).toMatch(/inanimate object/i)
    expect(lines).toMatch(/never (a )?people|never a person/i)
    expect(lines).toMatch(/decides how that object looks/i)
    expect(lines).toMatch(/only where the pencil drawing shows an object/i)
    expect(lines).toMatch(/overrides the character-sheet rule/i)
    expect(propReferenceLines(2, [])).toEqual([])
  })

  // 왜: 소품 모습(m1126 A3)은 배경 모습과 같은 규칙으로 샷에 쓰인다 — 씬의 이야기 속 때(과거 · 현재 · 미래)와 같은 모습 중 그림이 있는 첫 것(만든 순서).
  //   그 때의 모습이 없거나 그림이 아직 없으면 기본 그림이다. 기본 그림이 없어도 맞는 모습 그림이 있으면 그것을 쓴다.
  it('씬의 이야기 속 때와 같은 소품 모습 중 그림이 있는 첫 것을 그 샷의 실사 참고로 쓰고, 없으면 기본 그림을 쓴다', () => {
    const props = [
      {
        propId: 'sword', name: '칼', imageUrl: 'https://sword',
        appearances: [
          { appearanceKey: 'broken_empty', narrativeTime: 'future' as const, imageUrl: null },
          { appearanceKey: 'broken', narrativeTime: 'future' as const, imageUrl: 'https://sword-broken' },
          { appearanceKey: 'new', narrativeTime: 'past' as const, imageUrl: 'https://sword-new' },
        ],
      },
      { propId: 'ring', name: '반지', imageUrl: null, appearances: [{ appearanceKey: 'old', narrativeTime: 'past' as const, imageUrl: 'https://ring-old' }] },
    ]
    const spec = placement(['sword', 'center'], ['ring', 'left'])
    expect(planShotPropRefs(spec, props, 2, 'future').map((ref) => ref.url)).toEqual(['https://sword-broken'])
    expect(planShotPropRefs(spec, props, 2, 'past').map((ref) => ref.url)).toEqual(['https://sword-new', 'https://ring-old'])
    expect(planShotPropRefs(spec, props, 2, 'present').map((ref) => ref.url)).toEqual(['https://sword'])
    expect(planShotPropRefs(spec, props, 2, null).map((ref) => ref.url)).toEqual(['https://sword'])
    expect(planSheetPropRefs([spec], props, 3, 'past').refs.map((ref) => ref.url)).toEqual(['https://sword-new', 'https://ring-old'])
  })

  // 왜: 소품 그림이 소품 양식(MAIN · FRONT · SIDE · BACK · TOP · DETAIL)을 채운 시트가 됐다(m1126 A2) — 첫 줄에 "물건 하나를 여러 방향에서 보인 시트"라고 적어야
  //   모델이 칸마다 다른 물건으로 읽거나 한 칸에 여러 번 그리지 않는다(리드 R1 승인 문장).
  it('소품 그림이 여러 방향을 담은 시트라 지시문 첫 줄은 시트마다 물건 하나를 여러 방향에서 보인다고 적는다', () => {
    const [first] = propReferenceLines(5, [{ propId: 'a', name: '은반지', url: 'https://a', position: null }, { propId: 'b', name: '열쇠', url: 'https://b', position: null }])
    expect(first).toBe('- PROP reference sheets (each shows ONE inanimate object from several views — never people, faces or mannequins), in order: reference image 5 = 은반지; reference image 6 = 열쇠.')
  })
})
