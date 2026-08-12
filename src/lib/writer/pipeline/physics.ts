// 영상 생성 물리 상수 — 프롬프트에 주입되는 백엔드 법칙의 단일 소스 (#prompt-audit 2026-07-21, 독트린 P2).
// 같은 법칙(샷 초 대역·프롬프트 자수)이 스테이지 산문마다 다른 숫자로 표류하던 것을 여기로 수렴한다
// (실측: decoupage "2~8초" vs v4 "5~15초" 동거, v4 "50~80자" vs v5 "50~100자").
// 값 변경 시 회귀 배터리(research/experiments/foundation/2026-07-21_cleanup-regression — R1) 재실행이 계약이다.

export const SHOT_PHYSICS = {
  /** 샷 하나의 초 대역 — 생성 클립 단위. 짧고 스냅있게. */
  shotSecondsMin: 2,
  shotSecondsMax: 8,
  /** 예외(긴 침묵 등)에만 허용되는 절대 상한. persist 클램프·재배분 상한이 이 값을 읽는다. */
  shotSecondsHardMax: 10,
  /** 재배분(duration_reallocation)의 needed 바닥 — 대사·액션·카메라무브·신규인물·씬오프닝 중
   *  하나라도 있는("내용 있는") 샷이 읽히는 데 필요한 최소. 위 shotSecondsMin(저작 가이드)과
   *  **다른 개념**이라 값도 다르다. 여기 모아두는 이유는 "샷 초 숫자는 전부 이 파일에서 읽는다"를
   *  지키기 위함 (2026-08-12: 이 값이 util 안에 따로 선언돼 있어 정본 밖 리터럴이 3개째였다).
   *  2026-08-12 오너 결정: 이 바닥은 **내용 있는 샷에만** 적용된다(isContentlessShot 판별,
   *  duration_reallocation.ts). 내용 없는 순수 인서트/컷어웨이는 재배분 대상에서 제외되어
   *  모델이 정한 값(1초도 가능)이 그대로 통과한다 — 옛 "실질 하한 3초 vs 문서상 하한 2" 어긋남은
   *  그 경우엔 더 이상 발생하지 않는다. 내용 있는 샷에서는 여전히 to=max(현행, ceil(needed))라
   *  실질 하한이 바닥(2.5)의 ceil인 3초다. */
  shotSecondsReallocFloor: 2.5,
  /** 클립당 캐릭터 액션 예산 — 동사 수 상한 (순차 표현 금지와 짝). */
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
export const FIRST_FRAME_CHARS = `${SHOT_PHYSICS.firstFramePromptCharsMin}~${SHOT_PHYSICS.firstFramePromptCharsMax}자`;
