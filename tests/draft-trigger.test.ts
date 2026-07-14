import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createGenerationJob: vi.fn<(...a: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'job-1' })),
  hasQueuedCharacterViewJob: vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => false),
  hasQueuedWorldShotJob: vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => false),
  countFailedJobsForTarget: vi.fn<(...a: unknown[]) => Promise<number>>(async () => 0),
  falImageSubmit: vi.fn<(...a: unknown[]) => Promise<{ request_id: string; model: string }>>(async () => ({ request_id: 'req-1', model: 'openai/gpt-image-2' })),
  getUser: vi.fn(),
  checkUserQuota: vi.fn(),
  quotaExceededBody: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-quota', () => ({
  checkUserQuota: mocks.checkUserQuota,
  quotaExceededBody: mocks.quotaExceededBody,
}))
vi.mock('@/lib/writer/llm/fal', () => ({
  falImageSubmit: (...a: unknown[]) => mocks.falImageSubmit(...a),
  DEFAULT_EDIT_IMAGE_MODEL: 'openai/gpt-image-2/edit',
  isImageEditModel: (model: string) => /\/edit$/.test(model),
}))
vi.mock('@/lib/generation-jobs', () => ({
  createGenerationJob: (...a: unknown[]) => mocks.createGenerationJob(...a),
  hasQueuedCharacterViewJob: (...a: unknown[]) => mocks.hasQueuedCharacterViewJob(...a),
  hasQueuedWorldShotJob: (...a: unknown[]) => mocks.hasQueuedWorldShotJob(...a),
  countFailedJobsForTarget: (...a: unknown[]) => mocks.countFailedJobsForTarget(...a),
  AUTO_GENERATION_GIVE_UP_THRESHOLD: 2,
}))
vi.mock('@/lib/fal/webhook-url', () => ({
  resolveWebhookUrl: () => undefined,
  resolveWebhookBaseUrl: () => undefined,
}))

import { POST as generateWorldPOST } from '@/app/api/artist/generate-world/route'
import {
  triggerAssetDrafts,
  triggerCharacterDrafts,
  triggerWorldDrafts,
} from '@/lib/artist/draft-trigger'
import {
  computeImageSourceHash,
  computeLookFingerprint,
  computeWorldImageSourceHash,
} from '@/lib/image-provenance'
import {
  buildWorldShotPromptForLocation,
  mapLocationRowToManifestLocation,
} from '@/lib/artist/world-prompt'

const PROJECT_ID = 'proj-1'
const WORKSPACE_ID = 'ws-1'
const DESIGN_TOKENS = {
  l1: { art_style: 'ink storybook', shape_language: 'clear silhouettes' },
  palette: { primary: 'cobalt', secondary: 'ochre', accent: 'red' },
}

interface ProjectRow {
  id: string
  workspace_id: string
  design_tokens: typeof DESIGN_TOKENS | null
  style_anchor_key?: string | null
}

interface CharacterRow {
  project_id: string
  character_id: string
  name: string
  role: string | null
  appearance: string | null
  costume: string[] | string | null
  view_main: string | null
  entity_type: string | null
  origin: 'producer' | 'writer'
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

interface CandidateRow {
  project_id: string
  character_id: string
  view: string
  id: string
}

const dbState: {
  projects: ProjectRow[]
  characters: CharacterRow[]
  locations: LocationRow[]
  candidates: CandidateRow[]
} = {
  projects: [],
  characters: [],
  locations: [],
  candidates: [],
}

beforeEach(() => {
  dbState.projects = [projectFixture({ design_tokens: DESIGN_TOKENS })]
  dbState.characters = [characterFixture()]
  dbState.locations = []
  dbState.candidates = []

  mocks.createGenerationJob.mockReset()
  mocks.createGenerationJob.mockResolvedValue({ id: 'job-1' })
  mocks.hasQueuedCharacterViewJob.mockReset()
  mocks.hasQueuedCharacterViewJob.mockResolvedValue(false)
  mocks.hasQueuedWorldShotJob.mockReset()
  mocks.hasQueuedWorldShotJob.mockResolvedValue(false)
  mocks.countFailedJobsForTarget.mockReset()
  mocks.countFailedJobsForTarget.mockResolvedValue(0)
  mocks.falImageSubmit.mockReset()
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'req-1', model: 'openai/gpt-image-2' })
  mocks.getUser.mockReset()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.checkUserQuota.mockReset()
  mocks.checkUserQuota.mockResolvedValue({ ok: true, queued: 0, limit: 8 })
  mocks.quotaExceededBody.mockReset()
  mocks.quotaExceededBody.mockImplementation((input: unknown) => input)
  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => queryFor(table))
})

describe('draft trigger relocation guards', () => {
  it('design_tokens null skips all submits and never records look_present=false', async () => {
    dbState.projects = [projectFixture({ design_tokens: null })]
    dbState.characters = [characterFixture()]
    dbState.locations = [locationFixture()]

    const result = await triggerAssetDrafts(PROJECT_ID)

    expect(result).toEqual({
      skipped_no_look: true,
      characters: { submitted: 0, skipped: 0, failed: 0 },
      worlds: { submitted: 0, skipped: 0, failed: 0 },
    })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    expect(mocks.createGenerationJob).not.toHaveBeenCalled()
    expect(
      mocks.createGenerationJob.mock.calls.some(
        ([arg]) => (arg as { inputSnapshot?: { look_present?: boolean } }).inputSnapshot?.look_present === false,
      ),
    ).toBe(false)
  })

  it('design_tokens query error also skips (fail-safe, never look_present=false)', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: 'db unavailable' } }),
            }),
          }),
        }
      }
      return queryFor(table)
    })

    const result = await triggerAssetDrafts(PROJECT_ID)

    expect(result.skipped_no_look).toBe(true)
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    expect(mocks.createGenerationJob).not.toHaveBeenCalled()
  })

  it('look-present asset trigger creates a look-bearing character job with workspace target', async () => {
    const character = characterFixture({
      appearance: 'silver-haired courier',
      costume: ['blue raincoat'],
    })
    dbState.characters = [character]

    const result = await triggerAssetDrafts(PROJECT_ID)

    expect(result.characters).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(mocks.createGenerationJob).toHaveBeenCalledTimes(1)
    const arg = mocks.createGenerationJob.mock.calls[0][0] as {
      kind: string
      inputSnapshot: Record<string, unknown>
      target: { workspaceId?: string; characterId?: string; view?: string; column?: string }
    }
    const lookFingerprint = computeLookFingerprint(DESIGN_TOKENS, character.costume, null)
    expect(arg.kind).toBe('character_view')
    expect(arg.target).toMatchObject({ workspaceId: WORKSPACE_ID, characterId: character.character_id, view: 'main' })
    expect(arg.inputSnapshot.look_present).toBe(true)
    expect(arg.inputSnapshot.source_hash).toBe(computeImageSourceHash(character.appearance, lookFingerprint))
    expect(arg.inputSnapshot.source_hash).not.toBe(computeImageSourceHash(character.appearance, null))
  })

  it('filters writer-origin opencast characters out of server drafts', async () => {
    dbState.characters = [
      characterFixture({ character_id: 'char_producer', origin: 'producer' }),
      characterFixture({ character_id: 'char_writer', origin: 'writer' }),
    ]

    const result = await triggerCharacterDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(mocks.createGenerationJob).toHaveBeenCalledTimes(1)
    expect((mocks.createGenerationJob.mock.calls[0][0] as { target: { characterId: string } }).target.characterId).toBe('char_producer')
  })

  it('triggerWorldDrafts uses prompt-only source_hash parity with generate-world and preserves target shape', async () => {
    const location = locationFixture()
    dbState.locations = [location]
    const builtPrompt = buildWorldShotPromptForLocation(
      mapLocationRowToManifestLocation(location),
      null,
      null,
      'wideShot',
    )

    const worldResult = await triggerWorldDrafts(PROJECT_ID)
    const triggerArg = mocks.createGenerationJob.mock.calls[0][0] as {
      kind: string
      actor: string
      inputSnapshot: Record<string, unknown>
      target: { workspaceId?: string; locationId?: string; column?: string }
    }

    mocks.createGenerationJob.mockClear()
    mocks.falImageSubmit.mockClear()
    const routeResponse = await generateWorldPOST(
      new Request('http://localhost/api/artist/generate-world', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          locationId: location.location_id,
          column: 'wide_shot',
          prompt: builtPrompt,
          aspectRatio: '16:9',
          sourceHash: computeWorldImageSourceHash(builtPrompt),
        }),
      }),
    )
    const routeArg = mocks.createGenerationJob.mock.calls[0][0] as {
      inputSnapshot: Record<string, unknown>
      target: { workspaceId?: string; locationId?: string; column?: string }
    }

    expect(worldResult).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(routeResponse.status).toBe(200)
    expect(triggerArg.kind).toBe('world_shot')
    expect(triggerArg.actor).toBe('writer')
    expect(triggerArg.inputSnapshot.source_hash).toBe(computeWorldImageSourceHash(builtPrompt))
    expect(triggerArg.inputSnapshot.source_hash).toBe(routeArg.inputSnapshot.source_hash)
    expect(triggerArg.inputSnapshot).toEqual(routeArg.inputSnapshot)
    expect(triggerArg.target).toEqual({ workspaceId: WORKSPACE_ID, locationId: location.location_id, column: 'wide_shot' })
    expect(routeArg.target).toEqual(triggerArg.target)
  })

  it('triggerWorldDrafts skips when a queued world_shot already exists', async () => {
    dbState.locations = [locationFixture()]
    mocks.hasQueuedWorldShotJob.mockResolvedValue(true)

    const result = await triggerWorldDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 0, skipped: 1, failed: 0 })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    expect(mocks.createGenerationJob).not.toHaveBeenCalled()
  })

  it('absorbs per-entity submit failures into counts', async () => {
    dbState.locations = [locationFixture()]
    mocks.falImageSubmit.mockRejectedValueOnce(new Error('fal unavailable'))

    await expect(triggerWorldDrafts(PROJECT_ID)).resolves.toEqual({ submitted: 0, skipped: 0, failed: 1 })
    expect(mocks.createGenerationJob).not.toHaveBeenCalled()
  })
})

function projectFixture(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    design_tokens: DESIGN_TOKENS,
    style_anchor_key: null,
    ...overrides,
  }
}

function characterFixture(overrides: Partial<CharacterRow> = {}): CharacterRow {
  return {
    project_id: PROJECT_ID,
    character_id: 'char_hero',
    name: '카이',
    role: 'protagonist',
    appearance: '은발 검사',
    costume: null,
    view_main: null,
    entity_type: 'person',
    origin: 'producer',
    ...overrides,
  }
}

function locationFixture(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    project_id: PROJECT_ID,
    location_id: 'loc_harbor',
    name: 'Moon Harbor',
    visual_description: 'misty harbor with black water and brass signal towers',
    style_description: 'painted gothic harbor',
    lighting_direction: 'moonlit backlight',
    lighting_sources: ['moon', 'red signal lamps'],
    time_of_day: 'night',
    purpose: 'final departure',
    props: ['signal tower', 'dock ropes'],
    wide_shot: null,
    ...overrides,
  }
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
  return mode === 'single' ? limited[0] ?? null : limited
}

function rowsForTable(table: string): Array<Record<string, unknown>> {
  if (table === 'projects') return dbState.projects as unknown as Array<Record<string, unknown>>
  if (table === 'characters') return dbState.characters as unknown as Array<Record<string, unknown>>
  if (table === 'locations') return dbState.locations as unknown as Array<Record<string, unknown>>
  if (table === 'character_image_candidates') return dbState.candidates as unknown as Array<Record<string, unknown>>
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
