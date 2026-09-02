// 영상 생성 물리 상수 — 프롬프트에 주입되는 백엔드 법칙의 단일 소스 (#prompt-audit 2026-07-21, 독트린 P2).
// 같은 법칙(샷 초 대역·프롬프트 자수)이 스테이지 산문마다 다른 숫자로 표류하던 것을 여기로 수렴한다
// (실측: decoupage "2~8초" vs v4 "5~15초" 동거, v4 "50~80자" vs v5 "50~100자").
// 값 변경 시 회귀 배터리(research/experiments/foundation/2026-07-21_cleanup-regression — R1) 재실행이 계약이다.

export const SHOT_PHYSICS = {
  /** 샷 하나의 초 대역 — 생성 클립 단위. 짧고 스냅있게. */
  shotSecondsMin: 2,
  shotSecondsMax: 8,
  /** 예외(긴 침묵 등)에만 허용되는 절대 상한. */
  shotSecondsHardMax: 10,
  /** 클립당 캐릭터 액션 예산 — 동사 수 상한. 같은 인물의 2동사 순차는 허용(#coverage-first 2026-09-02, duration ≥5s). */
  verbsPerShotMax: 2,
  /** TI2V 모션 프롬프트 자수 대역 (압축 필수). */
  motionPromptCharsMin: 50,
  motionPromptCharsMax: 80,
  /** T2I 첫 프레임 프롬프트 자수 대역 (정적 묘사 풍부하게). */
  firstFramePromptCharsMin: 200,
  firstFramePromptCharsMax: 400,
} as const;

// ── 프롬프트 주입용 문구 조각 — 모든 스테이지가 같은 표현을 쓰게 한다 ──
export const SHOT_SECONDS_RANGE = `${SHOT_PHYSICS.shotSecondsMin}~${SHOT_PHYSICS.shotSecondsMax}초`;
export const SHOT_SECONDS_HARD_MAX = `${SHOT_PHYSICS.shotSecondsHardMax}초`;
export const MOTION_PROMPT_CHARS = `${SHOT_PHYSICS.motionPromptCharsMin}~${SHOT_PHYSICS.motionPromptCharsMax}자`;

// ── 샷 페이싱 상수(#duration-surgery 2026-08-31 오너 확정 A+B) — 계산기(duration_reallocation)와
//    프롬프트 루브릭(DURATION_RUBRIC)이 같은 숫자를 쓴다. 오너가 레퍼런스 영상으로 캘리브레이션할
//    단일 블록: 여기 값을 바꾸면 상류 가이드와 하류 재배분이 함께 움직인다.
export const SHOT_PACING = {
  /** character_motion magnitude 1개의 자연 수행 초. */
  motionSeconds: { micro: 0.6, small: 1.2, medium: 2.0, large: 3.0 } as Record<string, number>,
  /** 프레임 리딩 기본초 — 동작이 없어도 관객이 프레임을 읽는 최소 비용. */
  baseSeconds: 1.2,
  cameraSeconds: { none: 0, simple: 0.5, complex: 1.0 },
  /** 환경 변화 1건당 가산(합산 상한 1.0s). */
  environmentSecondsEach: 0.5,
  /** 대사 = 실발화 1배 + 이 여백 (2026-08-31 오너 확정: 총 여백 0.5s — 종전 1.5s 이중 여백 폐지). */
  speechMarginSeconds: 0.5,
  koCharsPerSec: 4.5,
  latinCharsPerSec: 13,
  /** needed 바닥 — 오너 루브릭 "리액션·인서트 = 2초". */
  floorSeconds: 2,
  /** 양방향 밴드: 배정이 ceil(needed)+slack 을 넘으면 그 값까지 감액(롱테이크 태그는 면제). */
  shrinkSlackSeconds: 2,
} as const;

/** duration 산정 루브릭 — decoupage/v4 프롬프트 공용(상류 가이드 A1). 숫자는 SHOT_PACING 파생. */
export const DURATION_RUBRIC = `duration 산정 규칙(초 단위, 산수로 정하라 — 감으로 정하지 마라):
- 기본 ${SHOT_PACING.baseSeconds}s(프레임 리딩) + 동작별 가산: 미세(micro) ${SHOT_PACING.motionSeconds.micro}s / 작음 ${SHOT_PACING.motionSeconds.small}s / 보통 ${SHOT_PACING.motionSeconds.medium}s / 큼 ${SHOT_PACING.motionSeconds.large}s
- 카메라 무브: 단순 +${SHOT_PACING.cameraSeconds.simple}s, 복합 +${SHOT_PACING.cameraSeconds.complex}s
- 대사 샷: 발화 시간(한글 글자수÷${SHOT_PACING.koCharsPerSec}) + ${SHOT_PACING.speechMarginSeconds}s — 액션과 병행되면 둘 중 큰 쪽
- 리액션·인서트 = ${SHOT_PACING.floorSeconds}s. 합계를 올림해 배정하고, 그보다 길게 주려면 duration_justification 에 사유를 적어라.
- 의도적 롱테이크는 duration_justification 을 "LONG TAKE — <사유>" 로 시작하라(재배분 감액 면제 태그).
예: 인서트 2s · 대사 6자+응시 4s(발화1.3+여백0.5 vs 기본1.2+micro0.6 → max≈1.8, 올림+대사 결합 3~4s) · 오프닝 설정 6s`; // i18n-ok: LLM 프롬프트 조각

export const FIRST_FRAME_CHARS = `${SHOT_PHYSICS.firstFramePromptCharsMin}~${SHOT_PHYSICS.firstFramePromptCharsMax}자`;
