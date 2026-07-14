import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkUserQuota: vi.fn(),
  quotaExceededBody: vi.fn(),
  createGenerationJob: vi.fn(),
  hasQueuedCharacterViewJob: vi.fn(),
  countFailedJobsForTarget: vi.fn(),
  listFailedCharacterViewJobs: vi.fn(),
  userOwnsProject: vi.fn(),
  falImageSubmit: vi.fn(),
  resolveWebhookUrl: vi.fn(),
  resolveWebhookBaseUrl: vi.fn(),
  from: vi.fn(),
  webhookBaseUrl: 'https://base.test' as string | null,
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-quota', () => ({
  checkUserQuota: mocks.checkUserQuota,
  quotaExceededBody: mocks.quotaExceededBody,
}))
vi.mock('@/lib/generation-jobs', () => ({
  createGenerationJob: mocks.createGenerationJob,
  hasQueuedCharacterViewJob: mocks.hasQueuedCharacterViewJob,
  countFailedJobsForTarget: mocks.countFailedJobsForTarget,
  listFailedCharacterViewJobs: mocks.listFailedCharacterViewJobs,
  userOwnsProject: mocks.userOwnsProject,
  AUTO_GENERATION_GIVE_UP_THRESHOLD: 5,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.falImageSubmit }))
vi.mock('@/lib/fal/webhook-url', () => ({
  resolveWebhookUrl: mocks.resolveWebhookUrl,
  resolveWebhookBaseUrl: mocks.resolveWebhookBaseUrl,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { POST as generateSheetPOST } from '@/app/api/artist/generate-sheet/route'
import { POST as generateWorldPOST } from '@/app/api/artist/generate-world/route'
import { POST as generateStoryboardPOST } from '@/app/api/director/generate-storyboard/route'
import { triggerCharacterDrafts } from '@/lib/artist/draft-trigger'
import {
  buildCharacterMainPrompt,
  buildCharacterTurnaroundPrompt,
  buildCharacterViewPrompt,
  type CharacterPromptInput,
  type DirectionalView,
} from '@/lib/artist/turnaround'

const USER = { id: 'user-1' }
const PROJECT_ID = 'project-1'
const WORKSPACE_ID = 'workspace-1'
const CHARACTER_ID = 'character-1'
const LOCATION_ID = 'location-1'
const WRITER_SHOT_ID = 'writer-shot-1'
const WEBHOOK_URL = 'https://hook.test/webhook'
const BASE_URL = 'https://base.test'
const TEMPLATE_URL = `${BASE_URL}/character-template.png`
const DEFAULT_IMAGE_MODEL = 'openai/gpt-image-2'
const DEFAULT_EDIT_IMAGE_MODEL = 'openai/gpt-image-2/edit'

interface DesignTokens {
  l1?: {
    art_style?: string
    shape_language?: string
    line_quality?: string
    texture_philosophy?: string
    character_proportion?: string
  }
  palette?: { primary?: string; secondary?: string; accent?: string }
}

interface ProjectRow {
  id: string
  workspace_id: string
  design_tokens?: DesignTokens | null
}

interface CharacterRow {
  project_id: string
  character_id: string
  name: string
  role: string | null
  appearance: string | null
  costume: string[] | string | null
  view_main: string | null
  entity_type: 'person' | 'object' | null
}

interface CandidateRow {
  project_id: string
  character_id: string
  view: string
  id: string
}

interface FalImageOpts {
  model?: string
  prompt: string
  aspect_ratio?: string
  reference_image_urls?: string[]
  webhookUrl?: string
}

const designTokens: DesignTokens = {
  l1: {
    art_style: 'ink-and-wash adventure illustration',
    shape_language: 'angular readable silhouettes',
    line_quality: 'crisp confident contour lines',
    texture_philosophy: 'matte paper grain',
    character_proportion: '7:1',
  },
  palette: {
    primary: 'deep cobalt',
    secondary: 'warm ochre',
    accent: 'signal red',
  },
}

const dbState: {
  projects: ProjectRow[]
  characters: CharacterRow[]
  candidates: CandidateRow[]
} = {
  projects: [],
  characters: [],
  candidates: [],
}

beforeEach(() => {
  dbState.projects = [projectFixture({ design_tokens: designTokens })]
  dbState.characters = []
  dbState.candidates = []

  mocks.getUser.mockReset()
  mocks.getUser.mockResolvedValue(USER)

  mocks.checkUserQuota.mockReset()
  mocks.checkUserQuota.mockResolvedValue({ ok: true, queued: 0, limit: 8 })
  mocks.quotaExceededBody.mockReset()
  mocks.quotaExceededBody.mockImplementation((check: unknown) => check)

  mocks.createGenerationJob.mockReset()
  mocks.createGenerationJob.mockResolvedValue({ id: 'job-1' })
  mocks.hasQueuedCharacterViewJob.mockReset()
  mocks.hasQueuedCharacterViewJob.mockResolvedValue(false)
  mocks.countFailedJobsForTarget.mockReset()
  mocks.countFailedJobsForTarget.mockResolvedValue(0)
  mocks.listFailedCharacterViewJobs.mockReset()
  mocks.listFailedCharacterViewJobs.mockResolvedValue([])
  mocks.userOwnsProject.mockReset()
  mocks.userOwnsProject.mockResolvedValue(true)

  mocks.falImageSubmit.mockReset()
  mocks.falImageSubmit.mockImplementation(async (opts: FalImageOpts) => ({
    request_id: 'req-1',
    model: opts.model ?? (opts.reference_image_urls?.length ? DEFAULT_EDIT_IMAGE_MODEL : DEFAULT_IMAGE_MODEL),
  }))

  mocks.webhookBaseUrl = BASE_URL
  mocks.resolveWebhookUrl.mockReset()
  mocks.resolveWebhookUrl.mockReturnValue(WEBHOOK_URL)
  mocks.resolveWebhookBaseUrl.mockReset()
  mocks.resolveWebhookBaseUrl.mockImplementation(() => mocks.webhookBaseUrl)

  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => queryFor(table))
})

describe('style-anchor Phase 0 no-op characterization', () => {
  it('D.1 generate-sheet person main uses template edit opts with no aspect_ratio', async () => {
    const character = characterFixture({ view_main: null, entity_type: 'person' })
    dbState.characters = [character]

    const response = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        view: 'main',
      }),
    )

    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: buildCharacterTurnaroundPrompt(sheetPromptInput(character, designTokens)),
      reference_image_urls: [TEMPLATE_URL],
      webhookUrl: WEBHOOK_URL,
    })
    expect(firstFalOpts()).not.toHaveProperty('aspect_ratio')
    expect(firstFalOpts().prompt).not.toContain('STYLE REFERENCE')
  })

  it('D.2 generate-sheet person main falls back to 3:2 T2I when no base URL exists', async () => {
    mocks.webhookBaseUrl = null
    const character = characterFixture({ view_main: null, entity_type: 'person' })
    dbState.characters = [character]

    const response = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        view: 'main',
      }),
    )

    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      model: DEFAULT_IMAGE_MODEL,
      prompt: buildCharacterTurnaroundPrompt(sheetPromptInput(character, designTokens)),
      aspect_ratio: '3:2',
      webhookUrl: WEBHOOK_URL,
    })
    expect(firstFalOpts()).not.toHaveProperty('reference_image_urls')
    expect(firstFalOpts().prompt).not.toContain('STYLE REFERENCE')
  })

  it('D.3 generate-sheet object main uses main portrait opts with 1:1 aspect ratio', async () => {
    const character = characterFixture({
      name: 'Chronometer',
      role: 'mystery prop',
      appearance: 'a brass clockwork compass with a cracked sapphire lens',
      costume: [],
      view_main: null,
      entity_type: 'object',
    })
    dbState.characters = [character]

    const response = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        view: 'main',
      }),
    )

    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      model: DEFAULT_IMAGE_MODEL,
      prompt: buildCharacterMainPrompt(sheetPromptInput(character, designTokens)),
      aspect_ratio: '1:1',
      webhookUrl: WEBHOOK_URL,
    })
    expect(firstFalOpts()).not.toHaveProperty('reference_image_urls')
    expect(firstFalOpts().prompt).not.toContain('STYLE REFERENCE')
  })

  it('D.4 generate-sheet directional view uses the main image as edit reference with no aspect_ratio', async () => {
    const character = characterFixture({ view_main: 'https://img/main.png', entity_type: 'person' })
    dbState.characters = [character]

    const response = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        view: 'back',
      }),
    )

    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: buildCharacterViewPrompt(sheetPromptInput(character, designTokens), 'back'),
      reference_image_urls: ['https://img/main.png'],
      webhookUrl: WEBHOOK_URL,
    })
    expect(firstFalOpts()).not.toHaveProperty('aspect_ratio')
    expect(firstFalOpts().prompt).not.toContain('STYLE REFERENCE')
  })

  it('D.5 generate-sheet safeMode forwards the safe prompt and records safe_mode in inputSnapshot', async () => {
    const character = characterFixture({
      appearance: '12-year-old ranger with bloodstained gloves and a moonlit cloak',
      costume: ['torn navy jacket', 'blood red scarf'],
      view_main: null,
      entity_type: 'person',
    })
    dbState.characters = [character]
    mocks.listFailedCharacterViewJobs.mockResolvedValue([
      { characterId: CHARACTER_ID, view: 'main', moderation: true, safeFailCount: 0 },
    ])

    const response = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        view: 'main',
        safeMode: true,
      }),
    )

    expect(response.status).toBe(200)
    const safeInput = sheetPromptInput(character, designTokens, { safeMode: true })
    expect(firstFalOpts()).toEqual({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: buildCharacterTurnaroundPrompt(safeInput),
      reference_image_urls: [TEMPLATE_URL],
      webhookUrl: WEBHOOK_URL,
    })
    const jobArg = firstGenerationJobArg()
    expect(jobArg.inputSnapshot.safe_mode).toBe(true)
    expect(firstFalOpts().prompt).not.toContain('STYLE REFERENCE')
  })

  it('D.6 generate-world forwards caller prompt/aspect only, with no model or reference urls', async () => {
    dbState.projects = [projectFixture({ design_tokens: null })]

    const response = await generateWorldPOST(
      postRequest('/api/artist/generate-world', {
        projectId: PROJECT_ID,
        locationId: LOCATION_ID,
        column: 'wide_shot',
        prompt: 'WORLD PROMPT',
        aspectRatio: '16:9',
      }),
    )

    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      prompt: 'WORLD PROMPT',
      aspect_ratio: '16:9',
      webhookUrl: WEBHOOK_URL,
    })
    expect(firstFalOpts()).not.toHaveProperty('model')
    expect(firstFalOpts()).not.toHaveProperty('reference_image_urls')
    expect(firstFalOpts().prompt).not.toContain('STYLE REFERENCE')
  })

  it('D.7 generate-storyboard forwards caller prompt/aspect/references with no model key', async () => {
    dbState.projects = [projectFixture({ design_tokens: null })]

    const response = await generateStoryboardPOST(
      postRequest('/api/director/generate-storyboard', {
        projectId: PROJECT_ID,
        writerShotId: WRITER_SHOT_ID,
        prompt: 'SHOT PROMPT',
        referenceImageUrls: ['a', 'b'],
        aspectRatio: '16:9',
      }),
    )

    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      prompt: 'SHOT PROMPT',
      aspect_ratio: '16:9',
      reference_image_urls: ['a', 'b'],
      webhookUrl: WEBHOOK_URL,
    })
    expect(firstFalOpts()).not.toHaveProperty('model')
    expect(firstFalOpts().prompt).not.toContain('STYLE REFERENCE')
  })

  it('D.8 triggerCharacterDrafts submits current template, fallback, and object opts', async () => {
    dbState.projects = [projectFixture({ design_tokens: null })]
    const templatePerson = draftCharacter({
      character_id: 'draft-person-template',
      name: 'Draft Template Person',
      role: 'protagonist',
      appearance: 'silver-haired courier in a blue raincoat',
      entity_type: 'person',
    })
    const fallbackPerson = draftCharacter({
      character_id: 'draft-person-fallback',
      name: 'Draft Fallback Person',
      role: 'rival',
      appearance: 'masked violinist carrying a lantern',
      entity_type: 'person',
    })
    const object = draftCharacter({
      character_id: 'draft-object',
      name: 'Signal Compass',
      role: null,
      appearance: 'a palm-sized compass with a glowing red needle',
      entity_type: 'object',
    })
    dbState.characters = [templatePerson, fallbackPerson, object]
    mocks.resolveWebhookBaseUrl.mockReset()
    mocks.resolveWebhookBaseUrl
      .mockReturnValueOnce(BASE_URL)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(BASE_URL)

    const result = await triggerCharacterDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 3, skipped: 0, failed: 0 })
    expect(mocks.falImageSubmit).toHaveBeenCalledTimes(3)
    expect(falOptsAt(0)).toEqual({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: buildCharacterTurnaroundPrompt(draftPromptInput(templatePerson)),
      reference_image_urls: [TEMPLATE_URL],
      webhookUrl: WEBHOOK_URL,
    })
    expect(falOptsAt(0)).not.toHaveProperty('aspect_ratio')
    expect(falOptsAt(0).prompt).not.toContain('STYLE REFERENCE')
    expect(falOptsAt(1)).toEqual({
      model: DEFAULT_IMAGE_MODEL,
      prompt: buildCharacterTurnaroundPrompt(draftPromptInput(fallbackPerson)),
      aspect_ratio: '3:2',
      webhookUrl: WEBHOOK_URL,
    })
    expect(falOptsAt(1)).not.toHaveProperty('reference_image_urls')
    expect(falOptsAt(1).prompt).not.toContain('STYLE REFERENCE')
    expect(falOptsAt(2)).toEqual({
      model: DEFAULT_IMAGE_MODEL,
      prompt: buildCharacterMainPrompt(draftPromptInput(object)),
      aspect_ratio: '1:1',
      webhookUrl: WEBHOOK_URL,
    })
    expect(falOptsAt(2)).not.toHaveProperty('reference_image_urls')
    expect(falOptsAt(2).prompt).not.toContain('STYLE REFERENCE')
  })

  it('D.9 PREVIZ GUARD keeps rough storyboard source free of style-anchor wiring', () => {
    const src = readFileSync('src/app/api/writer/rough-storyboard/route.ts', 'utf8')

    expect(src).not.toContain('@/lib/style-anchor')
    expect(src).not.toContain('style-anchor')
    expect(src).not.toContain('STYLE REFERENCE')
    // Phase 2: behavioral previz assertion. The route fans through multi-table shot recovery,
    // i18n derivation, optional LLM rewrite, queued/failed job gates, and per-shot filtering;
    // this durable source guard is the Phase 0 no-op lock without that disproportionate mock graph.
  })

  it('D.10 fal submit layer stays free of style-anchor global injection', () => {
    // Guards the ADR-rejected alternative (global injection inside falImageSubmit),
    // which the fully-mocked fal module in the cases above cannot see. Phase 1.1 only
    // adds `export` to isImageEditModel/DEFAULT_EDIT_IMAGE_MODEL — this stays green.
    const src = readFileSync('src/lib/writer/llm/fal.ts', 'utf8')
    expect(src).not.toContain('@/lib/style-anchor')
    expect(src).not.toContain('STYLE REFERENCE')
  })
})

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function projectFixture(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    design_tokens: designTokens,
    ...overrides,
  }
}

function characterFixture(overrides: Partial<CharacterRow> = {}): CharacterRow {
  return {
    project_id: PROJECT_ID,
    character_id: CHARACTER_ID,
    name: 'Ari Vale',
    role: 'skyship scout',
    appearance: 'a focused explorer with copper goggles and wind-tossed black hair',
    costume: ['navy flight coat', 'brass utility boots'],
    view_main: null,
    entity_type: 'person',
    ...overrides,
  }
}

function draftCharacter(overrides: Partial<CharacterRow>): CharacterRow {
  return characterFixture({
    character_id: 'draft-character',
    name: 'Draft Character',
    role: 'supporting character',
    appearance: 'a draft character silhouette',
    costume: null,
    view_main: null,
    entity_type: 'person',
    ...overrides,
  })
}

function sheetPromptInput(
  character: CharacterRow,
  dt: DesignTokens,
  opts: { instruction?: string; safeMode?: boolean } = {},
): CharacterPromptInput {
  const palette = [dt.palette?.primary, dt.palette?.secondary, dt.palette?.accent].filter(
    (x): x is string => !!x,
  )
  return {
    name: character.name,
    appearance: character.appearance ?? character.name,
    role: character.role ?? undefined,
    costumes: (character.costume ?? undefined) as string[] | undefined,
    artStyle: dt.l1?.art_style,
    shapeLanguage: dt.l1?.shape_language,
    lineQuality: dt.l1?.line_quality,
    texturePhilosophy: dt.l1?.texture_philosophy,
    characterProportion: dt.l1?.character_proportion,
    palette,
    delta: typeof opts.instruction === 'string' ? opts.instruction : undefined,
    safeMode: opts.safeMode ?? false,
  }
}

function draftPromptInput(character: CharacterRow): CharacterPromptInput {
  return {
    name: character.name,
    appearance: character.appearance ?? character.name,
    role: character.role ?? undefined,
  }
}

function firstFalOpts(): FalImageOpts {
  return falOptsAt(0)
}

function falOptsAt(index: number): FalImageOpts {
  return mocks.falImageSubmit.mock.calls[index][0] as FalImageOpts
}

function firstGenerationJobArg(): { inputSnapshot: Record<string, unknown> } {
  return mocks.createGenerationJob.mock.calls[0][0] as { inputSnapshot: Record<string, unknown> }
}

function queryFor(table: string) {
  const filters: Array<[string, unknown]> = []
  let limitValue: number | null = null
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value])
      return query
    }),
    order: vi.fn(() => query),
    limit: vi.fn((value: number) => {
      limitValue = value
      return query
    }),
    single: vi.fn(async () => ({ data: resolveRows(table, filters, limitValue, 'single'), error: null })),
    maybeSingle: vi.fn(async () => ({ data: resolveRows(table, filters, limitValue, 'single'), error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: resolveRows(table, filters, limitValue, 'many'), error: null }).then(resolve, reject),
  }
  return query
}

function resolveRows(
  table: string,
  filters: Array<[string, unknown]>,
  limitValue: number | null,
  mode: 'single' | 'many',
): unknown {
  const rows = rowsForTable(table).filter((row) => matchesFilters(row, filters))
  const limited = limitValue == null ? rows : rows.slice(0, limitValue)
  return mode === 'single' ? limited[0] ?? null : limited
}

function rowsForTable(table: string): Array<Record<string, unknown>> {
  if (table === 'projects') return dbState.projects as unknown as Array<Record<string, unknown>>
  if (table === 'characters') return dbState.characters as unknown as Array<Record<string, unknown>>
  if (table === 'character_image_candidates') return dbState.candidates as unknown as Array<Record<string, unknown>>
  return []
}

function matchesFilters(row: Record<string, unknown>, filters: Array<[string, unknown]>): boolean {
  return filters.every(([column, value]) => row[column] === value)
}
