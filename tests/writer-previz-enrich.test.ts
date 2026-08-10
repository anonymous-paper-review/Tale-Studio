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

describe('previz 강화 ③ — 스케치에 빛·초점', () => {
  it('START 에 조명 방향 해칭 + 그림자 반대 방향 + 초점 디테일 지시가 실린다', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    expect(cell.start).toContain('lit from top right')
    expect(cell.start).toContain('directional pencil hatching')
    expect(cell.start).toContain('cast shadows toward the lower-left')
    expect(cell.start).toContain('soft feathered shadow edges')
    expect(cell.start).toContain('densest, sharpest line detail')
    expect(cell.start).toContain('shallow focus') // DoF → 배경 느슨하게
  })

  it('END 에도 동일 조명·초점 지시가 실린다(같은 조명 셋업 유지)', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    expect(cell.end).toContain('lighting and focus (draw these into the sketch)')
    expect(cell.end).toContain('lit from top right')
  })

  it('hard 조명은 crisp 엣지로 서술한다', () => {
    const spec = staticSpec({ lighting: { key_fill_ratio: '8:1', color_temp_kelvin: 6500, quality: 'hard', key_direction: 'side_left' } })
    const cell = buildRoughGridCell(richInput({ spec: { staticSpec: spec } }), 'x')
    expect(cell.start).toContain('crisp hard-edged shadow edges')
    expect(cell.start).toContain('cast shadows toward the right')
  })
})

describe('previz 강화 ① — DIRECTION 기술 라벨', () => {
  it('KEY/카메라/FOCUS/색온도 라벨을 DIRECTION(motion)에 싣는다', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    expect(cell.motion).toContain('handwritten technical labels')
    expect(cell.motion).toContain('"KEY: top right, soft"')
    expect(cell.motion).toContain('35mm')
    expect(cell.motion).toContain('shallow focus')
    expect(cell.motion).toContain('"FOCUS: the girl straining against the shard"')
    expect(cell.motion).toContain('"WARM 3500K"') // 색온도 — 흑백 previz 의 유일한 색 통로
  })

  it('색온도 버킷: 5500K 초과는 COOL, 4000~5500 은 NEUTRAL', () => {
    const cool = staticSpec({ lighting: { key_fill_ratio: '2:1', color_temp_kelvin: 6500, quality: 'soft', key_direction: 'top' } })
    expect(buildRoughGridCell(richInput({ spec: { staticSpec: cool } }), 'x').motion).toContain('"COOL 6500K"')
    const neutral = staticSpec({ lighting: { key_fill_ratio: '2:1', color_temp_kelvin: 4500, quality: 'soft', key_direction: 'top' } })
    expect(buildRoughGridCell(richInput({ spec: { staticSpec: neutral } }), 'x').motion).toContain('"NEUTRAL 4500K"')
  })

  it('정적 샷도 라벨은 실린다(static hold 유지 + 라벨 병기)', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01') // dynamicSpec 없음 → static hold
    expect(cell.motion).toContain('static hold')
    expect(cell.motion).toContain('KEY:')
  })
})

describe('인물 이중 표현 가드(#figure-dedup)', () => {
  it('blocking+레이어 셀은 동일 대상 명시 + moment 만 언급된 인물 off-screen 금지를 싣는다', () => {
    // 실측 e1a9fd08 sh_03_17: "figure 1"(익명 목각)과 레이어 "갑옷 추적자들"을 별개로 해석해
    //   맨몸 인형이 추가로 그려짐(주인공으로 오독). 같은 대상임을 못박아 이중 표현을 차단.
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    expect(cell.start).toContain('SAME subjects')
    expect(cell.start).toContain('no plain duplicate mannequin')
    expect(cell.start).toContain('OFF-SCREEN')
  })

  it('스펙 없는 fallback 셀은 기존 인원수 고정 가드를 유지한다(#split-spec)', () => {
    const cell = buildRoughGridCell(richInput({ spec: null }), 'sh_01_01')
    expect(cell.start).toContain('exactly 1 figure')
    expect(cell.start).toContain('do not draw any other people')
    expect(cell.start).not.toContain('SAME subjects') // 레이어 없는 셀엔 불필요
  })
})

describe('fallback(스펙 없음) 경로는 기존 그대로', () => {
  it('해칭·라벨 지시가 전혀 실리지 않는다', () => {
    const cell = buildRoughGridCell(richInput({ spec: null }), 'sh_01_01')
    expect(cell.start).not.toContain('pencil hatching')
    expect(cell.start).not.toContain('draw these into the sketch')
    expect(cell.motion).not.toContain('technical labels')
    expect(cell.motion).not.toContain('KEY:')
    expect(cell.end).not.toContain('lighting and focus')
  })
})

describe('그리드 프롬프트 텍스트 규칙 정합', () => {
  it('말미 금지 조항이 DIRECTION 행의 기술 라벨을 정식 허용한다', () => {
    const cell = buildRoughGridCell(richInput(), 'sh_01_01')
    const prompt = buildRoughGridPrompt([cell], 'grid4')
    expect(prompt).toContain('technical margin labels')
    expect(prompt).not.toMatch(/except the DIRECTION row's arrow labels\.$/m)
  })
})
