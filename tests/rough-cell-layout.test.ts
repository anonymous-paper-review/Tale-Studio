// #stage(2026-09-03): 무대에서 계산된 화면 배치(screen_layout)가 러프 셀 문장에 실린다 —
//   위치·깊이·크기·향, 그리고 END 가 START 와 다르면 끝 배치까지.
import { describe, it, expect } from 'vitest'
import { buildRoughGridCell, describePlacement } from '@/lib/writer/rough-storyboard-grid'
import type { RoughStoryboardPromptInput } from '@/lib/writer/rough-storyboard'
import type { ShotStaticSpec, ScreenPlacement } from '@/lib/writer/types/pipeline'

const place = (over: Partial<ScreenPlacement>): ScreenPlacement => ({
  in_frame: true, screen_x: 0, screen_y: -0.6, distance_m: 4, apparent_height: 0.6,
  position_in_frame: 'center_third', depth_band: 'midground', facing: 'front', ...over,
})

function spec(): ShotStaticSpec {
  return {
    shot_id: 'shot_5', lens_mm: 35, shot_type: 'MS', camera_angle: 'eye_level', depth_of_field: 'medium',
    framing: { rule: 'thirds', layers: { midground: 'three leaders on floating ledges' }, focal_point: "the beast leader's open palms" },
    lighting: { key_fill_ratio: '8:1', color_temp_kelvin: 6000, quality: 'hard', key_direction: 'top_left' },
    character_blocking: [
      { character_id: 'char_3', position_in_frame: 'center_third', pose: 'walking with open palms', gaze: 'toward_camera', asset_version: 'v1' },
      { character_id: 'char_2', position_in_frame: 'frame_edge_left', pose: 'standing', gaze: 'away_from_camera', asset_version: 'v1' },
    ],
    prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: '',
    camera_setup: { subject: 'char_3', from_direction: 'S', height: 'eye', lens_mm: 35 },
    screen_layout: {
      beat: 3,
      camera: { x: 0, y: -2.4, z: 1.5, look_at: { x: 0, y: 5, z: 1.4 }, lens_mm: 35, hfov_deg: 54 },
      end_camera: { x: 0, y: -1.8, z: 1.5, look_at: { x: 0, y: 1.2, z: 1.4 }, lens_mm: 35, hfov_deg: 54 },
      characters: [
        { character_id: 'char_3', start: place({ apparent_height: 0.3, distance_m: 7.4, depth_band: 'background' }), end: place({ apparent_height: 0.95, distance_m: 3, depth_band: 'midground' }) },
        { character_id: 'char_2', start: place({ screen_x: -0.84, position_in_frame: 'frame_edge_left', depth_band: 'foreground', apparent_height: 1.4, facing: 'three_quarter_back_right' }), end: place({ screen_x: -0.9, position_in_frame: 'frame_edge_left', depth_band: 'foreground', apparent_height: 1.45, facing: 'three_quarter_back_right' }) },
      ],
      issues: [],
    },
  }
}

const input: RoughStoryboardPromptInput = {
  shotType: 'MS',
  actionDescription: 'char_3 approaches with palms out.',
  characterNames: ['수인 수장', '요정 수장'],
  spec: { staticSpec: spec(), dynamicSpec: { shot_id: 'shot_5', camera_motion: { type: 'tracking', direction: 'forward', speed: 'slow', magnitude: 'moderate' }, character_motion: [{ character_id: 'char_3', verb: 'walks toward the camera', magnitude: 'medium' }], motion_prompt: '' } },
}

describe('러프 셀 × 화면 배치', () => {
  it('START 문장에 계산된 위치·깊이·크기·향이 실린다', () => {
    const cell = buildRoughGridCell(input, 'shot_5')
    expect(cell.start).toContain('figure 1 in the center of the frame, in the background, small, far away, facing the camera')
    expect(cell.start).toContain('figure 2 at the far left edge of the frame, in the foreground, very close, cut by the frame (only part of the body in view), three-quarter back view, turned toward screen-right')
  })

  it('END 가 달라진 인물만 끝 배치를 적는다(수인은 다가와 커지고, 요정은 그대로)', () => {
    const cell = buildRoughGridCell(input, 'shot_5')
    expect(cell.end).toContain('Positions at END: figure 1 ends in the center of the frame, in the midground, large, filling most of the frame height, facing the camera')
    expect(cell.end).not.toContain('figure 2 ends')
  })

  it('screen_layout 이 없으면 옛 문장(LLM 위치 낱말) 그대로', () => {
    const noLayout = { ...input, spec: { staticSpec: { ...spec(), screen_layout: undefined } } }
    const cell = buildRoughGridCell(noLayout, 'shot_5')
    expect(cell.start).toContain('figure 1 at center third, walking with open palms')
    expect(cell.end).not.toContain('Positions at END')
  })

  it('describePlacement 낱말', () => {
    expect(describePlacement(place({ position_in_frame: 'right_third', depth_band: 'midground', apparent_height: 0.5, facing: 'profile_left' }))).toBe('in the right third of the frame, in the midground, mid-size, whole body in view, in profile, facing screen-left')
    expect(describePlacement(place({ apparent_height: 0.1, facing: 'back' }))).toContain('tiny in the distance, seen from behind')
  })
})
