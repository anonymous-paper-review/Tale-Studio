// 무대 기하 — 정지 카메라·정지 인물이면 END 배치는 START 와 같다 (2026-09-07, 겨울_6 씬 1 shot 2 실측)
//
//   쌍 축 검사가 카메라 방향을 돌리면(SE→S) START 는 돌린 카메라로, END 는 돌리기 전 카메라로 배치를 계산해
//   무대에서 한 발짝도 안 움직인 용족이 화면 왼쪽→오른쪽으로 옮겨가고 향까지 바뀌었다. END 카메라는 언제나
//   START 의 최종 카메라(모든 보정 뒤)에서 출발한다. 문장 하나 = 테스트 하나.
import { describe, expect, it } from 'vitest'
import { applyStageToShots } from '@/lib/writer/pipeline/stage/apply'
import type { DecoupageShot, SceneStage, ShotDesign, ShotStaticSpec } from '@/lib/writer/types/pipeline'

// 겨울_6 씬 1 비트 0 그대로: 용족(char)·요정(char_2)이 대치, 수인(char_3)이 누워 있다가 앉는다.
const STAGE: SceneStage = {
  scene_id: 'sc_01',
  unit: 'm',
  axis: { from: 'char', to: 'char_2' },
  camera_side: 'left',
  landmarks: [
    { id: 'dirt_collapse_zone', label: 'collapse zone', x: 0, y: 0 },
    { id: 'inverted_tree', label: 'inverted tree', x: -8, y: 10 },
    { id: 'floating_rock_cluster', label: 'floating rock cluster', x: 10, y: 8 },
    { id: 'dimensional_rift', label: 'dimensional rift', x: 0, y: 20 },
  ],
  beats: [
    {
      beat: 0,
      characters: [
        { character_id: 'char', x: -4.5, y: 3.5, facing_deg: 135, posture: 'standing' },
        { character_id: 'char_2', x: 4.5, y: -3.5, facing_deg: 315, posture: 'standing' },
        { character_id: 'char_3', x: -1.5, y: -5, facing_deg: 45, posture: 'lying' },
      ],
      end_characters: [
        { character_id: 'char', x: -4.5, y: 3.5, facing_deg: 135, posture: 'standing' },
        { character_id: 'char_2', x: 4.5, y: -3.5, facing_deg: 315, posture: 'standing' },
        { character_id: 'char_3', x: -1.5, y: -5, facing_deg: 45, posture: 'sitting' },
      ],
    },
  ],
} as SceneStage

function shot(id: string, shotType: string, setup: ShotStaticSpec['camera_setup'], blocking: string[]): ShotDesign {
  return {
    intent: { shot_id: id, scene_id: 'sc_01', story_beat_ref: 0, dramatic_purpose: '', duration_seconds: 5, duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing' },
    static_spec: {
      shot_id: id, lens_mm: 35, shot_type: shotType, camera_angle: 'eye_level', depth_of_field: 'medium',
      framing: { rule: 'thirds', layers: {}, focal_point: '' }, lighting: { key_fill_ratio: '4:1', color_temp_kelvin: 5000, quality: 'soft', key_direction: 'top_left' },
      character_blocking: blocking.map((c) => ({ character_id: c, position_in_frame: 'center_third', pose: 'standing', gaze: 'ahead', asset_version: 'v1' })),
      prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: '',
      camera_setup: setup,
    },
    dynamic_spec: { shot_id: id, camera_motion: { type: 'static', direction: 'none', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: '' },
  } as ShotDesign
}

const dec = (id: string, size: DecoupageShot['shot_size']): DecoupageShot => ({
  shot_id: id, scene_id: 'sc_01', operation: 'derived', shot_function: 'action', source_beats: [0], beat_summary: '', shot_size: size,
  intended_duration_seconds: 5, rhythm_role: 'develop', camera_intent: 'static', dramatic_purpose: '',
})

describe('무대 기하 — END 카메라는 START 의 최종 카메라에서 출발한다', () => {
  const shots = [
    shot('shot_1', 'EWS', { subject: 'floating_rock_cluster', from_direction: 'S', height: 'eye', lens_mm: 35, over_shoulder_of: null, axis_cross: 'none', end: null }, ['char_3', 'char', 'char_2']),
    shot('shot_2', 'WS', { subject: 'char_3', from_direction: 'SE', height: 'low', lens_mm: 35, over_shoulder_of: null, axis_cross: 'none', end: null }, ['char_3', 'char']),
  ]
  const result = applyStageToShots(shots, STAGE, [dec('shot_1', 'EWS'), dec('shot_2', 'WS')], { format: 'horizontal_16:9' })
  const layout = result.shots[1].static_spec.screen_layout!

  it('쌍 축 검사가 카메라를 돌린 샷에서, 정지 카메라·정지 인물의 END 배치는 START 와 같다', () => {
    expect(result.issues.some((i) => i.location === 'shot_2' && /쌍 축/.test(i.message))).toBe(true)
    expect(layout.end_camera).toBeUndefined()
    // 무대에서 안 움직인 용족·요정: 명단에 있으면 END = START, 없으면 돌린 카메라 기준으로 프레임 밖이어야 한다
    //   (옛 코드는 돌리기 전 카메라로 END 를 계산해 프레임 밖 용족을 END 에서 오른쪽 가장자리에 세웠다).
    for (const id of ['char', 'char_2']) {
      const c = layout.characters.find((x) => x.character_id === id)
      if (!c) {
        expect(layout.off_frame ?? []).toContain(id)
        continue
      }
      expect(c.end).toBeDefined()
      expect(c.end!.position_in_frame).toBe(c.start.position_in_frame)
      expect(c.end!.screen_x).toBe(c.start.screen_x)
      expect(c.end!.facing).toBe(c.start.facing)
    }
    expect(layout.off_frame ?? []).toContain('char')
  })

  it('앉는 수인(상태가 바뀐 인물)의 END 는 같은 카메라에서 자세만 달라진다', () => {
    const beast = layout.characters.find((c) => c.character_id === 'char_3')!
    expect(beast.end!.posture).toBe('sitting')
    expect(beast.end!.screen_x).toBe(beast.start.screen_x)
    expect(beast.end!.distance_m).toBe(beast.start.distance_m)
  })
})
