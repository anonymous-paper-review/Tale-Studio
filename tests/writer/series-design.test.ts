// 시리즈 다음 화는 같은 그림체면 앞 화 색 설계를 그대로 쓰고, 새 인물 · 배경을 앞 화와 같은 세계로 디자인하며, 배경은 나오는 씬의 시간대 · 날씨에 맞춘다 (2026-10-27 오너 "제품에서 고칠 것")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  from: vi.fn(),
  getActiveRun: vi.fn(),
}))

vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: mocks.generateJson,
  describeAxisConfig: () => 'mock-model',
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.getActiveRun }))

import { parseSeries, SERIES_VERSION } from '@/lib/series/snapshot'
import { seriesDesignInput, seriesPipelineInput } from '@/lib/series/seed'
import { loadSeriesWriterInput } from '@/lib/series/server'
import { seriesBlock } from '@/lib/writer/pipeline/series-block'
import { runVisualIdentity } from '@/lib/writer/pipeline/stages/v0_visual'
import { designLocations, runV2Design } from '@/lib/writer/pipeline/stages/v2_design'
import type { PipelineLogger } from '@/lib/writer/logger'
import type {
  ActVisualArc,
  BackgroundContract,
  Characters,
  DesignTokens,
  Genre,
  PipelineInput,
  StoryScene,
  VisualIdentity,
} from '@/lib/writer/types/pipeline'

const PREV_TOKENS: DesignTokens = {
  l0: { medium: '2d_animation', resolution: { width: 1920, height: 1080 }, fps: 24, aspect_ratio: '16:9', rendering_method: 'cel_shaded' },
  l1: { art_style: 'jp_anime', shape_language: 'round', line_quality: 'clean', character_proportion: '6.5:1', texture_philosophy: 'flat' },
  palette: {
    primary: 'Greyish Moss Green (#5B6B5C)',
    secondary: 'Deep Night Navy (#1B263B)',
    accent: 'Luminous Magic Gold (#FFD700)',
    forbidden: ['#00FFFF'],
  },
  color_meaning: { '황금빛': '힘멜과의 기억' },
  vfx_approach: '부드러운 입자 빛',
} as DesignTokens

const SNAPSHOT = {
  version: SERIES_VERSION,
  prevProjectId: 'ep1',
  prevTitle: '남겨진 마법',
  copiedAt: '2026-10-27T00:00:00.000Z',
  characters: [
    { characterId: 'char_2', name: '페른', role: 'supporting', appearance: '보라색 긴 머리, 검은 로브와 흰 블라우스', personality: [], sheetUrl: 'https://m/fern.png', portraitUrl: null, styleId: 'jp_anime' },
  ],
  locations: [
    { locationId: 'location_2', name: '야영지', description: '숲 가장자리의 밤 야영지, 모닥불', wideShotUrl: 'https://m/camp.png', styleId: 'jp_anime' },
  ],
  voices: [],
  styleId: 'jp_anime',
  format: 'horizontal_16:9',
  dialogueLanguage: 'ko',
  continuesLastScene: false,
  copyFailures: [],
  designTokens: PREV_TOKENS,
}

// writer/start 가 실행 입력에 싣는 시리즈 칸들(series/server.ts 와 같은 조합) — 앞 화 줄거리는 없는 경우.
const writerInput = (styleId: string): Pick<PipelineInput, 'series' | 'inheritedLooks' | 'inheritedDesignTokens'> => {
  const snapshot = parseSeries(SNAPSHOT)!
  return { series: seriesPipelineInput(snapshot, null), ...seriesDesignInput(snapshot, styleId) }
}
// 디자인 단계가 받는 시리즈 정보(steps.ts 와 같은 조합).
const designContext = (styleId: string) => {
  const input = writerInput(styleId)
  return { scenes: SCENES, series: input.series, looks: input.inheritedLooks, designTokens: input.inheritedDesignTokens }
}

const logger = () =>
  ({
    markStage: vi.fn(async () => {}),
    saveLlmCall: vi.fn(async () => ''),
    saveStage: vi.fn(async () => ''),
  }) as unknown as PipelineLogger
const V = { provider: 'gemini' } as never

const scene = (overrides: Partial<StoryScene>): StoryScene =>
  ({
    scene_id: 'scene_1',
    act_ref: 'act_1',
    location: 'river_ferry_dock',
    time_of_day: '새벽',
    narrative_time: 'present',
    characters_in_scene: ['char'],
    purpose: 'conflict',
    emotion_beat: { start: '', end: '' },
    dialogue_summary: '페른이 다시 묻는다.',
    info_asymmetry: '',
    estimated_seconds: 10,
    scene_actions: ['프리렌이 안개 낀 강물을 바라본다.'],
    ...overrides,
  }) as StoryScene

const SCENES: StoryScene[] = [
  scene({ scene_id: 'scene_1', location: 'river_ferry_dock', time_of_day: '새벽', weather: '짙은 안개' }),
  scene({
    scene_id: 'scene_3',
    location: 'drifting_ferry_boat',
    time_of_day: '낮',
    dialogue_summary: '뱃사공이 용사 이야기를 한다.',
    scene_actions: ['늙은 뱃사공이 강 안개 속으로 나룻배를 밀어 넣는다.'],
  }),
  scene({ scene_id: 'scene_4', location: 'drifting_ferry_boat', time_of_day: '밤', dialogue_summary: '나중 장면' }),
]

const CHARACTERS = {
  characters: [
    { id: 'char_2', name: '페른', role: 'supporting', appearance_description: '보라색 긴 머리', personality: [] },
    { id: 'old_boatman', name: '늙은 뱃사공', role: 'supporting', appearance_description: '주름진 노인', personality: [] },
  ],
  relationships: [],
  subtext_notes: [],
} as unknown as Characters

const WORLD: BackgroundContract = {
  locations: [
    { id: 'river_ferry_dock', name: '강가 나루터', description: '낡은 목재 나루터' },
    { id: 'drifting_ferry_boat', name: '강 위의 나룻배', description: '작은 나무배' },
  ],
}

const IDENTITY = { format: PREV_TOKENS.l0, style: PREV_TOKENS.l1 } as VisualIdentity

function llmDesign() {
  return {
    characterVisual: { characters: [{ character_id: 'old_boatman', appearance: '노인', costume: ['펠트 모자'], palette: ['#5B6B5C'] }] },
    worldVisual: {
      global_palette: { primary: '#319795', secondary: '#D69E2E', accent: '#9F7AEA', forbidden: [] },
      color_meaning: { 청록: '새로 정한 뜻' },
      locations: [
        { id: 'river_ferry_dock', style_description: '안개 낀 새벽 나루터', lighting_sources: ['안개 속 새벽빛'], props: [] },
        { id: 'drifting_ferry_boat', style_description: '안개 낀 강 위의 배', lighting_sources: ['흐린 낮빛'], props: [] },
      ],
      vfx_approach: '새로 정한 효과',
    },
  }
}

beforeEach(() => {
  mocks.generateJson.mockReset()
  mocks.from.mockReset()
  mocks.getActiveRun.mockReset()
})

describe('앞 화 색 설계 이어받기', () => {
  // 왜: 같이 정한 것 — 운영 2화가 1화 색(이끼 초록 · 밤 남색 · 마법 금색)을 버리고 청록 · 황토 · 보라를 새로 정해 새 인물 시트 색이 1화와 어긋났다.
  it('같은 그림체로 그리면 Writer 입력에 앞 화 색 설계를 싣고, 그림체를 바꾸면 싣지 않는다', () => {
    const series = parseSeries(SNAPSHOT)!
    expect(seriesDesignInput(series, 'jp_anime').inheritedDesignTokens).toEqual(PREV_TOKENS)
    // 왜: 그림체를 바꾸면 앞 화 색 설계는 그 그림체와 맞지 않는다 — 새로 정한다.
    expect(seriesDesignInput(series, 'watercolor').inheritedDesignTokens).toBeUndefined()
    expect(seriesDesignInput({ ...series, designTokens: null }, 'jp_anime').inheritedDesignTokens).toBeUndefined()
  })

  // 왜: 혼자 정한 것 — 기록이 깨졌으면 색 설계 없이(지금처럼 새로 정해) 이어 간다. 시리즈 자체를 버리지 않는다.
  it('시리즈 기록의 색 설계 모양이 틀리면 색 설계 없이 읽는다', () => {
    expect(parseSeries(SNAPSHOT)?.designTokens).toEqual(PREV_TOKENS)
    expect(parseSeries({ ...SNAPSHOT, designTokens: { l1: 'anime' } })?.designTokens).toBeNull()
    expect(parseSeries({ ...SNAPSHOT, designTokens: undefined })?.designTokens).toBeNull()
    expect(parseSeries({ ...SNAPSHOT, designTokens: { l1: 'anime' } })?.prevTitle).toBe('남겨진 마법')
  })

  // 왜: 같이 정한 것 — 그림 양식(등신 · 선 · 형태)도 색 설계의 일부다. 운영 2화는 6.5등신이 7등신으로 바뀌었다.
  it('앞 화 색 설계가 있으면 그림 양식을 새로 정하지 않고 앞 화 것을 쓰며 화면 비율만 이번 화 설정을 따른다', async () => {
    const genre = { format: 'vertical_9:16' } as unknown as Genre

    const result = await runVisualIdentity(genre, logger(), V, undefined, PREV_TOKENS)

    expect(mocks.generateJson).not.toHaveBeenCalled()
    expect(result.style).toEqual(PREV_TOKENS.l1)
    expect(result.format.aspect_ratio).toBe('9:16')
    expect(result.format.resolution).toEqual({ width: 1080, height: 1920 })
    expect(result.format.medium).toBe('2d_animation')
  })

  // 왜: 같이 정한 것 — 전역 팔레트를 앞 화 값으로 고정해야 인물 시트 팔레트 칸 · 이후 Storyboard 색이 1화와 같다.
  it('앞 화 색 설계가 있으면 전역 팔레트 · 색 의미 · 효과 방식을 앞 화 값 그대로 쓰고 인물 강조색은 그 팔레트에서 고르라고 지시한다', async () => {
    mocks.generateJson.mockResolvedValue(llmDesign())
    const { worldVisual } = await runV2Design(IDENTITY, null as ActVisualArc | null, CHARACTERS, WORLD, '', logger(), V, 'ko', designContext('jp_anime'))

    expect(worldVisual.global_palette).toEqual(PREV_TOKENS.palette)
    expect(worldVisual.color_meaning).toEqual(PREV_TOKENS.color_meaning)
    expect(worldVisual.vfx_approach).toBe(PREV_TOKENS.vfx_approach)
    const [prompt] = mocks.generateJson.mock.calls[0]
    expect(prompt).toContain('[앞 화 색 설계')
    expect(prompt).toContain('Greyish Moss Green (#5B6B5C)')
    expect(prompt).toMatch(/인물 강조색[^\n]*이 팔레트에서/)
  })

  // 왜: 혼자 정한 것 — 정상 경로 고정. 보통 프로젝트는 지금처럼 색 설계를 새로 정한다.
  it('시리즈가 아닌 프로젝트는 색 설계를 새로 정하고 앞 화 지시를 싣지 않는다', async () => {
    mocks.generateJson.mockResolvedValue(llmDesign())

    const { worldVisual } = await runV2Design(IDENTITY, null, CHARACTERS, WORLD, '', logger(), V, 'ko', { scenes: SCENES })

    expect(worldVisual.global_palette.primary).toBe('#319795')
    expect(worldVisual.vfx_approach).toBe('새로 정한 효과')
    const [prompt] = mocks.generateJson.mock.calls[0]
    expect(prompt).not.toContain('[앞 화 색 설계')
    expect(prompt).not.toContain('[시리즈')
  })
})

describe('새 인물 · 배경을 앞 화와 같은 세계로', () => {
  // 왜: 같이 정한 것 — 운영 2화의 새 뱃사공이 삿갓 · 동양풍 작업복으로 나왔다. 그림 요청에 어느 세계인지가 빠져 있었다.
  it('Writer 입력에 앞 화 인물 외모 · 배경 설명을 같은 세계의 기준으로 싣는다', () => {
    expect(writerInput('watercolor').inheritedLooks).toEqual({
      characters: [{ name: '페른', appearance: '보라색 긴 머리, 검은 로브와 흰 블라우스' }],
      locations: [{ name: '야영지', description: '숲 가장자리의 밤 야영지, 모닥불' }],
    })
  })

  // 왜: 같이 정한 것 — 새 인물의 외모 글은 산문 단계(씬)에서 처음 생긴다. 거기서부터 같은 세계여야 한다.
  it('산문 지시에 새로 나오는 인물을 앞 화와 같은 세계의 모습으로 쓰라고 앞 화 인물 모습과 함께 싣는다', () => {
    const block = seriesBlock(writerInput('jp_anime'))
    expect(block).toContain('- 페른: 보라색 긴 머리, 검은 로브와 흰 블라우스')
    expect(block).toContain('- 야영지: 숲 가장자리의 밤 야영지, 모닥불')
    expect(block).toMatch(/새로 나오는 인물[^\n]*같은 세계 · 같은 시대 · 같은 문화권/)
  })

  // 왜: 같이 정한 것 — 의상 · 소품은 디자인 단계가 정한다. 같은 세계 기준이 여기에도 있어야 한다.
  it('인물 · 배경 디자인 지시에 앞 화 인물 · 배경 모습을 주고 같은 세계 · 시대 · 문화권으로 만들라고 지시한다', async () => {
    mocks.generateJson.mockResolvedValue(llmDesign())
    await runV2Design(IDENTITY, null, CHARACTERS, WORLD, '', logger(), V, 'ko', designContext('watercolor'))

    const [prompt] = mocks.generateJson.mock.calls[0]
    expect(prompt).toContain('[시리즈 · 앞 화와 같은 세계]')
    expect(prompt).toContain('「남겨진 마법」')
    expect(prompt).toContain('- 페른: 보라색 긴 머리, 검은 로브와 흰 블라우스')
    expect(prompt).toMatch(/같은 세계 · 같은 시대 · 같은 문화권/)
    // 그림체를 바꾼 화라 색 설계는 새로 정한다.
    expect(prompt).not.toContain('[앞 화 색 설계')
  })

  // 왜: 혼자 정한 것 — 앞 화 설명이 길면 지시가 불어난다. 한 사람 · 한 곳당 앞부분만 싣는다.
  it('앞 화 인물 외모 · 배경 설명은 240자까지만 싣는다', () => {
    const long = '가'.repeat(400)
    const raw = { ...SNAPSHOT, characters: [{ ...SNAPSHOT.characters[0], appearance: long }] }
    const series = seriesDesignInput(parseSeries(raw)!, 'jp_anime')
    expect(series.inheritedLooks?.characters[0].appearance.length).toBeLessThanOrEqual(241)
    expect(series.inheritedLooks?.characters[0].appearance.endsWith('…')).toBe(true)
  })
})

describe('배경 디자인은 나오는 씬의 시간대 · 날씨를 따른다', () => {
  // 왜: 같이 정한 것 — 운영 2화 나룻배가 "강 안개 속으로" 씬인데 구름 낀 맑은 대낮 · 노을로 그려졌다. 디자인 단계가 씬을 보지 못했다.
  it('배경마다 그 배경이 나오는 씬의 시간대 · 날씨 · 일어나는 일을 디자인 지시에 싣는다', async () => {
    const located = designLocations(WORLD.locations, SCENES)
    expect(located[0]).toMatchObject({ id: 'river_ferry_dock', scenes: [{ scene_id: 'scene_1', time_of_day: '새벽', weather: '짙은 안개' }] })
    expect(located[1].scenes.map((s) => s.scene_id)).toEqual(['scene_3', 'scene_4'])
    expect(located[1].scenes[0].what).toContain('강 안개 속으로 나룻배를 밀어 넣는다')

    mocks.generateJson.mockResolvedValue(llmDesign())
    await runV2Design(IDENTITY, null, CHARACTERS, WORLD, '', logger(), V, 'ko', { scenes: SCENES })
    const [prompt, , opts] = mocks.generateJson.mock.calls[0]
    expect(prompt).toContain(JSON.stringify(located, null, 2))
    // 왜: 씬에 없는 노을 · 맑은 하늘을 지어내면 같은 일이 되풀이된다.
    expect(opts.systemInstruction).toMatch(/처음 나오는 씬/)
    expect(opts.systemInstruction).toMatch(/씬에 없는 시간대 · 날씨/)
  })

  // 왜: 혼자 정한 것 — 어느 씬에도 안 나오는 배경(보관 · 이어받기만 한 곳)은 씬 칸을 빈 목록으로 둔다.
  it('어느 씬에도 안 나오는 배경은 씬 목록을 비워 둔다', () => {
    const located = designLocations([{ id: 'location_2', name: '야영지', description: '' }], SCENES)
    expect(located[0].scenes).toEqual([])
  })
})

describe('Writer 시작이 이 화 그림체를 보고 색 설계를 싣는다', () => {
  // 왜: 같이 정한 것 — 그림체를 바꿨는지는 [만들기]를 누른 그 순간 프로젝트에 저장된 그림체로 가린다.
  it('Writer 입력을 읽을 때 이 화 그림체가 앞 화와 같으면 색 설계를 싣는다', async () => {
    mocks.getActiveRun.mockResolvedValue(null)
    const project = { series: SNAPSHOT, reference_project_id: 'ep1', workspace_id: 'ws', style_anchor_key: 'jp_anime', custom_style_anchor: null }
    const prev = { id: 'ep1', workspace_id: 'ws' }
    let projectReads = 0
    mocks.from.mockImplementation((table: string) => chain(table === 'projects' ? [[project, prev][projectReads++ % 2]] : []))

    const input = await loadSeriesWriterInput('ep2')

    expect(input?.design.inheritedDesignTokens).toEqual(PREV_TOKENS)

    project.style_anchor_key = 'watercolor'
    const changed = await loadSeriesWriterInput('ep2')
    expect(changed?.design.inheritedDesignTokens).toBeUndefined()
  })
})

// 한 번의 조회 — maybeSingle 은 첫 행, 목록 조회는 전부. projects 는 읽는 순서대로(이 화 → 앞 화) 넣어 준다.
function chain(rows: unknown[]) {
  const query: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'order']) query[name] = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }))
  query.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
  return query
}
