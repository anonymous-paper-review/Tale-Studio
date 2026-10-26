// 앞 화에서 이어받았는데 이 화 그림이 비어 있는 인물 · 배경은 앞 화 그림을 참고 그림으로 넣어 이 화 그림체로 다시 그리고 (시리즈 2026-10-26),
//   같은 그림체로 새로 나온 인물 · 배경은 앞 화 그림 한 장을 그림체 견본으로 붙여 그린다 (2026-10-27 오너 "제품에서 고칠 것")
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({
  reserveGenerationJob: vi.fn<(...a: unknown[]) => Promise<{ id: string; fal_key_id: string }>>(),
  confirmGenerationJobReceipt: vi.fn<(...a: unknown[]) => Promise<void>>(),
  rejectGenerationJobReservation: vi.fn<(...a: unknown[]) => Promise<void>>(),
  hasQueuedCharacterViewJob: vi.fn<(...a: unknown[]) => Promise<boolean>>(),
  hasQueuedWorldShotJob: vi.fn<(...a: unknown[]) => Promise<boolean>>(),
  countFailedJobsForTarget: vi.fn<(...a: unknown[]) => Promise<number>>(),
  listFailedCharacterViewJobs: vi.fn<(...a: unknown[]) => Promise<unknown[]>>(),
  listFailedWorldShotJobs: vi.fn<(...a: unknown[]) => Promise<unknown[]>>(),
  falImageSubmit: vi.fn<(...a: unknown[]) => Promise<{ request_id: string; model: string; fal_key_id: string }>>(),
  submitWorldShotJob: vi.fn<(...a: unknown[]) => Promise<{ id: string; model: string; request_id: string }>>(),
  checkGenerationCapacity: vi.fn(),
  quotaExceededBody: vi.fn(),
  templateAssetUrl: vi.fn<(...a: unknown[]) => Promise<string | null>>(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
// 접근 가드는 이 파일의 관심사 아님 — 소유자 통과로 고정 (가드 자체 검증은 api-project-access-guard.test.ts 전담, #access-audit 2026-08-15)
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({
    ok: true as const,
    projectId,
    userId: 'user-1',
    viaShare: false,
  })),
}))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  quotaExceededBody: mocks.quotaExceededBody,
}))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: (...a: unknown[]) => mocks.reserveGenerationJob(...a),
  confirmGenerationJobReceipt: (...a: unknown[]) => mocks.confirmGenerationJobReceipt(...a),
  rejectGenerationJobReservation: (...a: unknown[]) => mocks.rejectGenerationJobReservation(...a),
  hasQueuedCharacterViewJob: (...a: unknown[]) => mocks.hasQueuedCharacterViewJob(...a),
  hasQueuedWorldShotJob: (...a: unknown[]) => mocks.hasQueuedWorldShotJob(...a),
  countFailedJobsForTarget: (...a: unknown[]) => mocks.countFailedJobsForTarget(...a),
  listFailedCharacterViewJobs: (...a: unknown[]) => mocks.listFailedCharacterViewJobs(...a),
  listFailedWorldShotJobs: (...a: unknown[]) => mocks.listFailedWorldShotJobs(...a),
  AUTO_GENERATION_GIVE_UP_THRESHOLD: 5,
}))
vi.mock('@/lib/writer/llm/fal', () => ({
  falImageSubmit: (...a: unknown[]) => mocks.falImageSubmit(...a),
  DEFAULT_EDIT_IMAGE_MODEL: 'openai/gpt-image-2/edit',
  isImageEditModel: (model: string) => /\/edit$/.test(model),
}))
vi.mock('@/lib/fal/webhook-url', () => ({
  resolveWebhookUrl: () => WEBHOOK_URL,
  resolveWebhookBaseUrl: () => 'https://base.test',
}))
// 템플릿은 스토리지에서 온다(template-asset.ts) — 테스트에서는 올릴 곳이 없어 주소를 직접 물린다.
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: (...a: unknown[]) => mocks.templateAssetUrl(...a) }))
// 배경 제출은 자리 예약 · 접수까지 한 묶음이라(world-submit.ts) 참고 그림 목록은 그 입력에서 본다.
vi.mock('@/lib/artist/world-submit', () => ({ submitWorldShotJob: (...a: unknown[]) => mocks.submitWorldShotJob(...a) }))

import { POST as generateSheetPOST } from '@/app/api/artist/generate-sheet/route'
import { POST as generateWorldPOST } from '@/app/api/artist/generate-world/route'
import { triggerCharacterDrafts, triggerWorldDrafts } from '@/lib/artist/draft-trigger'
import { seriesCharacterReference, seriesLocationReference, seriesStyleSample } from '@/lib/series/redraw-reference'
import { keepsSourcePortrait } from '@/lib/artist/source-image'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'
import { SERIES_VERSION, type SeriesSnapshot } from '@/lib/series/snapshot'
import { _clearStyleAnchorCacheForTest } from '@/lib/style-anchor'

const PROJECT_ID = 'proj-2'
const WORKSPACE_ID = 'ws-1'
const OWNER_ID = 'owner-1'
const CHARACTER_ID = 'char_hero'
const LOCATION_ID = 'loc_harbor'
const WEBHOOK_URL = 'https://hook.test/webhook'
const TEMPLATE_URL = 'https://media.test/templates/character-template-abc123456789.png'
const PREV_SHEET = 'https://media.test/ws-1/proj-2/series/char_hero_sheet.png'
const PREV_WIDE = 'https://media.test/ws-1/proj-2/series/loc_harbor_wide.png'
const SOURCE_IMAGE = 'https://media.test/ws-1/proj-2/uploads/hero-photo.png'
const NEW_CHARACTER_ID = 'old_boatman'
const NEW_LOCATION_ID = 'river_ferry_dock'
const ANCHOR_IMAGE = 'https://media.test/style-anchors/watercolor.png'
const INK_ANCHOR_IMAGE = 'https://media.test/style-anchors/ink.png'
const styleRow = (key: string, imageUrl: string) => ({
  key,
  image_url: imageUrl,
  is_active: true,
  medium: key,
  style_clause: null,
  use_preview_ref: false,
  preview_url: null,
  anchor_kind: 'media',
  use_reference_image: true,
  facets: null,
})
const DESIGN_TOKENS = {
  l1: { art_style: 'ink storybook', shape_language: 'clear silhouettes' },
  palette: { primary: 'cobalt', secondary: 'ochre', accent: 'red' },
}

const SERIES: SeriesSnapshot = {
  version: SERIES_VERSION,
  prevProjectId: 'proj-1',
  prevTitle: '첫 화',
  copiedAt: '2026-10-26T00:00:00.000Z',
  characters: [
    {
      characterId: CHARACTER_ID,
      name: '카이',
      role: 'protagonist',
      appearance: '은발 검사',
      personality: ['차분하다'],
      sheetUrl: PREV_SHEET,
      portraitUrl: 'https://media.test/ws-1/proj-2/series/char_hero_portrait.png',
      styleId: 'watercolor',
    },
  ],
  locations: [
    { locationId: LOCATION_ID, name: 'Moon Harbor', description: 'misty harbor', wideShotUrl: PREV_WIDE, styleId: 'watercolor' },
  ],
  voices: [],
  styleId: 'watercolor',
  format: 'horizontal_16:9',
  dialogueLanguage: 'ko',
  continuesLastScene: false,
  copyFailures: [],
  designTokens: null,
}

const read = (rel: string) => readFileSync(rel, 'utf8')
const PROMPT_INPUT = { name: '카이', appearance: '은발 검사' } as never

interface ProjectRow {
  id: string
  workspace_id: string
  design_tokens: typeof DESIGN_TOKENS | null
  style_anchor_key: string | null
  custom_style_anchor: Record<string, unknown> | null
  series: unknown
}

interface CharacterRow {
  project_id: string
  character_id: string
  name: string
  role: string | null
  costume: string[] | string | null
  entity_type: string | null
}

interface AppearanceRow {
  project_id: string
  character_id: string
  appearance_key: string
  is_default: boolean
  appearance: string | null
  costume: string[] | string | null
  sheet_url: string | null
  portrait_url: string | null
  derived_from_url: string | null
}

interface LocationRow {
  project_id: string
  location_id: string
  name: string
  visual_description: string | null
  style_description: string | null
  lighting_direction: string | null
  lighting_sources: string[] | null
  time_of_day: string | null
  purpose: string | null
  props: string[] | null
  wide_shot: string | null
}

const dbState: {
  projects: ProjectRow[]
  workspaces: Array<{ id: string; owner_id: string }>
  characters: CharacterRow[]
  appearances: AppearanceRow[]
  locations: LocationRow[]
  candidates: Array<Record<string, unknown>>
  styleAnchors: Array<Record<string, unknown>>
} = { projects: [], workspaces: [], characters: [], appearances: [], locations: [], candidates: [], styleAnchors: [] }

beforeEach(() => {
  _clearStyleAnchorCacheForTest()
  dbState.projects = [projectFixture()]
  dbState.workspaces = [{ id: WORKSPACE_ID, owner_id: OWNER_ID }]
  dbState.characters = [characterFixture()]
  dbState.appearances = [appearanceFixture()]
  dbState.locations = []
  dbState.candidates = []
  dbState.styleAnchors = [styleRow('watercolor', ANCHOR_IMAGE), styleRow('ink', INK_ANCHOR_IMAGE)]

  mocks.reserveGenerationJob.mockReset()
  mocks.reserveGenerationJob.mockResolvedValue({ id: 'job-1', fal_key_id: 'prod-2000' })
  mocks.confirmGenerationJobReceipt.mockReset()
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.rejectGenerationJobReservation.mockReset()
  mocks.rejectGenerationJobReservation.mockResolvedValue(undefined)
  mocks.hasQueuedCharacterViewJob.mockReset()
  mocks.hasQueuedCharacterViewJob.mockResolvedValue(false)
  mocks.hasQueuedWorldShotJob.mockReset()
  mocks.hasQueuedWorldShotJob.mockResolvedValue(false)
  mocks.countFailedJobsForTarget.mockReset()
  mocks.countFailedJobsForTarget.mockResolvedValue(0)
  mocks.listFailedCharacterViewJobs.mockReset()
  mocks.listFailedCharacterViewJobs.mockResolvedValue([])
  mocks.listFailedWorldShotJobs.mockReset()
  mocks.listFailedWorldShotJobs.mockResolvedValue([])
  mocks.falImageSubmit.mockReset()
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'req-1', model: 'openai/gpt-image-2/edit', fal_key_id: 'prod-2000' })
  mocks.submitWorldShotJob.mockReset()
  mocks.submitWorldShotJob.mockResolvedValue({ id: 'job-2', model: 'openai/gpt-image-2/edit', request_id: 'req-2' })
  mocks.checkGenerationCapacity.mockReset()
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 8 })
  mocks.quotaExceededBody.mockReset()
  mocks.quotaExceededBody.mockImplementation((input: unknown) => input)
  mocks.templateAssetUrl.mockReset()
  mocks.templateAssetUrl.mockResolvedValue(TEMPLATE_URL)
  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => queryFor(table))
})

describe('이어받은 인물 · 배경을 이 화 그림체로 다시 그린다', () => {
  // 왜: 앞 화와 그림체가 다르고 이번 화에 나오는 인물은 이 화 표에 그림 없이 들어온다 — 글로만 그리면 다른 사람이 된다.
  it('이어받은 인물의 그림이 비어 있으면 앞 화 그림을 참고해 이 화 그림체로 다시 그린다', async () => {
    expect(seriesCharacterReference(SERIES, CHARACTER_ID)).toBe(PREV_SHEET)
    expect(seriesCharacterReference(SERIES, 'char_stranger')).toBeNull()
    expect(seriesCharacterReference(null, CHARACTER_ID)).toBeNull()

    const result = await triggerCharacterDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(falRefs()).toEqual([TEMPLATE_URL, PREV_SHEET])
    expect(falPrompt()).toContain('PREVIOUS episode')
    // 사용자가 올린 원본이 아니므로 "그대로 재현" 갈래는 켜지 않는다.
    expect(falPrompt()).not.toContain('ORIGINAL picture')
  })

  // 왜: 배경도 같은 이유다 — 앞 화 와이드샷을 안 보여주면 같은 항구가 다른 곳으로 그려진다.
  it('이어받은 배경의 그림이 비어 있으면 앞 화 와이드샷을 참고해 다시 그린다', async () => {
    expect(seriesLocationReference(SERIES, LOCATION_ID)).toBe(PREV_WIDE)
    expect(seriesLocationReference(SERIES, 'loc_stranger')).toBeNull()
    expect(seriesLocationReference(null, LOCATION_ID)).toBeNull()
    dbState.locations = [locationFixture()]

    const result = await triggerWorldDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(worldRefs()).toEqual([PREV_WIDE])
  })

  // 왜: 자동 초안이 혼잡 · 실패로 못 채운 빈칸은 사람이 버튼으로 다시 그린다 — 그 길에도 앞 화 그림이 붙어야 같은 인물이다.
  it('그림 다시 그리기 버튼으로 그려도 같은 규칙으로 앞 화 그림을 참고한다', async () => {
    const sheet = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        appearanceKey: 'current',
        view: 'main',
        actor: 'ui',
      }),
    )
    expect(sheet.status).toBe(200)
    expect(falRefs()).toEqual([TEMPLATE_URL, PREV_SHEET])
    expect(falPrompt()).toContain('PREVIOUS episode')

    dbState.locations = [locationFixture()]
    const world = await generateWorldPOST(
      postRequest('/api/artist/generate-world', {
        projectId: PROJECT_ID,
        locationId: LOCATION_ID,
        column: 'wide_shot',
        prompt: 'misty harbor with brass signal towers',
        actor: 'ui',
      }),
    )
    expect(world.status).toBe(200)
    expect(worldRefs()).toEqual([PREV_WIDE])
  })

  // 왜: 원본은 사용자가 직접 고른 그 사람이다 — 앞 화 그림이 먼저 오면 앞 화의 해석이 원본을 이긴다.
  it('사용자가 올린 원본 그림이 있으면 그 원본이 앞 화 그림보다 먼저다', async () => {
    dbState.appearances = [appearanceFixture({ derived_from_url: SOURCE_IMAGE })]

    await triggerCharacterDrafts(PROJECT_ID)

    expect(falRefs()).toEqual([TEMPLATE_URL, SOURCE_IMAGE, PREV_SHEET])
    expect(falPrompt()).toContain('ORIGINAL picture')
    expect(falPrompt()).toContain('PREVIOUS episode')

    mocks.falImageSubmit.mockClear()
    const sheet = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        appearanceKey: 'current',
        view: 'main',
        actor: 'ui',
      }),
    )
    expect(sheet.status).toBe(200)
    expect(falRefs()).toEqual([TEMPLATE_URL, SOURCE_IMAGE, PREV_SHEET])
  })

  // 왜: 앞 화 시트는 사용자가 올린 원본이 아니다 — 대표 사진 유지 규칙에 걸리면 이 화 대표 사진이 앞 화 그림체로 남는다.
  it('앞 화 그림으로 다시 그린 인물도 시트가 나오면 시트에서 대표 사진을 만든다', () => {
    // 대표 사진 유지(keepsSourcePortrait)는 사용자가 올린 원본만 본다 — 앞 화 시트는 그 칸에 넣지 않는다.
    expect(keepsSourcePortrait({ derived_from_url: SOURCE_IMAGE })).toBe(true)
    expect(keepsSourcePortrait({ derived_from_url: null })).toBe(false)
    expect(read('src/lib/series/redraw-reference.ts')).not.toContain('derived_from_url')
    expect(read('src/app/api/artist/generate-sheet/route.ts')).toMatch(/const sourceImageUrl = typeof appearance\.derived_from_url/)
    expect(read('src/lib/artist/draft-trigger.ts')).toMatch(/defaultAppearance\.derived_from_url/)
    // 시트가 착지하면 지금처럼 시트 크롭이 대표 사진이 된다.
    expect(read('src/lib/fal/finalize.ts')).toContain('keepsSourcePortrait(')
  })

  // 정상 경로 고정 — 시리즈가 아닌 프로젝트(대부분)는 앞 화가 없다.
  it('시리즈가 아닌 프로젝트는 지금처럼 참고 그림 없이 그린다', async () => {
    dbState.projects = [projectFixture({ series: null })]
    dbState.locations = [locationFixture()]

    await triggerCharacterDrafts(PROJECT_ID)
    expect(falRefs()).toEqual([TEMPLATE_URL])
    expect(falPrompt()).not.toContain('PREVIOUS episode')

    await triggerWorldDrafts(PROJECT_ID)
    expect(worldRefs() ?? []).toEqual([])
  })

  // 왜: 앞 화 시트는 그림체가 다를 수 있다 — "그대로 재현"으로 읽히면 앞 화 그림체가 이 화 그림에 묻어 온다.
  it('앞 화 시트를 참고할 때는 정체성만 따르고 그림체는 이 화 그림체로 그리라고 지시한다', () => {
    const prompt = buildCharacterTurnaroundPrompt(PROMPT_INPUT, { hasSeriesSheet: true })
    expect(prompt).toContain('PREVIOUS episode')
    expect(prompt).toContain('take ONLY the identity')
    expect(prompt).toMatch(/face, hair, build/)
    expect(prompt).toContain('art style declared for THIS sheet')
    expect(prompt).toMatch(/never copy[^.]*linework, shading, texture or medium/)
    // 원본의 "그대로 재현" 문장과 섞이지 않는다.
    expect(prompt).not.toContain('ORIGINAL picture')
    // 앞 화 시트가 없으면 프롬프트는 지금과 글자 하나 다르지 않다.
    expect(buildCharacterTurnaroundPrompt(PROMPT_INPUT, { hasSeriesSheet: false })).toBe(
      buildCharacterTurnaroundPrompt(PROMPT_INPUT),
    )
    expect(buildCharacterTurnaroundPrompt(PROMPT_INPUT)).not.toContain('PREVIOUS episode')
  })

  // 왜: 실사처럼 기준 그림 없이 그리는 그림체는 앞 화 와이드샷이 유일한 참고 그림이다. 지시가 없으면 앞 화 그림체를 그대로 따라 그린다.
  it('앞 화 와이드샷을 참고할 때는 장소만 따르고 그림체는 이 화 그림체로 그리라고 지시한다', async () => {
    dbState.locations = [locationFixture()]
    await triggerWorldDrafts(PROJECT_ID)
    expect(worldPrompt()).toContain('PREVIOUS episode')
    expect(worldPrompt()).toMatch(/layout, landmarks/)
    expect(worldPrompt()).toMatch(/never copy[^.]*linework, shading, texture or medium/)
    const seriesHash = worldInput().sourceHash

    mocks.submitWorldShotJob.mockClear()
    const world = await generateWorldPOST(
      postRequest('/api/artist/generate-world', {
        projectId: PROJECT_ID,
        locationId: LOCATION_ID,
        column: 'wide_shot',
        prompt: 'misty harbor with brass signal towers',
        actor: 'ui',
      }),
    )
    expect(world.status).toBe(200)
    expect(worldPrompt()).toContain('PREVIOUS episode')

    // 시리즈가 아닌 프로젝트는 프롬프트가 지금과 같다.
    dbState.projects = [projectFixture({ series: null })]
    mocks.submitWorldShotJob.mockClear()
    await triggerWorldDrafts(PROJECT_ID)
    expect(worldPrompt()).not.toContain('PREVIOUS episode')
    // 지시 줄은 그림 출처 해시에 들어가지 않는다 — 들어가면 설명이 같은데 "설명이 바뀜"으로 보인다.
    expect(worldInput().sourceHash).toBe(seriesHash)
  })
})

describe('같은 그림체로 새로 나온 인물 · 배경은 앞 화 그림 한 장을 그림체 견본으로 붙인다', () => {
  // 이어받은 카이는 같은 그림체라 앞 화 시트를 그대로 쓴다(이미 채워짐). 새 인물 뱃사공은 빈칸이다.
  function sameStyleEpisode(styleKey: string | null = 'watercolor') {
    dbState.projects = [projectFixture({ style_anchor_key: styleKey })]
    dbState.characters = [characterFixture(), characterFixture({ character_id: NEW_CHARACTER_ID, name: '뱃사공', role: 'supporting' })]
    dbState.appearances = [
      appearanceFixture({ sheet_url: PREV_SHEET }),
      appearanceFixture({ character_id: NEW_CHARACTER_ID, appearance: '주름진 노인' }),
    ]
  }

  // 왜: 같이 정한 것 — 운영 2화 뛰사공은 일반 견본 그림만 보고 그려 선 · 음영 · 세계관이 1화 인물과 달랐다.
  it('같은 그림체로 새 인물을 그리면 앞 화 인물 시트 한 장을 마지막 참고 그림으로 붙이고 다른 인물이라고 지시한다', async () => {
    sameStyleEpisode()
    expect(seriesStyleSample(SERIES, 'character', NEW_CHARACTER_ID, 'watercolor')).toBe(PREV_SHEET)

    const result = await triggerCharacterDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 1, skipped: 1, failed: 0 })
    expect(falRefs()).toEqual([ANCHOR_IMAGE, TEMPLATE_URL, PREV_SHEET])
    expect(falPrompt()).toContain('DIFFERENT character from the PREVIOUS episode')
    expect(falPrompt()).toMatch(/never copy its face, hair, outfit/)
    expect(falPrompt()).toMatch(/same world, period and culture/)
  })

  // 왜: 같이 정한 것 — 배경도 같다. 단 견본은 다른 장소라 "그 장소를 지켜라"(정체성 참고)로 보내면 안 된다.
  it('같은 그림체로 새 배경을 그리면 앞 화 배경 한 장을 견본으로 붙이고 그 장소를 따라 그리지 말라고 지시한다', async () => {
    sameStyleEpisode()
    dbState.locations = [locationFixture({ location_id: NEW_LOCATION_ID, name: '강가 나루터' })]
    expect(seriesStyleSample(SERIES, 'location', NEW_LOCATION_ID, 'watercolor')).toBe(PREV_WIDE)

    const result = await triggerWorldDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(worldInput().styleSampleUrl).toBe(PREV_WIDE)
    expect(worldRefs() ?? []).toEqual([])
    expect(worldPrompt()).toContain('DIFFERENT place from the PREVIOUS episode')
    expect(worldPrompt()).toMatch(/never reproduce that place/)
    const sampleHash = worldInput().sourceHash

    // 지시 줄은 그림 출처 해시에 들어가지 않는다 — 시리즈가 아닌 같은 배경과 해시가 같다.
    dbState.projects = [projectFixture({ style_anchor_key: 'watercolor', series: null })]
    mocks.submitWorldShotJob.mockClear()
    await triggerWorldDrafts(PROJECT_ID)
    expect(worldInput().styleSampleUrl ?? null).toBeNull()
    expect(worldInput().sourceHash).toBe(sampleHash)
  })

  // 왜: 혼자 정한 것 — 자동 초안이 못 채운 빈칸을 사람이 버튼으로 그려도 같은 견본이 붙어야 그림이 같은 결로 나온다.
  it('버튼으로 새 인물을 처음 그리거나 새 배경을 그려도 같은 규칙으로 견본을 붙인다', async () => {
    sameStyleEpisode()
    const sheet = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', { projectId: PROJECT_ID, characterId: NEW_CHARACTER_ID, appearanceKey: 'current', view: 'main', actor: 'ui' }),
    )
    expect(sheet.status).toBe(200)
    expect(falRefs()).toEqual([ANCHOR_IMAGE, TEMPLATE_URL, PREV_SHEET])
    expect(falPrompt()).toContain('DIFFERENT character from the PREVIOUS episode')

    dbState.locations = [locationFixture({ location_id: NEW_LOCATION_ID, name: '강가 나루터', wide_shot: 'https://media.test/ws-1/proj-2/locations/dock-v1.png' })]
    const world = await generateWorldPOST(
      postRequest('/api/artist/generate-world', { projectId: PROJECT_ID, locationId: NEW_LOCATION_ID, column: 'wide_shot', prompt: 'misty river dock at dawn', actor: 'ui' }),
    )
    expect(world.status).toBe(200)
    expect(worldInput().styleSampleUrl).toBe(PREV_WIDE)
    expect(worldPrompt()).toContain('DIFFERENT place from the PREVIOUS episode')
  })

  // 왜: 혼자 정한 것 — 그림체를 바꾼 화의 앞 화 그림은 다른 그림체라 견본이 될 수 없다. 기준 그림 없이 그리는 그림체(실사,
  //   10-13 오너)에 그림을 붙이지 않는다. 이 화 시트가 생긴 뒤 다시 그리기는 그 시트가 기준이다.
  it('그림체를 바꿨거나 그림체 기준 그림이 없거나 이 화 시트가 이미 있으면 견본을 붙이지 않는다', async () => {
    expect(seriesStyleSample(SERIES, 'character', NEW_CHARACTER_ID, 'ink')).toBeNull()
    expect(seriesStyleSample(SERIES, 'character', CHARACTER_ID, 'watercolor')).toBeNull()
    expect(seriesStyleSample(null, 'character', NEW_CHARACTER_ID, 'watercolor')).toBeNull()

    sameStyleEpisode('ink')
    await triggerCharacterDrafts(PROJECT_ID)
    expect(falRefs()).toEqual([INK_ANCHOR_IMAGE, TEMPLATE_URL])

    mocks.falImageSubmit.mockClear()
    sameStyleEpisode(null)
    await triggerCharacterDrafts(PROJECT_ID)
    expect(falRefs()).toEqual([TEMPLATE_URL])

    mocks.falImageSubmit.mockClear()
    sameStyleEpisode()
    const ownSheet = 'https://media.test/ws-1/proj-2/characters/boatman-v1.png'
    dbState.appearances[1].sheet_url = ownSheet
    const sheet = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', { projectId: PROJECT_ID, characterId: NEW_CHARACTER_ID, appearanceKey: 'current', view: 'main', actor: 'ui' }),
    )
    expect(sheet.status).toBe(200)
    expect(falRefs()).toEqual([ANCHOR_IMAGE, TEMPLATE_URL, ownSheet])
    expect(falPrompt()).not.toContain('DIFFERENT character')

    sameStyleEpisode('ink')
    dbState.locations = [locationFixture({ location_id: NEW_LOCATION_ID, name: '강가 나루터' })]
    await triggerWorldDrafts(PROJECT_ID)
    expect(worldInput().styleSampleUrl ?? null).toBeNull()
    expect(worldPrompt()).not.toContain('DIFFERENT place')
  })
})

function projectFixture(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    design_tokens: DESIGN_TOKENS,
    style_anchor_key: null,
    custom_style_anchor: null,
    series: SERIES,
    ...overrides,
  }
}

function characterFixture(overrides: Partial<CharacterRow> = {}): CharacterRow {
  return {
    project_id: PROJECT_ID,
    character_id: CHARACTER_ID,
    name: '카이',
    role: 'protagonist',
    costume: null,
    entity_type: 'person',
    ...overrides,
  }
}

function appearanceFixture(overrides: Partial<AppearanceRow> = {}): AppearanceRow {
  return {
    project_id: PROJECT_ID,
    character_id: CHARACTER_ID,
    appearance_key: 'current',
    is_default: true,
    appearance: '은발 검사',
    costume: null,
    sheet_url: null,
    portrait_url: null,
    derived_from_url: null,
    ...overrides,
  }
}

function locationFixture(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    project_id: PROJECT_ID,
    location_id: LOCATION_ID,
    name: 'Moon Harbor',
    visual_description: 'misty harbor with black water and brass signal towers',
    style_description: 'painted gothic harbor',
    lighting_direction: 'moonlit backlight',
    lighting_sources: ['moon'],
    time_of_day: 'night',
    purpose: 'final departure',
    props: ['signal tower'],
    wide_shot: null,
    ...overrides,
  }
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function falOpts(): { prompt: string; reference_image_urls?: string[] } {
  return mocks.falImageSubmit.mock.calls[0][0] as { prompt: string; reference_image_urls?: string[] }
}

function falRefs(): string[] | undefined {
  return falOpts().reference_image_urls
}

function falPrompt(): string {
  return falOpts().prompt
}

function worldInput(): { prompt: string; sourceHash?: string | null; referenceImageUrls?: string[] | null; styleSampleUrl?: string | null } {
  return mocks.submitWorldShotJob.mock.calls[0][0] as { prompt: string; sourceHash?: string | null; referenceImageUrls?: string[] | null; styleSampleUrl?: string | null }
}

function worldRefs(): string[] | null | undefined {
  return worldInput().referenceImageUrls
}

function worldPrompt(): string {
  return worldInput().prompt
}

function queryFor(table: string) {
  const filters: Array<{ column: string; value: unknown; op: 'eq' | 'is' }> = []
  let limitValue: number | null = null
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value, op: 'eq' })
      return query
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value, op: 'is' })
      return query
    }),
    limit: vi.fn((value: number) => {
      limitValue = value
      return Promise.resolve({ data: resolveRows(table, filters, limitValue, 'many'), error: null })
    }),
    maybeSingle: vi.fn(async () => ({ data: resolveRows(table, filters, limitValue, 'single'), error: null })),
    single: vi.fn(async () => ({ data: resolveRows(table, filters, limitValue, 'single'), error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: resolveRows(table, filters, limitValue, 'many'), error: null }).then(resolve, reject),
  }
  return query
}

function resolveRows(
  table: string,
  filters: Array<{ column: string; value: unknown; op: 'eq' | 'is' }>,
  limitValue: number | null,
  mode: 'single' | 'many',
): unknown {
  const rows = rowsForTable(table).filter((row) => matchesFilters(row, filters))
  const limited = limitValue == null ? rows : rows.slice(0, limitValue)
  return mode === 'single' ? (limited[0] ?? null) : limited
}

function rowsForTable(table: string): Array<Record<string, unknown>> {
  if (table === 'projects') return dbState.projects as unknown as Array<Record<string, unknown>>
  if (table === 'workspaces') return dbState.workspaces as unknown as Array<Record<string, unknown>>
  if (table === 'characters') return dbState.characters as unknown as Array<Record<string, unknown>>
  if (table === 'character_appearances') return dbState.appearances as unknown as Array<Record<string, unknown>>
  if (table === 'locations') return dbState.locations as unknown as Array<Record<string, unknown>>
  if (table === 'character_image_candidates') return dbState.candidates
  if (table === 'style_anchors') return dbState.styleAnchors
  return []
}

function matchesFilters(
  row: Record<string, unknown>,
  filters: Array<{ column: string; value: unknown; op: 'eq' | 'is' }>,
): boolean {
  return filters.every(({ column, value, op }) => {
    if (op === 'is' && value === null) return row[column] == null
    return row[column] === value
  })
}
