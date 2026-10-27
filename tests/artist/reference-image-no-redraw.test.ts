// 레퍼런스 그림으로 채운 인물 · 배경은 자동 초안도 화면의 다시 그리기도 그리지 않고, 그림이 빈 것만 AI가 그린다 (2026-10-27 오너)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reserveGenerationJob: vi.fn<(...a: unknown[]) => Promise<{ id: string; fal_key_id: string }>>(async () => ({ id: 'job-1', fal_key_id: 'prod-2000' })),
  falImageSubmit: vi.fn<(...a: unknown[]) => Promise<{ request_id: string; model: string; fal_key_id: string }>>(async () => ({ request_id: 'req-1', model: 'openai/gpt-image-2', fal_key_id: 'prod-2000' })),
  tables: {} as Record<string, Array<Record<string, unknown>>>,
}))

// 작은 가짜 DB — eq · is 로 걸러 읽기만 한다(초안은 표를 고치지 않고 생성 작업만 예약한다).
function query(table: string) {
  const filters: Array<[string, string, unknown]> = []
  let limit: number | null = null
  const rows = () => (mocks.tables[table] ?? []).filter((row) => filters.every(([kind, column, value]) => (kind === 'is' && value === null ? row[column] == null : row[column] === value)))
  const many = () => ({ data: (limit == null ? rows() : rows().slice(0, limit)).map((row) => ({ ...row })), error: null })
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = (column: string, value: unknown) => { filters.push(['eq', column, value]); return builder }
  builder.is = (column: string, value: unknown) => { filters.push(['is', column, value]); return builder }
  builder.order = () => builder
  builder.limit = (value: number) => { limit = value; return Promise.resolve(many()) }
  builder.insert = () => Promise.resolve({ data: null, error: null })
  builder.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
  builder.single = builder.maybeSingle
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(many()).then(resolve, reject)
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => query(table) } }))
vi.mock('@/lib/writer/llm/fal', () => ({
  falImageSubmit: (...a: unknown[]) => mocks.falImageSubmit(...a),
  DEFAULT_EDIT_IMAGE_MODEL: 'openai/gpt-image-2/edit',
  isImageEditModel: (model: string) => /\/edit$/.test(model),
}))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: (...a: unknown[]) => mocks.reserveGenerationJob(...a),
  confirmGenerationJobReceipt: async () => undefined,
  rejectGenerationJobReservation: async () => undefined,
  hasQueuedCharacterViewJob: async () => false,
  hasQueuedWorldShotJob: async () => false,
  countFailedJobsForTarget: async () => 0,
  AUTO_GENERATION_GIVE_UP_THRESHOLD: 2,
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined, resolveWebhookBaseUrl: () => undefined }))

import { assetCompletionGaps, makingProgress } from '@/lib/artist/breakdown'
import { triggerCharacterDrafts, triggerWorldDrafts } from '@/lib/artist/draft-trigger'
import { missingDrawTargets } from '@/lib/artist/draw-continue'

const MINHO_REF = 'http://supabase.invalid/storage/v1/object/public/media/ws-1/proj-1/breakdown/minho.png'
const HALL_REF = 'http://supabase.invalid/storage/v1/object/public/media/ws-1/proj-1/breakdown/hall.jpg'
const reservedTargets = () => mocks.reserveGenerationJob.mock.calls.map(([arg]) => (arg as { target: Record<string, unknown> }).target)

const location = (location_id: string, wide_shot: string | null) => ({
  project_id: 'proj-1', location_id, name: location_id, visual_description: '형광등 복도', style_description: null,
  lighting_direction: null, lighting_sources: null, time_of_day: 'day', purpose: null, props: null, wide_shot,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tables = {
    projects: [{ id: 'proj-1', workspace_id: 'ws-1', design_tokens: { l1: { art_style: 'ink storybook' }, palette: { primary: 'cobalt' } }, style_anchor_key: null, custom_style_anchor: null, series: null }],
    characters: [
      { project_id: 'proj-1', character_id: 'minho', name: '민호', role: 'protagonist', costume: null, entity_type: 'person' },
      { project_id: 'proj-1', character_id: 'boss', name: '팀장', role: 'supporting', costume: null, entity_type: 'person' },
    ],
    character_appearances: [
      // 민호는 [만들기] 때 레퍼런스 그림이 기본 모습의 시트 · 대표 사진으로 적혔다.
      { project_id: 'proj-1', character_id: 'minho', appearance_key: 'current', is_default: true, appearance: '회사원', costume: null, sheet_url: MINHO_REF, portrait_url: MINHO_REF, derived_from_url: null },
      { project_id: 'proj-1', character_id: 'boss', appearance_key: 'current', is_default: true, appearance: '엄한 팀장', costume: null, sheet_url: null, portrait_url: null, derived_from_url: null },
    ],
    locations: [location('hall', HALL_REF), location('roof', null)],
    character_image_candidates: [],
  }
})

describe('레퍼런스로 채운 칸은 다시 그리지 않는다', () => {
  it('시트가 레퍼런스 그림으로 채워진 인물은 자동 초안이 그리지 않고 비어 있는 인물만 그린다', async () => {
    // 왜: 오너 "이미지가 업로드되지 않은 것이 있다면 우리가 그려주면 되" — Writer 가 디자인을 마치면 서버가 인물 시트를 그리는데, 올린 그림이 있는 인물까지 그리면 그림이 바뀌고 돈이 든다.
    const result = await triggerCharacterDrafts('proj-1')

    expect(result).toEqual({ submitted: 1, skipped: 1, failed: 0 })
    expect(reservedTargets()).toEqual([expect.objectContaining({ characterId: 'boss', view: 'main' })])
  })

  it('와이드샷이 레퍼런스 그림으로 채워진 배경은 자동 초안이 그리지 않고 비어 있는 배경만 그린다', async () => {
    // 왜: 배경도 인물과 같다(약속 B) — 그림을 올린 배경은 그 그림이 그대로 배경 카드의 그림이다.
    const result = await triggerWorldDrafts('proj-1')

    expect(result).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(reservedTargets()).toEqual([expect.objectContaining({ locationId: 'roof', column: 'wide_shot' })])
  })

  it('화면의 안 나온 그림 다시 그리기도 레퍼런스로 채운 인물 · 배경은 고르지 않는다', () => {
    // 왜: 서버 초안이 한도에 막혀 건너뛴 그림은 화면이 이어 그린다(2026-10-27) — 그때도 올린 그림이 있는 칸은 빈칸이 아니다.
    const targets = missingDrawTargets({
      characters: [
        { characterId: 'minho', entityType: 'person', appearances: [{ appearanceKey: 'current', isDefault: true, sheetUrl: MINHO_REF }] },
        { characterId: 'boss', entityType: 'person', appearances: [{ appearanceKey: 'current', isDefault: true, sheetUrl: null }] },
      ],
      worlds: [{ locationId: 'hall', wideShot: HALL_REF }, { locationId: 'roof', wideShot: null }],
      drawingViews: [],
      drawingLocations: [],
    })

    expect(targets).toEqual({ characters: [{ characterId: 'boss', appearanceKey: 'current' }], worlds: ['roof'] })
  })

  it('레퍼런스로 채운 인물 · 배경은 만드는 중 화면에서 처음부터 다 그린 그림으로 센다', () => {
    // 왜: 모두 레퍼런스를 올렸으면 그릴 것이 없다 — 그림 그리는 중으로 남으면 [완료하기]를 기다리게 된다.
    const gaps = assetCompletionGaps(
      [{ characterId: 'minho', name: '민호', entityType: 'person', appearances: [{ isDefault: true, sheetUrl: MINHO_REF }] }],
      [{ locationId: 'hall', name: '회사 복도', wideShot: HALL_REF }],
    )

    expect(gaps).toEqual({ characters: [], locations: [] })
    expect(makingProgress({ started: true, current_stage: 'sceneSplit' }, { charsReady: 1, charsTotal: 1, worldsReady: 1, worldsTotal: 1 })).toEqual({ step: 2, drawn: 2, total: 2, done: true })
  })
})
