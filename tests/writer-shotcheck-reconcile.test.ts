import { describe, expect, it } from 'vitest'
import { assembleShotsFromDesigns } from '@/lib/writer/pipeline/stages/c_application_2'
import type { ShotDesign, Scenes, StoryScene } from '@/lib/writer/types/pipeline'

// ---- 최소 픽스처 ----
function scene(id: string, location: string): StoryScene {
  return {
    scene_id: id,
    act_ref: 'act_1',
    location,
    time_of_day: 'day',
    characters_in_scene: ['char'],
    purpose: `purpose_${id}`,
    emotion_beat: { start: 'calm', end: 'tense' },
    dialogue_summary: `dialogue_${id}`,
    info_asymmetry: 'audience=character',
    estimated_seconds: 30,
    scene_actions: ['a', 'b'],
  }
}

function design(
  shotId: string,
  sceneId: string,
  opts: { firstFrame?: string; motion?: string } = {},
): ShotDesign {
  return {
    intent: {
      shot_id: shotId,
      scene_id: sceneId,
      story_beat_ref: 0,
      dramatic_purpose: `purpose of ${shotId}`,
      duration_seconds: 6,
      duration_justification: 'x',
      audience_focus: 'y',
      shot_position_in_scene: 'developing',
    },
    static_spec: {
      shot_id: shotId,
      lens_mm: 35,
      shot_type: 'MS',
      camera_angle: 'eye_level',
      depth_of_field: 'medium',
      framing: { rule: 'thirds', layers: {}, focal_point: 'subject face' },
      lighting: { key_fill_ratio: '4:1', color_temp_kelvin: 5000, quality: 'soft', key_direction: 'front' },
      character_blocking: [
        { character_id: 'char', position_in_frame: 'center', pose: 'standing', gaze: 'toward_camera', asset_version: 'v1' },
      ],
      prop_placement: [],
      palette_emphasis: [],
      texture_notes: '',
      color_grading_intent: 'cold',
      first_frame_prompt: opts.firstFrame ?? `FIRST FRAME rich prompt for ${shotId} — twenty+ chars`,
    },
    dynamic_spec: {
      shot_id: shotId,
      camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' },
      character_motion: [{ character_id: 'char', verb: 'turns', magnitude: 'small' }],
      motion_prompt: opts.motion ?? `MOTION prompt for ${shotId}`,
    },
  }
}

const scenes: Scenes = {
  scenes: [scene('scene_1', 'loc_1'), scene('scene_2', 'loc_2')],
  total_estimated_seconds: 60,
}

// E12b (2026-07-21): LLM 조립 제거 — 조립은 항상 결정론. 이 테스트는 그 1:1 계약을 가드한다.
describe('assembleShotsFromDesigns (C2 결정론 조립)', () => {
  it('입력 shotDesign 1개당 ShotSequenceItem 정확히 1개, 입력 순서 보존', () => {
    const designs = [
      design('shot_1', 'scene_1'),
      design('shot_2', 'scene_1'),
      design('shot_3', 'scene_2'),
      design('shot_4', 'scene_2'),
    ]
    const shots = assembleShotsFromDesigns(designs, scenes)

    expect(shots).toHaveLength(4)
    expect(shots.map((s) => s.shot_id)).toEqual(['shot_1', 'shot_2', 'shot_3', 'shot_4'])
    expect(shots.map((s) => s.S.scene_id)).toEqual(['scene_1', 'scene_1', 'scene_2', 'scene_2'])
  })

  it('렌더 프롬프트(first_frame/motion)를 L4에서 그대로 확보한다 — v5_prompts가 최우선 소비', () => {
    const d = design('shot_9', 'scene_2', {
      firstFrame: 'DETERMINISTIC first frame prompt long enough',
      motion: 'DET motion',
    })
    const shots = assembleShotsFromDesigns([d], scenes)

    expect(shots).toHaveLength(1)
    expect(shots[0].first_frame_generation.composition_prompt).toBe('DETERMINISTIC first frame prompt long enough')
    expect(shots[0].video_generation.motion_prompt).toBe('DET motion')
    // 씬 정보 매핑
    expect(shots[0].S.scene_id).toBe('scene_2')
    expect(shots[0].S.scene_purpose).toBe('purpose_scene_2')
    expect(shots[0].assets.locations[0].id).toBe('loc_2') // scene.location
    expect(shots[0].V.camera.type).toBe('MS') // static_spec.shot_type
    expect(shots[0].duration_seconds).toBe(6) // intent.duration_seconds
  })

  it('씬 목록에 없는 scene_id여도 죽지 않고 L4 intent 기반으로 채운다', () => {
    const d = design('shot_1', 'scene_missing')
    const shots = assembleShotsFromDesigns([d], scenes)

    expect(shots).toHaveLength(1)
    expect(shots[0].S.scene_id).toBe('scene_missing')
    expect(shots[0].S.scene_purpose).toBe('purpose of shot_1') // intent.dramatic_purpose 폴백
    expect(shots[0].assets.locations).toEqual([]) // scene 없음 → location 없음
  })
})
