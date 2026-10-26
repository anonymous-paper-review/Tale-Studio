// 시리즈 다음 화로 Writer를 시작하면 앞 화 인물 · 배경 · 말투 · 앞 화 산문을 실어 주고 이어받은 그림을 이 화에 적는다 (2026-10-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), owns: vi.fn(), createRun: vi.fn(), activeRun: vi.fn(), trigger: vi.fn(), after: vi.fn(), rpc: vi.fn(),
  writes: [] as Array<{ table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> }>,
  rows: {} as Record<string, Array<Record<string, unknown>>>,
}))

// 작은 가짜 DB — 표마다 행을 두고 eq 로 걸러 읽고, 쓰기는 기록하고 성공한다.
function chain(table: string) {
  const entry = { table, op: 'select', payload: undefined as unknown, filters: [] as Array<[string, unknown]> }
  const rows = () => (mocks.rows[table] ?? []).filter((row) => entry.filters.every(([key, value]) => row[key] === value))
  const result = () => {
    if (entry.op !== 'select') {
      mocks.writes.push({ ...entry, filters: [...entry.filters] })
      return { data: table === 'writer_runs' ? [{ id: 'run-1' }] : [], error: null }
    }
    return { data: rows(), error: null }
  }
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'is', 'order', 'limit', 'in']) builder[name] = () => builder
  builder.eq = (key: string, value: unknown) => { entry.filters.push([key, value]); return builder }
  for (const op of ['update', 'insert', 'upsert']) builder[op] = (payload: unknown) => { entry.op = op; entry.payload = payload; return builder }
  builder.maybeSingle = async () => { const { data, error } = result(); return { data: Array.isArray(data) ? data[0] ?? null : data, error } }
  builder.single = builder.maybeSingle
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(result()).then(resolve, reject)
  return builder
}

vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: mocks.after }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.user }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => chain(table), rpc: (name: string, args: unknown) => mocks.rpc(name, args) } }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/writer/run-store', () => ({ createRun: mocks.createRun, getActiveRun: mocks.activeRun }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ WRITER_TOTAL_UNITS: 15, WRITER_V2_TOTAL_UNITS: 1, triggerWriterStep: mocks.trigger }))
vi.mock('@/lib/admin', () => ({ isAdminOwnedProject: vi.fn(async () => false) }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ appearanceI18nFields: async (_id: string, appearance: string) => ({ appearance, appearance_native: appearance }), applyProducerI18n: async () => undefined }))
vi.mock('@/lib/writer/i18n/entity-names', () => ({ ensureEntityNamesEn: async () => undefined }))

import { POST } from '@/app/api/writer/start/route'
import { SERIES_VERSION } from '@/lib/series/snapshot'
import type { PipelineInput } from '@/lib/writer/types/pipeline'

const SHEET = 'https://example.supabase.co/storage/v1/object/public/media/ws/ep2/series/jia-sheet.png'
const PORTRAIT = 'https://example.supabase.co/storage/v1/object/public/media/ws/ep2/series/jia-portrait.png'
const WIDE = 'https://example.supabase.co/storage/v1/object/public/media/ws/ep2/series/yard-wide.png'
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const STORY = '지아가 다음 날 다시 운동장에 나가는 이야기'
const PREV_PROSE = '지아가 운동장에서 돌을 던진다.'

const voice = {
  character_id: 'jia', name: '지아', speech_style: '짧게 끊어 말한다', formality: '반말',
  sentence_length: '짧음', verbal_tics: ['야'], emotional_expression: '직설적', taboo: '존댓말', example_lines: ['야, 비켜.'],
}

const seriesSnapshot = (patch: Record<string, unknown> = {}) => ({
  version: SERIES_VERSION,
  prevProjectId: 'prev-1',
  prevTitle: '첫 화 — 운동장의 돌',
  copiedAt: '2026-10-26T00:00:00.000Z',
  characters: [{
    characterId: 'jia', name: '지아', role: 'protagonist', appearance: '분홍 원피스',
    personality: ['씩씩하다'], sheetUrl: SHEET, portraitUrl: PORTRAIT, styleId: 'anime_soft',
  }],
  locations: [{ locationId: 'yard', name: '운동장', description: '흙바닥', wideShotUrl: WIDE, styleId: 'anime_soft' }],
  voices: [],
  styleId: 'anime_soft',
  format: 'horizontal_16:9',
  dialogueLanguage: 'ko',
  continuesLastScene: false,
  copyFailures: [],
  ...patch,
})

/** 지금 화(project-1) 행 — series 를 바꿔 끼우거나 series 없이 두면 시리즈가 아닌 프로젝트가 된다. */
const projectRow = (patch: Record<string, unknown> = {}) => ({
  id: 'project-1', workspace_id: 'ws-1', reference_project_id: 'prev-1', series: seriesSnapshot(),
  locale: 'ko', locale_locked: true, settings: { dialogueLanguage: 'ko' }, entry_draft: null,
  style_anchor_key: 'anime_soft', custom_style_anchor: null,
  ...patch,
})

/** 앞 화 최신 Writer 실행 — 여기서 앞 화 산문을 읽는다. */
const prevRun = {
  id: 'run-prev', status: 'completed', updated_at: '2026-10-25T00:00:00.000Z',
  state: {
    scenes: { scenes: [{ scene_id: 's1', scene_actions: [PREV_PROSE] }] },
    characters: { characters: [{ id: 'jia', name: '지아' }] },
    world: { locations: [{ id: 'yard', name: '운동장' }] },
  },
}

/** 이 화의 트리트먼트 초안 실행 — [만들기]로 넘길 때(continueDraft) 이 실행에 Producer 값을 싣는다. */
const draftRun = () => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-10-26T00:00:00.000Z',
  state: {
    input: { story: STORY, runtimeSeconds: 300, treatmentDraft: true, sceneGate: true, writerEngine: 'v1' },
    genre, scenes: { scenes: [{ scene_id: 's1', scene_actions: ['지아가 운동장을 걷는다.'], characters_in_scene: ['jia'], location: 'yard' }] },
    characters: { characters: [{ id: 'jia', name: '지아', appearance_description: '' }] },
    world: { locations: [{ id: 'yard', name: '운동장', description: '' }] },
  },
})

const genre = { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 300, depth_level: 'D4', format: 'horizontal_16:9' }
const post = (body: Record<string, unknown> = {}) => POST(new NextRequest('http://localhost/api/writer/start', {
  method: 'POST', body: JSON.stringify({ projectId: 'project-1', story: STORY, runtimeSeconds: 300, genre, ...body }), headers: { 'Content-Type': 'application/json' },
}))
const startedInput = () => mocks.createRun.mock.calls[0][1] as PipelineInput
const continuedInput = () => {
  const update = mocks.writes.find((w) => w.table === 'writer_runs' && w.op === 'update')!
  return (update.payload as { state: { input: PipelineInput } }).state.input
}
const upsertedPeople = () => (mocks.rpc.mock.calls[0]?.[1] as { p_people: Array<{ character_id: string }> } | undefined)?.p_people ?? []
const writesTo = (table: string) => mocks.writes.filter((w) => w.table === table)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.writes.length = 0
  mocks.rows = { projects: [projectRow(), { id: 'prev-1', workspace_id: 'ws-1' }], style_anchors: [{ key: 'anime_soft', label: '부드러운 애니', medium: 'anime', is_active: true }] }
  mocks.user.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.createRun.mockResolvedValue({ id: 'run-1', state: {} })
  mocks.activeRun.mockImplementation(async (id: string) => (id === 'prev-1' ? prevRun : null))
})

describe('이어받은 인물 · 배경을 Writer에 싣기', () => {
  it('시리즈 다음 화는 캐스트가 비어 와도 이어받은 인물 · 배경을 Writer에 싣는다', async () => {
    // 왜: 다음 화는 Producer 카드가 비어 있는 새 프로젝트로 시작한다 — 합치지 않으면 앞 화 인물이 Writer 에 한 명도 가지 않는다.
    const response = await post({ cast: { characters: [] }, backgrounds: { locations: [] } })

    expect(response.status).toBe(200)
    expect(startedInput().cast?.characters).toEqual([
      { character_id: 'jia', name: '지아', entity_type: 'person', role: 'protagonist', appearance: '분홍 원피스', personality: ['씩씩하다'] },
    ])
    expect(startedInput().background?.locations).toEqual([{ id: 'yard', name: '운동장', description: '흙바닥' }])
    // 표에도 같은 합친 값을 쓴다 — Artist 가 Writer 를 기다리지 않고 카드를 본다.
    expect(upsertedPeople().map((p) => p.character_id)).toEqual(['jia'])
    expect(writesTo('locations').some((w) => (w.payload as { location_id?: string }).location_id === 'yard')).toBe(true)
  })

  it('같은 인물이 카드로도 오면 한 번만 싣고 카드 값을 쓴다', async () => {
    // 왜: 사람이 다음 화에서 외모를 고쳤는데 앞 화 값이 또 실리면 같은 인물이 두 줄로 생기거나 고친 값이 묻힌다.
    await post({ cast: { characters: [{ character_id: 'jia', name: '지아', entity_type: 'person', appearance: '노란 우비' }] } })

    expect(startedInput().cast?.characters).toEqual([
      { character_id: 'jia', name: '지아', entity_type: 'person', appearance: '노란 우비', personality: ['씩씩하다'] },
    ])
  })

  it('Writer 실행에 앞 화 제목과 앞 화 산문을 싣는다', async () => {
    // 왜: 앞 화 산문 없이는 Writer 가 "이어 쓰기"를 못 하고 같은 인물로 다른 이야기를 처음부터 쓴다.
    await post()
    expect(startedInput().series).toEqual({ prevTitle: '첫 화 — 운동장의 돌', prevProse: PREV_PROSE, characters: ['지아'], locations: ['운동장'] })

    // [만들기]로 넘기는 경로(이어 가기)도 같은 실행 입력에 싣는다.
    mocks.writes.length = 0
    mocks.activeRun.mockImplementation(async (id: string) => (id === 'prev-1' ? prevRun : draftRun()))
    await post({ continueDraft: true })
    expect(continuedInput().series).toEqual({ prevTitle: '첫 화 — 운동장의 돌', prevProse: PREV_PROSE, characters: ['지아'], locations: ['운동장'] })
  })

  it('앞 화가 지워졌으면 앞 화 산문 없이 싣는다', async () => {
    // 왜: 앞 화를 지운 뒤에도 다음 화는 계속 쓴다 — 산문만 못 읽을 뿐 인물 · 배경 · 제목은 그대로 있다.
    mocks.rows.projects = [projectRow({ reference_project_id: null })]

    await post()

    expect(startedInput().series).toEqual({ prevTitle: '첫 화 — 운동장의 돌', prevProse: null, characters: ['지아'], locations: ['운동장'] })
  })

  it('앞 화 말투를 Writer 실행에 싣는다', async () => {
    // 왜: 같은 인물이 화마다 다른 말투로 말하면 같은 사람으로 읽히지 않는다. 앞 화가 대사까지 끝났을 때만 넘어온다.
    mocks.rows.projects = [projectRow({ series: seriesSnapshot({ voices: [voice] }) }), { id: 'prev-1', workspace_id: 'ws-1' }]
    await post()
    expect(startedInput().inheritedVoices).toEqual([voice])

    // 앞 화가 대사까지 안 끝났으면 말투 칸을 두지 않는다.
    vi.clearAllMocks()
    mocks.rows.projects = [projectRow(), { id: 'prev-1', workspace_id: 'ws-1' }]
    mocks.owns.mockResolvedValue(true)
    mocks.user.mockResolvedValue({ id: 'user-1' })
    mocks.createRun.mockResolvedValue({ id: 'run-1', state: {} })
    mocks.activeRun.mockImplementation(async (id: string) => (id === 'prev-1' ? prevRun : null))
    await post()
    expect(startedInput().inheritedVoices).toBeUndefined()
  })

  it('시리즈가 아닌 프로젝트는 시리즈 칸 없이 Writer를 시작한다', async () => {
    // 왜: 보통 프로젝트에 빈 시리즈 칸이 실리면 Writer 지시에 "앞 화" 자리가 생겨 없는 앞 화를 이어 쓰려 한다.
    mocks.rows.projects = [projectRow({ series: null, reference_project_id: null })]

    const response = await post({ cast: { characters: [{ character_id: 'minsu', name: '민수', entity_type: 'person', appearance: '안경' }] } })

    expect(response.status).toBe(200)
    expect(startedInput().series).toBeUndefined()
    expect(startedInput().inheritedVoices).toBeUndefined()
    expect(startedInput().cast?.characters).toEqual([{ character_id: 'minsu', name: '민수', entity_type: 'person', appearance: '안경' }])
  })
})

describe('이어받은 그림 적용', () => {
  it('이어받은 그림은 지금 프로젝트 그림체로 판단해 인물 시트와 배경 와이드샷에 적는다', async () => {
    // 왜: 이 두 칸이 차 있을 때만 Artist 자동 초안이 그 인물 · 배경을 건너뛴다 — 안 적으면 같은 그림체인데도 돈을 들여 다시 그린다.
    mocks.activeRun.mockImplementation(async (id: string) => (id === 'prev-1' ? prevRun : draftRun()))

    await post({ continueDraft: true })

    expect(writesTo('character_appearances').map((w) => ({ payload: w.payload, filters: w.filters }))).toEqual([
      {
        payload: { sheet_url: SHEET, portrait_url: PORTRAIT },
        filters: [['project_id', 'project-1'], ['character_id', 'jia'], ['is_default', true]],
      },
    ])
    expect(writesTo('locations').find((w) => w.op === 'update' && (w.payload as { wide_shot?: string }).wide_shot)).toMatchObject({
      payload: { wide_shot: WIDE },
      filters: [['project_id', 'project-1'], ['location_id', 'yard']],
    })

    // 지금 프로젝트 그림체가 앞 화와 다르면 이번 화에 나오는 인물 · 배경은 비워 둔다(Artist 가 앞 화 그림을 참고해 다시 그린다).
    mocks.writes.length = 0
    mocks.rows.projects = [projectRow({ style_anchor_key: 'watercolor_soft' }), { id: 'prev-1', workspace_id: 'ws-1' }]
    mocks.rows.style_anchors = [{ key: 'watercolor_soft', label: '수채', medium: 'watercolor', is_active: true }]

    await post({ continueDraft: true })

    expect(writesTo('character_appearances')).toEqual([])
    expect(writesTo('locations').filter((w) => (w.payload as { wide_shot?: string }).wide_shot)).toEqual([])
  })
})
