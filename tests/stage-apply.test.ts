// 무대 → 샷 적용(#stage 2026-09-03): 겨울_4 씬 1의 28·29·30 을 한 무대에서 풀면 좌우·시선이 일관되고,
//   프레임 밖 인물은 빠지고 들어온 인물은 추가되며, 위치 낱말은 LLM 값이 아니라 계산값이다.
import { describe, it, expect } from 'vitest'
import { applyStageToShots, beatForShot, stageStatesForBeat, defaultCameraSetup } from '@/lib/writer/pipeline/stage/apply'
import type { DecoupageShot, SceneStage, ShotDesign, ShotStaticSpec } from '@/lib/writer/types/pipeline'

const STAGE: SceneStage = {
  scene_id: 'scene_1',
  unit: 'm',
  landmarks: [{ id: 'forest', label: 'inverted forest', x: 0, y: 38 }],
  axis: { from: 'char_2', to: 'char' },
  camera_side: 'right',
  beats: [
    {
      beat: 3,
      characters: [
        { character_id: 'char_2', x: -1.3, y: 0.6, facing_deg: 27, posture: 'standing', height_m: 1.7 },
        { character_id: 'char', x: 1.3, y: 0.6, facing_deg: 333, posture: 'standing', height_m: 1.9 },
        { character_id: 'char_3', x: 0, y: 5, facing_deg: 180, posture: 'walking', height_m: 2.0, note: 'on a floating ledge' },
      ],
      end_characters: [
        { character_id: 'char_2', x: -1.3, y: 0.6, facing_deg: 27, posture: 'standing', height_m: 1.7 },
        { character_id: 'char', x: 1.3, y: 0.6, facing_deg: 333, posture: 'standing', height_m: 1.9 },
        { character_id: 'char_3', x: 0, y: 1.2, facing_deg: 180, posture: 'standing', height_m: 2.0 },
      ],
    },
    {
      beat: 5,
      characters: [
        { character_id: 'char_2', x: -1.3, y: 0.6, facing_deg: 0, posture: 'standing', height_m: 1.7 },
        { character_id: 'char', x: 1.3, y: 0.6, facing_deg: 0, posture: 'standing', height_m: 1.9 },
        { character_id: 'char_3', x: 0, y: 1.2, facing_deg: 0, posture: 'standing', height_m: 2.0 },
      ],
      end_characters: [
        { character_id: 'char_2', x: -2.2, y: 3.5, facing_deg: 0, posture: 'walking', height_m: 1.7 },
        { character_id: 'char', x: 2.2, y: 3.5, facing_deg: 0, posture: 'walking', height_m: 1.9 },
        { character_id: 'char_3', x: 0, y: 4.5, facing_deg: 0, posture: 'walking', height_m: 2.0 },
      ],
    },
  ],
}

function spec(over: Partial<ShotStaticSpec>): ShotStaticSpec {
  return {
    shot_id: 'x',
    lens_mm: 35,
    shot_type: 'MS',
    camera_angle: 'eye_level',
    depth_of_field: 'medium',
    framing: { rule: 'thirds', layers: {}, focal_point: '' },
    lighting: { key_fill_ratio: '8:1', color_temp_kelvin: 6000, quality: 'hard', key_direction: 'top_left' },
    character_blocking: [],
    prop_placement: [],
    palette_emphasis: [],
    texture_notes: '',
    color_grading_intent: '',
    first_frame_prompt: '',
    ...over,
  }
}
function shot(id: string, st: Partial<ShotStaticSpec>, cam: { type: string; direction?: string } = { type: 'static' }): ShotDesign {
  return {
    intent: { shot_id: id, scene_id: 'scene_1', story_beat_ref: 0, dramatic_purpose: '', duration_seconds: 5, duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing' },
    static_spec: spec({ shot_id: id, ...st }),
    dynamic_spec: { shot_id: id, camera_motion: { type: cam.type as never, direction: cam.direction, speed: 'slow', magnitude: 'moderate' }, character_motion: [], motion_prompt: '' },
  }
}
const dec = (shot_id: string, source_beats: number[]): DecoupageShot => ({
  shot_id, scene_id: 'scene_1', operation: source_beats.length ? 'derived' : 'added', shot_function: 'action', source_beats,
  beat_summary: '', shot_size: 'MS', intended_duration_seconds: 5, rhythm_role: 'develop', camera_intent: 'static', dramatic_purpose: '',
})

const SHOT_28 = shot('shot_5', {
  shot_type: 'MS',
  camera_setup: { subject: 'char_3', from_direction: 'S', height: 'eye', lens_mm: 35 }, // 북쪽 5m 의 수인을 남쪽에서 → 카메라가 축 북쪽에 놓인다
  character_blocking: [
    { character_id: 'char_3', position_in_frame: 'left_third', pose: 'walking, palms out', gaze: 'toward_camera', asset_version: 'v1' },
    { character_id: 'char', position_in_frame: 'left_third', pose: 'standing', gaze: 'toward_char_3', asset_version: 'v1' },
    { character_id: 'char_2', position_in_frame: 'right_third', pose: 'standing', gaze: 'toward_char_3', asset_version: 'v1' },
  ],
}, { type: 'tracking', direction: 'forward' })
const SHOT_29 = shot('shot_6', {
  shot_type: 'MCU',
  lens_mm: 85,
  camera_setup: { subject: 'char', from_direction: 'S', height: 'eye', lens_mm: 85 },
  character_blocking: [
    { character_id: 'char', position_in_frame: 'left_third', pose: 'standing erect', gaze: 'right', asset_version: 'v1' },
    { character_id: 'char_3', position_in_frame: 'center_third', pose: 'standing', gaze: 'toward_char', asset_version: 'v1' }, // 기하상 프레임 밖 → 빠져야 한다
  ],
})
const SHOT_30 = shot('shot_7', {
  shot_type: 'WS',
  camera_setup: { subject: 'group', from_direction: 'S', height: 'eye', lens_mm: 35 },
  character_blocking: [
    { character_id: 'char', position_in_frame: 'left_third', pose: 'standing', gaze: 'toward_background', asset_version: 'v1' },
    { character_id: 'char_2', position_in_frame: 'center_third', pose: 'standing', gaze: 'toward_background', asset_version: 'v1' },
    { character_id: 'char_3', position_in_frame: 'right_third', pose: 'standing', gaze: 'toward_background', asset_version: 'v1' },
  ],
})
const DEC = [dec('shot_5', [3]), dec('shot_6', [4]), dec('shot_7', [5])]

describe('비트 잇기', () => {
  it('데쿠파주 source_beats 첫 값, 없으면(added) 직전 비트', () => {
    expect(beatForShot(SHOT_28, DEC[0], 0)).toBe(3)
    expect(beatForShot(SHOT_28, dec('shot_x', []), 4)).toBe(4)
  })
  it('없는 비트는 직전 비트의 끝 상태로 잇는다', () => {
    const s = stageStatesForBeat(STAGE, 4)
    expect(s.beatUsed).toBe(3)
    expect(s.start.find((c) => c.character_id === 'char_3')!.y).toBe(1.2)
    expect(s.end).toBe(s.start)
  })
})

describe('applyStageToShots — 겨울_4 씬 1', () => {
  const { shots, issues } = applyStageToShots([SHOT_28, SHOT_29, SHOT_30], STAGE, DEC, { format: 'horizontal_16:9' })
  const by = (id: string) => shots.find((s) => s.intent.shot_id === id)!.static_spec
  const pos = (id: string, c: string) => by(id).character_blocking.find((b) => b.character_id === c)?.position_in_frame

  it('28: 수인 앞(축 북쪽)에 놓인 카메라는 축 남쪽으로 반사되고, 좌우는 요정 왼쪽·용족 오른쪽으로 계산된다', () => {
    const s = by('shot_5')
    expect(s.screen_layout?.axis_corrected).toBe(true)
    expect(s.screen_layout!.camera.y).toBeLessThan(0.6)
    expect(pos('shot_5', 'char_2')).toMatch(/left/)
    expect(pos('shot_5', 'char')).toMatch(/right/)
    expect(pos('shot_5', 'char_3')).toBe('center_third')
    expect(s.camera_setup?.from_direction).toBe('S')
    expect(issues.some((i) => i.location === 'shot_5' && i.severity === 'WARNING' && i.message.includes('축'))).toBe(true)
  })

  it('28: 트래킹 전진은 END 카메라를 따로 두고 END 배치를 남긴다', () => {
    const s = by('shot_5')
    expect(s.screen_layout?.end_camera).toBeDefined()
    const beast = s.screen_layout!.characters.find((c) => c.character_id === 'char_3')!
    expect(beast.end).toBeDefined()
    expect(beast.end!.apparent_height).toBeGreaterThan(beast.start.apparent_height) // 다가와서 커진다
  })

  it('29: 85mm 클로즈업 프레임 밖의 수인은 blocking 에서 빠지고 용족만 남는다', () => {
    const s = by('shot_6')
    expect(s.character_blocking.map((b) => b.character_id)).toEqual(['char'])
    expect(issues.some((i) => i.location === 'shot_6' && i.message.includes('char_3') && i.message.includes('프레임 밖'))).toBe(true)
    expect(s.lens_mm).toBe(85)
    expect(s.camera_angle).toBe('eye_level')
  })

  it('29→27 연속: 남쪽 카메라에서 용족은 서쪽(상대)을 보므로 화면 왼쪽을 향한다', () => {
    const dragon = by('shot_6').screen_layout!.characters.find((c) => c.character_id === 'char')!
    expect(dragon.start.facing).toMatch(/left/)
  })

  it('30: 와이드는 셋 다 프레임 안, 요정 왼쪽·용족 오른쪽·수인 가운데 — LLM 의 뒤집힌 위치를 덮어쓴다', () => {
    expect(pos('shot_7', 'char_2')).toMatch(/left/)
    expect(pos('shot_7', 'char')).toMatch(/right/)
    expect(pos('shot_7', 'char_3')).toBe('center_third')
    const s = by('shot_7')
    expect(s.screen_layout!.characters.every((c) => c.start.in_frame)).toBe(true)
    // 비트 5 안의 이동(북쪽으로 걸음) → END 배치가 있고 더 작아진다
    const beast = s.screen_layout!.characters.find((c) => c.character_id === 'char_3')!
    expect(beast.end!.apparent_height).toBeLessThan(beast.start.apparent_height)
  })

  it('camera_setup 이 없으면 기본값(축 안쪽·첫 인물)으로 계산하고 경고를 남긴다', () => {
    const s = shot('shot_9', { character_blocking: [{ character_id: 'char', position_in_frame: 'center', pose: 'standing', gaze: 'ahead', asset_version: 'v1' }] })
    const r = applyStageToShots([s], STAGE, [dec('shot_9', [3])])
    expect(r.shots[0].static_spec.camera_setup?.subject).toBe('char')
    expect(r.shots[0].static_spec.screen_layout).toBeDefined()
    expect(r.issues.some((i) => i.message.includes('camera_setup'))).toBe(true)
    const d = defaultCameraSetup(s.static_spec, STAGE, STAGE.beats[0].characters)
    expect(['S', 'SE', 'SW']).toContain(d.from_direction)
  })

  it('무대에 없는 인물의 blocking 은 유지한다(정체성 참조 보존)', () => {
    const s = shot('shot_9', {
      camera_setup: { subject: 'char', from_direction: 'S', height: 'eye', lens_mm: 35 },
      character_blocking: [{ character_id: 'char_99', position_in_frame: 'center', pose: 'standing', gaze: 'ahead', asset_version: 'v1' }],
    })
    const r = applyStageToShots([s], STAGE, [dec('shot_9', [3])])
    expect(r.shots[0].static_spec.character_blocking.some((b) => b.character_id === 'char_99')).toBe(true)
  })
})
