// S, V, C, Shot Sequence 데이터 모델
// linear_pipeline.md 기준

export type DepthLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7';

// Compact Mode 트리거: 어떤 depth도 V3를 스킵하지 않음 — 짧은 영상(D1~D3)도 풀 파이프라인.
//   (이전엔 D1~D3가 V3를 스킵하고 V4가 디시플린을 자체 판단 → 씬 단위 연출 규율이 약했음.
//    연출 품질을 위해 모든 depth가 V3 씬 비주얼 플랜을 거치도록 변경.)
//   재활성화하려면 해당 레벨을 배열에 다시 추가하면 됨.
export const COMPACT_DEPTH_LEVELS: readonly DepthLevel[] = [];
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
// V5: T2I / TI2V 최종 프롬프트 (마지막 stage 출력)
// =====================================================================

export interface T2IPrompt {
  prompt: string;                  // 첫 프레임 생성용 (200~400자)
  negative_prompt?: string;
  aspect_ratio: string;            // V0.aspect_ratio
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

export interface RenderPromptsOutput {
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

// =====================================================================
// Assets: 캐릭터/로케이션 reference 이미지 (V2 직후 생성, V6 input)
//   - V0의 reference_assets ID와 1:1 매칭되는 실제 이미지 URL
//   - V6 T2I는 이걸 reference_image_urls로 fal에 전달 (I2I)
// =====================================================================

export type AssetKind = 'character' | 'location';

export interface AssetItem {
  id: string;                // S2 character.id 또는 V2 location.id
  kind: AssetKind;
  name: string;
  prompt_used: string;
  image_url: string;
  width?: number;
  height?: number;
  model: string;
  status: 'success' | 'failed' | 'pending';
  error?: string;
  request_id?: string;
  submitted_at?: string;
}

export interface AssetsManifest {
  total: number;
  success_count: number;
  failed_count: number;
  pending_count?: number;
  model: string;
  aspect_ratio: string;            // V0.aspect_ratio (reference 일관성 위해 동일)
  characters: AssetItem[];
  locations: AssetItem[];
}

// =====================================================================
// V6: 첫 프레임 이미지 (fal.ai T2I 결과)
// =====================================================================

export interface ShotImageResult {
  shot_id: string;
  scene_id: string;
  image_url: string;
  width?: number;
  height?: number;
  prompt_used: string;
  model: string;
  // pending = submit 완료, fal 큐에서 생성 중. request_id로 결과 회수 가능.
  status: 'success' | 'failed' | 'pending';
  error?: string;
  request_id?: string;       // fal queue id (pending 상태 회수에 필요)
  submitted_at?: string;     // ISO. resume timeout 판단용
}

export interface ShotImagesOutput {
  total_shots: number;
  success_count: number;
  failed_count: number;
  pending_count?: number;
  model: string;
  shots: ShotImageResult[];
}

// =====================================================================
// V7: 영상 클립 (fal.ai TI2V 결과)
// =====================================================================

export interface ShotVideoResult {
  shot_id: string;
  scene_id: string;
  video_url: string;
  duration_seconds: number;
  prompt_used: string;
  first_frame_url: string;
  model: string;
  status: 'success' | 'failed' | 'skipped' | 'pending';
  error?: string;
  request_id?: string;
  submitted_at?: string;
}

export interface ShotVideosOutput {
  total_shots: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  pending_count?: number;
  model: string;
  shots: ShotVideoResult[];
}

export interface PipelineInput {
  story: string;          // 자유 텍스트 입력
  presetId?: string;      // 선택적 장르 프리셋
  runtimeSeconds?: number; // 사용자 명시 러닝타임 (없으면 자동 결정)
  models?: PipelineModelsInput; // S/V/C 축별 모델 선택 (선택)
  // producer-story-gate §3: producer가 확정한 장르(완성형)·캐스트 seed.
  //   있으면 createRun이 state.genre/state.characters를 seed → s0(genre)/s2(characters) step이
  //   has 체크(`!== undefined`)로 자연 생략된다. writer는 s1(structure)부터 수행.
  genre?: Genre;
  cast?: CastContract;
  // V축 재설계(2026-06-13): 월드/세팅 seed (s2 = characters + 월드). createRun이 state.world로 seed.
  background?: BackgroundContract;
  // 스타일 앵커 연결(2026-07-14): producer "스타일&톤"에서 유저가 직접 고른 전역 그림체 견본
  //   (projects.style_anchor_key → style_anchors 행). 있으면 v0가 art_style/매체를 장르에서
  //   발명하지 않고 앵커 매체로 고정 → writer 전 체인(v1~v5 텍스트)이 유저 선택과 정합.
  //   소비 시점 art_style 억제(generate-sheet)는 "앵커를 나중에 바꾸는" 경우의 안전망으로 별도 유지.
  styleAnchor?: { key: string; label?: string; medium?: string };
  /**
   * Stage skip 플래그. 피드백이 다운스트림에 실질 반영되지 않는 stage를
   * 건너뛰어 LLM 호출/시간을 절약한다. 미지정 시 default = skip(true).
   *   - validation1: c_validation_1 (C 검증 ①) 통째 skip
   */
  skip?: {
    validation1?: boolean;
  };
}

// =====================================================================
// S축 (Story Layer)
// =====================================================================

export interface Genre {
  genre: string;
  subGenre?: string;
  tone: string[];
  targetEmotion: string[];
  runtime_seconds: number;
  depth_level: DepthLevel;
  format: string; // "horizontal_16:9" | "vertical_9:16" | "cinema_2.39:1"
}

export interface NarrativeStructure {
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

export interface StoryCharacter {
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
  appearance_description: string;
  motivation: {
    want: string;
    need: string;
    wound?: string;
  };
}

export interface StoryRelationship {
  between: [string, string]; // character ids
  type: string;
  state_change?: string;
  visible_in_video: boolean;
}

export interface Characters {
  characters: StoryCharacter[];
  relationships: StoryRelationship[];
  subtext_notes: string[];
}

// producer → writer 핸드오프 계약 (producer-story-gate §3). characters 테이블 컬럼과 1:1.
//   slug(character_id) 생성은 producer가 소유. writer는 이를 seed로 받아 재료로만 읽는다.
export interface CastContractCharacter {
  character_id: string; // producer가 확정한 slug
  name: string;
  entity_type: 'person' | 'object';
  role?: string;
  appearance: string;
  arc?: { start_state: string; end_state: string; arc_type: string };
  motivation?: { want: string; need?: string; wound?: string };
}
export interface CastContract {
  characters: CastContractCharacter[];
  relationships?: StoryRelationship[];
  subtext_notes?: string[];
}

export interface StoryScene {
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

// 오픈 캐스트 (producer-story-gate §4): s3_scenes 가 전개상 새 인물이 필요할 때만 분리 반환.
//   파이프라인이 state.characters 에 머지(origin='writer')하고 persistAssetsToDb 가 새 slug 만 insert.
//   최소 필드 — 나머지는 mergeOpenCast 가 StoryCharacter 기본값으로 채운다.
export interface NewCharacter {
  id: string; // 새 slug (snake_case, 기존 캐스트와 중복 금지)
  name: string;
  role?: string; // "protagonist" | "antagonist" | "supporting"
  appearance_description?: string;
  // 오픈캐스트도 서사 속성을 가진다(#opencast-arc 2026-07-21) — s3가 "전개상 왜 필요한지" 아는
  //   시점에 함께 산출. mergeOpenCast가 기본값 대신 사용, persist가 DB(arc/motivation JSONB)에 기록.
  personality?: string[];
  arc?: { start_state?: string; end_state?: string; arc_type?: string };
  motivation?: { want?: string; need?: string };
}

export interface Scenes {
  scenes: StoryScene[];
  total_estimated_seconds: number;
  // 전개상 추가된 새 인물 (기존 캐스트로 충분하면 [] 또는 미반환). §4 오픈 캐스트.
  new_characters?: NewCharacter[];
  // E3b 시간 예산 모드 — 코드가 설정(LLM 출력 아님). honest=씬초↔액션 결합 검증됨,
  // representative=장편 대표 스토리보드(씬 초가 액션보다 클 수 있음 — 의도된 것).
  coverage_mode?: 'honest' | 'representative';
}

// =====================================================================
// C 메타레이어 (검증 결과)
// =====================================================================

export type ValidationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  category: 'causality' | 'cdq' | 'verisimilitude' | 'cliche' | 'differentiator' | 'action_budget' | 'continuity' | 'theme' | 'cinematography';
  severity: ValidationSeverity;
  location: string; // "S3.scene_2" or "shot_5" etc
  message: string;
  suggestion?: string;
}

export interface StoryCheckReport {
  passed: boolean;
  issues: ValidationIssue[];
  causality_chain: Array<{ from: string; to: string; connector: 'therefore' | 'but' | 'and_then' }>;
  cdq_present: boolean;
  cdq_clarity_score: number; // 0~1
  cliche_count: number;
  retry_count: number;
}

export interface ShotCheckReport {
  passed: boolean;
  issues: ValidationIssue[];
  shots_split_count: number;
  total_action_violations_fixed: number;
}

// =====================================================================
// V축 (Visual Layer)
// =====================================================================

export interface RenderFormat {
  medium: string;
  resolution: { width: number; height: number };
  fps: number;
  aspect_ratio: string;
  rendering_method: string;
}

export interface ArtDirection {
  art_style: string;
  shape_language: string;
  line_quality: string;
  character_proportion: string;
  texture_philosophy: string;
}

// =====================================================================
// V축 연결 재설계 (2026-06-13) — coarse-to-fine + 같은-계층(s_n↔v_n) 참조.
//   v0↔s0 VisualIdentity / v1↔s1 ActVisualArc / v2↔s2 CharacterVisual+WorldVisual / v3↔s3 SceneCinematography.
//   각 v_n = [자기 s_n] + [직전 v_{n-1}]만 직접 참조. 계획: dev/VISUAL_AXIS_REDESIGN_PLAN.md
//   (2026-06: 전 스테이지 native 전환 완료 — 구 ProductionDesign 제거. RenderFormat/ArtDirection 은 VisualIdentity.format/style 로 잔존.)
// =====================================================================

// producer seed: 월드/세팅 (s2 = characters + 월드). ≤10min 전제 — 스토리 필요 배경만.
export interface BackgroundContract {
  locations: Array<{ id: string; name: string; description: string }>;
  setting?: string; // 세계관/시대/분위기 한 줄 (선택)
}

// v0 ↔ s0(genre): 비주얼 아이덴티티 = 포맷 + 글로벌 스타일 (구 RenderFormat+ArtDirection 병합).
//   format/style 을 별 sub-블록으로 둬 기술 스펙 vs 미학 혼선을 막는다(audit 지적).
export interface VisualIdentity {
  format: RenderFormat; // 매체/해상도/fps/비율/렌더
  style: ArtDirection;  // art_style/shape/line/proportion/texture (전역 고정)
}

// v1 ↔ s1(narrativeStructure): 막별 비주얼 아크 — 막/전환점 따라 비주얼이 어떻게 진화하는가.
export interface ActVisualArc {
  acts: Array<{
    act_id: string;        // NarrativeStructure.acts[].act_id 참조
    palette_shift: string; // 이 막의 색 방향
    lighting_mood: string; // 조명/톤
    energy: 'low' | 'rising' | 'high' | 'falling';
    visual_note: string;   // 한 줄 의도
  }>;
  global_arc_intent: string;
}

// v2 ↔ s2(characters): 인물 비주얼.
export interface CharacterVisual {
  characters: Array<{
    character_id: string;
    appearance: string; // 시각 외형(구체)
    costume: string[];
    palette: string[];  // 인물 강조색
  }>;
}

// v2 ↔ s2(world/background): 월드 비주얼 (글로벌 팔레트·컬러 의미·로케이션·VFX).
export interface WorldVisual {
  global_palette: { primary: string; secondary: string; accent: string; forbidden: string[] };
  color_meaning: Record<string, string>; // color → meaning
  locations: Array<{ id: string; style_description: string; lighting_sources: string[]; props: string[] }>;
  vfx_approach: string;
}

// =====================================================================
// V3: 씬 단위 비주얼 플랜 (Scene-level visual discipline)
// 글로벌 V0~V2와 샷 V4 사이의 다리. 한 씬을 어떻게 찍을지의 영상 문법.
// =====================================================================

export interface SceneCinematography {
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
  palette_emphasis: string[];  // V2.global_palette 중 강조할 색

  // 공간 / POV
  dominant_pov: string;        // character_id | "omniscient"
  spatial_axis_180?: { from_char: string; to_char: string };  // 180° 축

  // 리듬 / 편집
  rhythm_profile: 'accelerating' | 'sustained' | 'decaying' | 'punctuated';
  cut_pace: 'long_takes' | 'medium' | 'rapid';
  avg_shot_seconds: number;

  // 설계 근거 (1줄)
  visual_intent: string;
}

// =====================================================================
// Découpage: 감독의 beat→shot 분해 (Director's authored shot breakdown)
//   linear_pipeline.md Turn 7 설계. S3 내러티브 비트와 샷을 분리한다.
//     - 비트(scene_actions) = "무슨 일이 일어나는가" (내러티브 단위)
//     - 샷 = "어떻게 찍는가" (카메라 단위)
//     - 둘의 매핑(N:M)이 감독의 1차 craft = découpage
//   시간 제약은 driver가 아니라 validator: 감독이 샷 수를 저작, action_budget이 검증.
//   V3/V4 사이에 위치. V4는 이 데쿠파주를 받아 각 샷을 3분할로 살만 붙인다.
// =====================================================================

export type ShotOperation =
  | 'derived'   // 비트 1:1 (기본)
  | 'added'     // 스토리에 없는 샷 추가 (establishing/cutaway/reaction/insert) — 연출의 핵심
  | 'merged'    // 여러 비트를 한 샷으로 (롱테이크/oner)
  | 'split';    // 한 비트를 여러 샷으로 (커버리지/리듬)

export type ShotFunction =
  | 'establishing'  // 공간/스케일 설정 (오리엔테이션)
  | 'master'        // 씬 전체를 담는 기준 샷
  | 'action'        // 주요 행동
  | 'reaction'      // 인물 반응 (대사/사건에 대한)
  | 'insert'        // 소품/디테일 클로즈업 (서사적 의미)
  | 'cutaway'       // 다른 대상으로 시선 분산 (긴장/리듬)
  | 'detail'        // 질감/분위기 디테일
  | 'pov'           // 인물 시점
  | 'reveal'        // 정보 공개 (push-in/pull-back)
  | 'transition';   // 씬/시간 전환

export type RhythmRole =
  | 'establish'   // 느린 오리엔테이션 (긴 호흡)
  | 'develop'     // 전개 (중간 템포)
  | 'punctuate'   // 강조 컷 (짧고 강함)
  | 'sustain'     // 유지 (긴 테이크, 몰입)
  | 'accelerate'  // 가속 (점점 짧아지는 컷)
  | 'breath';     // 쉼 (정적 비트, 눈 휴식)

export interface DecoupageShot {
  shot_id: string;
  scene_id: string;
  operation: ShotOperation;
  shot_function: ShotFunction;
  // scene.scene_actions 인덱스 매핑.
  //   derived=[i] / merged=[i,j,..] / split=[i] (여러 split 샷이 같은 i 공유) / added=[]
  source_beats: number[];
  added_rationale?: string;        // operation==='added'일 때 필수: 왜 이 스토리-부재 샷이 필요한가
  beat_summary: string;            // 이 샷이 담는 내용 (derived/merged/split=비트 텍스트, added=추가 내용) — EN base(S7)
  beat_summary_native?: string;    // 같은 내용의 유저 언어 병기(#shot-story 2026-07-21) — 표시 전용(실행 중 프리뷰). 하류 생성은 beat_summary(EN)만 소비.
  shot_size: 'EWS' | 'WS' | 'FS' | 'MFS' | 'MS' | 'MCU' | 'CU' | 'ECU' | 'OTS' | '2S' | 'POV';
  intended_duration_seconds: number;
  rhythm_role: RhythmRole;
  camera_intent: 'static' | 'motivated_move';
  camera_move_motivation?: string; // camera_intent==='motivated_move'일 때 필수: 감정적 동기
  dramatic_purpose: string;
}

export interface SceneDecoupage {
  scene_id: string;
  beat_count: number;              // scene_actions 수
  shot_count: number;              // 데쿠파주가 저작한 샷 수 (beat_count와 독립적으로 결정)
  coverage_ratio: number;          // shot_count / beat_count
  rhythm_profile: string;          // 씬의 정적/동적 에너지 곡선 (1줄)
  uncovered_beats: number[];       // 의도적으로 생략(REMOVE)한 비트 인덱스 (기본 빈 배열)
  shots: DecoupageShot[];
}

export interface DecoupagePlan {
  scenes: SceneDecoupage[];
  total_shots: number;
  total_added: number;             // 감독이 추가한 스토리-부재 샷 수
  total_merged: number;
  total_split: number;
  director_notes: string;          // 전체 데쿠파주 전략 요약
}

// =====================================================================
// V4: 샷 단위 3분할 (T2I2V 파이프라인 대응)
//   V4a: 연출 의도 (story beat 1:1 매핑)
//   V4b: 정적 시각 (Image 생성 입력 — 풍부)
//   V4c: 동적 시각 (Video 생성 입력 — 압축)
// =====================================================================

export interface ShotIntent {
  shot_id: string;
  scene_id: string;
  story_beat_ref: number;            // S3.scenes[i].scene_actions의 index
  dramatic_purpose: string;          // 예: "Kai의 망설임 노출"
  duration_seconds: number;          // 보통 5~15초 (action_budget 기반)
  duration_justification: string;    // 왜 이 길이인가
  audience_focus: string;            // 관객 시선이 머무는 지점
  shot_position_in_scene:
    | 'opening' | 'developing' | 'climax' | 'resolution' | 'transition';

  // 데쿠파주 출처 (decoupageDriven 시 v4 가 결정론적 주입 — beat→shot 추적성 #8). compact/legacy 면 미설정.
  operation?: ShotOperation;
  source_beats?: number[];           // 이 샷이 담는 scene_actions 인덱스 (story_beat_ref 단수의 확장)
  shot_function?: ShotFunction;
  rhythm_role?: RhythmRole;
}

export interface ShotStaticSpec {
  shot_id: string;

  // 카메라 (frame start 기준 정적)
  lens_mm: number;                   // V3.lens_vocabulary에서 선택
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
  palette_emphasis: string[];        // V3.palette_emphasis 중 이 샷 강조 색
  texture_notes: string;
  color_grading_intent: string;

  // 최종 출력 (compile 결과)
  first_frame_prompt: string;        // Image 생성기 입력 (200~400자 OK)
}

export interface ShotDynamicSpec {
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

export interface ShotDesign {
  intent: ShotIntent;
  static_spec: ShotStaticSpec;
  dynamic_spec: ShotDynamicSpec;
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
// 샷 단위 대사 트랙 (#dialogue-v4 2026-07-23) — 대사 스테이지(stages/dialogue.ts) 산출.
//   lab/exp2 블라인드 A/B에서 확정된 V4 구성: 보이스 프로파일 + 씬 순차 글로벌 메모리
//   + 3규율(침묵 예산·정보 공개 순서·명대사 금지). persist가 shots.dialogue_lines로 매핑한다.
// =====================================================================

/** 인물 보이스(어투) 프로파일 — 대사 스테이지 상류에서 캐스트로부터 설계 */
export interface VoiceProfile {
  character_id: string;
  name: string;
  speech_style: string;          // 말투 한 줄 (예: "무뚝뚝한 반말, 필요한 말만")
  formality: string;             // 반말/존댓말/혼용 + 상대별 변화
  sentence_length: string;
  verbal_tics: string[];         // 말버릇
  emotional_expression: string;  // 감정을 말로 드러내는 방식
  taboo: string;                 // 절대 쓰지 않을 말투/어휘
  example_lines: string[];
}

export interface ShotDialogueLine {
  character_id: string;
  line: string;
  delivery?: string;
}

export interface ShotDialogue {
  shot_id: string;               // decoupage 표준화 shot_id (shot_N)
  dialogue: ShotDialogueLine[];  // 빈 배열 = 침묵 샷 (정상)
  narration: string | null;      // 보이스오버 — 서사적으로 필요할 때만
}

export interface SceneShotDialogue {
  scene_id: string;
  shots: ShotDialogue[];
}

/** 씬 순차 전개 메모리 — 대사 일관성 저장소 (V4의 "확립된 사실"이 정보 공개 순서의 진실) */
export interface DialogueMemory {
  established_facts: string[];
  relationship_state: string;
  tone_notes: string;
  notable_lines: { character_id: string; line: string }[];
}

/** 대사 스테이지 최종 산출 — writer_runs.state.dialogue */
export interface DialogueTrack {
  profiles: VoiceProfile[];
  scenes: SceneShotDialogue[];
}

// Render Spec 타입(`RenderPromptsOutput`/`T2IPrompt`/`TI2VPrompt`/`ShotGenerationPrompts`)은
// 본 파일 상단(50번대 줄)에 정의됨. l5_prompts.ts 참조.
// 향후 provider-specific 확장(seed/cfg/asset path/IP-Adapter 등)은 그 위에서.

// =====================================================================
// 통합 결과 (모든 단계 + 최종 샷 시퀀스)
// =====================================================================

export interface PipelineResult {
  project_id: string;
  input: PipelineInput;
  genre: Genre;
  narrativeStructure: NarrativeStructure;
  characters: Characters;
  scenes: Scenes;
  storyCheck: StoryCheckReport;
  visualIdentity: VisualIdentity;        // v0 (format+style)
  actVisualArc: ActVisualArc;            // v1 (막별 비주얼 아크)
  characterVisual: CharacterVisual;      // v2 (인물 비주얼)
  worldVisual: WorldVisual;              // v2 (월드 비주얼)
  sceneCinematography: SceneCinematography[];   // 씬 단위 비주얼 플랜
  decoupage: DecoupagePlan;              // 감독 beat→shot 분해 (#8 가시화)
  shotDesign: ShotDesign[];              // 샷 단위 3분할 (intent + static + dynamic)
  shotCheck: ShotCheckReport;
  shotSequence: ShotSequence;
  renderPrompts: RenderPromptsOutput;  // T2I + TI2V 최종 프롬프트
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

