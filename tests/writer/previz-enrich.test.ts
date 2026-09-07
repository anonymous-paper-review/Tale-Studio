// 러프 그림의 빛과 초점을 정확히 보여주고, 정보가 없는 칸에는 불필요한 지시를 넣지 않는다 (#previz-enrich ①+③, 2026-08-07)
// previz 정보 강화(#previz-enrich ①+③, 2026-08-07) 회귀 — lab/viz-gap previz A/B 검증 후 이관.
//   계약: rich(staticSpec) 셀은 ③빛·초점 스케치 지시(START/END) + ①DIRECTION 기술 라벨을 싣고,
//   fallback(스펙 없음) 셀은 기존 그대로(라벨·해칭 지시 없음).
import { describe, it, expect } from 'vitest'
import { buildRoughGridCell, buildRoughGridPrompt } from '@/lib/writer/rough-storyboard-grid'
import type { RoughStoryboardPromptInput } from '@/lib/writer/rough-storyboard'
import type { ShotStaticSpec } from '@/lib/writer/types/pipeline'

function staticSpec(over: Partial<ShotStaticSpec> = {}): ShotStaticSpec {
  return {
    shot_id: 'sh_01_01',
    lens_mm: 35,
    shot_type: 'WS',
    camera_angle: 'eye_level',
    depth_of_field: 'shallow',
    framing: {
      rule: 'thirds',
      layers: { midground: 'a girl pulling a shard from a dune' },
      focal_point: 'the girl straining against the shard',
    },
    lighting: {
      key_fill_ratio: '4:1',
      color_temp_kelvin: 3500,
      quality: 'soft',
      key_direction: 'top_right',
    },
    character_blocking: [
      { character_id: 'char', position_in_frame: 'center', pose: 'crouching', gaze: 'down', asset_version: 'v1' },
    ],
    prop_placement: [],
    palette_emphasis: [],
    texture_notes: '',
    color_grading_intent: '',
    first_frame_prompt: '',
    ...over,
  }
}

function richInput(over: Partial<RoughStoryboardPromptInput> = {}): RoughStoryboardPromptInput {
  return {
    shotType: 'WS',
    actionDescription: 'A girl pulls a rusted shard from the dune.',
    characterNames: ['소녀'],
    durationSeconds: 6,
    spec: { staticSpec: staticSpec() },
    ...over,
  }
}

describe('스케치에 빛과 초점을 표시한다 (③)', () => {
  it('빛과 초점이 정해져 있으면 시작 그림에 그 방향과 세부를 함께 안내한다', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    expect(cell.start).toContain('lit from top right')
    expect(cell.start).toContain('directional pencil hatching')
    expect(cell.start).toContain('cast shadows toward the lower-left')
    expect(cell.start).toContain('soft feathered shadow edges')
    expect(cell.start).toContain('densest, sharpest line detail')
    expect(cell.start).toContain('shallow focus') // DoF → 배경 느슨하게
  })

  it('끝 그림에도 시작 그림과 같은 빛과 초점을 안내한다', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    expect(cell.end).toContain('lighting and focus (draw these into the sketch)')
    expect(cell.end).toContain('lit from top right')
  })

  it('빛이 강하면 그림자 가장자리를 또렷하게 안내한다', () => {
    const spec = staticSpec({ lighting: { key_fill_ratio: '8:1', color_temp_kelvin: 6500, quality: 'hard', key_direction: 'side_left' } })
    const cell = buildRoughGridCell(richInput({ spec: { staticSpec: spec } }), 'x')
    expect(cell.start).toContain('crisp hard-edged shadow edges')
    expect(cell.start).toContain('cast shadows toward the right')
  })
})

describe('DIRECTION 줄에 촬영 정보를 표시한다 (①)', () => {
  it('촬영 방향 줄에 카메라와 빛 정보를 함께 표시한다', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    // #fixed-crop(2026-08-17): 라벨은 템플릿이 내장한 캡션 스트립 안에만 — 고정 좌표 크롭과 한 몸.
    expect(cell.motion).toContain('compact caption block')
    expect(cell.motion).toContain('never write outside the panel')
    expect(cell.motion).toContain('"KEY: top right, soft"')
    expect(cell.motion).toContain('35mm')
    expect(cell.motion).toContain('shallow focus')
    expect(cell.motion).toContain('"FOCUS: the girl straining again\u2026"') // 24자 클립 — 스트립 용량 계약(#fixed-crop)
    expect(cell.motion).toContain('"WARM 3500K"') // 색온도 — 흑백 previz 의 유일한 색 통로
  })

  it('빛의 색이 차갑거나 중간이면 COOL·NEUTRAL로 구분해 표시한다', () => {
    const cool = staticSpec({ lighting: { key_fill_ratio: '2:1', color_temp_kelvin: 6500, quality: 'soft', key_direction: 'top' } })
    expect(buildRoughGridCell(richInput({ spec: { staticSpec: cool } }), 'x').motion).toContain('"COOL 6500K"')
    const neutral = staticSpec({ lighting: { key_fill_ratio: '2:1', color_temp_kelvin: 4500, quality: 'soft', key_direction: 'top' } })
    expect(buildRoughGridCell(richInput({ spec: { staticSpec: neutral } }), 'x').motion).toContain('"NEUTRAL 4500K"')
  })

  it('카메라가 멈춘 장면에도 촬영 정보를 함께 표시한다', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01') // dynamicSpec 없음 → static hold
    expect(cell.motion).toContain('static hold')
    expect(cell.motion).toContain('KEY:')
  })
})

describe('같은 인물을 두 번 그리지 않는다 (#figure-dedup)', () => {
  it('같은 인물을 가리키는 설명은 하나로 묶고 화면 밖 인물은 그리지 않게 한다', () => {
    // 실측 e1a9fd08 sh_03_17: "figure 1"(익명 목각)과 레이어 "갑옷 추적자들"을 별개로 해석해
    //   맨몸 인형이 추가로 그려짐(주인공으로 오독). 같은 대상임을 못박아 이중 표현을 차단.
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    expect(cell.start).toContain('SAME subjects')
    expect(cell.start).toContain('no plain duplicate mannequin')
    expect(cell.start).toContain('OFF-SCREEN')
  })

  it('촬영 정보가 없어도 인물 수를 하나로 지키고 다른 사람은 그리지 않게 한다 (#split-spec)', () => {
    const cell = buildRoughGridCell(richInput({ spec: null }), 'sh_01_01')
    expect(cell.start).toContain('exactly 1 figure')
    expect(cell.start).toContain('do not draw any other people')
    expect(cell.start).not.toContain('SAME subjects') // 레이어 없는 셀엔 불필요
  })
})

describe('촬영 정보가 없는 칸은 기존 방식으로 만든다', () => {
  it('촬영 정보가 없는 칸에는 빛 안내나 촬영 표기를 넣지 않는다', () => {
    const cell = buildRoughGridCell(richInput({ spec: null }), 'sh_01_01')
    expect(cell.start).not.toContain('pencil hatching')
    expect(cell.start).not.toContain('draw these into the sketch')
    expect(cell.motion).not.toContain('technical labels')
    expect(cell.motion).not.toContain('KEY:')
    expect(cell.end).not.toContain('lighting and focus')
  })
})

describe('그림 안내 문구의 규칙을 지킨다', () => {
  it('그림 안내의 금지 규칙에서도 DIRECTION 줄의 촬영 표기는 허용한다', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    const prompt = buildRoughGridPrompt([cell], 'grid4')
    expect(prompt).toContain('technical margin labels')
    expect(prompt).not.toMatch(/except the DIRECTION row's arrow labels\.$/m)
  })
})
