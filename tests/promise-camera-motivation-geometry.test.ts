// 카메라 동기 — 리빌과 시점을 무대 기하가 검사한다 (2026-09-07)
//
//   reveal: camera_setup.end.subject 의 대상이 START 프레임 밖·END 프레임 안이어야 한다. END 에 없으면 코드가 END 카메라를
//   대상 쪽으로 돌린다. pov: camera_setup.pov_of 의 인물 눈에 카메라를 놓고 그 인물은 프레임에서 봉인한다. 문장 하나 = 테스트 하나.
import { describe, expect, it } from 'vitest'
import { applyStageToShots } from '@/lib/writer/pipeline/stage/apply'
import type { DecoupageShot, SceneStage, ShotDesign, ShotStaticSpec } from '@/lib/writer/types/pipeline'

// 축은 두지 않는다 — 축 보정(점 반사)이 카메라를 옮기면 리빌 대상이 START 에 들어와 검사 자체가 흐려진다. 리빌·시점 기하만 본다.
const STAGE: SceneStage = {
  scene_id: 'sc_01',
  unit: 'm',
  axis: null,
  camera_side: 'left',
  landmarks: [
    { id: 'inverted_tree', label: 'inverted tree', x: -8, y: 10 },
    { id: 'floating_rock_cluster', label: 'floating rock cluster', x: 10, y: 8 },
  ],
  beats: [
    {
      beat: 0,
      characters: [
        { character_id: 'char', x: -4.5, y: 3.5, facing_deg: 135, posture: 'standing' },
        { character_id: 'char_2', x: 4.5, y: -3.5, facing_deg: 315, posture: 'standing' },
        { character_id: 'char_3', x: -1.5, y: -5, facing_deg: 45, posture: 'sitting' },
      ],
      end_characters: [
        { character_id: 'char', x: -4.5, y: 3.5, facing_deg: 135, posture: 'standing' },
        { character_id: 'char_2', x: 4.5, y: -3.5, facing_deg: 315, posture: 'standing' },
        { character_id: 'char_3', x: -1.5, y: -2, facing_deg: 90, posture: 'walking' },
      ],
    },
  ],
} as SceneStage

function shot(id: string, shotType: string, setup: Record<string, unknown>, blocking: string[], camera: Record<string, unknown>): ShotDesign {
  return {
    intent: { shot_id: id, scene_id: 'sc_01', story_beat_ref: 0, dramatic_purpose: '', duration_seconds: 5, duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing' },
    static_spec: {
      shot_id: id, lens_mm: 35, shot_type: shotType, camera_angle: 'eye_level', depth_of_field: 'medium',
      framing: { rule: 'thirds', layers: {}, focal_point: '' }, lighting: { key_fill_ratio: '4:1', color_temp_kelvin: 5000, quality: 'soft', key_direction: 'top_left' },
      character_blocking: blocking.map((c) => ({ character_id: c, position_in_frame: 'center_third', pose: 'standing', gaze: 'ahead', asset_version: 'v1' })),
      prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: '',
      camera_setup: setup as unknown as ShotStaticSpec['camera_setup'],
    },
    dynamic_spec: { shot_id: id, camera_motion: camera as ShotDesign['dynamic_spec']['camera_motion'], character_motion: [], motion_prompt: '' },
  } as ShotDesign
}
const dec = (id: string, size: DecoupageShot['shot_size']): DecoupageShot => ({
  shot_id: id, scene_id: 'sc_01', operation: 'derived', shot_function: 'action', source_beats: [0], beat_summary: '', shot_size: size,
  intended_duration_seconds: 5, rhythm_role: 'develop', camera_intent: 'static', dramatic_purpose: '',
})
const NAMES = new Map([['char', 'Dragon Chief'], ['char_2', 'Elf Chief'], ['char_3', 'Beast Chief']])

describe('리빌 — 대상은 START 밖, END 안이어야 한다', () => {
  const shots = [
    shot('shot_1', 'MS', { subject: 'char_3', from_direction: 'S', height: 'eye', lens_mm: 35, over_shoulder_of: null, axis_cross: 'none', end: { subject: 'char_2' } }, ['char_3'],
      { type: 'pan', direction: 'right', speed: 'medium', magnitude: 'moderate', motivation: 'reveal', target: 'char_2' }),
  ]
  const result = applyStageToShots(shots, STAGE, [dec('shot_1', 'MS')], { format: 'horizontal_16:9', names: NAMES })
  const layout = result.shots[0].static_spec.screen_layout!

  it('요정은 START 프레임 밖에 있고, 코드가 END 카메라를 요정 쪽으로 돌려 END 프레임 안에 들인다', () => {
    expect(layout.reveal).toMatchObject({ target: 'char_2', in_start: false, in_end: true, resolved: true })
    expect(layout.end_camera).toBeDefined()
    // 팬은 제자리 회전 — 카메라 위치는 그대로, 시선만 요정에게.
    expect(layout.end_camera!.x).toBeCloseTo(layout.camera.x, 2)
    expect(layout.end_camera!.y).toBeCloseTo(layout.camera.y, 2)
    expect(layout.end_camera!.look_at.x).toBeCloseTo(4.5, 1)
    expect(layout.end_camera!.look_at.y).toBeCloseTo(-3.5, 1)
    const elf = layout.characters.find((c) => c.character_id === 'char_2')!
    expect(elf.start.in_frame).toBe(false)
    expect(elf.end!.in_frame).toBe(true)
  })

  it('리빌 대상이 START 프레임에 이미 있으면 드러남이 아니라고 알린다', () => {
    const wide = [
      shot('shot_w', 'EWS', { subject: 'group', from_direction: 'S', height: 'eye', lens_mm: 35, over_shoulder_of: null, axis_cross: 'none', end: { subject: 'char_2' } }, ['char', 'char_2', 'char_3'],
        { type: 'pan', direction: 'right', speed: 'medium', magnitude: 'moderate', motivation: 'reveal', target: 'char_2' }),
    ]
    const r = applyStageToShots(wide, STAGE, [dec('shot_w', 'EWS')], { format: 'horizontal_16:9', names: NAMES })
    expect(r.shots[0].static_spec.screen_layout!.reveal).toMatchObject({ target: 'char_2', in_start: true })
    expect(r.issues.some((i) => i.location === 'shot_w' && /START 프레임에 이미/.test(i.message))).toBe(true)
  })
})

describe('시점 — 카메라는 인물의 눈이고 그 인물은 프레임에 없다', () => {
  const shots = [
    shot('shot_p', 'POV', { subject: 'char_2', from_direction: 'S', height: 'eye', lens_mm: 35, over_shoulder_of: null, axis_cross: 'none', end: null, pov_of: 'char_3' }, ['char_2'],
      { type: 'handheld_drift', direction: 'none', speed: 'slow', magnitude: 'minimal', motivation: 'pov', target: 'char_3' }),
  ]
  const result = applyStageToShots(shots, STAGE, [dec('shot_p', 'POV')], { format: 'horizontal_16:9', names: NAMES })
  const layout = result.shots[0].static_spec.screen_layout!

  it('카메라가 수인의 자리·눈높이에 놓이고 수인의 향을 본다', () => {
    expect(layout.pov_of).toBe('char_3')
    expect(layout.camera.x).toBeCloseTo(-1.5, 2)
    expect(layout.camera.y).toBeCloseTo(-5, 2)
    expect(layout.camera.z).toBeGreaterThan(0.9)
    expect(layout.camera.z).toBeLessThan(1.8)
    // facing 45° 는 북동쪽 — look_at 이 카메라보다 북쪽·동쪽에 있다.
    expect(layout.camera.look_at.x).toBeGreaterThan(layout.camera.x)
    expect(layout.camera.look_at.y).toBeGreaterThan(layout.camera.y)
  })

  it('수인은 명단·배치에서 빠지고 "카메라 자신"이라는 제약이 붙으며, 비트 끝에 수인이 움직이면 END 카메라가 따라간다', () => {
    expect(layout.characters.some((c) => c.character_id === 'char_3')).toBe(false)
    expect(layout.off_frame ?? []).toContain('char_3')
    expect(result.shots[0].static_spec.character_blocking.some((b) => b.character_id === 'char_3')).toBe(false)
    const note = result.issues.find((i) => i.location === 'shot_p' && /point-of-view/.test(i.constraint ?? ''))
    expect(note?.constraint).toMatch(/Beast Chief \(char_3\) is the camera in this shot \(point-of-view\)/)
    expect(layout.end_camera).toBeDefined()
    expect(layout.end_camera!.y).toBeCloseTo(-2, 2)
  })
})
