// 모션 어휘 정본(#motion-vocab 2026-08-11) — camera_motion / character_motion 의 고정 낱말과 교정기.
//
// ─ 왜 이 파일이 생겼나 (실측: research/experiments/camera-follow-disambiguation, 2026-08-11) ────
//   손동작·시선·감정 3쌍(대상이 프레임 안 vs 밖)을 제품 경로에 통과시킨 실험에서,
//   **모델의 판단은 6/6 정확했다** — 프레임 안이면 static, 밖이면 이동을 골랐고 이유도 맞았다.
//   고장은 판단이 아니라 그 뒤 전달 경로에 있었다.
//
//   근본 원인: v4 지시서의 카메라 유형 목록이 `"static" | "handheld_drift" | "dolly_in" | ...` 로
//   잘려 있었다. 말줄임표가 리터럴이다 — 9개 중 3개만 보여주고 나머지를 알려준 적이 없다.
//   모델이 어휘를 어긴 게 아니라, 어휘를 모른 채 그럴듯한 값을 지어낼 수밖에 없었다(`pan_right`).
//
//   그리고 목록 밖 값이 소비처 4곳에서 **서로 다르게, 조용히** 죽었다:
//     ① 모션 계약문(motion-contract.ts): pan 전용 절 "Rotation only — the camera does not travel."
//        이 사라진다 → 회전(pan)과 이동(tracking)의 차이가 영상 모델에 전달되지 않는다.
//        하필 그 차이가 이 실험이 재려던 축 자체였다.
//     ② 6축 카메라 컨트롤(shot-config-from-design.ts): switch default → 전 축 0.
//        글로는 "오른쪽으로 팬", 숫자로는 "가만히 있어라"를 동시에 보낸다.
//     ③ 준수 검수(adherence/core.ts): directional 판정 대상에서 빠져 **방향 검사가 통째로 스킵**된다.
//        검수기까지 눈을 감으므로 이 계열 사고는 자동으로는 영영 안 잡힌다.
//     ④ 씬 역추론(pipeline/util/infer_v3.ts): kinetic 미집계 → 카메라가 도는 씬이 tripod/static 으로 기록.
//
//   두 스케일의 **중간값 낱말이 서로 다른 것**도 같은 계열의 함정이다 —
//   카메라는 minimal|moderate|large, 인물은 micro|small|medium|large. 가운데가 moderate vs medium 이다.
//   모델이 이를 맞바꿔 쓰면(실측: gaze_off_frame 의 인물 magnitude=`moderate`) 받는 쪽이 모르는 말로
//   취급해 최소값으로 떨궜고, "보통 크기 고갯짓"이 발주문에 "a barely-perceptible micro movement"로
//   **뒤집혀** 나갔다. 측정 대상 케이스에서 정확히 터졌다.
//
// ─ 원칙 (architecture.md §3 "모델은 제안만 한다 / 검증은 제품 레이어") ──────────────────────
//   1차 방어 — 지시서가 어휘를 **전부** 보여준다. 아래 `*_ENUM_TEXT` 가 그 문구의 유일한 출처다.
//              (프롬프트에 어휘를 손으로 다시 적으면 이 파일과 갈라진다 — 그게 원래 사고였다.)
//   2차 방어 — 그래도 목록 밖 값이 오면 **여기서 한 번** 정규화한다. 소비처가 각자 무시하지 않는다.
//   기록    — 정규화는 손실을 `repairs` 로 남긴다. 조용한 열화가 이번 사고의 본체였으므로,
//              고치는 것보다 "고쳤다고 말하는 것"이 더 중요하다.
//   보존    — 매핑에 실패한 유형은 **static 으로 떨구지 않는다**(§normalizeCameraMotionType 참조).
//
// 이 파일은 의도적으로 아무것도 import 하지 않는다 — types/pipeline.ts 가 여기서 타입을 가져가므로
//   반대 방향 import 를 만들면 순환이 된다.

// ── 어휘 (정본) ───────────────────────────────────────────────────────────────────────────

/** 카메라 유형 9종. types/pipeline.ts 의 ShotDynamicSpec.camera_motion.type 이 이 배열에서 파생된다. */
export const CAMERA_MOTION_TYPES = [
  'static',
  'pan',
  'tilt',
  'dolly_in',
  'dolly_out',
  'tracking',
  'crane',
  'handheld_drift',
  'rack_focus',
] as const;
export type CameraMotionType = (typeof CAMERA_MOTION_TYPES)[number];

/** 방향어. motion-contract.ts 의 screenDirections()가 화면 기준으로 풀어쓸 수 있는 낱말만 싣는다. */
export const CAMERA_DIRECTIONS = [
  'none',
  'left',
  'right',
  'up',
  'down',
  'forward',
  'backward',
] as const;

/** 속도. 카메라·인물 공통. */
export const MOTION_SPEEDS = ['slow', 'medium', 'fast'] as const;
export type MotionSpeed = (typeof MOTION_SPEEDS)[number];

/** 카메라 진폭. 인물 스케일과 가운데 낱말이 다르다(moderate) — 혼동이 잦아 교정기가 맞바꿔 받는다. */
export const CAMERA_MAGNITUDES = ['minimal', 'moderate', 'large'] as const;
export type CameraMagnitude = (typeof CAMERA_MAGNITUDES)[number];

/** 인물 동작 크기. 카메라 스케일과 가운데 낱말이 다르다(medium). */
export const CHARACTER_MAGNITUDES = ['micro', 'small', 'medium', 'large'] as const;
export type CharacterMagnitude = (typeof CHARACTER_MAGNITUDES)[number];

// ── 프롬프트 주입용 문자열 (지시서가 어휘를 전부 보여주게 하는 유일한 출처) ────────────────────

const quoteJoin = (values: readonly string[]) => values.map((v) => `"${v}"`).join(' | ');

export const CAMERA_MOTION_TYPE_ENUM_TEXT = quoteJoin(CAMERA_MOTION_TYPES);
export const CAMERA_DIRECTION_ENUM_TEXT = quoteJoin(CAMERA_DIRECTIONS);
export const MOTION_SPEED_ENUM_TEXT = quoteJoin(MOTION_SPEEDS);
export const CAMERA_MAGNITUDE_ENUM_TEXT = quoteJoin(CAMERA_MAGNITUDES);
export const CHARACTER_MAGNITUDE_ENUM_TEXT = quoteJoin(CHARACTER_MAGNITUDES);

/**
 * 지시서에 싣는 어휘 설명 블록. 낱말만 나열하면 모델이 뜻을 짐작해서 고르므로 뜻도 함께 준다.
 * 특히 pan(제자리 회전) vs tracking(카메라가 실제로 이동) 구분이 실측에서 무너진 지점이라 명시한다.
 */
export const MOTION_VOCABULARY_GUIDE = `[모션 고정 어휘 — 아래 낱말 **그대로만** 쓴다. 방향·속도를 유형 이름에 붙이지 마라(예: "pan_right" ✗ → type:"pan", direction:"right" ○)]
- camera_motion.type: ${CAMERA_MOTION_TYPE_ENUM_TEXT}
  · static         카메라 완전 고정 (구도 변화 없음)
  · pan            제자리에서 좌우 회전 — 카메라는 이동하지 않는다
  · tilt           제자리에서 상하 회전
  · dolly_in       피사체 쪽으로 전진 (구도가 점점 타이트해진다)
  · dolly_out      피사체에서 후진 (구도가 점점 넓어진다)
  · tracking       피사체를 따라 카메라가 실제로 이동 — pan 과 달리 위치가 바뀐다
  · crane          상하로 카메라가 실제로 이동
  · handheld_drift 위치 이동 없이 미세하게 흔들림
  · rack_focus     카메라는 고정, 초점만 다른 면으로 옮김
- camera_motion.direction: ${CAMERA_DIRECTION_ENUM_TEXT}  (static/handheld_drift/rack_focus 는 "none")
- camera_motion.speed: ${MOTION_SPEED_ENUM_TEXT}
- camera_motion.magnitude: ${CAMERA_MAGNITUDE_ENUM_TEXT}   ← 카메라는 가운데가 "moderate"
- character_motion[].magnitude: ${CHARACTER_MAGNITUDE_ENUM_TEXT}  ← 인물은 가운데가 "medium" (카메라와 다르다)`;

// ── 교정기 ────────────────────────────────────────────────────────────────────────────────

/** 낱말 비교용 정규화: 소문자 + 공백/하이픈/점 → 밑줄 + 중복 밑줄 축약. */
function slug(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const CAMERA_TYPE_SET = new Set<string>(CAMERA_MOTION_TYPES);

/** 어휘 밖이지만 뜻이 분명한 표현 → 정본 낱말. 실측·업계 통용어 위주. */
const CAMERA_TYPE_SYNONYMS: Record<string, CameraMotionType> = {
  none: 'static',
  fixed: 'static',
  locked: 'static',
  locked_off: 'static',
  lock_off: 'static',
  still: 'static',
  hold: 'static',
  tripod: 'static',
  no_movement: 'static',

  push_in: 'dolly_in',
  pushin: 'dolly_in',
  zoom_in: 'dolly_in',
  truck_in: 'dolly_in',
  dolly_forward: 'dolly_in',
  move_in: 'dolly_in',

  push_out: 'dolly_out',
  pull_out: 'dolly_out',
  pull_back: 'dolly_out',
  zoom_out: 'dolly_out',
  dolly_back: 'dolly_out',
  dolly_backward: 'dolly_out',
  move_out: 'dolly_out',

  track: 'tracking',
  trucking: 'tracking',
  truck: 'tracking',
  follow: 'tracking',
  following: 'tracking',
  dolly_side: 'tracking',
  lateral: 'tracking',

  jib: 'crane',
  boom: 'crane',

  whip_pan: 'pan',
  swish_pan: 'pan',
  pan_shot: 'pan',

  handheld: 'handheld_drift',
  hand_held: 'handheld_drift',
  shaky: 'handheld_drift',
  drift: 'handheld_drift',

  rack: 'rack_focus',
  focus_pull: 'rack_focus',
  pull_focus: 'rack_focus',
  focus_rack: 'rack_focus',
};

/** 유형 이름에 눌어붙은 방향어 → 정본 방향어. `pan_right` 의 `right` 를 살려내는 표. */
const DIRECTION_SUFFIXES: Record<string, string> = {
  left: 'left',
  right: 'right',
  up: 'up',
  upward: 'up',
  upwards: 'up',
  down: 'down',
  downward: 'down',
  downwards: 'down',
  forward: 'forward',
  forwards: 'forward',
  in: 'forward',
  backward: 'backward',
  backwards: 'backward',
  back: 'backward',
  out: 'backward',
  left_to_right: 'right',
  right_to_left: 'left',
};

export interface RawCameraMotion {
  type?: unknown;
  direction?: unknown;
  speed?: unknown;
  magnitude?: unknown;
}

export interface NormalizedCameraMotion {
  /** 정본 낱말. 매핑 실패 시에만 원문 문자열이 그대로 남는다(`mapped:false`). */
  type: CameraMotionType | string;
  /** false = 어휘 밖 미상 유형. 소비처는 "움직이긴 하는데 종류를 모른다"로 다뤄야 한다. */
  mapped: boolean;
  direction: string;
  speed: MotionSpeed;
  magnitude: CameraMagnitude;
}

/**
 * 카메라 유형 교정.
 *
 * 매핑 실패 시 **static 으로 떨어뜨리지 않는다**. 미상값을 정지로 접으면 모델이 설계한 이동이
 * 소리 없이 사라지고, 계약문이 "LOCKED tripod — zero camera movement"로 바뀌어 같은 프롬프트 안의
 * 장면 묘사문과 정면으로 모순된다. 그게 이 파일이 고치려는 사고의 더 나쁜 버전이다.
 * 그래서 미상값은 원문을 유지한 채 `mapped:false` 로 표시만 하고, 판단은 소비처에 남긴다.
 */
export function normalizeCameraMotionType(raw: unknown): {
  type: CameraMotionType | string;
  mapped: boolean;
  /** 유형 이름에서 떼어낸 방향어(있을 때만). direction 이 비어 있으면 이걸 쓴다. */
  directionFromType: string | null;
} {
  const t = slug(raw);
  if (!t) return { type: 'static', mapped: true, directionFromType: null };
  if (CAMERA_TYPE_SET.has(t)) return { type: t as CameraMotionType, mapped: true, directionFromType: null };

  const synonym = CAMERA_TYPE_SYNONYMS[t];
  if (synonym) return { type: synonym, mapped: true, directionFromType: null };

  // `pan_right`, `tilt_up`, `track_left`, `crane_down` 류 — 접두가 유형, 나머지가 방향.
  //   긴 이름(dolly_in)이 짧은 이름(dolly)보다 먼저 걸려야 하므로 길이 내림차순.
  const prefixes = [...CAMERA_MOTION_TYPES, ...Object.keys(CAMERA_TYPE_SYNONYMS)].sort(
    (a, b) => b.length - a.length,
  );
  for (const prefix of prefixes) {
    if (t !== `${prefix}` && t.startsWith(`${prefix}_`)) {
      const canonical = CAMERA_TYPE_SET.has(prefix)
        ? (prefix as CameraMotionType)
        : CAMERA_TYPE_SYNONYMS[prefix];
      if (!canonical) continue;
      const suffix = t.slice(prefix.length + 1);
      return { type: canonical, mapped: true, directionFromType: DIRECTION_SUFFIXES[suffix] ?? null };
    }
  }

  // `slow_push_in` 처럼 수식어가 앞에 붙은 경우 — 토큰 어디에든 정본/동의어가 있으면 채택.
  for (const prefix of prefixes) {
    if (t.includes(prefix)) {
      const canonical = CAMERA_TYPE_SET.has(prefix)
        ? (prefix as CameraMotionType)
        : CAMERA_TYPE_SYNONYMS[prefix];
      if (canonical) return { type: canonical, mapped: true, directionFromType: null };
    }
  }

  return { type: String(raw ?? '').trim(), mapped: false, directionFromType: null };
}

/**
 * 방향어 교정 — **의도적으로 거의 아무것도 하지 않는다.**
 *
 * 소문자·밑줄 통일과 빈값→'none' 까지만이다. 방향어를 대표값으로 접지 않는 이유:
 * 하류(screenDirections·directionExpectationText)가 이미 `left_to_right` 와 `right` 를 각각
 * 같은 뜻으로 풀고 있고, 여기서 한쪽으로 접으면 이미 잘 돌던 계약을 이 수정이 건드리게 된다
 * (실제로 adherence-core 테스트가 그 변화를 잡아냈다).
 * DIRECTION_SUFFIXES 는 `pan_right` 처럼 **유형 이름에 눌어붙은** 방향을 떼어낼 때만 쓴다 —
 * 그건 원래 값이 없던 자리를 채우는 일이라 기존 계약을 바꾸지 않는다.
 */
export function normalizeDirection(raw: unknown): string {
  const d = slug(raw);
  if (!d || d === 'none') return 'none';
  return d;
}

/** 속도 교정. 미상은 'slow'(기존 speedWord 기본값 유지 — 없던 속도를 지어내지 않는다). */
export function normalizeSpeed(raw: unknown): MotionSpeed {
  const s = slug(raw);
  if (s === 'fast' || s === 'quick' || s === 'rapid' || s === 'snap' || s === 'swift') return 'fast';
  if (s === 'medium' || s === 'moderate' || s === 'steady' || s === 'normal' || s === 'mid') return 'medium';
  return 'slow';
}

/** 카메라 진폭 교정. 인물 스케일 낱말(micro/small/medium)도 맞바꿔 받는다. */
export function normalizeCameraMagnitude(raw: unknown): CameraMagnitude {
  const m = slug(raw);
  if (m === 'large' || m === 'high' || m === 'big' || m === 'strong' || m === 'major' || m === 'extreme' || m === 'dramatic') {
    return 'large';
  }
  if (m === 'moderate' || m === 'medium' || m === 'mid' || m === 'normal' || m === 'standard' || m === 'modest') {
    return 'moderate';
  }
  // none/zero/minimal/micro/small/subtle/… + 미상 → 최소.
  //   카메라 진폭은 기존 magnitudeWord 기본값도 '작게'였다 — 여기서 기본을 키우면
  //   정지 계약 샷의 진폭이 조용히 올라간다(둥둥 재발). 그래서 카메라 쪽은 기본값을 유지한다.
  return 'minimal';
}

/**
 * 인물 동작 크기 교정.
 *
 * 카메라와 달리 **미상값의 기본을 'medium' 으로 둔다**. 기존 코드는 미상을 최소('micro')로 떨궈
 * "보통 크기 고갯짓"을 "거의 알아볼 수 없는 미세한 움직임"으로 뒤집어 발주했다(실측).
 * 모델이 동사를 적어냈다는 건 "무언가 일어난다"는 뜻이므로, 모를 때의 안전한 쪽은 억제가 아니라 보통이다.
 * (카메라와 기본 방향이 반대인 이유: 카메라는 지어낸 이동이 사고고, 인물은 삼켜진 동작이 사고다.)
 */
export function normalizeCharacterMagnitude(raw: unknown): CharacterMagnitude {
  const m = slug(raw);
  if (m === 'large' || m === 'big' || m === 'high' || m === 'strong' || m === 'major' || m === 'extreme' || m === 'broad' || m === 'full') {
    return 'large';
  }
  if (m === 'micro' || m === 'minimal' || m === 'none' || m === 'zero' || m === 'negligible' || m === 'imperceptible' || m === 'subtle' || m === 'slight' || m === 'tiny') {
    return 'micro';
  }
  if (m === 'small' || m === 'minor' || m === 'restrained' || m === 'gentle' || m === 'light') {
    return 'small';
  }
  return 'medium';
}

/**
 * camera_motion 전체 교정 — 소비처(계약문·6축·검수·씬 역추론)가 공통으로 통과시키는 진입점.
 * 이미 정본인 값은 그대로 통과하므로 몇 번을 통과시켜도 결과가 같다(멱등).
 *
 * @returns repairs — 사람이 읽을 교정 기록. 비어 있으면 어휘를 지킨 입력이다.
 */
export function normalizeCameraMotion(raw: RawCameraMotion | null | undefined): {
  motion: NormalizedCameraMotion;
  repairs: string[];
} {
  const repairs: string[] = [];
  const rawType = raw?.type;
  const { type, mapped, directionFromType } = normalizeCameraMotionType(rawType);
  if (slug(rawType) && slug(rawType) !== slug(type)) {
    repairs.push(
      mapped
        ? `camera_motion.type "${String(rawType)}" → "${type}"${directionFromType ? ` (direction "${directionFromType}" 추출)` : ''}`
        : `camera_motion.type "${String(rawType)}" 어휘 밖 — 매핑 실패, 원문 유지`,
    );
  } else if (!mapped) {
    repairs.push(`camera_motion.type "${String(rawType)}" 어휘 밖 — 매핑 실패, 원문 유지`);
  }

  // 유형에 눌어붙어 있던 방향은 direction 이 비어 있을 때만 채운다 — 명시된 direction 이 우선.
  const explicitDirection = normalizeDirection(raw?.direction);
  const direction =
    explicitDirection === 'none' && directionFromType ? directionFromType : explicitDirection;

  const speed = normalizeSpeed(raw?.speed);
  if (slug(raw?.speed) && slug(raw?.speed) !== speed) {
    repairs.push(`camera_motion.speed "${String(raw?.speed)}" → "${speed}"`);
  }

  const magnitude = normalizeCameraMagnitude(raw?.magnitude);
  if (slug(raw?.magnitude) && slug(raw?.magnitude) !== magnitude) {
    repairs.push(`camera_motion.magnitude "${String(raw?.magnitude)}" → "${magnitude}"`);
  }

  return { motion: { type, mapped, direction, speed, magnitude }, repairs };
}

/**
 * 카메라가 정지 계약인가 — 이동 없는 유형 3종.
 * 매핑 실패(mapped:false)는 정지로 보지 않는다: 모델이 무언가 적었다면 이동을 의도한 쪽이 안전하다.
 */
export function isCameraStatic(motion: NormalizedCameraMotion): boolean {
  if (!motion.mapped) return false;
  return motion.type === 'static' || motion.type === 'handheld_drift' || motion.type === 'rack_focus';
}
