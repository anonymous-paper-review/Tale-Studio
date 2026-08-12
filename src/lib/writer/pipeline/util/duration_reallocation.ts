// 인지 부하 기반 샷 길이 재배분 (#p2-pacing 2026-08-04) — 진단: lab/previz-quality/REPORT.md §7.
//
// 문제: duration 이 씬 예산 나눠먹기(정보 부하와 상관 r≈-0.2)로 배정돼 "2초 샷에 대사 1줄+액션"
//   같은 인지 과부하 샷이 생긴다 (실측 6/26). dialogue 스테이지가 duration 확정 *뒤*에 돌아
//   대사 발화 시간이 샷 길이에 반영될 경로가 구조적으로 없던 것이 핵심.
// 해법: persist 직전(대사 확정 후) 결정론 재배분 — 각 샷의 필요 시간(needed)을 규칙으로 계산해
//   **증액만** 한다(단축 금지 — long take 는 연출 의도일 수 있음). 씬 길이는 합으로 늘어나고
//   persist 가 scenes.estimated_duration_seconds 를 그 합으로 수렴시킨다 (est 는 참고치로 강등).
//
// 재배분의 목적은 "짧은 컷 금지"가 아니라 "대사·액션이 안 들어가는 사고 방지"다(2026-08-12 오너 결정).
//   대사 0 + 보조동작 0 + 카메라무브 none + 신규 인물 0 + 씬 오프닝 아님 = 순수 인서트/컷어웨이는
//   내용이 없어 인지 과부하가 원천적으로 불가능하므로 재배분 대상에서 제외한다 — 모델이 정한 값
//   그대로 통과한다(1초도 가능). isContentlessShot() 이 그 판별.
//
// needed 규칙 (결정론, LLM 없음, 내용 있는 샷에만 적용):
//   speech  = 대사·내레이션 발화 시간 — 한글 ~4.5자/초, 라틴 ~13자/초 + 호흡 0.5s
//   action  = 2.0 + 0.8×보조액션 + 카메라 무브(simple 0.5 / complex 1.0)
//   newInfo = 신규 인물 첫 등장 ×1.0 + 씬 오프닝(공간 리딩) 1.0
//   needed  = max(바닥 2.5s, action+newInfo, speech+1.0)  — 발화와 액션은 병행되므로 max 합성
//   to      = min(상한, max(현행, ceil(needed)))          — 상한은 persist 클램프(10s)와 정합
import type { ShotSequenceItem, ShotDialogue } from '@/lib/writer/types/pipeline'
import { SHOT_PHYSICS } from '@/lib/writer/pipeline/physics'

// 정본에서 읽는다 — 종전엔 리터럴 2.5·10 을 여기 따로 적어두고 주석으로 "동일 값 유지"를
//   사람에게 부탁했다. 프롬프트에 주입되는 숫자와 코드가 자르는 숫자가 같은 출처여야 한다
//   (physics.ts 헤더의 선언 목적 그 자체 — 2026-08-12 오너 지시).
export const REALLOC_MIN_SHOT_SECONDS = SHOT_PHYSICS.shotSecondsReallocFloor
export const REALLOC_MAX_SHOT_SECONDS = SHOT_PHYSICS.shotSecondsHardMax

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

/** isContentlessShot 판별 입력 — 루프 안에서 이미 계산된 값을 그대로 넘긴다(중복 계산 금지). */
interface ContentSignals {
  speechSeconds: number
  secondaryActionCount: number
  cameraMovementComplexity: 'none' | 'simple' | 'complex' | undefined
  newCharacterCount: number
  sceneOpening: boolean
}

/**
 * "내용 없는 샷"(순수 인서트/컷어웨이) 판별 — 대사 발화·보조동작·카메라무브·신규 인물·씬 오프닝이
 *   전부 없으면 인지 과부하가 원천적으로 불가능하다. 재배분 목적이 "짧은 컷 금지"가 아니라
 *   "대사·액션이 안 들어가는 사고 방지"이므로(파일 헤더), 이 경우는 재배분 대상에서 제외한다
 *   (2026-08-12 오너 결정 — 모델이 정한 값 그대로 통과, 1초도 가능).
 */
export function isContentlessShot(signals: ContentSignals): boolean {
  return (
    signals.speechSeconds === 0 &&
    signals.secondaryActionCount === 0 &&
    (signals.cameraMovementComplexity ?? 'none') === 'none' &&
    signals.newCharacterCount === 0 &&
    !signals.sceneOpening
  )
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

    if (
      isContentlessShot({
        speechSeconds: speech,
        secondaryActionCount: shot.action_budget?.secondary_action_count ?? 0,
        cameraMovementComplexity: shot.action_budget?.camera_movement_complexity,
        newCharacterCount: newCharacters,
        sceneOpening,
      })
    ) {
      return shot // 내용 없음 — 재배분 대상 제외, 원본 값 그대로(changed 미등재)
    }

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
