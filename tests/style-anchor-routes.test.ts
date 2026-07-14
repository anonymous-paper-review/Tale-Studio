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
  DEFAULT_IMAGE_MODEL: 'openai/gpt-image-2',
  DEFAULT_EDIT_IMAGE_MODEL: 'openai/gpt-image-2/edit',
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
vi.mock('@/lib/writer/llm/fal', () => ({
  falImageSubmit: mocks.falImageSubmit,
  DEFAULT_EDIT_IMAGE_MODEL: mocks.DEFAULT_EDIT_IMAGE_MODEL,
  isImageEditModel: (model: string) => /\/edit$/.test(model) || /redux/.test(model) || /ip-adapter/.test(model),
}))
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
import {
  STYLE_ANCHOR_CLAUSE,
  STYLE_ANCHOR_MULTIREF_CLAUSE,
  STYLE_ANCHOR_TEMPLATE_CLAUSE,
  _clearStyleAnchorCacheForTest,
} from '@/lib/style-anchor'
import { computeImageSourceHash, computeLookFingerprint } from '@/lib/image-provenance'

const USER = { id: 'user-1' }
const PROJECT_ID = 'project-1'
const WORKSPACE_ID = 'workspace-1'
const CHARACTER_ID = 'character-1'
const LOCATION_ID = 'location-1'
const WRITER_SHOT_ID = 'writer-shot-1'
const WEBHOOK_URL = 'https://hook.test/webhook'
const BASE_URL = 'https://base.test'
const TEMPLATE_URL = `${BASE_URL}/character-template.png`
const ANCHOR_KEY = 'real'
const ANCHOR_URL = 'https://anchor/real.png'
const DEFAULT_IMAGE_MODEL = mocks.DEFAULT_IMAGE_MODEL
const DEFAULT_EDIT_IMAGE_MODEL = mocks.DEFAULT_EDIT_IMAGE_MODEL

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
  entity_type: 'person' | 'object' | null
}

interface StyleAnchorRow {
  key: string
  image_url: string
  is_active: boolean | null
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
  styleAnchors: StyleAnchorRow[]
} = {
  projects: [],
  characters: [],
  styleAnchors: [],
}

beforeEach(() => {
  _clearStyleAnchorCacheForTest()
  dbState.projects = [projectFixture({ design_tokens: designTokens, style_anchor_key: ANCHOR_KEY })]
  dbState.characters = []
  dbState.styleAnchors = [styleAnchorFixture()]

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

describe('style-anchor route integration', () => {
  it('AC1 generate-sheet person/template injects anchor before the layout template', async () => {
    const character = characterFixture({ view_main: null, entity_type: 'person' })
    dbState.characters = [character]

    const response = await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        view: 'main',
      }),
    )

    const expectedPrompt = `${STYLE_ANCHOR_CLAUSE}\n${STYLE_ANCHOR_TEMPLATE_CLAUSE}\n${buildCharacterTurnaroundPrompt(sheetPromptInput(character, designTokens))}`
    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: expectedPrompt,
      reference_image_urls: [ANCHOR_URL, TEMPLATE_URL],
      webhookUrl: WEBHOOK_URL,
      aspect_ratio: '16:9',
    })
    expect(firstGenerationJobArg().inputSnapshot).toMatchObject({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: expectedPrompt,
      reference_image_urls: [ANCHOR_URL, TEMPLATE_URL],
      aspect_ratio: '16:9',
      style_anchor_key: ANCHOR_KEY,
    })
  })

  // Q3b/exp4 판정 잠금 (2026-07-14, docs/style-anchor-art-style-authority.md §9):
  //   - texture/line/shape/palette 토큰은 앵커와 공존해도 앵커가 매체를 이긴다(실측) → 그대로 나간다.
  //   - art_style 토큰은 값에 매체어가 실리면(dark_cinematic_realism) 앵커를 이겨버린다(실측, d6208bba
  //     거인 실사화) → 앵커 존재 시 무조건 억제. 이 특성을 고정한다 — 되돌리려면 실 A/B 재판정 선행.
  it('AC1b generate-sheet with anchor suppresses the art_style token but keeps texture/line/palette (judged behavior)', async () => {
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
    const prompt = firstFalOpts().prompt
    expect(prompt).toContain(STYLE_ANCHOR_CLAUSE)
    // art_style 토큰만 억제 — 매체어 값이 앵커를 override 하는 실측 사고 차단.
    expect(prompt).not.toContain('art style:')
    // 나머지 재료/색 토큰은 앵커와 함께 그대로 나간다 (실측 무해 = 판정된 현행).
    expect(prompt).toContain('line quality: crisp confident contour lines')
    expect(prompt).toContain('texture: matte paper grain')
    expect(prompt).toContain('palette: deep cobalt, warm ochre, signal red')
  })

  it('AC10 Q5 generate-sheet folds the anchor key into source_hash (false-stale guard)', async () => {
    const character = characterFixture({ view_main: null, entity_type: 'person' })
    dbState.characters = [character]
    await generateSheetPOST(
      postRequest('/api/artist/generate-sheet', {
        projectId: PROJECT_ID,
        characterId: CHARACTER_ID,
        view: 'main',
      }),
    )
    const snapshot = firstGenerationJobArg().inputSnapshot
    expect(snapshot.source_hash).toBe(
      computeImageSourceHash(
        character.appearance,
        computeLookFingerprint(designTokens, character.costume, ANCHOR_KEY),
      ),
    )
    // 앵커 키가 실제로 지문에 스레딩됨을 증명 — 제거하면 null-anchor 해시와 같아져 실패한다.
    expect(snapshot.source_hash).not.toBe(
      computeImageSourceHash(
        character.appearance,
        computeLookFingerprint(designTokens, character.costume, null),
      ),
    )
  })

  it('AC2 generate-sheet person/T2I fallback injects anchor and normalizes to the edit model', async () => {
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
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: `${STYLE_ANCHOR_CLAUSE}\n${buildCharacterTurnaroundPrompt(sheetPromptInput(character, designTokens))}`,
      aspect_ratio: '3:2',
      reference_image_urls: [ANCHOR_URL],
      webhookUrl: WEBHOOK_URL,
    })
  })

  it('AC3 generate-sheet object main injects anchor and preserves the square aspect ratio', async () => {
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
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: `${STYLE_ANCHOR_CLAUSE}\n${buildCharacterMainPrompt(sheetPromptInput(character, designTokens))}`,
      aspect_ratio: '1:1',
      reference_image_urls: [ANCHOR_URL],
      webhookUrl: WEBHOOK_URL,
    })
  })

  it('AC4 generate-sheet directional views stay anchor-free even when the project has an anchor key', async () => {
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
    expect(firstFalOpts().reference_image_urls).not.toContain(ANCHOR_URL)
    expect(firstFalOpts().prompt).not.toContain(STYLE_ANCHOR_CLAUSE)
  })

  it('AC5 generate-world injects anchor fields and records the post-injection snapshot', async () => {
    dbState.projects = [projectFixture({ design_tokens: null, style_anchor_key: ANCHOR_KEY })]

    const response = await generateWorldPOST(
      postRequest('/api/artist/generate-world', {
        projectId: PROJECT_ID,
        locationId: LOCATION_ID,
        column: 'wide_shot',
        prompt: 'WORLD PROMPT',
        aspectRatio: '16:9',
      }),
    )

    const expectedPrompt = `${STYLE_ANCHOR_CLAUSE}\nWORLD PROMPT`
    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      prompt: expectedPrompt,
      aspect_ratio: '16:9',
      reference_image_urls: [ANCHOR_URL],
      model: DEFAULT_EDIT_IMAGE_MODEL,
      webhookUrl: WEBHOOK_URL,
    })
    expect(firstGenerationJobArg().inputSnapshot).toEqual({
      prompt: expectedPrompt,
      aspect_ratio: '16:9',
      reference_image_urls: [ANCHOR_URL],
      model: DEFAULT_EDIT_IMAGE_MODEL,
      source_hash: null,
      style_anchor_key: ANCHOR_KEY,
    })
  })

  it('AC6 generate-storyboard with caller refs uses multiref mode and records the post-injection snapshot', async () => {
    dbState.projects = [projectFixture({ design_tokens: null, style_anchor_key: ANCHOR_KEY })]

    const response = await generateStoryboardPOST(
      postRequest('/api/director/generate-storyboard', {
        projectId: PROJECT_ID,
        writerShotId: WRITER_SHOT_ID,
        prompt: 'SHOT PROMPT',
        referenceImageUrls: ['a', 'b'],
        aspectRatio: '16:9',
      }),
    )

    const expectedPrompt = `${STYLE_ANCHOR_CLAUSE}\n${STYLE_ANCHOR_MULTIREF_CLAUSE}\nSHOT PROMPT`
    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      prompt: expectedPrompt,
      aspect_ratio: '16:9',
      reference_image_urls: [ANCHOR_URL, 'a', 'b'],
      model: DEFAULT_EDIT_IMAGE_MODEL,
      webhookUrl: WEBHOOK_URL,
    })
    expect(firstGenerationJobArg().inputSnapshot).toEqual({
      prompt: expectedPrompt,
      aspect_ratio: '16:9',
      reference_image_urls: [ANCHOR_URL, 'a', 'b'],
      model: DEFAULT_EDIT_IMAGE_MODEL,
      style_anchor_key: ANCHOR_KEY,
    })
  })

  it('AC6 generate-storyboard without caller refs uses single mode', async () => {
    dbState.projects = [projectFixture({ design_tokens: null, style_anchor_key: ANCHOR_KEY })]

    const response = await generateStoryboardPOST(
      postRequest('/api/director/generate-storyboard', {
        projectId: PROJECT_ID,
        writerShotId: WRITER_SHOT_ID,
        prompt: 'SHOT PROMPT',
        aspectRatio: '16:9',
      }),
    )

    expect(response.status).toBe(200)
    expect(firstFalOpts()).toEqual({
      prompt: `${STYLE_ANCHOR_CLAUSE}\nSHOT PROMPT`,
      aspect_ratio: '16:9',
      reference_image_urls: [ANCHOR_URL],
      model: DEFAULT_EDIT_IMAGE_MODEL,
      webhookUrl: WEBHOOK_URL,
    })
  })

  it('AC7 triggerCharacterDrafts injects anchor for character main template, fallback, and object drafts', async () => {
    dbState.projects = [projectFixture({ design_tokens: null, style_anchor_key: ANCHOR_KEY })]
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

    const expectedTemplatePrompt = `${STYLE_ANCHOR_CLAUSE}\n${STYLE_ANCHOR_TEMPLATE_CLAUSE}\n${buildCharacterTurnaroundPrompt(draftPromptInput(templatePerson))}`
    const expectedFallbackPrompt = `${STYLE_ANCHOR_CLAUSE}\n${buildCharacterTurnaroundPrompt(draftPromptInput(fallbackPerson))}`
    const expectedObjectPrompt = `${STYLE_ANCHOR_CLAUSE}\n${buildCharacterMainPrompt(draftPromptInput(object))}`
    expect(result).toEqual({ submitted: 3, skipped: 0, failed: 0 })
    expect(mocks.falImageSubmit).toHaveBeenCalledTimes(3)
    expect(mocks.createGenerationJob).toHaveBeenCalledTimes(3)
    expect(falOptsAt(0)).toEqual({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: expectedTemplatePrompt,
      reference_image_urls: [ANCHOR_URL, TEMPLATE_URL],
      aspect_ratio: '16:9',
      webhookUrl: WEBHOOK_URL,
    })
    expect(generationJobArgAt(0).inputSnapshot).toMatchObject({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: expectedTemplatePrompt,
      reference_image_urls: [ANCHOR_URL, TEMPLATE_URL],
      aspect_ratio: '16:9',
      style_anchor_key: ANCHOR_KEY,
    })
    expect(generationJobArgAt(0).inputSnapshot.source_hash).toBe(
      computeImageSourceHash(
        templatePerson.appearance,
        computeLookFingerprint(null, templatePerson.costume, ANCHOR_KEY),
      ),
    )
    expect(generationJobArgAt(0).inputSnapshot.source_hash).not.toBe(
      computeImageSourceHash(
        templatePerson.appearance,
        computeLookFingerprint(null, templatePerson.costume, null),
      ),
    )
    expect(falOptsAt(1)).toEqual({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: expectedFallbackPrompt,
      reference_image_urls: [ANCHOR_URL],
      aspect_ratio: '3:2',
      webhookUrl: WEBHOOK_URL,
    })
    expect(generationJobArgAt(1).inputSnapshot).toMatchObject({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: expectedFallbackPrompt,
      reference_image_urls: [ANCHOR_URL],
      aspect_ratio: '3:2',
      style_anchor_key: ANCHOR_KEY,
    })
    expect(falOptsAt(2)).toEqual({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: expectedObjectPrompt,
      reference_image_urls: [ANCHOR_URL],
      aspect_ratio: '1:1',
      webhookUrl: WEBHOOK_URL,
    })
    expect(generationJobArgAt(2).inputSnapshot).toMatchObject({
      model: DEFAULT_EDIT_IMAGE_MODEL,
      prompt: expectedObjectPrompt,
      reference_image_urls: [ANCHOR_URL],
      aspect_ratio: '1:1',
      style_anchor_key: ANCHOR_KEY,
    })
  })

  it('AC7 triggerCharacterDrafts treats an inactive anchor as a fail-soft no-op for draft opts', async () => {
    dbState.projects = [projectFixture({ design_tokens: null, style_anchor_key: ANCHOR_KEY })]
    dbState.styleAnchors = [styleAnchorFixture({ is_active: false })]
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
    expect(falOptsAt(0).prompt).not.toContain(STYLE_ANCHOR_CLAUSE)
    expect(falOptsAt(1)).toEqual({
      model: DEFAULT_IMAGE_MODEL,
      prompt: buildCharacterTurnaroundPrompt(draftPromptInput(fallbackPerson)),
      aspect_ratio: '3:2',
      webhookUrl: WEBHOOK_URL,
    })
    expect(falOptsAt(1)).not.toHaveProperty('reference_image_urls')
    expect(falOptsAt(1).prompt).not.toContain(STYLE_ANCHOR_CLAUSE)
    expect(falOptsAt(2)).toEqual({
      model: DEFAULT_IMAGE_MODEL,
      prompt: buildCharacterMainPrompt(draftPromptInput(object)),
      aspect_ratio: '1:1',
      webhookUrl: WEBHOOK_URL,
    })
    expect(falOptsAt(2)).not.toHaveProperty('reference_image_urls')
    expect(falOptsAt(2).prompt).not.toContain(STYLE_ANCHOR_CLAUSE)
    expect(generationJobArgAt(0).inputSnapshot.style_anchor_key).toBeNull()
    expect(generationJobArgAt(1).inputSnapshot.style_anchor_key).toBeNull()
    expect(generationJobArgAt(2).inputSnapshot.style_anchor_key).toBeNull()
  })

  it('AC9 treats an inactive anchor row as a fail-soft no-op for fal submit opts', async () => {
    dbState.projects = [projectFixture({ design_tokens: null, style_anchor_key: ANCHOR_KEY })]
    dbState.styleAnchors = [styleAnchorFixture({ is_active: false })]

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
    expect(firstFalOpts().prompt).not.toContain(STYLE_ANCHOR_CLAUSE)
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
    style_anchor_key: ANCHOR_KEY,
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


function styleAnchorFixture(overrides: Partial<StyleAnchorRow> = {}): StyleAnchorRow {
  return {
    key: ANCHOR_KEY,
    image_url: ANCHOR_URL,
    is_active: true,
    ...overrides,
  }
}

function sheetPromptInput(character: CharacterRow, dt: DesignTokens): CharacterPromptInput {
  const palette = [dt.palette?.primary, dt.palette?.secondary, dt.palette?.accent].filter(
    (x): x is string => !!x,
  )
  return {
    name: character.name,
    appearance: character.appearance ?? character.name,
    role: character.role ?? undefined,
    costumes: (character.costume ?? undefined) as string[] | undefined,
    // 앵커 존재 시 route 가 artStyle 토큰을 억제한다 (2026-07-14 exp4 실측 — authority doc §9-2).
    //   이 파일의 sheet 테스트는 전부 활성 앵커 fixture 를 쓰므로 undefined 미러.
    artStyle: undefined,
    shapeLanguage: dt.l1?.shape_language,
    lineQuality: dt.l1?.line_quality,
    texturePhilosophy: dt.l1?.texture_philosophy,
    characterProportion: dt.l1?.character_proportion,
    palette,
    safeMode: false,
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
  return mocks.falImageSubmit.mock.calls[0][0] as FalImageOpts
}
function falOptsAt(index: number): FalImageOpts {
  return mocks.falImageSubmit.mock.calls[index][0] as FalImageOpts
}


function firstGenerationJobArg(): { inputSnapshot: Record<string, unknown> } {
  return mocks.createGenerationJob.mock.calls[0][0] as { inputSnapshot: Record<string, unknown> }
}
function generationJobArgAt(index: number): { inputSnapshot: Record<string, unknown> } {
  return mocks.createGenerationJob.mock.calls[index][0] as { inputSnapshot: Record<string, unknown> }
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
  if (table === 'style_anchors') return dbState.styleAnchors as unknown as Array<Record<string, unknown>>
  return []
}

function matchesFilters(row: Record<string, unknown>, filters: Array<[string, unknown]>): boolean {
  return filters.every(([column, value]) => row[column] === value)
}
