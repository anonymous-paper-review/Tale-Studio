// Storyboard 보드의 숫자 · 샷 이름 · Director 넘김 창 내용 (리뉴얼 1차 2026-10-19, 프로토타입 S1 · S7).
//   보드 카드 · 화면 머리 · 넘김 창이 같은 셈을 쓰도록 한 곳에 둔다 — 러닝타임은 목표가 아니라 샷 길이의 합(지표)이다.
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { isRoughDrawn } from '@/lib/writer/rough-progress'
import type { RoughStoryboardImage, Shot } from '@/types'

type BoardShotInput = Pick<Shot, 'shotId' | 'sceneId' | 'durationSeconds' | 'actionDescription' | 'roughStoryboard'>
type BoardManifest = { scenes: ReadonlyArray<{ sceneId: string }> } | null | undefined

export interface BoardShotEntry<S extends BoardShotInput = BoardShotInput> {
  shot: S
  /** 보드에 보이는 씬 번호(1부터). */
  sceneNo: number
  /** 보드에 보이는 샷 번호 — 씬마다 다시 세지 않고 씬 순서대로 이어 센다(#shot-global-no 2026-08-12). */
  shotNo: number
  /** 보드 카드와 같은 이름 "Scene N · Shot M"(로케일 무관, #internal-id-scrub). */
  label: string
}

/** 보드에 그려지는 샷과 번호 — 씬 목록 순서, 씬 안에서는 샷 순서. 씬 목록에 없는 샷은 보드에 없다. */
export function boardShots<S extends BoardShotInput>(manifest: BoardManifest, shots: readonly S[]): BoardShotEntry<S>[] {
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

export interface DirectorHandoffSummary {
  /** 러프가 있어 Director 로 넘어가는 샷 수. */
  movingShots: number
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
  return { movingShots: moving.length, movingSeconds: secondsOf(moving), missing }
}

/** 빠지는 샷 이름을 이만큼까지 적고 나머지는 "외 N컷"으로 줄인다 — 창이 이름으로 넘치지 않게. */
const MISSING_LABEL_LIMIT = 10

export interface DirectorConfirmView {
  title: string
  rows: Array<{ label: string; value: string }>
  /** 러프가 없어 빠지는 샷 안내. 없으면 null. */
  warning: string | null
  /** [남은 컷 그리기]를 둘지 — 빠지는 샷 중 그릴 수 있는 것이 있을 때만. */
  canDrawRemaining: boolean
}

export function directorConfirmView(summary: DirectorHandoffSummary, locale: AppLocale): DirectorConfirmView {
  const labels = summary.missing.map((item) => item.label)
  const shots = labels.slice(0, MISSING_LABEL_LIMIT).join(', ')
  const more = labels.length - MISSING_LABEL_LIMIT
  const warning = labels.length === 0 ? null
    : more > 0
      ? translate(locale, 'These shots have no rough and are left out this time: {shots} and {count} more.', { shots, count: more })
      : translate(locale, 'These shots have no rough and are left out this time: {shots}.', { shots })
  return {
    title: translate(locale, 'Hand over to Director?'),
    rows: [
      { label: translate(locale, 'Moving over'), value: translate(locale, 'Shots {count} · roughs · character and background images', { count: summary.movingShots }) },
      { label: translate(locale, 'Running time'), value: translate(locale, '{seconds}s', { seconds: summary.movingSeconds }) },
      { label: translate(locale, 'Next'), value: translate(locale, 'Director makes the cuts from the roughs and the Artist images') },
    ],
    warning,
    canDrawRemaining: summary.missing.some((item) => item.drawable),
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
