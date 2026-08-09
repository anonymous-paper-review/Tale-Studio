// 영상 모션 계약 컴파일러(#motion-contract 2026-08-07) — v4 dynamic_spec → 영상 프롬프트 계약문.
//
// 배경(실측): 영상 프롬프트가 첫 프레임의 정적 묘사문뿐이라 모션 설계(카메라 static/방향/속도,
//   인물 동사, 시선 arc)가 영상 모델에 한 글자도 전달되지 않았다 — "static hold 인데 움직임",
//   "화살표 반대 방향", "샷 시간 대비 변화 없음"의 구조적 원인. previz DIRECTION 화살표가
//   지시하는 대상(영상)이 정작 DIRECTION 을 못 받던 것.
//
// 원칙:
//   - 결정론(LLM 없음): 같은 spec + duration → 같은 계약문.
//   - 화면 기준 방향 명시: "pan left" 는 중의적("시야가 왼쪽으로" vs "배경이 왼쪽으로") —
//     둘 다 못박아 방향 반전 증상을 직접 처방한다.
//   - 시간 스케일: "over the full Ns" — 진폭을 샷 길이에 묶는다.
//   - 정지도 계약: static 은 "무브 금지 + 미세 생명감(호흡·옷자락)만" — 얼어붙은 프레임도,
//     지어낸 카메라 무브도 둘 다 위반이다.
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

export interface MotionContract {
  /** 프롬프트 주입용 계약문 (영어). 빈 문자열 = 계약 없음(레거시 폴백). */
  text: string
  /** 카메라가 정지 계약인가 — START/END 수렴 지시문 분기(P0)에 사용. */
  cameraStatic: boolean
}

const w = (x: unknown) => String(x ?? '').replace(/[_-]+/g, ' ').trim()

/** left_to_right 류 방향어 → (시야 이동, 화면 내 콘텐츠 이동) 쌍. 중의성 제거의 핵심. */
function screenDirections(direction: string): { view: string; content: string } | null {
  const d = direction.toLowerCase().trim().replace(/\s+/g, '_')
  const map: Record<string, { view: string; content: string }> = {
    left_to_right: { view: 'screen right', content: 'screen left' },
    right_to_left: { view: 'screen left', content: 'screen right' },
    left: { view: 'screen left', content: 'screen right' },
    right: { view: 'screen right', content: 'screen left' },
    up: { view: 'upward', content: 'downward in frame' },
    down: { view: 'downward', content: 'upward in frame' },
    upward: { view: 'upward', content: 'downward in frame' },
    downward: { view: 'downward', content: 'upward in frame' },
    forward: { view: 'deeper into the scene', content: 'past the camera' },
    backward: { view: 'away from the scene', content: 'toward frame center, shrinking' },
  }
  return map[d] ?? null
}

function speedWord(speed: unknown): string {
  return speed === 'fast' ? 'fast' : speed === 'medium' ? 'steady' : 'slow'
}
function magnitudeWord(m: unknown): string {
  return m === 'large' || m === 'high' ? 'large' : m === 'moderate' || m === 'medium' ? 'moderate' : 'small'
}

function cameraClause(dyn: ShotDynamicSpec, durationSeconds: number): { clause: string; isStatic: boolean } {
  const cam = dyn.camera_motion
  const type = cam?.type
  if (!type || type === 'static') {
    return {
      clause:
        'Camera: LOCKED tripod shot — absolutely zero camera movement for the entire clip: no pan, no drift, no zoom, no push-in.',
      isStatic: true,
    }
  }
  if (type === 'handheld_drift') {
    return {
      clause:
        'Camera: handheld micro-drift only — the framing breathes subtly in place but never travels, never pans, never zooms.',
      isStatic: true, // 이동 없음 — START/END 수렴 관점에선 정지 취급
    }
  }
  const speed = speedWord(cam.speed)
  const mag = magnitudeWord(cam.magnitude)
  const dirs = cam.direction && cam.direction !== 'none' ? screenDirections(cam.direction) : null
  const dirText = dirs
    ? ` toward ${dirs.view} — on-screen content flows toward ${dirs.content}`
    : ''
  const byType: Record<string, string> = {
    pan: `Camera: pans ${speed}${dirText}. Rotation only — the camera does not travel.`,
    tilt: `Camera: tilts ${speed}${dirText}.`,
    dolly_in: `Camera: dollies in ${speed} — the framing grows steadily tighter on the subject.`,
    dolly_out: `Camera: dollies out ${speed} — the framing grows steadily wider, revealing more environment.`,
    tracking: `Camera: tracks ${speed} with the subject${dirs ? ` toward ${dirs.view} (background flows toward ${dirs.content})` : ''}.`,
    crane: `Camera: cranes ${speed}${dirText}.`,
    rack_focus: 'Camera: holds position while focus racks to a different plane — no camera travel.',
  }
  const base = byType[type] ?? `Camera: ${w(type)} ${speed}${dirText}.`
  return {
    clause: `${base} ${mag === 'large' ? 'Large' : mag === 'moderate' ? 'Moderate' : 'Small'} amplitude, spread evenly over the full ${durationSeconds} seconds.`,
    isStatic: type === 'rack_focus',
  }
}

function subjectClauses(dyn: ShotDynamicSpec): string[] {
  const out: string[] = []
  ;(dyn.character_motion ?? []).forEach((m, i) => {
    if (!m?.verb?.trim()) return
    const mag = m.magnitude
    const scale =
      mag === 'large'
        ? 'a large, clearly visible movement that completes fully'
        : mag === 'medium'
          ? 'a clear movement that completes'
          : mag === 'small'
            ? 'a small, restrained movement'
            : 'a barely-perceptible micro movement'
    out.push(`subject ${i + 1}: "${w(m.verb)}" — ${scale}`)
  })
  ;(dyn.gaze_arc ?? []).forEach((g) => {
    if (g && g.from !== g.to) out.push(`gaze turns from ${w(g.from)} to ${w(g.to)}`)
  })
  ;(dyn.environmental_change ?? []).forEach((e) => {
    if (e?.type) out.push(`environment: ${w(e.type)} (${w(e.magnitude) || 'moderate'})`)
  })
  return out
}

/**
 * dynamic_spec + 샷 길이 → 영상 모션 계약문.
 *   dyn 이 없으면 빈 계약(레거시 프로젝트 — 기존 동작 유지, cameraStatic 판단 불가 → false).
 */
export function compileMotionContract(
  dyn: ShotDynamicSpec | null | undefined,
  durationSeconds: number,
): MotionContract {
  if (!dyn) return { text: '', cameraStatic: false }
  const cam = cameraClause(dyn, durationSeconds)
  const subjects = subjectClauses(dyn)
  const subjectText = subjects.length
    ? `Subjects: ${subjects.join('; ')}.`
    : 'Subjects: no scripted action — only subtle natural life (breathing, cloth, hair, atmosphere), never frozen.'
  const pace = `Pace the motion across the full ${durationSeconds}-second duration — by the final frame every scripted movement has fully completed.`
  const ban =
    'Do NOT add any camera movement, framing change, new character, new prop or extra action beyond this contract.'
  return {
    text: `Motion contract: ${cam.clause} ${subjectText} ${pace} ${ban}`,
    cameraStatic: cam.isStatic,
  }
}
