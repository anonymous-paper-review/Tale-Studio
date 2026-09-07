// 카메라 동기 — 러프의 MOVEMENT 줄과 영상 계약문에 "왜"가 실린다 (2026-09-07)
import { describe, expect, it } from 'vitest'
import { buildRoughGridCell } from '@/lib/writer/rough-storyboard-grid'
import { compileMotionContract } from '@/lib/director/motion-contract'
import type { ShotDynamicSpec, ShotStaticSpec, StageCamera } from '@/lib/writer/types/pipeline'

const CAM: StageCamera = { x: 0, y: -8, z: 1.5, look_at: { x: 0, y: 0, z: 1.2 }, lens_mm: 35, hfov_deg: 54 }
const NAMES = new Map([['char', 'Dragon Chief'], ['char_2', 'Elf Chief'], ['char_3', 'Beast Chief']])

function spec(extra: Partial<ShotStaticSpec> = {}): ShotStaticSpec {
  return {
    shot_id: 'sh', lens_mm: 35, shot_type: 'MS', camera_angle: 'eye_level', depth_of_field: 'medium',
    framing: { rule: 'thirds', layers: {}, focal_point: 'the leaders' },
    lighting: { key_fill_ratio: '4:1', color_temp_kelvin: 5000, quality: 'soft', key_direction: 'top_left' },
    character_blocking: [{ character_id: 'char', position_in_frame: 'center_third', pose: 'standing', gaze: 'ahead', asset_version: 'v1' }],
    prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: '',
    screen_layout: { beat: 0, camera: CAM, characters: [], issues: [] },
    ...extra,
  }
}
function dyn(camera: ShotDynamicSpec['camera_motion']): ShotDynamicSpec {
  return { shot_id: 'sh', camera_motion: camera, character_motion: [], motion_prompt: '' }
}
function cell(staticSpec: ShotStaticSpec, dynamicSpec: ShotDynamicSpec) {
  return buildRoughGridCell(
    {
      shotType: 'MS',
      actionDescription: 'The dragon chief turns toward the voice.',
      characterNames: ['Dragon Chief'],
      characterNameById: NAMES,
      spec: { staticSpec, dynamicSpec },
      stageLandmarks: [{ id: 'inverted_tree', label: 'inverted tree', x: -8, y: 10 }],
      frameAspect: 16 / 9,
    },
    'sh',
  )
}

describe('러프 MOVEMENT 줄에 "왜"가 실린다', () => {
  it('리빌 팬은 "to reveal Elf Chief, who is outside the frame at the start" 를 단다', () => {
    const c = cell(spec(), dyn({ type: 'pan', direction: 'right', speed: 'medium', magnitude: 'moderate', motivation: 'reveal', target: 'char_2' }))
    expect(c.motion).toMatch(/camera pan right, medium — to reveal Elf Chief, who is outside the frame at the start/)
  })
  it('표지를 강조하는 dolly_in 은 표지 라벨로 "왜"를 단다', () => {
    const c = cell(spec(), dyn({ type: 'dolly_in', direction: 'forward', speed: 'slow', magnitude: 'moderate', motivation: 'emphasis', target: 'inverted_tree' }))
    expect(c.motion).toMatch(/to emphasize inverted tree — the audience must not miss it/)
  })
  it('시점 샷의 START 는 카메라가 누구의 눈인지 말하고 그 인물을 그리지 말라고 한다', () => {
    const c = cell(spec({ screen_layout: { beat: 0, camera: CAM, characters: [], issues: [], pov_of: 'char_3', off_frame: ['char_3'] } }), dyn({ type: 'handheld_drift', direction: 'none', speed: 'slow', magnitude: 'minimal', motivation: 'pov', target: 'char_3' }))
    expect(c.start).toMatch(/point-of-view shot: the camera is Beast Chief's eyes — Beast Chief is never visible/)
  })
})

describe('영상 계약문에 "왜"가 실린다', () => {
  it('카메라 절 바로 뒤에 Purpose 절이 붙고, 이름 맵이 있으면 대상 이름을 쓴다', () => {
    const contract = compileMotionContract(dyn({ type: 'pan', direction: 'right', speed: 'medium', magnitude: 'moderate', motivation: 'reveal', target: 'char_2' }), 5, { names: NAMES })
    expect(contract.text).toMatch(/Camera: pans steady[^.]*\. Rotation only — the camera does not travel\. [^.]*amplitude[^.]*\. Purpose: to reveal Elf Chief, who is outside the frame at the start\./)
  })
  it('동기가 없는 옛 샷은 계약문이 그대로다', () => {
    const contract = compileMotionContract(dyn({ type: 'pan', direction: 'right', speed: 'medium', magnitude: 'moderate' }), 5)
    expect(contract.text).not.toMatch(/Purpose:/)
  })
})
