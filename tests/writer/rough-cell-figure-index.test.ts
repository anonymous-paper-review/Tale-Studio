// #figure-index(2026-09-02): 러프 셀의 동작·시선 "figure N" 은 인물의 blocking 번호를 따른다.
//   실측 겨울_4(9ea9bd67) sh_01_28 — 옛 코드는 동작 목록 인덱스로 번호를 매겨 수인의 두 번째 동작이
//   figure 2(용족)에게 붙었고, 러프 END 에서 용족이 한 발 내딛는 그림이 나왔다.
import { describe, it, expect } from 'vitest'
import { buildRoughGridCell } from '@/lib/writer/rough-storyboard-grid'
import type { RoughStoryboardPromptInput } from '@/lib/writer/rough-storyboard'
import type { ShotStaticSpec, ShotDynamicSpec } from '@/lib/writer/types/pipeline'

function staticSpec(blocking: ShotStaticSpec['character_blocking']): ShotStaticSpec {
  return {
    shot_id: 'shot_5',
    lens_mm: 35,
    shot_type: 'MS',
    camera_angle: 'eye_level',
    depth_of_field: 'medium',
    framing: {
      rule: 'thirds',
      layers: { foreground: 'Char_3 on a floating ledge', midground: 'Char and char_2 on stone ledges', background: 'inverted roots' },
      focal_point: "Char_3's hands starting near chest level",
    },
    lighting: { key_fill_ratio: '8:1', color_temp_kelvin: 6000, quality: 'hard', key_direction: 'top_left' },
    character_blocking: blocking,
    prop_placement: [],
    palette_emphasis: [],
    texture_notes: '',
    color_grading_intent: '',
    first_frame_prompt: '',
  }
}

function dynamicSpec(over: Partial<ShotDynamicSpec>): ShotDynamicSpec {
  return {
    shot_id: 'shot_5',
    camera_motion: { type: 'static', direction: 'none', magnitude: 'minimal', speed: 'slow' },
    character_motion: [],
    environmental_change: [],
    transition_in: 'cut',
    transition_out: 'cut',
    ...over,
  } as ShotDynamicSpec
}

// 겨울_4 sh_01_28 의 실제 스펙(요약): blocking 순서 = 수인(char_3)·용족(char)·요정(char_2),
//   동작은 둘 다 수인의 것.
const SH_01_28: RoughStoryboardPromptInput = {
  shotType: 'MS',
  actionDescription: 'char_3 exhales a rough breath and slowly approaches char and char_2 with both palms turned outward.',
  characterNames: ['수인 수장', '용족 수장', '요정 수장'],
  characterNameById: new Map([['char_3', '수인 수장'], ['char', '용족 수장'], ['char_2', '요정 수장']]),
  spec: {
    staticSpec: staticSpec([
      { character_id: 'char_3', position_in_frame: 'center_third', pose: 'standing upright, hands near chest', gaze: 'toward_char', asset_version: 'v1' },
      { character_id: 'char', position_in_frame: 'right_third', pose: 'standing tensely with hand on ornament', gaze: 'toward_char_3', asset_version: 'v1' },
      { character_id: 'char_2', position_in_frame: 'left_third', pose: 'standing cautiously on a ledge', gaze: 'toward_char_3', asset_version: 'v1' },
    ]),
    dynamicSpec: dynamicSpec({
      camera_motion: { type: 'tracking', direction: 'forward', magnitude: 'moderate', speed: 'slow' },
      character_motion: [
        { character_id: 'char_3', verb: 'exhales heavily', magnitude: 'small' },
        { character_id: 'char_3', verb: 'steps forward showing palms', magnitude: 'medium' },
      ],
      gaze_arc: [{ character_id: 'char_3', from: 'toward_char', to: 'toward_char' }],
    }),
  },
}

describe('러프 셀 동작 번호 — 인물의 blocking 번호를 따른다 (#figure-index)', () => {
  it('sh_01_28 실측: 수인의 두 동작이 모두 figure 1 에 붙고, 용족(figure 2)은 동작을 받지 않는다', () => {
    const cell = buildRoughGridCell(SH_01_28, 'sh_01_28')
    expect(cell.motion).toContain('figure 1: exhales heavily (small)')
    expect(cell.motion).toContain('figure 1: steps forward showing palms (medium)')
    expect(cell.motion).not.toContain('figure 2:')
    expect(cell.end).toContain('figure 1: steps forward showing palms (medium)')
    expect(cell.end).not.toContain('figure 2:')
  })

  it('동작 목록 순서가 blocking 순서와 달라도 각 동작은 자기 인물의 번호를 받는다', () => {
    const input: RoughStoryboardPromptInput = {
      ...SH_01_28,
      spec: {
        staticSpec: SH_01_28.spec!.staticSpec,
        dynamicSpec: dynamicSpec({
          character_motion: [
            { character_id: 'char_2', verb: 'folds wings', magnitude: 'small' }, // blocking 3번째
            { character_id: 'char', verb: 'grips ornament', magnitude: 'small' }, // blocking 2번째
          ],
        }),
      },
    }
    const cell = buildRoughGridCell(input, 'x')
    expect(cell.motion).toContain('figure 3: folds wings (small)')
    expect(cell.motion).toContain('figure 2: grips ornament (small)')
    expect(cell.motion).not.toContain('figure 1:')
  })

  it('시선 arc 도 인물 번호를 달고 실린다', () => {
    const input: RoughStoryboardPromptInput = {
      ...SH_01_28,
      spec: {
        staticSpec: SH_01_28.spec!.staticSpec,
        dynamicSpec: dynamicSpec({ gaze_arc: [{ character_id: 'char', from: 'toward_char_3', to: 'far_left' }] }),
      },
    }
    const cell = buildRoughGridCell(input, 'x')
    expect(cell.motion).toContain('figure 2: blank head turns toward char 3 → far left')
  })

  it('blocking 에 없는 인물(START 계약상 화면 밖)의 동작은 싣지 않는다 — 유령 figure 금지', () => {
    const input: RoughStoryboardPromptInput = {
      ...SH_01_28,
      spec: {
        staticSpec: SH_01_28.spec!.staticSpec,
        dynamicSpec: dynamicSpec({
          character_motion: [
            { character_id: 'char_3', verb: 'exhales heavily', magnitude: 'small' },
            { character_id: 'char_9', verb: 'runs in from the forest', magnitude: 'large' },
          ],
        }),
      },
    }
    const cell = buildRoughGridCell(input, 'x')
    expect(cell.motion).toContain('figure 1: exhales heavily (small)')
    expect(cell.motion).not.toContain('runs in from the forest')
    expect(cell.motion).not.toContain('figure 4')
  })

  it('sh_01_29 실측: 인물이 하나뿐이면 두 동작 모두 figure 1 — 유령 figure 2 가 생기지 않는다', () => {
    const input: RoughStoryboardPromptInput = {
      shotType: 'MCU',
      actionDescription: 'char lets out a scoff, turns their head away, and stares at the forest.',
      characterNames: ['용족 수장'],
      characterNameById: new Map([['char', '용족 수장']]),
      spec: {
        staticSpec: staticSpec([
          { character_id: 'char', position_in_frame: 'left_third', pose: 'standing erect in ceremonial breastplate', gaze: 'right', asset_version: 'v1' },
        ]),
        dynamicSpec: dynamicSpec({
          character_motion: [
            { character_id: 'char', verb: 'snorts dismissively with a slight head tilt', magnitude: 'small' },
            { character_id: 'char', verb: 'turns head away to look toward the distant forest', magnitude: 'medium' },
          ],
          gaze_arc: [{ character_id: 'char', from: 'right', to: 'far_left' }],
        }),
      },
    }
    const cell = buildRoughGridCell(input, 'sh_01_29')
    expect(cell.motion).toContain('figure 1: snorts dismissively with a slight head tilt (small)')
    expect(cell.motion).toContain('figure 1: turns head away to look toward the distant forest (medium)')
    expect(cell.motion).toContain('figure 1: blank head turns right → far left')
    expect(cell.motion).not.toContain('figure 2')
  })

  it('인물이 하나뿐인 셀은 id 가 어긋나도 그 하나에 붙인다(모호하지 않다)', () => {
    const input: RoughStoryboardPromptInput = {
      shotType: 'CU',
      actionDescription: 'she looks up.',
      characterNames: ['소녀'],
      spec: {
        staticSpec: staticSpec([{ character_id: 'char_girl', position_in_frame: 'center', pose: 'kneeling', gaze: 'down', asset_version: 'v1' }]),
        dynamicSpec: dynamicSpec({ character_motion: [{ character_id: 'girl', verb: 'looks up', magnitude: 'small' }] }),
      },
    }
    expect(buildRoughGridCell(input, 'x').motion).toContain('figure 1: looks up (small)')
  })

  it('blocking 이 없는 폴백 셀은 characterNames 순서로 번호를 잇는다', () => {
    const input: RoughStoryboardPromptInput = {
      shotType: 'WS',
      actionDescription: 'two figures cross the bridge.',
      characterNames: ['A', 'B'],
      characterNameById: new Map([['char_a', 'A'], ['char_b', 'B']]),
      spec: {
        staticSpec: undefined as unknown as ShotStaticSpec,
        dynamicSpec: dynamicSpec({ character_motion: [{ character_id: 'char_b', verb: 'waves', magnitude: 'small' }] }),
      },
    }
    expect(buildRoughGridCell(input, 'x').motion).toContain('figure 2: waves (small)')
  })
})
