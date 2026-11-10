// 대본 그대로 쓰기에서 [만들기] 뒤 디자인 · 대사 단계는 실행 기록(목록에 보인 배경 · 재점검으로 합친 인물 · 샷을 나눈 비트)을 그대로 따른다 (오너 · 리드 2026-11-10 B1)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runV2Design: vi.fn(),
  persistAssetsToDb: vi.fn(),
  runShotDesign: vi.fn(),
  runShotCheck: vi.fn(),
  runRenderPrompts: vi.fn(),
  runDialogue: vi.fn(),
}))

vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class PipelineLogger {}, makeProjectId: vi.fn(() => 'p') }))
vi.mock('@/lib/writer/pipeline/stages/s0_dramaturgy', () => ({ runDramaturgySafe: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/s1s3_merged', () => ({ runStructureScenesMerged: vi.fn() }))
// 배경 목록 맞추기(mergeOpenWorld)는 진짜를 쓴다. 미리 보기 · 재점검과 같은 규칙인지가 이 시험의 요점이다.
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', async (importOriginal) => ({ ...(await importOriginal<object>()), runScenes: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/c_validation_1', () => ({ runStoryCheck: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v0_visual', () => ({ runVisualIdentity: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v1_act_arc', () => ({ runActVisualArc: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v2_design', () => ({ runV2Design: mocks.runV2Design }))
vi.mock('@/lib/writer/pipeline/stages/v3_scene_plan', () => ({ runSceneCinematography: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/decoupage', () => ({ runDecoupage: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v3s_stage', () => ({ runSceneStage: vi.fn() }))
vi.mock('@/lib/writer/pipeline/stages/v4_shots', () => ({ runShotDesign: mocks.runShotDesign }))
vi.mock('@/lib/writer/pipeline/stages/c_application_2', () => ({ runShotCheck: mocks.runShotCheck }))
vi.mock('@/lib/writer/pipeline/stages/v5_prompts', () => ({ runRenderPrompts: mocks.runRenderPrompts }))
vi.mock('@/lib/writer/pipeline/stages/dialogue', () => ({
  runDialogue: mocks.runDialogue,
  toDialogueTrack: vi.fn((r: { profiles: unknown; scenes: unknown }) => ({ profiles: r.profiles, scenes: r.scenes })),
}))
vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: vi.fn(),
  describeAxisConfig: () => 'test/model',
  DEFAULT_MODELS: { S: { provider: 'mock' }, V: { provider: 'mock' }, C: { provider: 'mock' } },
}))
vi.mock('@/lib/writer/pipeline/util/infer_v3', () => ({ inferSceneCinematographyFromShots: vi.fn(() => []) }))
vi.mock('@/lib/writer/pipeline/util/persist_design_tokens', () => ({ persistDesignTokens: vi.fn(async () => undefined) }))
vi.mock('@/lib/writer/pipeline/util/persist_manifest', () => ({ persistAssetsToDb: mocks.persistAssetsToDb, persistShotsToDb: vi.fn(), persistSceneStagesToDb: vi.fn(), persistSceneLedgersToDb: vi.fn() }))
vi.mock('@/lib/writer/types/pipeline', () => ({ isCompactDepth: vi.fn(() => false) }))
vi.mock('@/lib/writer/pipeline/validators/action_budget', () => ({ analyzeSceneActionBudget: vi.fn(() => ({ issues: [] })) }))
vi.mock('@/lib/writer/pipeline', () => ({
  resolveModels: vi.fn(() => ({ S: { provider: 'mock' }, V: { provider: 'mock' }, C: { provider: 'mock' } })),
  resolveSkip: vi.fn(() => ({ validation1: false })),
  emptyC1Report: vi.fn(() => ({})),
}))
vi.mock('@/lib/writer/run-store', () => ({
  getActiveRun: vi.fn(),
  saveRunState: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  markAwaiting: vi.fn(),
  advanceProjectStageAfterWriter: vi.fn(),
}))
vi.mock('@/lib/writer/llm/raw_collector', () => ({
  getPendingRawCalls: vi.fn(() => []),
  getUsageTotals: vi.fn(() => ({ calls: 0, inputTokens: 0, outputTokens: 0, inputChars: 0, outputChars: 0, rateLimitHits: 0 })),
}))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: vi.fn(async () => undefined) }))

import { WRITER_STEPS, type WriterRunState } from '@/lib/writer/pipeline/steps'
import { dialogueTrackFromScript, preservedScript, scenesFromScript } from '@/lib/writer/script/preserve'
import { castContractToCharacters } from '@/lib/writer/cast-contract'
import { planBreakdownRecheck } from '@/lib/writer/breakdown-recheck'
import { syncTreatmentCast } from '@/lib/producer/treatment-cast-sync'

// 11/10 영어 점검(C03)의 시험 대본(앞머리 줄의 줄표만 쉼표로 바꿨다). 이 시험을 위해 지은 글이다(실제 작품 아님).
const LAST_BUS = `THE LAST BUS
(written for this test, not a real work)

1. EXT. COUNTRY BUS STOP - NIGHT
WIDE SHOT. Rain falls on an empty bus stop under a single streetlight.
MAYA (20s, yellow raincoat) runs in, out of breath, and checks her phone.
CLOSE-UP on the phone screen: "Last bus 11:40 PM". The clock reads 11:42.
MAYA: No, no, no...

2. EXT. COUNTRY ROAD - CONTINUOUS
LONG SHOT. Headlights appear around the bend. An old bus slows down.
MEDIUM SHOT. The door folds open. The DRIVER (60s, kind eyes, wool cap) smiles.
DRIVER: I always wait two minutes for the rain.
Maya laughs and steps inside.

3. INT. BUS - CONTINUOUS
TRACKING SHOT down the empty aisle. Maya sits by the window.
CLOSE-UP. She draws a small smile on the fogged glass.
FADE OUT.`

const logger = () => ({ flushRawLlm: vi.fn(async () => undefined), markStage: vi.fn(async () => undefined), saveLlmCall: vi.fn(async () => undefined) }) as never
const step = (key: string) => {
  const s = WRITER_STEPS.find((c) => c.key === key)
  if (!s) throw new Error(`${key} step missing`)
  return s
}

/** [만들기] 직전의 대본 그대로 실행 기록. 실행을 만들 때(createRun)와 씬 단계가 하는 것과 같게 채운다. */
function keepState(story: string, over: Partial<WriterRunState> = {}): WriterRunState {
  const input = { story, preserveScript: true }
  const preserved = preservedScript(input)!
  return {
    input,
    genre: {},
    characters: castContractToCharacters(preserved.cast),
    narrativeStructure: { acts: [{ act_id: 'act_1', proportion: 1 }] },
    scenes: scenesFromScript(preserved.doc),
    visualIdentity: {},
    actVisualArc: null,
    ...over,
  } as unknown as WriterRunState
}

const designedWorld = () => mocks.runV2Design.mock.calls[0][3] as { locations: Array<{ id: string; name: string; description: string }> } | undefined
const savedWorld = () => mocks.persistAssetsToDb.mock.calls[0][5] as { locations: Array<{ id: string; name: string }> } | undefined

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.runV2Design.mockResolvedValue({ characterVisual: { characters: [] }, worldVisual: { global_palette: {}, color_meaning: {}, locations: [], vfx_approach: '' } })
  mocks.persistAssetsToDb.mockResolvedValue(undefined)
  mocks.runRenderPrompts.mockResolvedValue({ total_shots: 0, shots: [] })
  mocks.runDialogue.mockResolvedValue({ done: true, doneSceneIds: [], scenes: [], memory: {}, profiles: [] })
})

describe('같이 정한 것', () => {
  // 왜: 11/10 점검(C03 · L2#1 · L2#8)에서 목록 · 스타일 창은 배경 3을 알렸는데, 디자인 단계가 장소를 0개로 받아 배경 카드가 하나도 안 생겼다(재점검과 상관없이).
  it('대본 그대로 쓰기에서 [만들기]를 누르면 목록에 보인 배경(대본의 장면 머리 장소)을 디자인해 배경 카드로 남긴다', async () => {
    const patch = (await step('v2Design').run(keepState(LAST_BUS), { logger: logger(), projectId: 'p1' })) as Partial<WriterRunState>

    expect(designedWorld()?.locations.map((l) => l.id)).toEqual(['COUNTRY BUS STOP', 'COUNTRY ROAD', 'BUS'])
    expect(savedWorld()?.locations.map((l) => l.name)).toEqual(['COUNTRY BUS STOP', 'COUNTRY ROAD', 'BUS'])
    expect(patch.world?.locations.map((l) => l.id)).toEqual(['COUNTRY BUS STOP', 'COUNTRY ROAD', 'BUS'])
  })
})

describe('혼자 정한 것', () => {
  // 왜: 이야기 엔진이 지은 장소 후보(isolated_roadside_stop · vintage_transit_bus …)는 대본에 없는 이름이라 씬 장소와 이어지지 않고, 넣으면 같은 곳을 두 번 그린다.
  //   산문 초안 · 재점검의 목록도 씬에 적힌 장소만 보인다.
  it('대본 그대로 쓰기의 배경 목록에는 이야기 엔진이 지은 장소 후보를 넣지 않는다', async () => {
    const dramaturgy = {
      core_engine: '', mechanism_notes: [],
      world_inventory: [
        { id: 'vintage_transit_bus', name: 'Bus', description: 'an old rural bus', derived_from: '', scene_potential: [] },
        { id: 'isolated_roadside_stop', name: 'Isolated roadside stop', description: '', derived_from: '', scene_potential: [] },
      ],
      dramatic_diagnosis: { stakes: '', weak_beats: [], cdq_candidates: [], ending_check: '' },
    }
    await step('v2Design').run(keepState(LAST_BUS, { dramaturgy } as never), { logger: logger(), projectId: 'p1' })

    expect(designedWorld()?.locations.map((l) => l.id)).toEqual(['COUNTRY BUS STOP', 'COUNTRY ROAD', 'BUS'])
  })

  // 왜: [만들기]는 사람이 고친 배경 카드만 실어 보낸다. 그것만 쓰면 나머지 장면 장소가 또 빠지고, 고친 이름 · 설명을 장면 이름으로 덮으면 고친 것이 사라진다.
  it('Producer 에서 고친 배경 카드는 그 이름 · 설명으로 디자인하고, 목록에 없는 장면 장소만 더한다', async () => {
    const world = { locations: [{ id: 'BUS', name: 'OLD BUS', description: 'rusty seats, fogged windows' }] }
    await step('v2Design').run(keepState(LAST_BUS, { world }), { logger: logger(), projectId: 'p1' })

    expect(designedWorld()?.locations).toEqual([
      { id: 'BUS', name: 'OLD BUS', description: 'rusty seats, fogged windows' },
      { id: 'COUNTRY BUS STOP', name: 'COUNTRY BUS STOP', description: '' },
      { id: 'COUNTRY ROAD', name: 'COUNTRY ROAD', description: '' },
    ])
  })

  // 왜: 정상 경로 고정. 대본이 아닌 이야기는 씬 단계가 이미 배경 목록을 쌓아 두었다. 디자인 단계는 그 목록을 그대로 쓴다.
  it('대본이 아닌 이야기의 디자인 단계는 지금처럼 쌓아 둔 배경 목록을 그대로 쓴다', async () => {
    const world = { locations: [{ id: 'kitchen', name: 'Kitchen', description: '' }] }
    const state = {
      input: { story: 'Mira waits in the kitchen. Later Jun walks out to the yard.' },
      genre: {},
      characters: { characters: [], relationships: [], subtext_notes: [] },
      scenes: { scenes: [{ scene_id: 's1', location: 'kitchen' }, { scene_id: 's2', location: 'yard' }], total_estimated_seconds: 20 },
      world,
      visualIdentity: {},
      actVisualArc: null,
    } as unknown as WriterRunState
    const patch = (await step('v2Design').run(state, { logger: logger(), projectId: 'p1' })) as Partial<WriterRunState>

    expect(designedWorld()).toBe(world)
    expect(patch).not.toHaveProperty('world')
  })

  // 왜: 11/10 점검(L2#5)에서 재점검으로 합친 인물의 대사가 [만들기] 뒤 대본에서 다시 만들어지며 합친 쪽 번호로 남아 화자가 비고 V.O. 로 나왔다.
  //   재점검 창은 "합친 이름은 남는 인물의 다른 이름으로 남는다"고 알린다.
  it('대본 그대로 쓰기에서 산문 재점검으로 합친 인물의 대사는 남는 인물의 대사로 샷에 실린다', async () => {
    // 같은 할머니를 큐마다 다르게 적은 대본(GRANDMA · GRANNY). 사람이 재점검에서 하나로 합친다.
    const script = `INT. KITCHEN - NIGHT
Mira sets the kettle down.

MIRA
You came back.

GRANDMA
(quietly)
I never left.

EXT. YARD - CONTINUOUS

GRANNY
Stay.`
    const before = keepState(script, { input: { story: script, preserveScript: true, treatmentDraft: true }, _proseLocked: true } as never)
    const list = syncTreatmentCast({ cast: [], backgrounds: [], syncedVersion: null }, {
      characters: before.characters!.characters.map((c) => ({ id: c.id!, name: c.name, role: 'supporting', entityType: 'person' as const, appearance: '', want: '' })),
      locations: [],
    }, 'v1')
    const recheck = planBreakdownRecheck({ state: before, cast: list.cast, backgrounds: list.backgrounds, ops: [{ op: 'merge', from: 'treatment:granny', into: 'treatment:grandma' }] })
    if (!recheck.ok) throw new Error(`recheck failed: ${recheck.code}`)
    const shots = [
      { shot_id: 'shot_1', scene_id: 'scene_1', source_beats: [0, 1] },
      { shot_id: 'shot_2', scene_id: 'scene_1', source_beats: [2] },
      { shot_id: 'shot_3', scene_id: 'scene_2', source_beats: [0] },
    ]
    mocks.runShotDesign.mockResolvedValue({ done: true, doneSceneIds: ['scene_1', 'scene_2'], shots })
    mocks.runShotCheck.mockResolvedValue({ shotSequence: { total_shots: 3, shots }, report: { issues: [] } })
    const state = {
      ...recheck.state,
      worldVisual: {}, characterVisual: {}, sceneCinematography: [], compact: false,
      decoupage: { scenes: [{ scene_id: 'scene_1', shots: shots.slice(0, 2) }, { scene_id: 'scene_2', shots: shots.slice(2) }] },
    } as unknown as WriterRunState

    const patch = (await step('shotsAndDialogue').run(state, { logger: logger(), projectId: 'p1', deadlineMs: Date.now() + 300_000 })) as unknown as {
      dialogue: { profiles: Array<{ character_id: string }>; scenes: Array<{ shots: Array<{ shot_id: string; dialogue: Array<{ character_id: string; line: string }> }> }> }
    }
    const byShot = Object.fromEntries(patch.dialogue.scenes.flatMap((s) => s.shots.map((sh) => [sh.shot_id, sh.dialogue.map((l) => `${l.character_id}: ${l.line}`)])))
    expect(byShot).toEqual({ shot_1: ['mira: You came back.'], shot_2: ['grandma: I never left.'], shot_3: ['grandma: Stay.'] })
    expect(patch.dialogue.profiles.map((p) => p.character_id)).toEqual(['mira', 'grandma'])
  })
})

describe('혼자 정한 것 · 검토 c 고침', () => {
  const byShot = (track: ReturnType<typeof dialogueTrackFromScript>) =>
    Object.fromEntries(track.scenes.flatMap((s) => s.shots.map((sh) => [sh.shot_id, sh.dialogue.map((l) => `${l.character_id}: ${l.line}`)])))

  // 왜: 검토 c 보통 1. 배포 전에 만든 초안은 씬 비트를 옛 대본 읽기로 저장했고, [만들기] 뒤 샷도 그 비트로 나뉜다. 대사 단계는 대본을 새로 읽어
  //   비트를 다시 세서, 카메라 줄이 연출 + 지문으로 갈라지면 번호가 밀려 대사가 다른 샷에 실렸다. 초안은 [만들기] 전까지 오래 기다릴 수 있다.
  it('대본 그대로 쓰기에서 대사는 실행 기록의 씬 비트(샷을 나눈 그 비트)에 맞춰 싣는다: 대본 읽기가 바뀌어 비트 수가 달라져도 대사가 다른 샷으로 밀리지 않는다', () => {
    const story = `INT. KITCHEN - NIGHT
WIDE SHOT. Rain hits the window.
MAYA: You came back.
CLOSE ON DRIVER. He nods slowly.
DRIVER: I never left.`
    const state = keepState(story)
    // 옛 읽기는 카메라 줄을 통째로 연출로 두어 비트가 대사 둘뿐이었다(저장된 초안 그대로).
    const stored = { ...state.scenes!, scenes: [{ ...state.scenes!.scenes[0], scene_actions: ['MAYA: You came back.', 'DRIVER: I never left.'] }] }
    const decoupage = { scenes: [{ scene_id: 'scene_1', shots: [{ shot_id: 'shot_1', source_beats: [0] }, { shot_id: 'shot_2', source_beats: [1] }] }] }

    const track = dialogueTrackFromScript(preservedScript(state.input)!.doc, stored, decoupage as never)

    expect(byShot(track)).toEqual({ shot_1: ['maya: You came back.'], shot_2: ['driver: I never left.'] })
  })

  // 왜: 검토 c 보통 1. 옛 읽기가 대사를 앞 줄과 한 비트로 묶어 둔 초안(카메라 줄이 인물로 읽혀 대사가 그 줄에 붙음)도 대사가 그 비트의 샷에 실려야 한다.
  it('예전 읽기가 대사를 다른 줄과 한 비트로 묶어 두었으면 그 대사는 그 비트를 덮는 샷에 싣는다', () => {
    const story = `INT. ROOM - DAY
LONG SHOT. The door opens.
MAYA: Hello.

Rain keeps falling.`
    const state = keepState(story)
    const stored = { ...state.scenes!, scenes: [{ ...state.scenes!.scenes[0], scene_actions: ['LONG SHOT: The door opens. MAYA: Hello.', 'Rain keeps falling.'] }] }
    const decoupage = { scenes: [{ scene_id: 'scene_1', shots: [{ shot_id: 'shot_1', source_beats: [0] }, { shot_id: 'shot_2', source_beats: [1] }] }] }

    const track = dialogueTrackFromScript(preservedScript(state.input)!.doc, stored, decoupage as never)

    expect(byShot(track)).toEqual({ shot_1: ['maya: Hello.'], shot_2: [] })
  })

  // 왜: 검토 c 낮음 5. "EXT. BUS STOP" · "EXT. Bus Stop" 은 배경 하나만 생기는데 둘째 씬 장소가 그 번호와 글자가 달라, 그림 참조 · Director 가
  //   글자 그대로 비교해 그 씬 샷에 배경이 안 붙었다. 대본이 아닌 흐름의 씬 장소 맞추기(normalizeSceneLocations)와 같은 방식이다.
  it('대본 그대로 쓰기에서 장면 장소가 대소문자만 다르면(BUS STOP · Bus Stop) [만들기] 때 같은 배경 번호로 맞춘다', async () => {
    const story = `EXT. BUS STOP - NIGHT
Maya waits.

MAYA: Come on.

EXT. Bus Stop - DAY
Maya waits again.

MAYA: Finally.`
    const patch = (await step('v2Design').run(keepState(story), { logger: logger(), projectId: 'p1' })) as Partial<WriterRunState>

    expect(designedWorld()?.locations.map((l) => l.id)).toEqual(['BUS STOP'])
    expect(patch.scenes?.scenes.map((s) => s.location)).toEqual(['BUS STOP', 'BUS STOP'])
    expect((mocks.persistAssetsToDb.mock.calls[0][2] as { scenes: Array<{ location: string }> }).scenes.map((s) => s.location)).toEqual(['BUS STOP', 'BUS STOP'])
  })
})

describe('혼자 정한 것 · 검토 c 재검토(7982ba84)', () => {
  // 왜: 검토 c 재검토 낮음 2. 대사 글만으로 담긴 비트를 찾아, 앞 지문에 같은 짧은 말('Maya sighs. "Fine."')이 있으면 대사가 그 지문의 샷에 실렸다.
  it('예전 읽기가 대사를 다른 줄과 한 비트로 묶어 두었으면 "화자: 대사" 글이 든 비트를 먼저 찾아, 앞 지문에 같은 짧은 말이 있어도 그 비트의 샷에 싣는다', () => {
    const story = `INT. ROOM - DAY
Maya sighs. "Fine."

LONG SHOT. The door opens.
MAYA: Fine.`
    const state = keepState(story)
    const stored = { ...state.scenes!, scenes: [{ ...state.scenes!.scenes[0], scene_actions: ['Maya sighs. "Fine."', 'LONG SHOT: The door opens. MAYA: Fine.'] }] }
    const decoupage = { scenes: [{ scene_id: 'scene_1', shots: [{ shot_id: 'shot_1', source_beats: [0] }, { shot_id: 'shot_2', source_beats: [1] }] }] }

    const track = dialogueTrackFromScript(preservedScript(state.input)!.doc, stored, decoupage as never)
    const byShot = Object.fromEntries(track.scenes.flatMap((s) => s.shots.map((sh) => [sh.shot_id, sh.dialogue.map((l) => `${l.character_id}: ${l.line}`)])))

    expect(byShot).toEqual({ shot_1: [], shot_2: ['maya: Fine.'] })
  })
})

