// 인지 부하 기반 샷 길이 재배분 (#p2-pacing 2026-08-04 → #duration-surgery 2026-08-31 전면 개정).
//
// 1차(#p2-pacing)의 진단은 "너무 짧다"(2초 샷에 대사 1줄, 3초 이하 38%)였고 처방이 **증액만**이었다.
// 실측 오버슈트(감사 D1·D2·D5, 오너 확정 2026-08-31): 감액 경로 0줄 + 계산기가 액션을 안 읽음
// (결과값 6가지뿐) + 대사 여백 이중 가산(실발화의 1.9배 배정) → "행동 대비 너무 긴 샷"이 기본값이 됐다.
//
// 개정 계약 (오너 확정 방향 B):
//   B4 — needed 가 실제 액션을 읽는다: dynamic_spec 의 동사별 magnitude 가중 합산(+카메라·환경),
//        스펙 미보유(레거시·수동 샷)만 종전 action_budget 근사로 폴백.
//   B5 — 단방향 래칫 → 양방향 밴드: 부족하면 증액(종전 유지), ceil(needed)+slack 초과분은 그
//        경계까지 감액. 의도적 롱테이크는 pacing_intent='long_take' 태그로 감액 면제
//        (v4 가 duration_justification "LONG TAKE — …" 마커로 선언, c_application 이 매핑).
//   D5 — 대사 = 실발화 1배 + 고정 여백 0.5s (종전: 호흡 0.5 + 여유 1.0 이중 가산 폐지).
//
// 상수는 physics.ts SHOT_PACING 이 단일 소스 — 프롬프트 루브릭(DURATION_RUBRIC)과 같은 숫자를
// 쓰므로, 오너의 레퍼런스 영상 기반 캘리브레이션은 그 블록 하나로 상·하류가 함께 움직인다.
import type { ShotSequenceItem, ShotDialogue } from '@/lib/writer/types/pipeline'
import { SHOT_PACING } from '@/lib/writer/pipeline/physics'

export const REALLOC_MIN_SHOT_SECONDS = SHOT_PACING.floorSeconds
export const REALLOC_MAX_SHOT_SECONDS = 10 // persist_manifest MAX_SHOT_SECONDS(#9)와 동일 값 유지

/** 발화 시간(초) — 스크립트별 근사 속도. 공백 제외 글자 수 기준. 실발화 1배(여백은 호출부 소관). */
export function speechSecondsForText(text: string): number {
  const chars = text.replace(/\s/g, '')
  if (!chars.length) return 0
  const latin = (chars.match(/[A-Za-z]/g) ?? []).length
  const rate =
    latin / chars.length > 0.6 ? SHOT_PACING.latinCharsPerSec : SHOT_PACING.koCharsPerSec
  return chars.length / rate
}

function speechSeconds(dialogue: ShotDialogue | undefined): number {
  if (!dialogue) return 0
  const lines = [
    ...dialogue.dialogue.map((l) => l.line),
    ...(dialogue.narration ? [dialogue.narration] : []),
  ]
  return lines.reduce((sum, line) => sum + speechSecondsForText(line), 0)
}

/** 액션 필요 초 — dynamic_spec(실제 동사·크기)이 있으면 그걸 읽고, 없으면 종전 근사 폴백(B4). */
function actionSeconds(shot: ShotSequenceItem): number {
  const dyn = shot.dynamic_spec
  if (dyn && ((dyn.character_motion?.length ?? 0) > 0 || dyn.camera_motion)) {
    const motion = (dyn.character_motion ?? []).reduce(
      (sum, m) =>
        sum +
        (SHOT_PACING.motionSeconds[(m as { magnitude?: string }).magnitude ?? ''] ??
          SHOT_PACING.motionSeconds.medium),
      0,
    )
    const camType = dyn.camera_motion?.type
    const camera =
      !camType || camType === 'static'
        ? SHOT_PACING.cameraSeconds.none
        : (dyn.camera_motion as { magnitude?: string } | undefined)?.magnitude === 'large'
          ? SHOT_PACING.cameraSeconds.complex
          : SHOT_PACING.cameraSeconds.simple
    const env = Math.min(
      1.0,
      (dyn.environmental_change?.length ?? 0) * SHOT_PACING.environmentSecondsEach,
    )
    return SHOT_PACING.baseSeconds + motion + camera + env
  }
  // 레거시 폴백 — 종전 근사(2.0 + 0.8×보조 + 카메라). 수동 샷 등 스펙 미보유만 온다.
  const budget = shot.action_budget
  const camera =
    budget?.camera_movement_complexity === 'complex'
      ? SHOT_PACING.cameraSeconds.complex
      : budget?.camera_movement_complexity === 'simple'
        ? SHOT_PACING.cameraSeconds.simple
        : 0
  return 2.0 + 0.8 * (budget?.secondary_action_count ?? 0) + camera
}

export interface DurationChange {
  shot_id: string
  from: number
  to: number
  needed: number
}

export interface DurationReallocation {
  shots: ShotSequenceItem[]
  changed: DurationChange[]
}

/**
 * 시퀀스 순서대로 신규 인물 첫 등장·씬 전환을 추적하며 needed 를 계산해 양방향 밴드로 수렴시킨다.
 *   부족: ceil(needed) 까지 증액 / 과대: ceil(needed)+slack 초과분을 그 경계까지 감액
 *   (pacing_intent='long_take' 는 감액 면제 — 증액은 여전히 적용).
 * 순수 함수 — 입력을 변경하지 않는다.
 */
export function reallocateShotDurations(
  shots: ShotSequenceItem[],
  dialogueByShotId: Map<string, ShotDialogue>,
  opts?: { minShotSeconds?: number; maxShotSeconds?: number },
): DurationReallocation {
  const min = opts?.minShotSeconds ?? REALLOC_MIN_SHOT_SECONDS
  const max = opts?.maxShotSeconds ?? REALLOC_MAX_SHOT_SECONDS
  const seenCharacters = new Set<string>()
  let prevSceneId: string | null = null
  const changed: DurationChange[] = []

  const out = shots.map((shot) => {
    const sceneId = shot.S?.scene_id ?? prevSceneId ?? ''
    const sceneOpening = sceneId !== prevSceneId
    prevSceneId = sceneId

    let newCharacters = 0
    for (const c of shot.assets?.characters ?? []) {
      if (typeof c.id !== 'string' || !c.id) continue
      if (!seenCharacters.has(c.id)) {
        seenCharacters.add(c.id)
        newCharacters += 1
      }
    }

    const speech = speechSeconds(dialogueByShotId.get(shot.shot_id))
    const needed = Math.max(
      min,
      actionSeconds(shot) + newCharacters * 1.0 + (sceneOpening ? 1.0 : 0),
      speech > 0 ? speech + SHOT_PACING.speechMarginSeconds : 0,
    )

    const from = shot.duration_seconds ?? 5
    const needCeil = Math.ceil(needed)
    const longTake = shot.pacing_intent === 'long_take'
    let to = from
    if (from < needCeil) {
      to = Math.min(max, needCeil)
    } else if (!longTake && from > needCeil + SHOT_PACING.shrinkSlackSeconds) {
      to = Math.max(Math.ceil(min), needCeil + SHOT_PACING.shrinkSlackSeconds)
    }
    if (to === from) return shot

    changed.push({ shot_id: shot.shot_id, from, to, needed: Math.round(needed * 10) / 10 })
    return { ...shot, duration_seconds: to }
  })

  return { shots: out, changed }
}
