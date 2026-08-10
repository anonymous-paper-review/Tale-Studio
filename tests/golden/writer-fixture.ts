// 골든 스냅샷 고정 입력(#writer-overhaul Phase 0, 2026-08-10).
//   writer 파이프라인 오버홀(죽은 스테이지 제거·스키마 다이어트)이 하류 산출물을 건드리지
//   않았음을 바이트로 증명하기 위한 유일한 입력. 실 프로젝트 shape 를 본떠 손으로 고정한다
//   (라이브 DB 스냅샷을 쓰면 재현이 계정/데이터에 묶여 회귀 테스트가 못 된다).
//
// 커버리지 의도 — 하류 분기를 전부 지나게:
//   shot_1 : 정지 카메라 + 2인 blocking + 소품 + deep focus  → 모션 계약 static 분기
//   shot_2 : dolly_in + gaze_arc + environmental_change + shallow → 계약 이동/방향 분기
//   shot_3 : 분할 부모(자식 2) — design_ref/static_spec/dynamic_spec 첫 자식만 상속(#p2-split-siblings)
import type {
  Characters,
  DecoupagePlan,
  Genre,
  Scenes,
  ShotDesign,
  VisualIdentity,
  WorldVisual,
} from '@/lib/writer/types/pipeline'

export const PROJECT_ID = '11111111-2222-4333-8444-555555555555'

export const GENRE: Genre = {
  genre: 'science fiction',
  subGenre: 'post-apocalyptic',
  tone: ['bleak', 'tense'],
  targetEmotion: ['dread', 'resolve'],
  runtime_seconds: 60,
  depth_level: 'D3',
  format: 'horizontal_16:9',
}

export const CHARACTERS: Characters = {
  characters: [
    {
      id: 'mira',
      name: 'Mira',
      role: 'protagonist',
      personality: ['stubborn', 'guarded'],
      arc: { start_state: 'hiding', end_state: 'exposed', arc_type: 'positive_change' },
      appearance_description: 'A wiry scavenger in a patched grey coat, soot on her cheekbones.',
      motivation: { want: 'the blueprints', need: 'to be believed', wound: 'abandoned as a child' },
    },
    {
      id: 'warden',
      name: 'Warden',
      role: 'antagonist',
      personality: ['methodical'],
      arc: { start_state: 'certain', end_state: 'doubting', arc_type: 'negative_change' },
      appearance_description: 'A tall figure in segmented dark armour, visor unlit.',
      motivation: { want: 'the archive sealed', need: 'order' },
    },
  ],
  relationships: [
    { between: ['mira', 'warden'], type: 'hunter/hunted', state_change: 'closing in', visible_in_video: true },
  ],
  subtext_notes: ['Mira never says the archive out loud.'],
}

export const SCENES: Scenes = {
  scenes: [
    {
      scene_id: 'scene_1',
      act_ref: 'act_1',
      location: 'dust_yard',
      time_of_day: 'dusk',
      weather: 'dust haze',
      characters_in_scene: ['mira', 'warden'],
      purpose: 'conflict',
      emotion_beat: { start: 'wary', end: 'cornered' },
      dialogue_summary: 'Mira refuses to hand over what she found.',
      key_dialogue: [{ character_id: 'mira', line: 'It was already broken.', delivery: 'flat' }],
      info_asymmetry: 'audience>character',
      estimated_seconds: 24,
      scene_actions: [
        'Mira tucks the blueprints inside her coat',
        'The Warden steps out of the dust',
        'Mira backs toward the pipe wall',
      ],
    },
  ],
  total_estimated_seconds: 24,
  coverage_mode: 'honest',
}

export const VISUAL_IDENTITY: VisualIdentity = {
  format: {
    medium: 'live action',
    resolution: { width: 1920, height: 1080 },
    fps: 24,
    aspect_ratio: '16:9',
    rendering_method: 'photoreal',
  },
  style: {
    art_style: 'gritty photoreal',
    shape_language: 'angular, broken silhouettes',
    line_quality: 'hard edged',
    character_proportion: 'naturalistic',
    texture_philosophy: 'dust, grain, scuffed metal',
  },
}

export const WORLD_VISUAL: WorldVisual = {
  global_palette: { primary: '#6b6155', secondary: '#2b2f33', accent: '#c8541f', forbidden: ['#00ff00'] },
  color_meaning: { '#c8541f': 'the archive', '#2b2f33': 'the Warden' },
  locations: [
    {
      id: 'dust_yard',
      style_description: 'A scrap yard of severed pipes under a low ochre dust sky.',
      lighting_sources: ['low sun through haze', 'sodium work lamp'],
      props: ['severed pipes', 'toppled crate'],
    },
  ],
  vfx_approach: 'practical dust, minimal comp',
}

export const DECOUPAGE: DecoupagePlan = {
  scenes: [
    {
      scene_id: 'scene_1',
      beat_count: 3,
      shot_count: 3,
      coverage_ratio: 1,
      rhythm_profile: 'sustained then punctuated',
      uncovered_beats: [],
      shots: [
        {
          shot_id: 'shot_1',
          scene_id: 'scene_1',
          operation: 'derived',
          shot_function: 'master',
          source_beats: [0],
          beat_summary: 'Mira tucks the blueprints inside her coat.',
          beat_summary_native: '미라가 도면을 코트 안에 밀어 넣는다.',
          shot_size: 'WS',
          intended_duration_seconds: 6,
          rhythm_role: 'establish',
          camera_intent: 'static',
          dramatic_purpose: 'Establish the yard and what she is hiding',
        },
        {
          shot_id: 'shot_2',
          scene_id: 'scene_1',
          operation: 'derived',
          shot_function: 'reveal',
          source_beats: [1],
          beat_summary: 'The Warden steps out of the dust.',
          beat_summary_native: '워든이 먼지 속에서 걸어 나온다.',
          shot_size: 'MS',
          intended_duration_seconds: 5,
          rhythm_role: 'develop',
          camera_intent: 'motivated_move',
          camera_move_motivation: 'The threat arrives before she sees it',
          dramatic_purpose: 'Deliver the threat',
        },
        {
          shot_id: 'shot_3',
          scene_id: 'scene_1',
          operation: 'derived',
          shot_function: 'action',
          source_beats: [2],
          beat_summary: 'Mira backs toward the pipe wall.',
          beat_summary_native: '미라가 파이프 벽 쪽으로 물러선다.',
          shot_size: 'MFS',
          intended_duration_seconds: 5,
          rhythm_role: 'accelerate',
          camera_intent: 'static',
          dramatic_purpose: 'Corner her',
        },
      ],
    },
  ],
  total_shots: 3,
  total_added: 0,
  total_merged: 0,
  total_split: 0,
  director_notes: 'Hold wide, then close the space around her.',
}

export const SHOT_DESIGNS: ShotDesign[] = [
  {
    intent: {
      shot_id: 'shot_1',
      scene_id: 'scene_1',
      story_beat_ref: 0,
      dramatic_purpose: 'Establish the yard and what she is hiding',
      duration_seconds: 6,
      duration_justification: 'Wide needs time to read the space',
      audience_focus: 'the folded blueprints against her chest',
      shot_position_in_scene: 'opening',
      operation: 'derived',
      source_beats: [0],
      shot_function: 'master',
      rhythm_role: 'establish',
    },
    static_spec: {
      shot_id: 'shot_1',
      lens_mm: 35,
      shot_type: 'WS',
      camera_angle: 'eye_level',
      focal_distance_m: 6,
      depth_of_field: 'deep',
      framing: {
        rule: 'thirds',
        layers: {
          foreground: 'a toppled crate at the left edge',
          midground: 'Mira crouched among severed pipes',
          background: 'the ochre dust sky over the yard',
        },
        focal_point: 'the folded blueprints against her chest',
      },
      lighting: {
        key_fill_ratio: '4:1',
        color_temp_kelvin: 3200,
        quality: 'hard',
        key_direction: 'side_left',
      },
      character_blocking: [
        {
          character_id: 'mira',
          position_in_frame: 'left_third',
          pose: 'crouching, coat pulled shut',
          gaze: 'down at her own hands',
          asset_version: 'v1',
        },
      ],
      prop_placement: [
        { prop: 'folded blueprints', position_in_frame: 'centre of her chest', significance: 'the archive' },
        { prop: 'toppled crate', position_in_frame: 'left foreground' },
      ],
      palette_emphasis: ['#c8541f'],
      texture_notes: 'dust film on every surface, scuffed metal',
      color_grading_intent: 'warm sodium key against cold shadow',
      first_frame_prompt:
        'Wide 35mm eye-level shot of a scavenger crouched among severed pipes in a dust yard at dusk, folded blueprints pressed to her chest, hard low sun raking from the left, ochre haze sky behind.',
    },
    dynamic_spec: {
      shot_id: 'shot_1',
      camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' },
      character_motion: [{ character_id: 'mira', verb: 'tucks the blueprints into her coat', magnitude: 'small' }],
      transition_in: 'cut',
      transition_out: 'cut',
      motion_prompt: 'She tucks the folded blueprints into her coat, locked-off wide.',
    },
  },
  {
    intent: {
      shot_id: 'shot_2',
      scene_id: 'scene_1',
      story_beat_ref: 1,
      dramatic_purpose: 'Deliver the threat',
      duration_seconds: 5,
      duration_justification: 'The reveal lands on the push',
      audience_focus: 'the unlit visor emerging from the haze',
      shot_position_in_scene: 'developing',
      operation: 'derived',
      source_beats: [1],
      shot_function: 'reveal',
      rhythm_role: 'develop',
    },
    static_spec: {
      shot_id: 'shot_2',
      lens_mm: 85,
      shot_type: 'MS',
      camera_angle: 'low',
      depth_of_field: 'shallow',
      framing: {
        rule: 'center',
        layers: {
          midground: 'the Warden emerging from the dust haze',
          background: 'blown-out haze and a sodium work lamp',
        },
        focal_point: 'the unlit visor',
      },
      lighting: {
        key_fill_ratio: '8:1',
        color_temp_kelvin: 6500,
        quality: 'soft',
        key_direction: 'back',
      },
      character_blocking: [
        {
          character_id: 'warden',
          position_in_frame: 'center',
          pose: 'walking forward, shoulders square',
          gaze: 'toward_camera',
          asset_version: 'v1',
        },
      ],
      prop_placement: [],
      palette_emphasis: ['#2b2f33'],
      texture_notes: 'segmented armour plate, haze bloom',
      color_grading_intent: 'cold backlit silhouette',
      first_frame_prompt:
        'Low-angle 85mm medium shot of a tall armoured figure stepping out of dust haze, unlit visor centred, cold backlight blooming through the haze, shallow focus.',
    },
    dynamic_spec: {
      shot_id: 'shot_2',
      camera_motion: { type: 'dolly_in', direction: 'forward', speed: 'slow', magnitude: 'moderate' },
      character_motion: [{ character_id: 'warden', verb: 'strides out of the haze', magnitude: 'medium' }],
      gaze_arc: [{ character_id: 'warden', from: 'off_screen_left', to: 'toward_camera' }],
      environmental_change: [{ type: 'dust_thins', magnitude: 'subtle' }],
      transition_in: 'cut',
      transition_out: 'cut',
      motion_prompt: 'He strides out of the haze as the camera pushes slowly in.',
    },
  },
  {
    intent: {
      shot_id: 'shot_3',
      scene_id: 'scene_1',
      story_beat_ref: 2,
      dramatic_purpose: 'Corner her',
      duration_seconds: 5,
      duration_justification: 'Two moves need room',
      audience_focus: 'the shrinking gap between her back and the pipes',
      shot_position_in_scene: 'climax',
      operation: 'derived',
      source_beats: [2],
      shot_function: 'action',
      rhythm_role: 'accelerate',
    },
    static_spec: {
      shot_id: 'shot_3',
      lens_mm: 50,
      shot_type: 'MFS',
      camera_angle: 'eye_level',
      depth_of_field: 'medium',
      framing: {
        rule: 'diagonal',
        layers: {
          foreground: 'the Warden’s shoulder cutting the right edge',
          midground: 'Mira retreating',
          background: 'the pipe wall',
        },
        focal_point: 'the gap between her back and the pipes',
      },
      lighting: {
        key_fill_ratio: '2:1',
        color_temp_kelvin: 4500,
        quality: 'diffused',
        key_direction: 'top_right',
      },
      character_blocking: [
        {
          character_id: 'mira',
          position_in_frame: 'left_third',
          pose: 'backing away, one hand behind her',
          gaze: 'off_screen_right',
          asset_version: 'v1',
        },
        {
          character_id: 'warden',
          position_in_frame: 'frame_edge_right',
          pose: 'advancing, half out of frame',
          gaze: 'toward Mira',
          asset_version: 'v1',
        },
      ],
      prop_placement: [{ prop: 'pipe wall', position_in_frame: 'full background' }],
      palette_emphasis: ['#6b6155'],
      texture_notes: 'rusted pipe joints, grit in the air',
      color_grading_intent: 'flat diffused dusk',
      first_frame_prompt:
        'Medium-full 50mm eye-level shot on a diagonal: a scavenger backing toward a wall of rusted pipes while an armoured shoulder cuts the right edge of frame, diffused dusk light from upper right.',
    },
    dynamic_spec: {
      shot_id: 'shot_3',
      camera_motion: { type: 'handheld_drift', speed: 'medium', magnitude: 'minimal' },
      character_motion: [
        { character_id: 'mira', verb: 'backs into the pipes', magnitude: 'medium' },
        { character_id: 'warden', verb: 'advances', magnitude: 'small' },
      ],
      transition_in: 'cut',
      transition_out: 'cut',
      motion_prompt: 'She backs into the pipes as he advances, handheld breathing.',
    },
  },
]

/** shotCheck 이 LLM 으로 받는 분할안 — 결정론 부분(buildSplitChildren)만 재현하기 위한 고정 입력. */
export const SPLIT_PROPOSAL = {
  shot_id: 'shot_3',
  reason: 'two primary actions in one shot',
  new_shots: [
    {
      shot_id: 'shot_3a',
      duration_seconds: 3,
      S: {
        scene_id: 'scene_1',
        scene_purpose: 'conflict',
        emotion_beat: { start: 'wary', end: 'cornered' },
        character_action: 'Mira backs into the pipe wall.',
      },
      video_generation: { motion_prompt: 'She backs into the pipes.' },
    },
    {
      shot_id: 'shot_3b',
      duration_seconds: 2,
      video_generation: { motion_prompt: 'He advances into the frame edge.' },
    },
  ],
} as const

/** shotCheck 채널1 이슈(고정) — check_notes 부착 + 분할 자식 상속 규칙(action_budget 제외) 재현용. */
export const CHECK_ISSUES = [
  {
    category: 'continuity' as const,
    severity: 'WARNING' as const,
    location: 'shot_2',
    message: 'The pipe wall disappears from the frame.',
    constraint: 'The wall of severed pipes stays visible behind the figure.',
  },
  {
    category: 'action_budget' as const,
    severity: 'CRITICAL' as const,
    location: 'shot_3',
    message: 'Two primary actions in one shot.',
    constraint: 'Show either her retreat or his advance, not both completing.',
  },
  {
    category: 'verisimilitude' as const,
    severity: 'INFO' as const,
    location: 'shot_1',
    message: 'Dust would settle on the blueprints.',
  },
]
