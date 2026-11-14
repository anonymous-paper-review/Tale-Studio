// Storyboard 보드의 숫자 · 샷 이름 · Director 넘김 창 내용 (리뉴얼 1차 2026-10-19, 프로토타입 S1 · S7).
//   보드 카드 · 화면 머리 · 넘김 창이 같은 셈을 쓰도록 한 곳에 둔다 — 러닝타임은 목표가 아니라 샷 길이의 합(지표)이다.
import { countText } from '@/lib/i18n/count-text'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { isRoughDrawn } from '@/lib/writer/rough-progress'
import { realImageBatchMinutes } from '@/lib/director/generation-estimate'
import type { RoughStoryboardImage, Shot } from '@/types'

type BoardShotInput = Pick<Shot, 'shotId' | 'sceneId' | 'durationSeconds' | 'actionDescription' | 'roughStoryboard'>
/** 번호만 셀 때 필요한 칸 — 씬 · 샷 id 와 순서. */
type NumberedShot = Pick<Shot, 'shotId' | 'sceneId'>
type BoardManifest = { scenes: ReadonlyArray<{ sceneId: string }> } | null | undefined

export interface BoardShotEntry<S extends NumberedShot = BoardShotInput> {
  shot: S
  /** 보드에 보이는 씬 번호(1부터). */
  sceneNo: number
  /** 보드에 보이는 샷 번호 — 씬마다 다시 세지 않고 씬 순서대로 이어 센다(#shot-global-no 2026-08-12). */
  shotNo: number
  /** 보드 카드와 같은 이름 "Scene N · Shot M"(로케일 무관, #internal-id-scrub). */
  label: string
}

/** 보드에 그려지는 샷과 번호 — 씬 목록 순서, 씬 안에서는 샷 순서. 씬 목록에 없는 샷은 보드에 없다.
 *  샷 번호를 보이는 모든 곳(멘션 · 채팅 · 도구 · 말풍선 · Artist · Editor · 내보내기)이 이 셈 하나를 쓴다(오너 2026-11-02 "전체 번호로 통일"). */
export function boardShots<S extends NumberedShot>(manifest: BoardManifest, shots: readonly S[]): BoardShotEntry<S>[] {
  const out: BoardShotEntry<S>[] = []
  let shotNo = 0
  ;(manifest?.scenes ?? []).forEach((scene, sceneIndex) => {
    for (const shot of shots) {
      if (shot.sceneId !== scene.sceneId) continue
      shotNo++
      out.push({ shot, sceneNo: sceneIndex + 1, shotNo, label: `Scene ${sceneIndex + 1} · Shot ${shotNo}` })
    }
  })
  return out
}

/** 샷 id → 보드 카드 이름("Scene 2 · Shot 8") — 번호는 id 가 아니라 지금 순서에서 센다(샷을 더하거나 지우면 다시 센다). */
export function boardShotLabels(manifest: BoardManifest, shots: readonly NumberedShot[]): Map<string, string> {
  return new Map(boardShots(manifest, shots).map((entry) => [entry.shot.shotId, entry.label]))
}

export interface BoardStats {
  scenes: number
  shots: number
  /** 샷 길이의 합 — 정수 초. */
  seconds: number
}

function secondsOf(entries: ReadonlyArray<{ shot: Pick<Shot, 'durationSeconds'> }>): number {
  const sum = entries.reduce((total, entry) => total + (Number.isFinite(entry.shot.durationSeconds) ? entry.shot.durationSeconds : 0), 0)
  return Math.round(sum)
}

export function boardStats(manifest: BoardManifest, shots: readonly BoardShotInput[]): BoardStats {
  const entries = boardShots(manifest, shots)
  return { scenes: manifest?.scenes.length ?? 0, shots: entries.length, seconds: secondsOf(entries) }
}

/** 제목 옆 "씬 3 · 샷 8 · 20초". */
export function boardStatsLabel(stats: BoardStats, locale: AppLocale): string {
  return translate(locale, 'Scenes {scenes} · Shots {shots} · {seconds}s', { scenes: stats.scenes, shots: stats.shots, seconds: stats.seconds })
}

export interface SceneStats {
  shots: number
  /** 그 씬 샷 길이의 합 — 정수 초(화면 머리와 같은 셈). */
  seconds: number
}

/** 씬 id → 씬 머리의 "3컷 · 7초"(v3 시안 S1, 2026-11-03). 씬 목록의 씬은 샷이 없어도 0으로 있다. 약속: tests/writer/board-card.test.ts */
export function sceneStats(manifest: BoardManifest, shots: readonly Pick<Shot, 'shotId' | 'sceneId' | 'durationSeconds'>[]): Map<string, SceneStats> {
  const entries = boardShots(manifest, shots)
  return new Map(
    (manifest?.scenes ?? []).map((scene) => {
      const own = entries.filter((entry) => entry.shot.sceneId === scene.sceneId)
      return [scene.sceneId, { shots: own.length, seconds: secondsOf(own) }]
    }),
  )
}

/** 씬 머리 "3컷 · 7초". */
export function sceneStatsLabel(stats: SceneStats, locale: AppLocale): string {
  // 영어는 컷이 하나면 단수 문장(리드 11/14 — 영어 재점검 "1 cuts").
  return countText((key, params) => translate(locale, key, params), stats.shots, '1 cut · {seconds}s', '{count} cuts · {seconds}s', { count: stats.shots, seconds: stats.seconds })
}

export interface DirectorHandoffSummary {
  /** 러프가 있어 Director 로 넘어가는 샷 수. */
  movingShots: number
  /** 넘어가는 샷 id(보드 순서) — 넘기기 창이 그중 실사가 아직 없는 샷을 센다. */
  movingShotIds: string[]
  /** 넘어가는 샷 길이의 합 — 정수 초. */
  movingSeconds: number
  /** 러프가 없어 이번에 빠지는 샷 — drawable = 그릴 스토리(액션)가 있어 [남은 컷 그리기]로 그릴 수 있다. */
  missing: Array<{ shotId: string; label: string; drawable: boolean }>
}

/** Director 넘김 창의 숫자. panelOf = 보드가 지금 보여 주는 그림(막 받은 그림 포함), 없으면 저장된 그림. */
export function directorHandoffSummary<S extends BoardShotInput>(
  manifest: BoardManifest,
  shots: readonly S[],
  panelOf: (shot: S) => RoughStoryboardImage | null | undefined = (shot) => shot.roughStoryboard,
): DirectorHandoffSummary {
  const entries = boardShots(manifest, shots)
  const moving = entries.filter((entry) => isRoughDrawn(panelOf(entry.shot)))
  const missing = entries
    .filter((entry) => !isRoughDrawn(panelOf(entry.shot)))
    .map((entry) => ({ shotId: entry.shot.shotId, label: entry.label, drawable: !!entry.shot.actionDescription?.trim() }))
  return { movingShots: moving.length, movingShotIds: moving.map((entry) => entry.shot.shotId), movingSeconds: secondsOf(moving), missing }
}

/** 빠지는 샷 이름을 이만큼까지 적고 나머지는 "외 N컷"으로 줄인다 — 창이 이름으로 넘치지 않게. */
const MISSING_LABEL_LIMIT = 10

export type DirectorHandoffChoice = 'makeImages' | 'pickYourself'

/** 넘기기 창(D0)에 더 보일 숫자 — 보드 밖(Artist 그림 · 이미 만든 실사 · Take 계산기)에서 온다. */
export interface DirectorConfirmExtra {
  /** Artist 에서 그림이 있는 인물 · 배경 카드 수. */
  characters: number
  backgrounds: number
  /** 넘어가는 샷 중 실사 이미지가 아직 없는 샷 수 — "넘어가면서 이미지 N장 만들기"의 N.
   *  저장된 실사를 아직 읽는 중이면 'counting', 읽기에 실패하면 많아야 몇 장인지(atMost)만 안다(검토 b 낮음 7). */
  imagesToMake: number | 'counting' | { atMost: number }
  /** 영상 한 편의 Take — 지금 Take 계산기 값(오너 2026-11-14 답 11번). Take 과금이 꺼져 있으면 null — 값을 보이지 않는다(낮음 5). */
  takesPerShot: number | null
}

export interface DirectorConfirmView {
  title: string
  description: string | null
  rows: Array<{ label: string; value: string }>
  /** 러프가 없어 빠지는 샷 안내. 없으면 null. */
  warning: string | null
  /** [남은 컷 그리기]를 둘지 — 빠지는 샷 중 그릴 수 있는 것이 있을 때만. */
  canDrawRemaining: boolean
  /** 고르기 둘(시안 D0) — 넘어가면서 이미지 만들기(추천) · 넘어가서 직접 고르기.
   *  만들 실사가 0장이면 만들기 칸은 null — 칸과 "추천"을 숨기고 직접 고르기만 둔다(리드 2026-11-14, 시안 없음). */
  makeImages: { label: string; description: string; disabled: boolean } | null
  pickYourself: { label: string; description: string }
  /** 창을 열 때 골라져 있는 것 — 만들 이미지가 있으면 추천(이미지 만들기). */
  defaultChoice: DirectorHandoffChoice
}

/** Storyboard → Director 넘기기 창(디자이너 1110 확정 D0 · 오너 2026-11-14 페이지 추천). 러프 없는 샷 경고 · [남은 컷 그리기]는 그대로 둔다.
 *  약속: tests/writer/board-summary.test.ts · tests/writer/director-handover-images.test.ts */
export function directorConfirmView(summary: DirectorHandoffSummary, locale: AppLocale, extra: DirectorConfirmExtra): DirectorConfirmView {
  const labels = summary.missing.map((item) => item.label)
  const shots = labels.slice(0, MISSING_LABEL_LIMIT).join(', ')
  const more = labels.length - MISSING_LABEL_LIMIT
  const warning = labels.length === 0 ? null
    : more > 0
      ? translate(locale, 'These shots have no rough and are left out this time: {shots} and {count} more.', { shots, count: more })
      : translate(locale, 'These shots have no rough and are left out this time: {shots}.', { shots })
  const images = typeof extra.imagesToMake === 'number' ? extra.imagesToMake : null
  const atMost = typeof extra.imagesToMake === 'object' ? extra.imagesToMake.atMost : null
  const showTakes = extra.takesPerShot !== null
  const nextRow =
    extra.imagesToMake === 'counting'
      ? translate(locale, 'Rough → real images · counting')
      : atMost !== null
        ? showTakes
          ? translate(locale, 'Rough → up to {count} real images · about {minutes} min · No Takes used', { count: atMost, minutes: realImageBatchMinutes(atMost) })
          : translate(locale, 'Rough → up to {count} real images · about {minutes} min', { count: atMost, minutes: realImageBatchMinutes(atMost) })
        : images && images > 0
          ? showTakes
            ? translate(locale, 'Rough → {count} real images · about {minutes} min · No Takes used', { count: images, minutes: realImageBatchMinutes(images) })
            : translate(locale, 'Rough → {count} real images · about {minutes} min', { count: images, minutes: realImageBatchMinutes(images) })
          : translate(locale, 'The real images are already made')
  return {
    title: translate(locale, 'Move on to Director?'),
    description: images && images > 0 ? translate(locale, 'We start by turning the {count} roughs into real images.', { count: images }) : null,
    rows: [
      {
        label: translate(locale, 'Moving over'),
        value: translate(locale, 'Shots {shots} · {seconds}s · Characters {characters} · Backgrounds {backgrounds} · Roughs {roughs}', {
          shots: summary.movingShots,
          seconds: summary.movingSeconds,
          characters: extra.characters,
          backgrounds: extra.backgrounds,
          roughs: summary.movingShots,
        }),
      },
      { label: translate(locale, 'Next'), value: nextRow },
      {
        label: translate(locale, 'After that'),
        value: extra.takesPerShot !== null
          ? countText((key, params) => translate(locale, key, params), extra.takesPerShot, 'Check the images and make the videos · 1 Take per shot', 'Check the images and make the videos · {takes} Takes per shot', { takes: extra.takesPerShot })
          : translate(locale, 'Check the images and make the videos'),
      },
    ],
    warning,
    canDrawRemaining: summary.missing.some((item) => item.drawable),
    makeImages: images === 0 ? null : {
      label:
        extra.imagesToMake === 'counting'
          ? translate(locale, 'Make images while moving over')
          : atMost !== null
            ? translate(locale, 'Make up to {count} images while moving over', { count: atMost })
            : translate(locale, 'Make {count} images while moving over', { count: images ?? 0 }),
      description: translate(locale, 'You can look at other screens while you wait. We show the first ones as soon as they are ready and tell you when they are all done.'),
      disabled: images === 0,
    },
    pickYourself: {
      label: translate(locale, 'Move over and pick yourself'),
      description: translate(locale, 'Choose the shots to make and make them one by one.'),
    },
    defaultChoice: images === 0 ? 'pickYourself' : 'makeImages',
  }
}

/** 보드 첫 안내(채팅) — 카드를 Ctrl/Cmd 로 눌러 붙이는 여러 샷 선택은 없앴으니 말하지 않는다(프로토타입 S1). */
export function storyboardBriefing(locale: AppLocale, counts: { sceneCount: number; shotCount: number }): string {
  return translate(
    locale,
    'Scene and shot work is done.\n\n' +
      '· Split into {sceneCount} scenes, {shotCount} shots\n' +
      '· Each shot is pre-drawn as a rough storyboard (pencil sketch)\n\n' +
      'Tell me which scene or shot you want to revise or add.\n' +
      'Press "@" to pick a scene or shot.',
    { sceneCount: counts.sceneCount, shotCount: counts.shotCount },
  )
}
