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
//
// 개정(#motion-vocab 2026-08-11): 어휘 밖 값을 여기서 조용히 삼키지 않는다.
//   실측(camera-follow-disambiguation)에서 모델이 `pan_right` 를 냈고, 이 파일이 byType 조회에
//   실패해 폴백 문장으로 떨어지면서 pan 전용 절 "Rotation only — the camera does not travel." 가
//   사라졌다 — 회전(pan)과 이동(tracking)의 차이가 영상 모델에 전달되지 않은 것이다.
//   같은 사고로 인물 magnitude `moderate`(어휘 밖)가 최소값으로 떨어져 "보통 크기 고갯짓"이
//   "a barely-perceptible micro movement"로 뒤집혀 발주됐다.
//   이제 motion-vocabulary 교정기를 먼저 통과시켜 정본 낱말로 만든 뒤 조회한다.
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import {
  normalizeCameraMotion,
  normalizeCharacterMagnitude,
  type NormalizedCameraMotion,
} from '@/lib/writer/motion-vocabulary'

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

function cameraClause(
  cam: NormalizedCameraMotion,
  durationSeconds: number,
): { clause: string; isStatic: boolean } {
  const type = cam.type
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
  // 교정기가 못 알아본 유형(mapped:false)은 낱말을 지어내 단정하지 않는다 —
  //   "이 속도·진폭으로 움직인다"까지만 말하고, 구체는 뒤따르는 장면 묘사문(모델의 motion_prompt)에 맡긴다.
  //   여기서 static 으로 접으면 같은 프롬프트 안의 묘사문과 정면 모순이 된다.
  if (!cam.mapped) {
    return {
      clause: `Camera: ${w(type)} ${speed}${dirText}. ${mag === 'large' ? 'Large' : mag === 'moderate' ? 'Moderate' : 'Small'} amplitude, spread evenly over the full ${durationSeconds} seconds.`,
      isStatic: false,
    }
  }
  const byType: Record<string, string> = {
    pan: `Camera: pans ${speed}${dirText}. Rotation only — the camera does not travel.`,
    tilt: `Camera: tilts ${speed}${dirText}. Rotation only — the camera does not travel.`,
    dolly_in: `Camera: dollies in ${speed} — the framing grows steadily tighter on the subject.`,
    dolly_out: `Camera: dollies out ${speed} — the framing grows steadily wider, revealing more environment.`,
    // pan/tilt 와 짝을 이루는 반대 극 — "제자리 회전"(pan) vs "실제로 이동"(tracking).
    //   이 대비가 실측에서 무너졌던 축이라 양쪽 문장에 모두 못박는다.
    tracking: `Camera: tracks ${speed} with the subject${dirs ? ` toward ${dirs.view} (background flows toward ${dirs.content})` : ''}. The camera itself travels — this is not a rotation in place.`,
    crane: `Camera: cranes ${speed}${dirText}. The camera itself travels vertically.`,
    rack_focus: 'Camera: holds position while focus racks to a different plane — no camera travel.',
  }
  // 정본 9종 중 static/handheld_drift 는 위에서 반환됐으므로 나머지 7종이 byType 에 모두 있다.
  //   즉 이 `??` 는 어휘를 늘리고 문장을 안 붙인 경우에만 걸린다 — 그때도 침묵하지 않게 남겨둔다.
  const base = byType[type] ?? `Camera: ${w(type)} ${speed}${dirText}.`
  return {
    clause: `${base} ${mag === 'large' ? 'Large' : mag === 'moderate' ? 'Moderate' : 'Small'} amplitude, spread evenly over the full ${durationSeconds} seconds.`,
    isStatic: type === 'rack_focus',
  }
}

/**
 * character_motion 을 배열로 세운다.
 *   writer-v2 는 이 칸에 배열이 아니라 자유 문장 하나를 저장한다(실측: shots 8행,
 *   design_ref `writer-v2:…`). 옛 코드는 문자열에 그대로 `.forEach` 를 불러 TypeError 로
 *   죽었고, 그 예외가 영상 발주 경로를 통째로 끊었다. 문장은 동사 한 줄로 받아 살린다.
 */
function characterMotions(raw: ShotDynamicSpec['character_motion'] | string | null | undefined) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    return [{ character_id: '', verb: raw.trim(), magnitude: 'medium' as const }]
  }
  return []
}

// 긴 샷의 "펴짐"을 막는 기준 길이(#g1 2026-08-27 오너: "End 프레임 변화폭이 적음 → 슬로우모션").
//   카메라 절은 durationSeconds 를 받아 "N초에 걸쳐"를 말했는데 피사체 절은 길이를 아예 안 봤다.
//   그래서 10초 샷과 5초 샷이 똑같이 "a small, restrained movement" 로 나갔다(실측:
//   sh_01_01 10s / sh_02_04 5s 둘 다 magnitude small). 같은 동작을 10초에 펴면 그게 슬로우모션이다.
//   해법은 magnitude 를 조작하는 게 아니라 — 그건 연출 의도다 — "이 길이 안에서 무엇이
//   완결돼야 하는가"를 덧붙이는 것이다. 짧은 샷은 한 동작을 또렷하게, 긴 샷은 그 동작이
//   끝난 뒤에도 화면이 죽지 않게 후속 여파(무게 이동·호흡·옷자락)까지 이어가도록 요구한다.
const LONG_SHOT_SECONDS = 7

function subjectClauses(dyn: ShotDynamicSpec, durationSeconds: number): string[] {
  const out: string[] = []
  const isLong = durationSeconds >= LONG_SHOT_SECONDS
  ;characterMotions(dyn.character_motion).forEach((m, i) => {
    if (!m?.verb?.trim()) return
    // 교정기 경유(#motion-vocab): 옛 코드는 어휘 밖 값을 else 로 흘려 최소값으로 떨궜다.
    //   그래서 인물 magnitude `moderate`(카메라 어휘와 혼동) 가 "micro" 로 뒤집혀 나갔다(실측).
    //   normalizeCharacterMagnitude 는 moderate→medium 으로 맞바꿔 받고, 미상은 medium 으로 둔다.
    const mag = normalizeCharacterMagnitude(m.magnitude)
    const scale =
      mag === 'large'
        ? 'a large, clearly visible movement that completes fully'
        : mag === 'medium'
          ? 'a clear movement that completes'
          : mag === 'small'
            ? 'a small, restrained movement'
            : 'a barely-perceptible micro movement'
    // 긴 샷에서 작은 동작 하나만 지시하면 남는 시간이 정지 화면이 된다 — 그 시간을 채울
    //   후속 여파를 함께 요구한다. 새 동작을 지어내라는 게 아니라 같은 동작의 뒤끝이다.
    const tail =
      isLong && (mag === 'small' || mag === 'micro')
        ? ' — then let its aftermath carry the remaining time (weight settling, breath, cloth and hair still moving); never freeze after it lands'
        : ''
    out.push(`subject ${i + 1}: "${w(m.verb)}" — ${scale}${tail}`)
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
  const { motion } = normalizeCameraMotion(dyn.camera_motion)
  const cam = cameraClause(motion, durationSeconds)
  const subjects = subjectClauses(dyn, durationSeconds)
  const subjectText = subjects.length
    ? `Subjects: ${subjects.join('; ')}.`
    : 'Subjects: no scripted action — only subtle natural life (breathing, cloth, hair, atmosphere), never frozen.'
  // 긴 샷은 "고르게 펴라"만 말하면 모델이 전체를 느리게 만든다(#g1). 완결 시점을 앞에 두고
  //   남은 시간은 여파로 채우게 나눠 말한다 — 동작 자체는 제 속도로 일어나야 한다.
  const pace =
    durationSeconds >= LONG_SHOT_SECONDS
      ? `Timing: perform each scripted movement at natural, lifelike speed — do NOT slow it down to fill ${durationSeconds} seconds. The main action completes well before the end; the remaining time is carried by its aftermath and ambient life, not by stretching the action.`
      : `Pace the motion across the full ${durationSeconds}-second duration — by the final frame every scripted movement has fully completed.`
  // 금지절의 범위(#motion-vocab 2026-08-11): 옛 문구는 "beyond this contract" 로 끝나
  //   이 계약문을 프롬프트의 **유일한** 권위로 선언했다. 그런데 계약문 뒤에는 모델이 쓴 장면
  //   묘사문(motion_prompt)이 이어 붙고, 거기에만 있는 연출 정보가 있다 — 실측에서 계약문은
  //   "pan right" 까지만 말했고 "레버를 드러낸다"는 목적은 묘사문에만 있었다.
  //   그래서 금지 대상을 "지어내기"로 좁히고, 뒤따르는 묘사문을 명시적으로 계약 안에 포함시킨다.
  const ban =
    'Do NOT invent camera movement, framing change, new character, new prop or extra action beyond this contract and the scene description that follows.'
  return {
    text: `Motion contract: ${cam.clause} ${subjectText} ${pace} ${ban}`,
    cameraStatic: cam.isStatic,
  }
}
