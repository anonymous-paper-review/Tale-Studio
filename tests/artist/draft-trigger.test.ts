// 그림체가 준비된 경우에만 캐릭터와 장소 그림 초안을 만들고, 한도와 중복 요청을 안전하게 막는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  // #generation-capacity-trigger(2026-09-14): 이미지 경로는 자리 예약 → 제출 → 접수 번호 채움 순서다.
  //   목 대상만 그 순서의 함수로 옮겼고, 각 케이스가 검사하는 동작은 그대로다.
  reserveGenerationJob: vi.fn<(...a: unknown[]) => Promise<{ id: string; fal_key_id: string }>>(async () => ({ id: 'job-1', fal_key_id: 'prod-2000' })),
  confirmGenerationJobReceipt: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
  rejectGenerationJobReservation: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
  hasQueuedCharacterViewJob: vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => false),
  hasQueuedWorldShotJob: vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => false),
  countFailedJobsForTarget: vi.fn<(...a: unknown[]) => Promise<number>>(async () => 0),
  falImageSubmit: vi.fn<(...a: unknown[]) => Promise<{ request_id: string; model: string; fal_key_id: string }>>(async () => ({ request_id: 'req-1', model: 'openai/gpt-image-2', fal_key_id: 'prod-2000' })),
  getUser: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  quotaExceededBody: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
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
vi.mock('@/lib/writer/llm/fal', () => ({
  falImageSubmit: (...a: unknown[]) => mocks.falImageSubmit(...a),
  DEFAULT_EDIT_IMAGE_MODEL: 'openai/gpt-image-2/edit',
  isImageEditModel: (model: string) => /\/edit$/.test(model),
}))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: (...a: unknown[]) => mocks.reserveGenerationJob(...a),
  confirmGenerationJobReceipt: (...a: unknown[]) => mocks.confirmGenerationJobReceipt(...a),
  rejectGenerationJobReservation: (...a: unknown[]) => mocks.rejectGenerationJobReservation(...a),
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
  computeWorldDescriptionHash,
  computeWorldImageSourceHash,
} from '@/lib/image-provenance'
import {
  buildWorldShotPromptForLocation,
  mapLocationRowToManifestLocation,
} from '@/lib/artist/world-prompt'

const PROJECT_ID = 'proj-1'
const WORKSPACE_ID = 'ws-1'
const OWNER_ID = 'owner-1'
const DESIGN_TOKENS = {
  l1: { art_style: 'ink storybook', shape_language: 'clear silhouettes' },
  palette: { primary: 'cobalt', secondary: 'ochre', accent: 'red' },
}

interface ProjectRow {
  id: string
  workspace_id: string
  design_tokens: typeof DESIGN_TOKENS | null
  style_anchor_key?: string | null
  custom_style_anchor?: Record<string, unknown> | null
}

interface WorkspaceRow {
  id: string
  owner_id: string
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
  appearance_key: string
  view: string
  id: string
}

interface AppearanceRow {
  project_id: string
  character_id: string
  appearance_key: 'current'
  is_default: true
  appearance: string | null
  costume: string[] | string | null
  sheet_url: string | null
  portrait_url: string | null
}

const dbState: {
  projects: ProjectRow[]
  workspaces: WorkspaceRow[]
  characters: CharacterRow[]
  appearances: AppearanceRow[]
  locations: LocationRow[]
  candidates: CandidateRow[]
} = {
  projects: [],
  workspaces: [],
  characters: [],
  appearances: [],
  locations: [],
  candidates: [],
}

beforeEach(() => {
  dbState.projects = [projectFixture({ design_tokens: DESIGN_TOKENS })]
  dbState.workspaces = [{ id: WORKSPACE_ID, owner_id: OWNER_ID }]
  dbState.characters = [characterFixture()]
  dbState.appearances = [appearanceFixture()]
  dbState.locations = []
  dbState.candidates = []

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
  mocks.falImageSubmit.mockReset()
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'req-1', model: 'openai/gpt-image-2', fal_key_id: 'prod-2000' })
  mocks.getUser.mockReset()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.checkGenerationCapacity.mockReset()
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 8 })
  mocks.quotaExceededBody.mockReset()
  mocks.quotaExceededBody.mockImplementation((input: unknown) => input)
  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => queryFor(table))
})

describe('그림 초안 생성 — 그림체가 없거나 설정을 읽지 못하면 안전하게 멈춘다', () => {
  it('그림체 설정이 없으면 그림 초안을 보내지 않고 없다고 잘못 기록하지 않는다', async () => {
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
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(
      mocks.reserveGenerationJob.mock.calls.some(
        ([arg]) => (arg as { inputSnapshot?: { look_present?: boolean } }).inputSnapshot?.look_present === false,
      ),
    ).toBe(false)
  })

  it('그림체 설정을 읽지 못해도 초안 생성을 멈추고 없다고 잘못 기록하지 않는다', async () => {
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
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
  })

  it('그림체가 있으면 캐릭터 그림 초안을 만들고 작업 공간 정보를 함께 기록한다', async () => {
    const character = characterFixture({
      appearance: 'silver-haired courier',
      costume: ['blue raincoat'],
    })
    dbState.characters = [character]
    dbState.appearances = [appearanceFixture({ appearance: character.appearance, costume: character.costume })]

    const result = await triggerAssetDrafts(PROJECT_ID)

    expect(result.characters).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(mocks.reserveGenerationJob).toHaveBeenCalledTimes(1)
    const arg = mocks.reserveGenerationJob.mock.calls[0][0] as {
      kind: string
      inputSnapshot: Record<string, unknown>
      target: { workspaceId?: string; characterId?: string; appearanceKey?: string; view?: string; column?: string }
    }
    const lookFingerprint = computeLookFingerprint(DESIGN_TOKENS, character.costume, null)
    expect(arg.kind).toBe('character_view')
    expect(arg.target).toMatchObject({ workspaceId: WORKSPACE_ID, characterId: character.character_id, appearanceKey: 'current', view: 'main' })
    expect(arg.inputSnapshot.look_present).toBe(true)
    expect(arg.inputSnapshot.source_hash).toBe(computeImageSourceHash(character.appearance, lookFingerprint))
    expect(arg.inputSnapshot.source_hash).not.toBe(computeImageSourceHash(character.appearance, null))
  })

  it('Writer에서 온 캐릭터도 Director에 들어가기 전에 그림 초안을 만든다 (#ref-gate 2026-09-02)', async () => {
    dbState.characters = [
      characterFixture({ character_id: 'char_producer', origin: 'producer' }),
      characterFixture({ character_id: 'char_writer', origin: 'writer' }),
    ]
    dbState.appearances = [
      appearanceFixture({ character_id: 'char_producer' }),
      appearanceFixture({ character_id: 'char_writer' }),
    ]

    const result = await triggerCharacterDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 2, skipped: 0, failed: 0 })
    expect(mocks.reserveGenerationJob).toHaveBeenCalledTimes(2)
    const ids = mocks.reserveGenerationJob.mock.calls.map((c) => (c[0] as { target: { characterId: string } }).target.characterId).sort()
    expect(ids).toEqual(['char_producer', 'char_writer'])
  })

  it('장소 초안과 화면에서 만든 장소 그림이 같은 설명을 사용하고 대상 정보를 유지한다', async () => {
    const location = locationFixture()
    dbState.locations = [location]
    const builtPrompt = buildWorldShotPromptForLocation(
      mapLocationRowToManifestLocation(location),
      null,
      null,
      'wideShot',
    )

    const worldResult = await triggerWorldDrafts(PROJECT_ID)
    const triggerArg = mocks.reserveGenerationJob.mock.calls[0][0] as {
      kind: string
      actor: string
      inputSnapshot: Record<string, unknown>
      target: { workspaceId?: string; locationId?: string; column?: string }
    }

    mocks.reserveGenerationJob.mockClear()
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
          // 약속 B7(2026-09-04): 클라(artist-store)도 설명 해시를 동반한다 — 초안 경로와 스냅샷이 같아야 한다.
          descriptionHash: computeWorldDescriptionHash(location.visual_description),
        }),
      }),
    )
    const routeArg = mocks.reserveGenerationJob.mock.calls[0][0] as {
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

  it('같은 장소 그림을 만들라는 요청이 이미 대기 중이면 새로 보내지 않는다', async () => {
    dbState.locations = [locationFixture()]
    mocks.hasQueuedWorldShotJob.mockResolvedValue(true)

    const result = await triggerWorldDrafts(PROJECT_ID)

    expect(result).toEqual({ submitted: 0, skipped: 1, failed: 0 })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
  })

  it('일부 대상에서 생성에 실패해도 전체 결과에 실패 수로 반영한다', async () => {
    dbState.locations = [locationFixture()]
    mocks.falImageSubmit.mockRejectedValueOnce(new Error('fal unavailable'))

    await expect(triggerWorldDrafts(PROJECT_ID)).resolves.toEqual({ submitted: 0, skipped: 0, failed: 1 })
    // 예약은 제출보다 먼저다 — 접수되지 않았다는 증거는 접수 번호가 채워지지 않은 것이다.
    expect(mocks.confirmGenerationJobReceipt).not.toHaveBeenCalled()
  })

  // #B(2026-09-02 용량 사전 점검) — design_tokens 확인 직후 owner 쿼터가 랬으부타마면 제출 전역 스킵.
  it('사용 한도를 넘으면 그림 초안을 보내지 않고 차단 사실을 알린다', async () => {
    dbState.characters = [characterFixture()]
    dbState.locations = [locationFixture()]
    mocks.checkGenerationCapacity.mockResolvedValue({
      ok: false,
      queued: 6,
      limit: 6,
      scope: 'user',
      category: 'image',
    })

    const result = await triggerAssetDrafts(PROJECT_ID)

    expect(result).toEqual({ characters: { submitted: 0, skipped: 0, failed: 0 }, worlds: { submitted: 0, skipped: 0, failed: 0 } })
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.checkGenerationCapacity).toHaveBeenCalledWith(OWNER_ID, 'image')
  })

  it('사용 한도 안이면 그림 초안을 정상적으로 보낸다 (기존 동작 유지)', async () => {
    dbState.characters = [characterFixture()]
    mocks.checkGenerationCapacity.mockResolvedValue({
      ok: true,
      queued: 0,
      limit: 6,
      scope: 'user',
      category: 'image',
    })

    const result = await triggerAssetDrafts(PROJECT_ID)

    expect(result.characters).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(mocks.checkGenerationCapacity).toHaveBeenCalledWith(OWNER_ID, 'image')
  })
})

// 2026-10-10 오너 "writer 생성 파이프라인과 그림체 분석을 병렬로 돌리고, 분석이 진행 중에는 artist 생성이 안 되게 막아두고 끝나면 진행" —
//   Writer 는 기다리지 않는다. Artist 그림만 미루고, 분석 창구가 끝을 알리며 다시 부른다.
describe('그림체 분석이 도는 동안 Artist 그림은 미룬다', () => {
  const ANCHOR_URL = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads/look/original.webp'
  const pendingAnchor = (minutesAgo: number) => ({
    url: ANCHOR_URL, label: '내 그림체', medium: '2d_anime', locked: true,
    analysis_pending_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  })

  it('그림체 분석이 도는 동안 Writer가 Artist 그림 초안을 시작하면 그리지 않고 미룬다', async () => {
    // 왜: 10/10 운영 806e2cc2 — 분석보다 Artist 가 먼저 그리면 그림체 설명 없이 그림만 보고 그린다(이번엔 28초 차이로 피했다).
    dbState.projects = [projectFixture({ custom_style_anchor: pendingAnchor(1) })]
    dbState.locations = [locationFixture()]

    const result = await triggerAssetDrafts(PROJECT_ID)

    expect(result.deferred_style_analysis).toBe(true)
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  it('그림체 분석이 끝났다고 알리며 부르면 분석 대기 표시가 남아 있어도 미뤄 둔 그림을 그린다', async () => {
    // 왜: 분석이 실패하면 대기 표시를 지우지 않는다 — 분석 창구가 끝을 알리며 부르면 그림만 보고라도 그린다.
    dbState.projects = [projectFixture({ custom_style_anchor: pendingAnchor(1) })]

    const result = await triggerAssetDrafts(PROJECT_ID, { afterStyleAnalysis: true })

    expect(result.deferred_style_analysis).toBeUndefined()
    expect(result.characters).toEqual({ submitted: 1, skipped: 0, failed: 0 })
  })

  it('분석 대기 표시가 5분 넘게 지났으면 기다리지 않고 그린다', async () => {
    // 왜: 분석 창구는 서버 한도(5분) 안에 끝난다 — 그보다 오래된 표시는 멈춘 분석이라 Artist 를 막지 않는다.
    dbState.projects = [projectFixture({ custom_style_anchor: pendingAnchor(6) })]

    const result = await triggerAssetDrafts(PROJECT_ID)

    expect(result.deferred_style_analysis).toBeUndefined()
    expect(result.characters).toEqual({ submitted: 1, skipped: 0, failed: 0 })
  })

  it('그림체 분석이 도는 동안 Artist 화면에서 배경 그림을 만들려 하면 그리지 않고 넘긴다', async () => {
    // 왜: Writer 가 씬을 저장하면 Artist 화면이 열린다 — 화면의 자동 채움도 분석을 기다린다. 분석이 끝나면 서버가 빈칸을 그린다.
    dbState.projects = [projectFixture({ custom_style_anchor: pendingAnchor(1) })]
    const location = locationFixture()
    dbState.locations = [location]
    const prompt = buildWorldShotPromptForLocation(mapLocationRowToManifestLocation(location), null, null, 'wideShot')

    const res = await generateWorldPOST(
      new Request('http://localhost/api/artist/generate-world', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: PROJECT_ID,
          locationId: location.location_id,
          column: 'wide_shot',
          prompt,
          aspectRatio: '16:9',
          sourceHash: computeWorldImageSourceHash(prompt),
          descriptionHash: computeWorldDescriptionHash(location.visual_description),
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ deduped: true, waitingForStyle: true })
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
  })
})

// 2026-10-10 오너(제안대로) — 올린 그림의 분석 결과가 있으면 인물 시트 본문은 Writer 그림체 값 대신 그림과 분석 결과만 따른다.
//   Writer 값은 분석을 보지 못한 채(분석보다 먼저) 장르 · 그림체 이름만으로 정해져 분석과 부딪혔다(운영 806e2cc2: 6등신 · 다른 색 조합).
describe('올린 그림의 분석 결과가 있을 때 인물 시트 본문', () => {
  const analyzed = (facets: Record<string, unknown> | null) => ({
    url: 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads/look/original.webp',
    label: '내 그림체', medium: '2d_anime', locked: true,
    ...(facets ? { facets } : {}),
  })
  const FACETS = { probe_anchors: 'Digital color line art with flat cel fills.', figure: 'Big round eyes.', priority: 'Priority order: dark outlines → cel shading.', negative: 'Avoid 3D render.' }
  const promptOf = () => (mocks.reserveGenerationJob.mock.calls[0][0] as { inputSnapshot: { prompt: string } }).inputSnapshot.prompt

  it('올린 그림의 분석 결과가 있으면 인물 시트 본문에 Writer가 정한 그림체 값(그림체 · 선 · 형태 · 질감 · 등신 · 색)을 싣지 않는다', async () => {
    // 왜: Writer 값은 분석 결과를 보지 못하고 정해져 "6등신 · 다른 색"처럼 분석과 반대로 말했다 — 그림체는 올린 그림과 분석이 정한다.
    dbState.projects = [projectFixture({ style_anchor_key: 'custom_1', custom_style_anchor: analyzed(FACETS) })]
    await triggerCharacterDrafts(PROJECT_ID)
    const prompt = promptOf()
    expect(prompt).toContain('Style anchors: Digital color line art with flat cel fills.')
    expect(prompt).not.toMatch(/art style: |line quality: |shape language: |texture: |head-to-body ratio|palette: /)
  })

  it('올린 그림의 분석 결과가 있으면 "흔한 애니 · 치비 · 마스코트풍으로 돌아가지 마라" 문장을 싣지 않는다', async () => {
    // 왜: 분석 기능 전(7월)에 넣은 고정 문장이라 애니 · 치비 그림체를 올리면 그림과 정면으로 부딪친다.
    dbState.projects = [projectFixture({ style_anchor_key: 'custom_1', custom_style_anchor: analyzed(FACETS) })]
    await triggerCharacterDrafts(PROJECT_ID)
    expect(promptOf()).not.toContain('never fall back to a generic anime, chibi or mascot look')
  })

  it('분석 결과가 없는 그림체(프리셋 · 분석 실패)는 지금처럼 Writer 그림체 값과 그 문장을 싣는다', async () => {
    // 정상 경로 고정 — 기댈 분석이 없으면 Writer 값이 유일한 그림체 글이다.
    dbState.projects = [projectFixture({ style_anchor_key: 'custom_1', custom_style_anchor: analyzed(null) })]
    await triggerCharacterDrafts(PROJECT_ID)
    const prompt = promptOf()
    expect(prompt).toContain('art style: ink storybook')
    expect(prompt).toContain('never fall back to a generic anime, chibi or mascot look')
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

function appearanceFixture(overrides: Partial<AppearanceRow> = {}): AppearanceRow {
  return {
    project_id: PROJECT_ID,
    character_id: 'char_hero',
    appearance_key: 'current',
    is_default: true,
    appearance: '은발 검사',
    costume: null,
    sheet_url: null,
    portrait_url: null,
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
  if (table === 'workspaces') return dbState.workspaces as unknown as Array<Record<string, unknown>>
  if (table === 'characters') return dbState.characters as unknown as Array<Record<string, unknown>>
  if (table === 'character_appearances') return dbState.appearances as unknown as Array<Record<string, unknown>>
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
