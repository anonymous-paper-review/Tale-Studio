// B안 타입 — 행동소 그룹(motion unit)이 1급, 카메라 상태는 그룹에 종속.
// 핵심 성질: 한 그룹 안에서 카메라 상태 변화를 표현할 수 없다 → R1(경계 규칙) 위반이 타입상 불가능.
// 출처: Tale-Studio/dev/Visual_Improvement/action-unit-camera-alignment.md §4.3

export type ActorMagnitude = 'micro' | 'small' | 'medium' | 'large';
export type CameraMagnitude = 'minimal' | 'moderate' | 'large';
export type CameraSpeed = 'slow' | 'medium' | 'fast';
export type CameraType =
  | 'static' | 'pan' | 'tilt' | 'dolly_in' | 'dolly_out'
  | 'tracking' | 'crane' | 'handheld_drift' | 'rack_focus';
export type Coupling = 'track_subject' | 'hold' | 'reveal' | 'counter';
export type IntentTag = 'disorientation' | 'dread' | 'reveal' | 'pov_unstable';
export type Phase = 'wind_up' | 'contact' | 'follow_through';
export type TransitionOut = 'cut' | 'match_cut' | 'fade' | 'dissolve';

export interface MotionUnitActor {
  character_id: string;
  verb: string;                    // 동사 1개 (행동소 = 최소 단위)
  magnitude: ActorMagnitude;
}

export interface CameraState {
  type: CameraType;
  direction?: string;              // left_to_right, forward 등
  speed: CameraSpeed;
  magnitude: CameraMagnitude;
  coupling: Coupling;              // R2의 1급 표현
  coupled_to?: string;             // coupling==='track_subject'일 때 필수 (character_id 또는 객체명)
  intent_tag?: IntentTag;          // coupling==='counter'일 때 필수 (면제 태그)
}

export interface MotionUnit {
  group_id: string;                // 행동소 그룹 id. 인접 샷에서 같은 id = 단위가 컷을 관통(match-on-action)
  intent: string;                  // 이 그룹의 연출 의도 1줄 — 정합 검사의 "의도" 변
  actors: MotionUnitActor[];       // 빈 배열 = 무인/환경 샷 (환경 모션은 intent에 서술)
  phase?: Phase;
  duration_share: number;          // 샷 길이 중 이 그룹의 비중 (0~1, 샷 내 합 ≈ 1)
  camera_state: CameraState;       // 그룹당 정확히 1개 — B안의 구조적 보장
}

export interface ShotMotionPlan {
  shot_id: string;
  units: MotionUnit[];
  transition_out?: TransitionOut;  // 마지막 그룹이 다음 샷으로 이어지면 match_cut
  motion_prompt: string;           // 컴파일 결과 (I2V 입력, 영어 50~80자)
}

export interface SceneMotionPlan {
  scene_id: string;
  shots: ShotMotionPlan[];
}

// ---- DB rows (필요 필드만) ----

export interface DbProject {
  id: string;
  title: string | null;
  story_text: string | null;
}

export interface DbScene {
  scene_id: string;
  narrative_summary: string | null;
  original_text_quote: string | null;
  mood: string | null;
  characters_present: string[] | null;
  sort_order: number;
}

export interface DbShot {
  shot_id: string;
  scene_id: string;
  shot_type: string;
  action_description: string | null;
  characters: string[] | null;
  duration_seconds: number | null;
  sort_order: number;
}

// ---- 검증 ----

export type RuleId =
  | 'SCHEMA'                 // 구조/enum 위반 (LLM이 B안 형태 자체를 못 지킴)
  | 'V2_UNTAGGED_COUNTER'    // counter 결합인데 intent_tag 없음 → 거짓 신호 (fail)
  | 'V3_MAGNITUDE_EXCESS'    // 카메라 크기 > 행동 크기 허용 매핑 (warn)
  | 'VB_UNIT_BUDGET'         // 그룹 수 > 시간 예산 (warn)
  | 'VS_SHARE_SUM'           // duration_share 합 ≠ 1 (warn)
  | 'V4_UNIT_ABANDON';       // 그룹이 샷 경계를 관통하는데 match_cut 미표시 (warn)

export interface Violation {
  rule: RuleId;
  shot_id: string;
  group_id?: string;
  severity: 'fail' | 'warn';
  detail: string;
}

export interface ShotScore {
  shot_id: string;
  unitCount: number;
  violations: Violation[];
  alignmentScore: number;          // 2·#V2 + 1·#V3 (plan-time 항만, 서수적 비교용)
}

export interface RunResult {
  runIndex: number;
  sceneId: string;
  plan: SceneMotionPlan;
  scores: ShotScore[];
  llm: { backend: string; ms: number; retried: boolean };
}
