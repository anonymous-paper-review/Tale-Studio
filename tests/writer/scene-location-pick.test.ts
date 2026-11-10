// 무대 · 데쿠파주 · 샷 단계는 씬 장소와 같은 장소만 모델에게 보여 주고, 이름이 겹칠 뿐인 장소는 싣지 않는다 (리드 2026-11-10 B1 이어서)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateJsonMock = vi.fn()

vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: (...args: unknown[]) => generateJsonMock(...args),
  describeAxisConfig: () => 'stub-model',
}))

import { sceneLocations } from '@/lib/writer/pipeline/util/scene-locations'
import { runSceneStage } from '@/lib/writer/pipeline/stages/v3s_stage'
import { runDecoupage } from '@/lib/writer/pipeline/stages/decoupage'
import { runShotDesign } from '@/lib/writer/pipeline/stages/v4_shots'
import { preservedScript, scenesFromScript } from '@/lib/writer/script/preserve'
import { castContractToCharacters } from '@/lib/writer/cast-contract'
import type { PipelineLogger } from '@/lib/writer/logger'

const loc = (id: string, name = id, look = `${id} look`) => ({ id, name, style_description: look, lighting_sources: [], props: [] })
const ids = (list: Array<{ id: string }>) => list.map((l) => l.id)

// 11/10 영어 점검(C03) 시험 대본의 1씬(이 시험을 위해 지은 글, 실제 작품 아님).
const SCRIPT = `EXT. COUNTRY BUS STOP - NIGHT
Rain falls on an empty bus stop under a single streetlight.

MAYA: No, no, no...

EXT. COUNTRY ROAD - CONTINUOUS
An old bus slows down.

DRIVER: I always wait two minutes for the rain.

INT. BUS - CONTINUOUS
Maya sits by the window.

MAYA: Thank you.`

const logger = {
  markStage: vi.fn(async () => {}),
  saveStage: vi.fn(async () => {}),
  saveLlmCall: vi.fn(async () => {}),
  flushRawLlm: vi.fn(async () => {}),
} as unknown as PipelineLogger
const axis = { provider: 'gemini', model: 'stub' } as never

beforeEach(() => {
  generateJsonMock.mockReset()
})

describe('같이 정한 것', () => {
  // 왜: B1 고침으로 대본 그대로 배경이 생기자 "COUNTRY BUS STOP" 씬의 무대 · 샷 지시에 "BUS"(버스 안) 디자인이 같이 실렸다.
  //   모델이 그 씬 샷에 버스 안을 배경으로 붙이면 Director 기준 그림이 틀어진다(리드 2026-11-10).
  it('무대 · 데쿠파주 · 샷 단계는 씬 장소와 같은 장소만 모델에게 보여 주고, 이름이 씬 장소 안에 들어 있을 뿐인 장소(COUNTRY BUS STOP 안의 BUS)는 싣지 않는다', async () => {
    const preserved = preservedScript({ story: SCRIPT, preserveScript: true })!
    const all = scenesFromScript(preserved.doc)
    const scenes = { ...all, scenes: [all.scenes[0]] }
    const characters = castContractToCharacters(preserved.cast)
    const worldVisual = {
      global_palette: { primary: '', secondary: '', accent: '', forbidden: [] },
      color_meaning: {},
      locations: [
        loc('COUNTRY BUS STOP', 'COUNTRY BUS STOP', 'rain-soaked shelter under one streetlight'),
        loc('COUNTRY ROAD', 'COUNTRY ROAD', 'wet two-lane road'),
        loc('BUS', 'BUS', 'warm bus interior with vinyl seats'),
      ],
      vfx_approach: '',
    }
    const decoupage = { scenes: [{ scene_id: 'scene_1', shots: [{ shot_id: 'shot_1', operation: 'derived', shot_function: 'action', shot_size: 'WS', intended_duration_seconds: 4, source_beats: [0], camera_intent: 'static', rhythm_role: 'establish', dramatic_purpose: 'p', beat_summary: 's' }] }] }
    const prompts: string[] = []
    generateJsonMock.mockImplementation(async (prompt: string) => {
      prompts.push(prompt)
      return null
    })

    const stagePrompts = async (run: () => Promise<unknown>) => {
      prompts.length = 0
      await run().catch(() => undefined)
      return [...prompts]
    }
    const genre = { genre: 'drama', tone: ['quiet'], targetEmotion: ['relief'] }
    const byStage = {
      stage: await stagePrompts(() => runSceneStage(characters, scenes as never, worldVisual, null, decoupage as never, logger, axis)),
      decoupage: await stagePrompts(() => runDecoupage(genre as never, characters, scenes as never, worldVisual, null, logger, axis)),
      shots: await stagePrompts(() => runShotDesign(genre as never, characters, scenes as never, { style: {} } as never, worldVisual, { characters: [] } as never, null, decoupage as never, '', logger, axis)),
    }

    for (const [stage, sent] of Object.entries(byStage)) {
      expect(sent.length, stage).toBeGreaterThan(0)
      for (const prompt of sent) {
        expect(prompt, stage).toContain('rain-soaked shelter under one streetlight')
        expect(prompt, stage).not.toContain('warm bus interior with vinyl seats')
        expect(prompt, stage).not.toContain('wet two-lane road')
      }
    }
  })
})

describe('혼자 정한 것', () => {
  const COUNTRY = [loc('COUNTRY BUS STOP'), loc('COUNTRY ROAD'), loc('BUS')]

  // 왜: 장면 머리 줄을 통째로 장소로 옮긴 씬이나 모델이 표기를 덧붙인 씬("kitchen (부엌)" · 2026 E13 실측)도 장소를 잃으면 안 된다.
  it('씬 장소에 장면 머리 표시 · 시간 꼬리 · 덧붙인 설명이 붙어 있어도(INT. BUS - CONTINUOUS · COUNTRY BUS STOP - NIGHT · kitchen (부엌)) 그 장소를 고른다', () => {
    expect(ids(sceneLocations(COUNTRY, 'INT. BUS - CONTINUOUS'))).toEqual(['BUS'])
    expect(ids(sceneLocations(COUNTRY, 'COUNTRY BUS STOP - NIGHT'))).toEqual(['COUNTRY BUS STOP'])
    expect(ids(sceneLocations(COUNTRY, 'EXT. COUNTRY ROAD \u2014 CONTINUOUS'))).toEqual(['COUNTRY ROAD'])
    expect(ids(sceneLocations([loc('kitchen', '부엌'), loc('kitchen_table')], 'kitchen (부엌)'))).toEqual(['kitchen'])
    expect(ids(sceneLocations([loc('kitchen', '부엌'), loc('kitchen_table')], 'kitchen: 아침 햇살'))).toEqual(['kitchen'])
  })

  // 왜: 대본이 아닌 흐름도 같은 고르기를 쓴다. 예전엔 bus_stop 씬에 bus 디자인까지 실렸다(이름이 겹칠 뿐인 다른 장소). 같은 번호는 지금처럼 고른다.
  it('AI 가 지은 장소 번호(bus · bus_stop)는 씬 장소와 번호가 같은 것만 고른다', () => {
    const slugs = [loc('bus', 'Bus'), loc('bus_stop', 'Bus stop'), loc('bus_depot', 'Bus depot')]

    expect(ids(sceneLocations(slugs, 'bus_stop'))).toEqual(['bus_stop'])
    expect(ids(sceneLocations(slugs, 'bus'))).toEqual(['bus'])
  })

  // 왜: 대본이 아닌 흐름의 새 장소는 번호 대신 사용자 언어의 이름 그대로가 번호다(s3 지시 "편의점 앞"). 버스 정류장 씬에 버스를 싣지 않는다.
  it('한국어 장소 이름도 같은 규칙으로 고른다(버스 정류장 씬에 버스를 싣지 않고, 편의점(밤) 씬은 편의점을 고른다)', () => {
    const korean = [loc('버스'), loc('버스 정류장'), loc('편의점'), loc('편의점 앞')]

    expect(ids(sceneLocations(korean, '버스 정류장'))).toEqual(['버스 정류장'])
    expect(ids(sceneLocations(korean, '편의점(밤)'))).toEqual(['편의점'])
    expect(ids(sceneLocations(korean, '편의점 앞'))).toEqual(['편의점 앞'])
  })

  // 왜: 모델이 장소 번호 대신 표시 이름이나 대소문자만 다르게 적으면 예전엔 아무 장소도 못 골랐다(글자 포함은 대소문자를 가린다).
  it('씬 장소가 장소 번호 대신 표시 이름이나 대소문자만 다르게 적혀 있어도 그 장소를 고른다', () => {
    const slugs = [loc('bus', 'Bus'), loc('bus_stop', 'Bus stop'), loc('kitchen', 'Kitchen')]

    expect(ids(sceneLocations(slugs, 'Bus stop'))).toEqual(['bus_stop'])
    expect(ids(sceneLocations(slugs, 'KITCHEN'))).toEqual(['kitchen'])
    expect(ids(sceneLocations(slugs, 'bus stop'))).toEqual(['bus_stop'])
  })

  // 왜: 검토 c 낮음 A(fe72b661). 앞부분 맞추기만 보면 뒷말이 중심말인 이름을 놓치거나(old_warehouse · 시골 버스 정류장) 다르게 골랐다
  //   (hospital_rooftop → hospital, 목록에 없는 BUS TERMINAL → BUS). 이름의 중심은 끝말이라 끝으로 맞는 장소를 고르고, 앞으로 맞는 장소는 뒤에 붙은 말이
  //   시간(bus_stop_night 의 night)일 때만 그 장소의 한때로 본다. 리드 지시(2026-11-10)로 예전 문장 "씬 장소와 같은 장소가 없으면, 씬 장소가 그 이름으로
  //   시작하는 장소 중 가장 긴 하나만 고른다"를 고쳤다.
  it('씬 장소와 같은 장소가 없으면 씬 장소가 그 이름으로 끝나는 장소를 고르고, 그 이름으로 시작하는 장소는 뒤에 붙은 말이 시간일 때만 고른다(여럿이면 가장 긴 하나, 같은 길이로 여럿이면 싣지 않는다)', () => {
    const slugs = [loc('bus'), loc('bus_stop'), loc('bus_depot')]

    expect(ids(sceneLocations(slugs, 'bus_stop_night'))).toEqual(['bus_stop'])
    expect(ids(sceneLocations([loc('warehouse')], 'old_warehouse'))).toEqual(['warehouse'])
    expect(ids(sceneLocations([loc('버스'), loc('버스 정류장')], '시골 버스 정류장'))).toEqual(['버스 정류장'])
    expect(ids(sceneLocations([loc('rooftop'), loc('hospital')], 'hospital_rooftop'))).toEqual(['rooftop'])
    expect(ids(sceneLocations([loc('COUNTRY BUS STOP'), loc('BUS')], 'BUS TERMINAL'))).toEqual([])
    expect(ids(sceneLocations([loc('편의점'), loc('편의점 앞')], '편의점 앞 골목'))).toEqual([])
    expect(ids(sceneLocations([loc('편의점')], '편의점 앞'))).toEqual(['편의점'])
    expect(ids(sceneLocations([loc('warehouse_a', 'warehouse'), loc('warehouse_b', 'warehouse')], 'old warehouse'))).toEqual([])
    expect(ids(sceneLocations([loc('warehouse'), loc('old warehouse district')], 'old warehouse'))).toEqual(['warehouse'])
  })

  // 왜: 검토 c 낮음 B(fe72b661). 괄호 · 쌍점 메모를 떼고 견주면 "Cafe (Old Town)" · "Cafe (New Town)"처럼 다른 장소가 같은 이름이 되어 둘 다 실렸다.
  it('장면 머리 표시 · 시간 꼬리를 떼고 같은 장소가 여럿이면 덧붙인 설명까지 견줘 하나로 좁히고, 그래도 여럿이면 싣지 않는다', () => {
    const cafes = [loc('Cafe (Old Town)'), loc('Cafe (New Town)')]
    const schools = [loc('학교 (1층)'), loc('학교 (옥상)')]

    expect(ids(sceneLocations(cafes, 'Cafe (Old Town) - NIGHT'))).toEqual(['Cafe (Old Town)'])
    expect(ids(sceneLocations(schools, 'INT. 학교 (옥상) - 밤'))).toEqual(['학교 (옥상)'])
    expect(sceneLocations(cafes, 'Cafe - NIGHT')).toEqual([])
    expect(ids(sceneLocations([loc('kitchen', '부엌'), loc('kitchen_table')], 'kitchen (부엌)'))).toEqual(['kitchen'])
  })

  // 왜: 씬 장소와 이어지지 않는 디자인(이름 가운데에 겹치는 말이 있을 뿐인 장소)을 보여 주면 모델이 그 장소를 배경으로 붙인다. 모르면 싣지 않는다.
  it('씬 장소와 이어지는 장소가 없으면 장소를 싣지 않는다', () => {
    const slugs = [loc('bus'), loc('bus_stop')]

    expect(sceneLocations(slugs, 'old_bus_depot')).toEqual([])
    expect(sceneLocations(slugs, '')).toEqual([])
    expect(sceneLocations(slugs, undefined)).toEqual([])
  })
})
