// Artist [만들기]로 넘길 때 레퍼런스 그림이 붙은 인물은 기본 모습의 시트 · 대표 사진이, 배경은 와이드샷이 그 그림이 되고, 못 적으면 Writer 를 이어 가지 않는다 (2026-10-27 오너)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), owns: vi.fn(), createRun: vi.fn(), activeRun: vi.fn(), trigger: vi.fn(), after: vi.fn(),
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  writes: [] as Array<{ table: string; op: string; payload: Record<string, unknown>; filters: Array<[string, string, unknown]> }>,
  /** 이 쓰기를 실패시킨다(연결 끊김 등). */
  failWrite: null as null | ((table: string, payload: Record<string, unknown>) => boolean),
}))

// 작은 가짜 DB — 표마다 행을 두고 eq · is 로 걸러 읽고 고친다. 쓰기는 기록한다.
function query(table: string) {
  let op: 'select' | 'update' | 'insert' | 'upsert' = 'select'
  let payload: Record<string, unknown> | Array<Record<string, unknown>> = {}
  let returning = false
  const filters: Array<[string, string, unknown]> = []
  const rows = () => (mocks.tables[table] ??= [])
  const matches = (row: Record<string, unknown>) =>
    filters.every(([kind, column, value]) => (kind === 'is' && value === null ? row[column] == null : row[column] === value))
  const run = (): { data: unknown; error: { message: string } | null } => {
    if (op === 'select') return { data: rows().filter(matches).map((row) => ({ ...row })), error: null }
    const list = Array.isArray(payload) ? payload : [payload]
    for (const item of list) mocks.writes.push({ table, op, payload: item, filters: [...filters] })
    if (list.some((item) => mocks.failWrite?.(table, item))) return { data: null, error: { message: 'connection reset' } }
    if (op === 'update') {
      const hit = rows().filter(matches)
      for (const row of hit) Object.assign(row, payload)
      return { data: returning ? hit.map((row) => ({ ...row })) : null, error: null }
    }
    rows().push(...list.map((item) => ({ ...item })))
    return { data: null, error: null }
  }
  const builder: Record<string, unknown> = {}
  builder.select = () => { if (op !== 'select') returning = true; return builder }
  builder.update = (value: Record<string, unknown>) => { op = 'update'; payload = value; return builder }
  builder.insert = (value: Record<string, unknown>) => { op = 'insert'; payload = value; return builder }
  builder.upsert = (value: Array<Record<string, unknown>>) => { op = 'upsert'; payload = value; return builder }
  builder.eq = (column: string, value: unknown) => { filters.push(['eq', column, value]); return builder }
  builder.is = (column: string, value: unknown) => { filters.push(['is', column, value]); return builder }
  builder.order = () => builder
  builder.limit = () => builder
  builder.maybeSingle = async () => { const { data, error } = run(); return { data: Array.isArray(data) ? data[0] ?? null : data, error } }
  builder.single = builder.maybeSingle
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject)
  return builder
}

/** 사람 + 기본 모습을 함께 만드는 저장 창구(upsert_people_with_default_appearances) — 그림 칸은 건드리지 않는다. */
async function rpc(name: string, args: { p_project_id: string; p_people: Array<{ character_id: string }> }) {
  if (name === 'upsert_people_with_default_appearances') {
    const appearances = (mocks.tables.character_appearances ??= [])
    for (const person of args.p_people) {
      if (appearances.some((row) => row.character_id === person.character_id && row.is_default)) continue
      appearances.push({ project_id: args.p_project_id, character_id: person.character_id, appearance_key: 'current', is_default: true, sheet_url: null, portrait_url: null, derived_from_url: null })
    }
  }
  return { data: [], error: null }
}

vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: mocks.after }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.user }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => query(table), rpc } }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/writer/run-store', () => ({ createRun: mocks.createRun, getActiveRun: mocks.activeRun }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ WRITER_TOTAL_UNITS: 15, WRITER_V2_TOTAL_UNITS: 1, triggerWriterStep: mocks.trigger }))
vi.mock('@/lib/admin', () => ({ isAdminOwnedProject: vi.fn(async () => false) }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ appearanceI18nFields: async (_id: string, appearance: string) => ({ appearance, appearance_native: appearance }), applyProducerI18n: async () => undefined }))
vi.mock('@/lib/writer/i18n/entity-names', () => ({ ensureEntityNamesEn: async () => undefined }))

import { POST } from '@/app/api/writer/start/route'
import { SERIES_VERSION } from '@/lib/series/snapshot'
import type { PipelineInput } from '@/lib/writer/types/pipeline'

const own = (rel: string) => `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')}/storage/v1/object/public/media/ws-1/project-1/${rel}`
const MINHO_REF = own('breakdown/minho.png')
const HALL_REF = own('breakdown/hall.jpg')
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const STORY = '민호가 회사 복도에서 자판기와 싸우는 이야기'
const genre = { genre: '코미디', tone: [], targetEmotion: [], runtime_seconds: 300, depth_level: 'D4', format: 'horizontal_16:9' }

const minho = (patch: Record<string, unknown> = {}) => ({ character_id: 'minho', name: '민호', entity_type: 'person', appearance: '회사원', ...patch })
const hall = (patch: Record<string, unknown> = {}) => ({ location_id: 'hall', name: '회사 복도', visual_description: '형광등 복도', purpose: '', user_edited: false, ...patch })

/** 이 화의 확정을 기다리는 산문 초안 — [만들기](이어 가기)가 이 실행에 Producer 값을 싣는다. */
const draftRun = () => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-10-27T00:00:00.000Z',
  state: {
    input: { story: STORY, runtimeSeconds: 300, treatmentDraft: true, sceneGate: true, writerEngine: 'v1' },
    genre,
    scenes: { scenes: [{ scene_id: 's1', scene_actions: ['민호가 복도를 걷는다.'], characters_in_scene: ['minho', 'jia'], location: 'hall' }] },
    characters: { characters: [{ id: 'minho', name: '민호', appearance_description: '' }] },
    world: { locations: [{ id: 'hall', name: '회사 복도', description: '' }] },
  },
})
const make = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/start', {
  method: 'POST',
  body: JSON.stringify({ projectId: 'project-1', story: STORY, runtimeSeconds: 300, genre, continueDraft: true, ...body }),
  headers: { 'Content-Type': 'application/json' },
}))
const appearance = (id: string) => mocks.tables.character_appearances?.find((row) => row.character_id === id && row.is_default)
const location = (id: string) => mocks.tables.locations?.find((row) => row.location_id === id)
const continuedInput = () => {
  const update = mocks.writes.find((w) => w.table === 'writer_runs' && w.op === 'update')
  return (update?.payload as { state: { input: PipelineInput } } | undefined)?.state.input
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.writes.length = 0
  mocks.failWrite = null
  mocks.tables = {
    projects: [{ id: 'project-1', workspace_id: 'ws-1', locale: 'ko', locale_locked: true, settings: { dialogueLanguage: 'ko' }, style_anchor_key: 'anime_soft', custom_style_anchor: null, series: null, reference_project_id: null }],
    style_anchors: [{ key: 'anime_soft', label: '부드러운 애니', medium: 'anime', is_active: true }],
    writer_runs: [{ id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-10-27T00:00:00.000Z' }],
  }
  mocks.user.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.createRun.mockResolvedValue({ id: 'run-new', state: {} })
  mocks.activeRun.mockImplementation(async (id: string) => (id === 'project-1' ? draftRun() : null))
})

describe('레퍼런스 그림 넘기기', () => {
  it('레퍼런스 그림이 붙은 인물을 넘기면 그 인물 기본 모습의 시트와 대표 사진이 그 그림이 되고 시트의 출처로는 적지 않는다', async () => {
    // 왜: 오너 "입력한 이미지는 그대로 artist에 사용". 출처로 적으면 카드가 "시트는 이 그림을 따라 만들어요"라며 시트를 새로 그리고,
    //   대표 사진이 비면 다른 모습을 만들 때 막힌다(다른 모습은 기본 모습 대표 사진을 얼굴 기준으로 쓴다).
    const response = await make({ cast: { characters: [minho({ source_image_url: MINHO_REF, source_image_as_is: true })] } })

    expect(response.status).toBe(200)
    expect(appearance('minho')).toMatchObject({ sheet_url: MINHO_REF, portrait_url: MINHO_REF, derived_from_url: null })
    expect(mocks.writes.some((w) => w.table === 'character_appearances' && 'derived_from_url' in w.payload)).toBe(false)
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })

  it('레퍼런스 그림이 붙은 배경을 넘기면 그 그림이 그대로 그 배경의 와이드샷이 된다', async () => {
    // 왜: 와이드샷 칸이 차 있으면 Artist 자동 초안이 그 배경을 건너뛴다 — 올린 그림이 그대로 배경 카드의 그림이 된다.
    const response = await make({ backgrounds: { locations: [hall({ source_image_url: HALL_REF, source_image_as_is: true })] } })

    expect(response.status).toBe(200)
    expect(location('hall')).toMatchObject({ wide_shot: HALL_REF })
  })

  it('레퍼런스 그림과 그대로 쓰라는 표시는 Writer 의 글 입력에 실리지 않는다', async () => {
    // 왜: 그림 주소와 그림 표시는 글이 아니다 — Writer 의 캐스트 · 배경 시드에 실리면 프롬프트에 URL 이 섞여 들어간다.
    await make({
      cast: { characters: [minho({ source_image_url: MINHO_REF, source_image_as_is: true })] },
      backgrounds: { locations: [hall({ source_image_url: HALL_REF, source_image_as_is: true })] },
    })

    const input = JSON.stringify(continuedInput())
    expect(input).toContain('민호')
    expect(input).not.toContain('source_image')
    expect(input).not.toContain(MINHO_REF)
    expect(input).not.toContain(HALL_REF)
  })

  it('레퍼런스 그림을 적지 못하면 Writer 를 이어 가지 않고 다시 누르라고 알린다', async () => {
    // 왜: 적지 못한 채 이어 가면 사람이 올린 그림 대신 AI 가 그려 버린다 — 다른 그림이 조용히 나오는 것보다 멈추고 다시 누르게 하는 편이 낫다.
    mocks.failWrite = (table, payload) => table === 'character_appearances' && 'sheet_url' in payload

    const response = await make({ cast: { characters: [minho({ source_image_url: MINHO_REF, source_image_as_is: true })] } })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Could not attach the uploaded reference pictures. Please try again.', code: 'reference_image_failed' })
    expect(mocks.writes.some((w) => w.table === 'writer_runs')).toBe(false)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('이미 그림이 있는 인물 · 배경은 같은 레퍼런스가 다시 넘어와도 덮어쓰지 않는다', async () => {
    // 왜: 다시 실행 등으로 같은 카드가 다시 넘어올 때, 그 사이 Artist 에서 다시 그린 그림을 처음 올린 그림으로 되돌리면 안 된다(자동으로는 빈칸만 채운다).
    const REDRAWN = own('characters/minho_main.png')
    const REDRAWN_HALL = own('locations/hall_wide.png')
    mocks.tables.character_appearances = [{ project_id: 'project-1', character_id: 'minho', appearance_key: 'current', is_default: true, sheet_url: REDRAWN, portrait_url: REDRAWN, derived_from_url: null }]
    mocks.tables.locations = [{ project_id: 'project-1', location_id: 'hall', name: '회사 복도', wide_shot: REDRAWN_HALL }]

    const response = await make({
      cast: { characters: [minho({ source_image_url: MINHO_REF, source_image_as_is: true })] },
      backgrounds: { locations: [hall({ source_image_url: HALL_REF, source_image_as_is: true })] },
    })

    expect(response.status).toBe(200)
    expect(appearance('minho')).toMatchObject({ sheet_url: REDRAWN, portrait_url: REDRAWN })
    expect(location('hall')).toMatchObject({ wide_shot: REDRAWN_HALL })
  })

  it('우리 보관함 밖 주소는 레퍼런스로 와도 적지 않는다', async () => {
    // 왜: 이 주소는 그림 생성 제공자가 직접 가져간다 — 보관함 밖 주소를 받으면 임의 주소를 대신 가져오게 시키는 통로가 된다.
    const response = await make({
      cast: { characters: [minho({ source_image_url: 'https://evil.example.com/x.png', source_image_as_is: true })] },
      backgrounds: { locations: [hall({ source_image_url: 'http://169.254.169.254/latest/meta-data', source_image_as_is: true })] },
    })

    expect(response.status).toBe(200)
    expect(appearance('minho')).toMatchObject({ sheet_url: null, portrait_url: null })
    expect(location('hall')?.wide_shot ?? null).toBeNull()
  })

  it('채팅에서 붙인 인물 그림은 지금처럼 대표 사진과 시트의 출처가 된다', async () => {
    // 왜: 2026-09-17 오너 결정(#image-to-artist)은 그대로다 — 그대로 쓰는 것은 브레이크다운에서 레퍼런스로 올린 그림뿐이다.
    const CHAT = own('uploads/u1/original.png')

    await make({ cast: { characters: [minho({ source_image_url: CHAT })] } })

    expect(appearance('minho')).toMatchObject({ sheet_url: null, portrait_url: CHAT, derived_from_url: CHAT })
  })

  it('시리즈 다음 화에서 이어받은 인물에 레퍼런스를 붙이면 앞 화 그림 대신 올린 그림이 시트가 된다', async () => {
    // 왜: 카드 그림이 이어받은 그림보다 먼저 적힌다 — 사람이 이 화에서 올린 그림이 이긴다(2026-10-26).
    const PREV_SHEET = own('series/jia-sheet.png')
    mocks.tables.projects = [
      {
        ...mocks.tables.projects[0],
        reference_project_id: 'prev-1',
        series: {
          version: SERIES_VERSION, prevProjectId: 'prev-1', prevTitle: '첫 화', copiedAt: '2026-10-26T00:00:00.000Z',
          characters: [{ characterId: 'jia', name: '지아', role: 'protagonist', appearance: '분홍 원피스', personality: [], sheetUrl: PREV_SHEET, portraitUrl: null, styleId: 'anime_soft' }],
          locations: [], voices: [], styleId: 'anime_soft', format: 'horizontal_16:9', dialogueLanguage: 'ko', continuesLastScene: false, copyFailures: [],
        },
      },
      { id: 'prev-1', workspace_id: 'ws-1' },
    ]
    const JIA_REF = own('breakdown/jia.png')

    const response = await make({ cast: { characters: [{ character_id: 'jia', name: '지아', entity_type: 'person', appearance: '', source_image_url: JIA_REF, source_image_as_is: true }] } })

    expect(response.status).toBe(200)
    expect(appearance('jia')).toMatchObject({ sheet_url: JIA_REF, portrait_url: JIA_REF })
    expect(mocks.writes.some((w) => w.table === 'character_appearances' && w.payload.sheet_url === PREV_SHEET)).toBe(false)
  })

  it('올린 레퍼런스 그림을 바꿔 다시 넘기면 예전에 올린 그림 대신 새로 올린 그림이 그 카드의 그림이 된다', async () => {
    // 왜: 넘기기가 중간에 실패해 그림을 바꾸고 다시 누르면, 빈칸만 채우는 규칙 때문에 예전에 올린 그림이 남았다(2026-10-27 검토 지적).
    //   이 프로젝트 브레이크다운에 올린 그림만 바꾼다 — Artist 에서 다시 그린 그림은 지금처럼 덮지 않는다(위 시험).
    const OLD = own('breakdown/minho-old.png')
    const OLD_HALL = own('breakdown/hall-old.jpg')
    mocks.tables.character_appearances = [{ project_id: 'project-1', character_id: 'minho', appearance_key: 'current', is_default: true, sheet_url: OLD, portrait_url: OLD, derived_from_url: null }]
    mocks.tables.locations = [{ project_id: 'project-1', location_id: 'hall', name: '회사 복도', wide_shot: OLD_HALL }]

    const response = await make({
      cast: { characters: [minho({ source_image_url: MINHO_REF, source_image_as_is: true })] },
      backgrounds: { locations: [hall({ source_image_url: HALL_REF, source_image_as_is: true })] },
    })

    expect(response.status).toBe(200)
    expect(appearance('minho')).toMatchObject({ sheet_url: MINHO_REF, portrait_url: MINHO_REF })
    expect(location('hall')).toMatchObject({ wide_shot: HALL_REF })
  })

  it('그대로 쓰는 레퍼런스는 이 프로젝트 브레이크다운에 올린 그림만 받는다', async () => {
    // 왜: 우리 보관함 주소이기만 하면 다른 프로젝트 그림도 이 카드의 그림으로 적혔다 — 그대로 쓰는 그림은 이 프로젝트에 올린 것뿐이다(2026-10-27 검토 지적).
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
    const OTHER = `${base}/storage/v1/object/public/media/ws-1/project-2/breakdown/x.png`
    const NOT_BREAKDOWN = own('characters/minho_main.png')

    const response = await make({
      cast: { characters: [minho({ source_image_url: OTHER, source_image_as_is: true })] },
      backgrounds: { locations: [hall({ source_image_url: NOT_BREAKDOWN, source_image_as_is: true })] },
    })

    expect(response.status).toBe(200)
    expect(appearance('minho')).toMatchObject({ sheet_url: null, portrait_url: null })
    expect(location('hall')?.wide_shot ?? null).toBeNull()
  })
})
