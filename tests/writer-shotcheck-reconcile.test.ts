import { describe, expect, it } from 'vitest'
import { reconcileAssembledShots } from '@/lib/writer/pipeline/stages/c_application_2'
import type { ShotDesign, ShotSequenceItem, Scenes, StoryScene } from '@/lib/writer/types/pipeline'

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

function llmShot(shotId: string, sceneId: string): ShotSequenceItem {
  return {
    shot_id: shotId,
    duration_seconds: 8,
    S: { scene_id: sceneId, scene_purpose: 'llm', emotion_beat: { start: 'a', end: 'b' }, character_action: 'llm action' },
    C: { causal_link: { from: null, to: null }, info_disclosure: 'llm', hook_type: 'curiosity_gap' },
    V: {
      camera: { type: 'CU', angle: 'low', movement: 'static' },
      lighting: { key_fill_ratio: '2:1', color_temp: '3200K' },
      composition: 'llm comp',
      mood: 'llm mood',
    },
    assets: { characters: [{ id: 'char', asset_version: 'v1' }], locations: [{ id: 'loc', asset_version: 'a' }] },
    first_frame_generation: { base_assets: ['char'], composition_prompt: `LLM composition for ${shotId}` },
    video_generation: { motion_prompt: `LLM motion for ${shotId}` },
    action_budget: {
      primary_action_count: 1,
      secondary_action_count: 0,
      camera_movement_complexity: 'none',
      environmental_changes: 0,
      passed_validation: true,
    },
    continuity: { carry_forward_from: null, consistent_elements: [], changes: [], is_scene_transition: false },
  }
}

const scenes: Scenes = {
  scenes: [scene('scene_1', 'loc_1'), scene('scene_2', 'loc_2')],
  total_estimated_seconds: 60,
}

describe('reconcileAssembledShots (shotCheck shot-loss 방지)', () => {
  it('LLM이 샷을 병합/누락해도 입력 shotDesign 개수를 보존한다 (관측 버그: 49→16)', () => {
    const designs = [
      design('shot_1', 'scene_1'),
      design('shot_2', 'scene_1'),
      design('shot_3', 'scene_2'),
      design('shot_4', 'scene_2'),
    ]
    // Gemini 조립이 scene 당 1샷으로 뭉갠 상황 재현
    const llm = [llmShot('shot_1', 'scene_1'), llmShot('shot_3', 'scene_2')]

    const { shots, reconstructed } = reconcileAssembledShots(llm, designs, scenes)

    expect(shots).toHaveLength(4)
    expect(reconstructed).toBe(2)
    expect(shots.map((s) => s.shot_id)).toEqual(['shot_1', 'shot_2', 'shot_3', 'shot_4'])
    // 각 샷이 올바른 씬에 귀속 (씬당 2샷 유지)
    expect(shots.map((s) => s.S.scene_id)).toEqual(['scene_1', 'scene_1', 'scene_2', 'scene_2'])
  })

  it('shot_id 매칭분은 LLM 메타를 재사용하되 scene 귀속은 intent 로 강제한다', () => {
    // LLM이 scene_id 를 잘못 붙인 케이스
    const llm = [llmShot('shot_2', 'WRONG_SCENE')]
    const { shots, reconstructed } = reconcileAssembledShots(llm, [design('shot_2', 'scene_1')], scenes)

    expect(reconstructed).toBe(0)
    expect(shots[0].S.scene_id).toBe('scene_1') // intent 우선
    expect(shots[0].C.hook_type).toBe('curiosity_gap') // LLM 메타 보존
    expect(shots[0].V.camera.type).toBe('CU')
  })

  it('LLM 출력이 비어도 L4 로부터 전량 결정론 복원하며 렌더 프롬프트를 확보한다', () => {
    const d = design('shot_9', 'scene_2', {
      firstFrame: 'DETERMINISTIC first frame prompt long enough',
      motion: 'DET motion',
    })
    const { shots, reconstructed } = reconcileAssembledShots([], [d], scenes)

    expect(reconstructed).toBe(1)
    expect(shots).toHaveLength(1)
    // 렌더 입력 (v5_prompts 가 최우선 소비)
    expect(shots[0].first_frame_generation.composition_prompt).toBe('DETERMINISTIC first frame prompt long enough')
    expect(shots[0].video_generation.motion_prompt).toBe('DET motion')
    // 씬 정보 매핑
    expect(shots[0].S.scene_id).toBe('scene_2')
    expect(shots[0].S.scene_purpose).toBe('purpose_scene_2')
    expect(shots[0].assets.locations[0].id).toBe('loc_2') // scene.location
    expect(shots[0].V.camera.type).toBe('MS') // static_spec.shot_type
  })

  it('LLM 순서가 뒤섞여도 출력은 입력 shotDesign 순서를 따른다', () => {
    const designs = [design('shot_1', 'scene_1'), design('shot_2', 'scene_2')]
    const llm = [llmShot('shot_2', 'scene_2'), llmShot('shot_1', 'scene_1')] // 역순
    const { shots } = reconcileAssembledShots(llm, designs, scenes)
    expect(shots.map((s) => s.shot_id)).toEqual(['shot_1', 'shot_2'])
  })
})
