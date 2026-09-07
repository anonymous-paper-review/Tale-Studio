// 카메라 동기의 강제 지점(#camera-motivation 2026-09-07, 오너 결정 1번) — 순수 함수. 데쿠파주와 V4 가 같이 쓴다.
//
//   architecture.md §3: 모델은 제안만 한다 / 검증은 제품 레이어. 지시서(1차 방어)가 닫힌 여섯을 보여주고,
//   여기(2차 방어)가 (a) 동기를 정본 낱말로 접고 (b) 동기에 맞춰 움직임의 꼴을 교정하며 (c) 동기 없는 무브를
//   static 으로 내린다. 접은 내용은 repairs 로 남긴다 — 조용한 열화가 이 계열 사고의 본체였다(#motion-vocab).
import {
  coerceMotionForMotivation,
  normalizeCameraMotion,
  normalizeCameraMotivation,
  isCameraStatic,
  type CameraMotivation,
  type RawCameraMotion,
} from '@/lib/writer/motion-vocabulary'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

export interface DecoupageCameraFields {
  camera_intent?: unknown
  camera_motivation?: unknown
  camera_move_motivation?: unknown
  camera_target?: unknown
}

export interface CoercedDecoupageCamera {
  camera_intent: 'static' | 'motivated_move'
  camera_motivation: CameraMotivation | null
  camera_target: string | null
  /** 접거나 내린 기록(사람이 읽는 한 줄). 없으면 null. */
  repair: string | null
}

function idOf(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

/** 데쿠파주 한 샷의 카메라 칸을 닫힌 동기로 접는다 — motivated_move 인데 여섯에 안 들면 static 으로 내린다. */
export function coerceDecoupageCamera(raw: DecoupageCameraFields): CoercedDecoupageCamera {
  const intent = raw.camera_intent === 'motivated_move' ? 'motivated_move' : 'static'
  const motivation =
    normalizeCameraMotivation(raw.camera_motivation) ?? normalizeCameraMotivation(raw.camera_move_motivation)
  const target = idOf(raw.camera_target)
  if (intent === 'static') return { camera_intent: 'static', camera_motivation: motivation, camera_target: target, repair: null }
  if (!motivation) {
    const said = idOf(raw.camera_move_motivation) ?? idOf(raw.camera_motivation)
    return {
      camera_intent: 'static',
      camera_motivation: null,
      camera_target: target,
      repair: `motivated_move 의 동기${said ? ` "${said}"` : ''} 가 여섯에 들지 않아 static 으로 내렸다`,
    }
  }
  return { camera_intent: 'motivated_move', camera_motivation: motivation, camera_target: target, repair: null }
}

export type EnforcedCameraMotion = ShotDynamicSpec['camera_motion'] & { mapped?: boolean }

/**
 * V4 의 camera_motion 을 닫힌 동기로 강제한다.
 *   - 동기는 V4 값 → 데쿠파주 값 순으로 잇는다(대상도 같다).
 *   - 움직이는데(정지 계약이 아닌데) 동기가 없으면 static 으로 접고 기록한다 — "여섯에 들지 않으면 움직이지 않는다".
 *   - 동기가 있으면 종류·속도·진폭을 동기에 맞춰 교정한다.
 *   - 어휘 밖 유형(mapped:false)은 #motion-vocab 원칙대로 원문을 유지한다(동기만 붙인다).
 */
export function enforceCameraMotivation(
  rawMotion: RawCameraMotion | string | null | undefined,
  decoupage: DecoupageCameraFields | null | undefined,
): { camera_motion: ShotDynamicSpec['camera_motion']; repairs: string[] } {
  const { motion, repairs } = normalizeCameraMotion(rawMotion)
  const rawObj = rawMotion && typeof rawMotion === 'object' ? (rawMotion as RawCameraMotion & { motivation?: unknown; target?: unknown }) : null
  const dec = decoupage ? coerceDecoupageCamera(decoupage) : null
  const motivation = normalizeCameraMotivation(rawObj?.motivation) ?? dec?.camera_motivation ?? null
  const target = idOf(rawObj?.target) ?? dec?.camera_target ?? null
  const base = { type: motion.type, direction: motion.direction, speed: motion.speed, magnitude: motion.magnitude } as ShotDynamicSpec['camera_motion']
  if (!motion.mapped) {
    return { camera_motion: { ...base, ...(motivation ? { motivation, target } : {}) }, repairs }
  }
  if (isCameraStatic(motion) && motion.type === 'static') {
    return { camera_motion: { ...base, ...(motivation ? { motivation, target } : {}) }, repairs }
  }
  if (!motivation) {
    repairs.push(`camera_motion "${motion.type}" 동기 없음 → static (여섯 동기 밖의 무브는 쓰지 않는다)`)
    return { camera_motion: { type: 'static', direction: 'none', speed: 'slow', magnitude: 'minimal' }, repairs }
  }
  const coerced = coerceMotionForMotivation(motion, motivation)
  repairs.push(...coerced.repairs)
  return {
    camera_motion: {
      type: coerced.motion.type as ShotDynamicSpec['camera_motion']['type'],
      direction: coerced.motion.direction,
      speed: coerced.motion.speed,
      magnitude: coerced.motion.magnitude,
      motivation,
      target,
    },
    repairs,
  }
}
