// 생성물 정합 검사 — 순수 판정 코어(#adherence P2, 2026-08-07). IO 없음(테스트 대상).
//
// 두 검사 축:
//   ① START 정합: previz/viz START 프레임이 샷 설명(액션·초점·인원)을 그렸는가 — VLM 판정용
//      claim 문자열을 여기서 조립(판정 자체는 vision.ts).
//   ② 영상 모션 준수: 영상 첫/끝 프레임의 픽셀 차이가 모션 계약과 맞는가 — 결정론 판정.
//      static 인데 diff 큼 = 과잉 모션 / large 설계인데 diff 작음 = 변화 부족.
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

// ── 킬 스위치(#adherence 2026-08-10, 사용자 요청 "일단 비활성화") ──────────────
// 코드 상수라 env 없이 토글 가능(서버·클라 공용, core.ts 는 순수 모듈). true 로만 바꾸면 즉시 부활.
//   판정 로직·라우트·배지·DB 스키마는 그대로 두고 진입만 막는다(재활성 리스크 최소).
/** ① 러프 START ↔ 설명 정합(VLM) */
export const ADHERENCE_START_ENABLED = false
/** ② 영상 모션 계약 준수(첫/끝 프레임 픽셀 diff + 방향 VLM) */
export const ADHERENCE_MOTION_ENABLED = false

// ── ① START claim ──────────────────────────────────────────────────────────
export interface StartClaimInput {
  /** EN 액션 서술 (shots.action_description — EN base) */
  actionEn: string
  /** static_spec.framing.focal_point (있으면) */
  focalPoint?: string | null
  /** 등장 인물 수 (0 = 무인물 풍경) */
  figureCount: number
}

/** VLM 에 줄 "이 START 프레임이 그려야 하는 것" 서술. 스타일·정체성이 아니라 스테이징만 판정하게 한다. */
export function buildStartClaim(input: StartClaimInput): string {
  const parts = [
    `depicts this moment: "${input.actionEn.trim()}"`,
    input.figureCount > 0
      ? `with ${input.figureCount} figure${input.figureCount > 1 ? 's' : ''} present`
      : 'with no figures (empty scene)',
  ]
  if (input.focalPoint?.trim()) parts.push(`visual emphasis on: ${input.focalPoint.trim()}`)
  return parts.join(', ')
}

// ── ② 영상 모션 준수 (결정론) ────────────────────────────────────────────────
/** 64px 그레이스케일 mean abs diff (0..255) 기준 임계 — 실측 보정 전 초기값.
 *  같은 프레임 재인코딩 노이즈 ~1-3, 미세 생명감 ~3-8, 구도 이동 >15 가 일반적. */
export const MOTION_DIFF = {
  /** 정지 계약(카메라 정지 + 인물 large 없음)에서 이 값 초과 = 과잉 모션 */
  staticMax: 14,
  /** large 모션 설계에서 이 값 미만 = 변화 부족 */
  largeMin: 6,
} as const

export interface MotionExpectation {
  /** 카메라 정지 계약(static/handheld_drift/rack_focus) — motion-contract 와 동일 판정 */
  cameraStatic: boolean
  /** 설계에 large 급 모션(카메라 magnitude large/high 또는 인물 large)이 있는가 */
  hasLargeMotion: boolean
  /** 방향성 카메라 이동(pan/tilt/tracking/crane + direction) — VLM 방향 판정 대상 */
  directional: { type: string; direction: string } | null
}

/** dynamic_spec → 판정 기대치. dyn 없으면 null(검사 불가). */
export function motionExpectation(dyn: ShotDynamicSpec | null | undefined): MotionExpectation | null {
  if (!dyn) return null
  const cam = dyn.camera_motion
  const type = cam?.type ?? 'static'
  const cameraStatic = !cam?.type || type === 'static' || type === 'handheld_drift' || type === 'rack_focus'
  const camLarge = cam?.magnitude === 'large' || (cam?.magnitude as string) === 'high'
  const charLarge = (dyn.character_motion ?? []).some((m) => m?.magnitude === 'large')
  const directional =
    !cameraStatic && cam?.direction && cam.direction !== 'none' && ['pan', 'tilt', 'tracking', 'crane'].includes(type)
      ? { type, direction: cam.direction }
      : null
  return { cameraStatic, hasLargeMotion: camLarge || charLarge, directional }
}

export type MotionVerdictStatus = 'ok' | 'over_motion' | 'under_motion'

/** 결정론 판정 — meanDiff(0..255)와 기대치만으로. 방향 판정은 별도(VLM). */
export function judgeMotionByDiff(meanDiff: number, exp: MotionExpectation): { status: MotionVerdictStatus; reason?: string } {
  if (exp.cameraStatic && !exp.hasLargeMotion && meanDiff > MOTION_DIFF.staticMax) {
    return {
      status: 'over_motion',
      reason: `정지 계약인데 첫·끝 프레임 차이가 큼 (diff ${meanDiff.toFixed(1)} > ${MOTION_DIFF.staticMax})`,
    }
  }
  if (exp.hasLargeMotion && meanDiff < MOTION_DIFF.largeMin) {
    return {
      status: 'under_motion',
      reason: `large 모션 설계인데 화면 변화가 거의 없음 (diff ${meanDiff.toFixed(1)} < ${MOTION_DIFF.largeMin})`,
    }
  }
  return { status: 'ok' }
}

/** 방향성 이동의 화면 기준 기대 서술 — VLM 질문용(모션 계약과 같은 방향 사전 사용). */
export function directionExpectationText(d: { type: string; direction: string }): string {
  const dir = d.direction.toLowerCase().replace(/\s+/g, '_')
  const viewMap: Record<string, string> = {
    left_to_right: 'the view shifts toward screen right (background content flows left)',
    right_to_left: 'the view shifts toward screen left (background content flows right)',
    left: 'the view shifts toward screen left',
    right: 'the view shifts toward screen right',
    up: 'the view shifts upward',
    down: 'the view shifts downward',
    upward: 'the view shifts upward',
    downward: 'the view shifts downward',
    forward: 'the camera moves deeper into the scene (framing tightens)',
    backward: 'the camera pulls back (framing widens)',
  }
  return viewMap[dir] ?? `the view moves ${d.direction.replace(/_/g, ' ')}`
}
