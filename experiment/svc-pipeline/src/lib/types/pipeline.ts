// S, V, C, Shot Sequence 데이터 모델
// linear_pipeline.md 기준

export type DepthLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7';

// Compact Mode 트리거: D1~D3는 L3 (씬 비주얼 플랜) 스킵 + L4 자체 디시플린
export const COMPACT_DEPTH_LEVELS: readonly DepthLevel[] = ['D1', 'D2', 'D3'];
export function isCompactDepth(d: DepthLevel): boolean {
  return COMPACT_DEPTH_LEVELS.includes(d);
}

// S/V/C 축별 LLM 설정 (없으면 DEFAULT_MODELS 사용)
export type LlmProviderName = 'gemini' | 'claude' | 'openai' | 'local';
export interface PipelineAxisModel {
  provider: LlmProviderName;
  model?: string;
  baseUrl?: string;  // local 전용
}
export interface PipelineModelsInput {
  S?: PipelineAxisModel;
  V?: PipelineAxisModel;
  C?: PipelineAxisModel;
}

// =====================================================================
// L5: T2I / TI2V 최종 프롬프트 (마지막 stage 출력)
// =====================================================================

export interface T2IPrompt {
  prompt: string;                  // 첫 프레임 생성용 (200~400자)
  negative_prompt?: string;
  aspect_ratio: string;            // L0.aspect_ratio
  width?: number;
  height?: number;
  reference_assets: string[];      // 캐릭터/로케이션 ID (IP-Adapter 등)
}

export interface TI2VPrompt {
  motion_prompt: string;           // 첫 프레임 + 모션 (50~100자, 동사 1~2)
  negative_prompt?: string;
  duration_seconds: number;
  fps?: number;
  camera_movement?: string;
}

export interface ShotGenerationPrompts {
  shot_id: string;
  scene_id: string;
  duration_seconds: number;
  t2i: T2IPrompt;
  ti2v: TI2VPrompt;
}

export interface FinalPromptsOutput {
  total_shots: number;
  shots: ShotGenerationPrompts[];
  l0_meta: {
    aspect_ratio: string;
    fps: number;
    resolution: { width: number; height: number };
  };
  extraction_summary: {
    t2i_extracted: number;
    t2i_llm_generated: number;
    ti2v_extracted: number;
    ti2v_llm_generated: number;
    llm_axis: string;  // LLM fallback 시 사용된 모델 라벨
  };
}

export interface PipelineInput {
  story: string;          // 자유 텍스트 입력
  presetId?: string;      // 선택적 장르 프리셋
  runtimeSeconds?: number; // 사용자 명시 러닝타임 (없으면 자동 결정)
  models?: PipelineModelsInput; // S/V/C 축별 모델 선택 (선택)
}

// =====================================================================
// S축 (Story Layer)
// =====================================================================

export interface S0Genre {
  genre: string;
  subGenre?: string;
  tone: string[];
  targetEmotion: string[];
  runtime_seconds: number;
  depth_level: DepthLevel;
  format: string; // "horizontal_16:9" | "vertical_9:16" | "cinema_2.39:1"
}

export interface S1Structure {
  structure_type: string; // "kishōtenketsu" | "3-act" | "hero's_journey" | "non-linear" 등
  acts: Array<{
    act_id: string;
    purpose: string;
    proportion: number; // 전체 중 비율 (합 1.0)
  }>;
  pov: string; // "1st_person" | "3rd_limited" | "3rd_omniscient"
  theme: string;
  central_dramatic_question: string;
  turning_point_position: number; // 0~1
}

export interface S2Character {
  id: string;
  name: string;
  age?: string;
  role: string; // "protagonist" | "antagonist" | "supporting"
  personality: string[];
  arc: {
    start_state: string;
    end_state: string;
    arc_type: string; // "positive_change" | "negative_change" | "fall" | "redemption" 등
  };
  voice: string;
  appearance_description: string;
  motivation: {
    want: string;
    need: string;
    wound?: string;
  };
}

export interface S2Relationship {
  between: [string, string]; // character ids
  type: string;
  state_change?: string;
  visible_in_video: boolean;
}

export interface S2Block {
  characters: S2Character[];
  relationships: S2Relationship[];
  subtext_notes: string[];
}

export interface S3Scene {
  scene_id: string;
  act_ref: string;
  location: string;
  time_of_day: string;
  weather?: string;
  characters_in_scene: string[];
  purpose: string; // "exposition" | "conflict" | "decision" | "revelation" | "transformation" 등
  emotion_beat: {
    start: string;
    end: string;
  };
  dialogue_summary: string;
  key_dialogue?: Array<{
    character_id: string;
    line: string;
    delivery: string;
  }>;
  info_asymmetry: string; // "audience=character" | "audience>character" | "character>audience"
  estimated_seconds: number;
  scene_actions: string[]; // 씬에서 일어나는 주요 액션들 (분할 전)
}

export interface S3Block {
  scenes: S3Scene[];
  total_estimated_seconds: number;
}

// =====================================================================
// C 메타레이어 (검증 결과)
// =====================================================================

export type ValidationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  category: 'causality' | 'cdq' | 'verisimilitude' | 'cliche' | 'action_budget' | 'continuity' | 'theme';
  severity: ValidationSeverity;
  location: string; // "S3.scene_2" or "shot_5" etc
  message: string;
  suggestion?: string;
}

export interface CValidation1Report {
  passed: boolean;
  issues: ValidationIssue[];
  causality_chain: Array<{ from: string; to: string; connector: 'therefore' | 'but' | 'and_then' }>;
  cdq_present: boolean;
  cdq_clarity_score: number; // 0~1
  cliche_count: number;
  retry_count: number;
}

export interface CValidation2Report {
  passed: boolean;
  issues: ValidationIssue[];
  shots_split_count: number;
  total_action_violations_fixed: number;
}

// =====================================================================
// Mid Preview
// =====================================================================

export interface MidPreview {
  v_recommendations: {
    L0: Partial<L0Visual>;
    L1: Partial<L1Style>;
    L2_summary: string;
    L3_scene_strategy: string;   // 씬 단위 영상 문법 힌트 (커버리지/리듬)
    L4_shot_recipe: string;      // 샷 단위 분배 힌트 (정적/동적)
  };
  color_script: Array<{ scene_id: string; dominant: string; mood: string }>;
  emotional_arc_visualization: string;
  production_difficulty: 'low' | 'medium' | 'high';
  warnings: string[];
}

// =====================================================================
// V축 (Visual Layer)
// =====================================================================

export interface L0Visual {
  medium: string;
  resolution: { width: number; height: number };
  fps: number;
  aspect_ratio: string;
  rendering_method: string;
}

export interface L1Style {
  art_style: string;
  shape_language: string;
  line_quality: string;
  character_proportion: string;
  texture_philosophy: string;
}

export interface L2Design {
  global_palette: {
    primary: string;
    secondary: string;
    accent: string;
    forbidden: string[];
  };
  color_meaning: Record<string, string>; // color → meaning
  locations: Array<{
    id: string;
    style_description: string;
    lighting_sources: string[];
    props: string[];
  }>;
  costumes: Record<string, string[]>; // character_id → costume items
  vfx_approach: string;
}

// =====================================================================
// L3: 씬 단위 비주얼 플랜 (Scene-level visual discipline)
// 글로벌 L0~L2와 샷 L4 사이의 다리. 한 씬을 어떻게 찍을지의 영상 문법.
// =====================================================================

export interface L3SceneVisualPlan {
  scene_id: string;

  // 커버리지 패턴
  coverage_pattern:
    | 'master_inserts'        // 마스터 + 인서트
    | 'shot_reverse'          // 정면-역면 cut
    | 'developing'            // 점진적으로 거리 좁히기
    | 'handheld_continuous'   // 핸드헬드 연속
    | 'montage'               // 압축 몽타주
    | 'single_take';          // 단일 컷 (1 take)
  shot_count_target: number;

  // 카메라 vocabulary (씬 내 일관)
  lens_vocabulary: number[];  // mm. 예: [50] 단일 / [35, 85] 2종
  camera_mounting: 'tripod' | 'handheld' | 'gimbal' | 'steadicam' | 'mixed';
  camera_energy: 'static' | 'breathing' | 'kinetic';

  // 조명/팔레트 진화
  lighting_arc: {
    start_K: number;
    end_K: number;
    dominant_ratio: string;   // "4:1" 등
    quality: 'hard' | 'soft' | 'diffused';
  };
  palette_emphasis: string[];  // L2.global_palette 중 강조할 색

  // 공간 / POV
  dominant_pov: string;        // character_id | "omniscient"
  spatial_axis_180?: { from_char: string; to_char: string };  // 180° 축

  // 리듬 / 편집
  rhythm_profile: 'accelerating' | 'sustained' | 'decaying' | 'punctuated';
  cut_pace: 'long_takes' | 'medium' | 'rapid';
  avg_shot_seconds: number;

  // 분위기
  silence_intentional: boolean;
  sound_motif_hints: string[];

  // 설계 근거 (1줄)
  visual_intent: string;
}

// =====================================================================
// L4: 샷 단위 3분할 (T2I2V 파이프라인 대응)
//   L4a: 연출 의도 (story beat 1:1 매핑)
//   L4b: 정적 시각 (Image 생성 입력 — 풍부)
//   L4c: 동적 시각 (Video 생성 입력 — 압축)
// =====================================================================

export interface L4aShotIntent {
  shot_id: string;
  scene_id: string;
  story_beat_ref: number;            // S3.scenes[i].scene_actions의 index
  dramatic_purpose: string;          // 예: "Kai의 망설임 노출"
  duration_seconds: number;          // 보통 5~15초 (action_budget 기반)
  duration_justification: string;    // 왜 이 길이인가
  audience_focus: string;            // 관객 시선이 머무는 지점
  shot_position_in_scene:
    | 'opening' | 'developing' | 'climax' | 'resolution' | 'transition';
}

export interface L4bShotStatic {
  shot_id: string;

  // 카메라 (frame start 기준 정적)
  lens_mm: number;                   // L3.lens_vocabulary에서 선택
  shot_type: string;                 // EWS, WS, MS, MCU, CU, ECU, OTS, 2S, INSERT, POV
  camera_angle: string;              // eye_level, low, high, dutch, overhead 등
  focal_distance_m?: number;
  depth_of_field: 'shallow' | 'medium' | 'deep';

  // 구도
  framing: {
    rule: 'thirds' | 'center' | 'symmetry' | 'diagonal' | 'frame_in_frame' | 'asymmetric';
    layers: { foreground?: string; midground?: string; background?: string };
    focal_point: string;             // 관객 시선이 머무는 화면 지점
  };

  // 조명 (이 순간 frozen)
  lighting: {
    key_fill_ratio: string;
    color_temp_kelvin: number;
    quality: 'hard' | 'soft' | 'diffused';
    key_direction: string;           // top_left, front, side_right 등
  };

  // 캐릭터 blocking
  character_blocking: Array<{
    character_id: string;
    position_in_frame: string;       // left_third, center, frame_edge_right
    pose: string;                    // standing_facing_left, seated_back_to_camera
    gaze: string;                    // toward_camera, off_screen_left, down
    asset_version: string;           // v1, v2 (의상/상태 버전)
  }>;

  // 소품
  prop_placement: Array<{
    prop: string;
    position_in_frame: string;
    significance?: string;
  }>;

  // 색/질감 emphasis
  palette_emphasis: string[];        // L3.palette_emphasis 중 이 샷 강조 색
  texture_notes: string;
  color_grading_intent: string;

  // 최종 출력 (compile 결과)
  first_frame_prompt: string;        // Image 생성기 입력 (200~400자 OK)
}

export interface L4cShotDynamic {
  shot_id: string;

  // 카메라 모션 (5~15초 동안)
  camera_motion: {
    type: 'static' | 'pan' | 'tilt' | 'dolly_in' | 'dolly_out'
        | 'tracking' | 'crane' | 'handheld_drift' | 'rack_focus';
    direction?: string;              // left_to_right, forward, etc.
    speed: 'slow' | 'medium' | 'fast';
    magnitude: 'minimal' | 'moderate' | 'large';
  };

  // 캐릭터 모션 (1~2개 동사로 압축)
  character_motion: Array<{
    character_id: string;
    verb: string;                    // 동사 1~2개
    magnitude: 'micro' | 'small' | 'medium' | 'large';
  }>;

  // 시선 arc (선택)
  gaze_arc?: Array<{
    character_id: string;
    from: string;
    to: string;
  }>;

  // 환경 변화 (선택)
  environmental_change?: Array<{
    type: string;                    // rain_intensifies, light_flicker
    magnitude: 'subtle' | 'moderate' | 'strong';
  }>;

  // 전환
  transition_in?: 'cut' | 'fade' | 'dissolve' | 'match_cut' | 'pre_lap' | 'l_cut';
  transition_out?: 'cut' | 'fade' | 'dissolve' | 'match_cut' | 'j_cut';

  // 최종 출력 (compile 결과)
  motion_prompt: string;             // Video 생성기 입력 (50~80자, 동사 1~2개)
}

export interface L4Shot {
  intent: L4aShotIntent;
  static_spec: L4bShotStatic;
  dynamic_spec: L4cShotDynamic;
}

// =====================================================================
// 샷 시퀀스 (최종 출력)
// =====================================================================

export interface ShotSequenceItem {
  shot_id: string;
  duration_seconds: number;

  // S 정보
  S: {
    scene_id: string;
    scene_purpose: string;
    emotion_beat: { start: string; end: string };
    character_action: string;
    dialogue?: string;
  };

  // C 정보
  C: {
    hook_type?: string;
    causal_link: { from: string | null; to: string | null };
    motif_active?: string;
    info_disclosure: string;
  };

  // V 정보
  V: {
    camera: { type: string; angle: string; movement: string };
    lighting: { key_fill_ratio: string; color_temp: string };
    composition: string;
    mood: string;
  };

  // 에셋 참조
  assets: {
    characters: Array<{ id: string; asset_version: string; visible_parts?: string[] }>;
    locations: Array<{ id: string; asset_version: string }>;
    props?: Array<{ id: string; asset_version: string; first_appearance?: boolean }>;
  };

  // 첫 프레임 생성 (Qwen3 Image)
  first_frame_generation: {
    base_assets: string[];
    composition_prompt: string;
  };

  // 영상 생성 (Hunyuan Video 1.5)
  video_generation: {
    motion_prompt: string;
  };

  // 액션 예산 검증
  action_budget: {
    primary_action_count: number;
    secondary_action_count: number;
    camera_movement_complexity: 'none' | 'simple' | 'complex';
    environmental_changes: number;
    passed_validation: boolean;
  };

  // 연속성 메타
  continuity: {
    carry_forward_from: string | null;
    consistent_elements: string[];
    changes: string[];
    is_scene_transition: boolean;
  };
}

export interface ShotSequence {
  project_id: string;
  total_shots: number;
  total_duration_seconds: number;
  depth_level: DepthLevel;
  shots: ShotSequenceItem[];
}

// =====================================================================
// L5: Render Spec — T2I/TI2V 프롬프트 추출 + provider-agnostic 패키징
// 현재는 추출 모드만 (extraction_only=true). 추후 provider-specific 변환/
//   seed/cfg/asset path resolution/IP-Adapter 등 확장 예정.
// =====================================================================

export interface ImageRequest {
  prompt: string;                     // T2I 프롬프트 (L4b.first_frame_prompt 추출)
  base_assets: string[];              // 참조 에셋 ID (캐릭터/로케이션)
  aspect_ratio?: string;              // L0에서 carry
  resolution?: { width: number; height: number };
  // === 향후 (L5 고도화) ===
  provider?: 'qwen3' | 'imagen' | 'flux' | 'nano_banana';
  negative_prompt?: string;
  seed?: number;
  cfg_scale?: number;
  steps?: number;
  sampler?: string;
  reference_images?: string[];        // IP-Adapter / ControlNet 시드
  lora_refs?: string[];
  estimated_cost_usd?: number;
}

export interface VideoRequest {
  motion_prompt: string;              // TI2V 모션 프롬프트 (L4c.motion_prompt 추출)
  duration_seconds: number;
  fps?: number;                       // L0에서 carry
  // === 향후 (L5 고도화) ===
  provider?: 'hunyuan' | 'kling' | 'veo' | 'sora';
  first_frame_input?: string;         // ImageRequest의 출력 경로 (체이닝)
  motion_strength?: number;
  interpolation?: boolean;
  estimated_cost_usd?: number;
}

export interface ShotRenderSpec {
  shot_id: string;
  duration_seconds: number;
  image_request: ImageRequest;
  video_request: VideoRequest;
  // 향후: transition_handling, fallback_chain, retry_policy 등
}

export interface RenderPlan {
  project_id: string;
  total_shots: number;
  total_duration_seconds: number;
  aspect_ratio: string;
  resolution: { width: number; height: number };
  fps: number;
  shots: ShotRenderSpec[];
  extraction_only: boolean;           // 현재 추출 모드 명시. true면 provider 미결정/추가 파라미터 없음
  // === 향후 (L5 고도화) ===
  total_estimated_cost_usd?: number;
  total_estimated_minutes?: number;
  default_providers?: {
    image: string;
    video: string;
  };
}

// =====================================================================
// 통합 결과 (모든 단계 + 최종 샷 시퀀스)
// =====================================================================

export interface PipelineResult {
  project_id: string;
  input: PipelineInput;
  S0: S0Genre;
  S1: S1Structure;
  S2: S2Block;
  S3: S3Block;
  c_validation_1: CValidation1Report;
  mid_preview: MidPreview;
  L0: L0Visual;
  L1: L1Style;
  L2: L2Design;
  L3: L3SceneVisualPlan[];   // 씬 단위 비주얼 플랜
  L4: L4Shot[];              // 샷 단위 3분할 (intent + static + dynamic)
  c_validation_2: CValidation2Report;
  shot_sequence: ShotSequence;
  final_prompts: FinalPromptsOutput;  // L5: T2I + TI2V 최종 프롬프트
  metadata: {
    started_at: string;
    completed_at: string;
    total_duration_ms: number;
    llm_calls: {
      gemini: number;
      claude: number;
      openai: number;
      local: number;
    };
  };
}
