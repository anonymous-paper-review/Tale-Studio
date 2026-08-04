// 인지 부하 기반 샷 길이 재배분 (#p2-pacing 2026-08-04) — 진단: lab/previz-quality/REPORT.md §7.
//
// 문제: duration 이 씬 예산 나눠먹기(정보 부하와 상관 r≈-0.2)로 배정돼 "2초 샷에 대사 1줄+액션"
//   같은 인지 과부하 샷이 생긴다 (실측 6/26). dialogue 스테이지가 duration 확정 *뒤*에 돌아
//   대사 발화 시간이 샷 길이에 반영될 경로가 구조적으로 없던 것이 핵심.
// 해법: persist 직전(대사 확정 후) 결정론 재배분 — 각 샷의 필요 시간(needed)을 규칙으로 계산해
//   **증액만** 한다(단축 금지 — long take 는 연출 의도일 수 있음). 씬 길이는 합으로 늘어나고
//   persist 가 scenes.estimated_duration_seconds 를 그 합으로 수렴시킨다 (est 는 참고치로 강등).
//
// needed 규칙 (결정론, LLM 없음):
//   speech  = 대사·내레이션 발화 시간 — 한글 ~4.5자/초, 라틴 ~13자/초 + 호흡 0.5s
//   action  = 2.0 + 0.8×보조액션 + 카메라 무브(simple 0.5 / complex 1.0)
//   newInfo = 신규 인물 첫 등장 ×1.0 + 씬 오프닝(공간 리딩) 1.0
//   needed  = max(바닥 2.5s, action+newInfo, speech+1.0)  — 발화와 액션은 병행되므로 max 합성
//   to      = min(상한, max(현행, ceil(needed)))          — 상한은 persist 클램프(10s)와 정합
import type { ShotSequenceItem, ShotDialogue } from '@/lib/writer/types/pipeline'

export const REALLOC_MIN_SHOT_SECONDS = 2.5
export const REALLOC_MAX_SHOT_SECONDS = 10 // persist_manifest MAX_SHOT_SECONDS(#9)와 동일 값 유지

const KO_CHARS_PER_SEC = 4.5
const LATIN_CHARS_PER_SEC = 13

/** 발화 시간(초) — 스크립트별 근사 속도. 공백 제외 글자 수 기준. */
export function speechSecondsForText(text: string): number {
  const chars = text.replace(/\s/g, '')
  if (!chars.length) return 0
  const latin = (chars.match(/[A-Za-z]/g) ?? []).length
  const rate = latin / chars.length > 0.6 ? LATIN_CHARS_PER_SEC : KO_CHARS_PER_SEC
  return chars.length / rate
}

function speechSeconds(dialogue: ShotDialogue | undefined): number {
  if (!dialogue) return 0
  const lines = [
    ...dialogue.dialogue.map((l) => l.line),
    ...(dialogue.narration ? [dialogue.narration] : []),
  ]
  const total = lines.reduce((sum, line) => sum + speechSecondsForText(line), 0)
  return total > 0 ? total + 0.5 : 0
}

function actionSeconds(shot: ShotSequenceItem): number {
  const budget = shot.action_budget
  const camera =
    budget?.camera_movement_complexity === 'complex'
      ? 1.0
      : budget?.camera_movement_complexity === 'simple'
        ? 0.5
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
 * 시퀀스 순서대로 신규 인물 첫 등장·씬 전환을 추적하며 needed 를 계산, 부족한 샷만 증액한다.
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
      speech > 0 ? speech + 1.0 : 0,
    )

    const from = shot.duration_seconds ?? 5
    const to = Math.min(max, Math.max(from, Math.ceil(needed)))
    if (to === from) return shot

    changed.push({ shot_id: shot.shot_id, from, to, needed: Math.round(needed * 10) / 10 })
    return { ...shot, duration_seconds: to }
  })

  return { shots: out, changed }
}
