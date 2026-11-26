// Storyboard 실사 보기(오너 2026-11-26 m1126 S2 · O1 · O7) — 카드가 보일 그림 · 카드 위 기다림 · [시작]이 만들 샷 · 진행 숫자를 정하는 순수 규칙.
//   처음엔 Writer 콘티의 목각 그림이 보이고, [시작]을 누르면 Director [이미지 만들기]와 같은 일괄이 실사를 만든다.
//   실사가 "있는가"는 실사 일괄 서버와 같은 판정(hasStoryboardImage)으로, 콘티 그림이 "있는가"는 러프 보드와 같은 판정(isRoughDrawn)으로 본다 —
//   화면이 만들 샷으로 센 것과 서버가 그릴 샷이 어긋나지 않게(서버는 실사 있는 샷 · 러프 없는 샷을 건너뛴다).
//   콘티 그림을 그리는 중인 샷(리드 2026-11-26 — Storyboard 가 빠진 콘티를 이어 그린다)은 [시작]이 빼고 이름을 알리며, 그 카드에만 기다림을 보인다.
//   약속: tests/writer/real-board.test.ts
import { activeShotIds, type ActiveJob } from '@/lib/generation-queue'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import type { GenerationJobKind } from '@/lib/generation-jobs'
import { storyboardImageStartFrame } from '@/lib/director/storyboard-image'
import { isRoughDrawn } from '@/lib/writer/rough-progress'
import type { RoughStoryboardImage } from '@/types/shot'

/** 카드에 그릴 실사 — RoughFrameCycle 이 그대로 받는 모양(url · generatedAt · 세 장). */
export interface RealPanel {
  url: string
  generatedAt: number
  frames?: { start: string; direction: string; end: string }
}

export type StoryboardCardPicture =
  | { kind: 'real'; panel: RealPanel }
  | { kind: 'conti'; panel: RoughStoryboardImage }
  | { kind: 'none' }

/** 실사 이미지 작업 — 일괄 시트(4샷 한 장)와 한 샷 다시 그리기. */
export const REAL_IMAGE_JOB_KINDS: readonly GenerationJobKind[] = ['storyboard_real_grid', 'shot_storyboard']

/** shots.storyboard_image 에서 카드에 그릴 지금 실사 — 없거나 끝나지 않았으면 null(서버 hasStoryboardImage 와 같은 판정). */
export function realPanelOf(raw: unknown): RealPanel | null {
  const start = storyboardImageStartFrame(raw)
  if (!start) return null
  const image = raw && typeof raw === 'object' ? (raw as { url?: unknown; generatedAt?: unknown; frames?: unknown }) : {}
  const f = image.frames && typeof image.frames === 'object' ? (image.frames as Record<string, unknown>) : null
  const frames =
    f && typeof f.start === 'string' && f.start && typeof f.direction === 'string' && f.direction && typeof f.end === 'string' && f.end
      ? { start: f.start, direction: f.direction, end: f.end }
      : undefined
  return {
    url: typeof image.url === 'string' && image.url ? image.url : start,
    generatedAt: typeof image.generatedAt === 'number' ? image.generatedAt : 0,
    ...(frames ? { frames } : {}),
  }
}

/** 카드가 보일 그림 — 실사가 있으면 실사, 없으면 콘티(목각 러프), 둘 다 없으면 없음. */
export function storyboardCardPicture(rough: RoughStoryboardImage | null | undefined, realRaw: unknown): StoryboardCardPicture {
  const panel = realPanelOf(realRaw)
  if (panel) return { kind: 'real', panel }
  if (rough && isRoughDrawn(rough)) return { kind: 'conti', panel: rough }
  return { kind: 'none' }
}

/** 지금 실사를 그리는 샷(큐에 떠 있는 실사 작업이 맡은 Writer 샷) — 화면에서 멈춘 작업은 세지 않는다(activeShotIds). */
export function realDrawingShotIds(jobs: readonly ActiveJob[]): Set<string> {
  return activeShotIds(jobs, REAL_IMAGE_JOB_KINDS)
}

/** 콘티 그림(목각 러프)을 그리는 작업. */
export const ROUGH_IMAGE_JOB_KINDS: readonly GenerationJobKind[] = ['shot_rough_storyboard']

/** 지금 콘티 그림을 그리는 샷 — 큐에 떠 있는 러프 작업이 맡은 샷 + Storyboard 이어 그리기가 보내고 아직 다시 읽지 않은 샷(pending). */
export function roughDrawingShotIds(jobs: readonly ActiveJob[], pending: Iterable<string> = []): Set<string> {
  const ids = activeShotIds(jobs, ROUGH_IMAGE_JOB_KINDS)
  for (const id of pending) ids.add(id)
  return ids
}

/** 실사 일괄의 진행 깃발(Director store 의 realBatch* — 한 탭에 일괄 하나). shotIds null = 실사 없는 샷 전부. */
export interface RealBatchFlags {
  busy: boolean
  cancelled: boolean
  shotIds: readonly string[] | null
}

/** 일괄이 맡았지만 아직 서버에 보내지 않은 샷인가 — Director 카드의 autoFillPending 과 같은 조건(실사 없음 · 콘티 있음 · 대상 · 멈추지 않음). */
function batchPending(shotId: string, hasReal: boolean, hasConti: boolean, batch: RealBatchFlags): boolean {
  if (!batch.busy || batch.cancelled || hasReal || !hasConti) return false
  return batch.shotIds === null || batch.shotIds.includes(shotId)
}

export type StoryboardCardWait = 'none' | 'drawing' | 'queued' | 'rough'

/** 카드 위 기다림 — drawing: 실사를 그리는 작업이 떠 있다 · rough: 실사가 없고 콘티 그림을 그리는 중이다 ·
 *  queued: [시작] 일괄의 차례를 기다린다 · none: 기다림 없음. 실사가 있는 카드는 콘티를 다시 그려도 실사를 그대로 보인다. */
export function storyboardCardWait(input: {
  shotId: string
  hasReal: boolean
  hasConti: boolean
  drawing: ReadonlySet<string>
  batch: RealBatchFlags
  roughDrawing?: ReadonlySet<string>
}): StoryboardCardWait {
  if (input.drawing.has(input.shotId)) return 'drawing'
  if (!input.hasReal && input.roughDrawing?.has(input.shotId)) return 'rough'
  return batchPending(input.shotId, input.hasReal, input.hasConti, input.batch) ? 'queued' : 'none'
}

export interface StoryboardBoardShot {
  shotId: string
  roughStoryboard?: RoughStoryboardImage | null
}

export interface StoryboardStartView {
  /** [시작]이 만들 샷(보드 순서) — 실사 없음 · 콘티 그림 있음 · 실사도 콘티도 그리는 중이 아님. */
  targets: string[]
  /** 실사가 없고 콘티 그림을 그리는 중이라 [시작]이 빼는 샷(보드 순서) — 다 그리면 다음 [시작]이 넣는다. 옛 콘티가 있어도 바뀌는 중이라 뺀다. */
  roughDrawing: string[]
  /** 실사도 콘티 그림도 없어 [시작]이 빼는 샷(보드 순서) — Writer 콘티에서 그린다. */
  noConti: string[]
  /** start = [시작] · stop = 일괄이 돌아 [멈추기] · stopping = 멈춘 판을 정리하는 중 · all-real = 실사가 다 있음 · nothing = 만들 수 있는 것이 없음(콘티 그림 없는 샷만 남음). */
  mode: 'start' | 'stop' | 'stopping' | 'all-real' | 'nothing'
  /** [다음: Director로 →]가 크림 단추인가 — [시작]이 보이면 [시작]이 크림이다(design §1 규칙 2 "크림은 화면에 하나"). */
  nextIsPrimary: boolean
}

/** 머리의 [시작] · [멈추기]와 [다음: Director로 →]의 모습. shots = 보드 순서(lib/writer/board-summary boardShots). */
export function storyboardStartView(input: {
  shots: readonly StoryboardBoardShot[]
  realOf: (shotId: string) => unknown
  drawing: ReadonlySet<string>
  batch: RealBatchFlags
  roughDrawing?: ReadonlySet<string>
}): StoryboardStartView {
  const targets: string[] = []
  const roughDrawing: string[] = []
  const noConti: string[] = []
  let allReal = true
  for (const shot of input.shots) {
    if (realPanelOf(input.realOf(shot.shotId))) continue
    allReal = false
    if (input.roughDrawing?.has(shot.shotId)) {
      roughDrawing.push(shot.shotId)
      continue
    }
    if (!shot.roughStoryboard || !isRoughDrawn(shot.roughStoryboard)) {
      noConti.push(shot.shotId)
      continue
    }
    if (!input.drawing.has(shot.shotId)) targets.push(shot.shotId)
  }
  const mode: StoryboardStartView['mode'] = input.batch.busy
    ? input.batch.cancelled ? 'stopping' : 'stop'
    : targets.length > 0
      ? 'start'
      : allReal
        ? 'all-real'
        : 'nothing'
  return { targets, roughDrawing, noConti, mode, nextIsPrimary: mode !== 'start' }
}

export interface StoryboardRealProgress {
  total: number
  /** 지금 실사가 있고 다시 그리는 중이 아닌 샷. */
  real: number
  /** 실사를 그리는 중 · [시작] 일괄의 차례를 기다리는 중 · 실사가 없고 콘티 그림을 그리는 중인 샷(카드에 기다림이 보이는 수). */
  making: number
  /** 실사가 없고 만드는 중도 아닌 샷. */
  noReal: number
}

/** 진행 줄 숫자 — 보드 전체 · 실사 · 만드는 중 · 실사 없음(셋을 더하면 전체). */
export function storyboardRealProgress(input: {
  shots: readonly StoryboardBoardShot[]
  realOf: (shotId: string) => unknown
  drawing: ReadonlySet<string>
  batch: RealBatchFlags
  roughDrawing?: ReadonlySet<string>
}): StoryboardRealProgress {
  let real = 0
  let making = 0
  for (const shot of input.shots) {
    const hasReal = !!realPanelOf(input.realOf(shot.shotId))
    const hasConti = !!shot.roughStoryboard && isRoughDrawn(shot.roughStoryboard)
    const wait = storyboardCardWait({ shotId: shot.shotId, hasReal, hasConti, drawing: input.drawing, batch: input.batch, roughDrawing: input.roughDrawing })
    if (wait !== 'none') making += 1
    else if (hasReal) real += 1
  }
  return { total: input.shots.length, real, making, noReal: input.shots.length - real - making }
}

/** 콘티 그림이 없는 샷 이름을 이만큼까지 적고 나머지는 수로 — 넘김 창(lib/writer/board-summary)과 같은 상한. */
const NO_CONTI_LABEL_LIMIT = 10

/** [시작] 때 콘티 그림이 없어 빠지는 샷 알림(혼자 정한 것 f) — 없으면 null. names = 보드 이름("샷 3"), 그 글의 언어로 지은 것. */
export function noContiNotice(locale: AppLocale, names: readonly string[]): string | null {
  if (names.length === 0) return null
  const shots = names.slice(0, NO_CONTI_LABEL_LIMIT).join(', ')
  const more = names.length - NO_CONTI_LABEL_LIMIT
  if (more > 0) {
    return translate(locale, '{shots} and {count} more have no rough storyboard, so they are left out. Draw them in Writer, then press Start again.', { shots, count: more })
  }
  return names.length === 1
    ? translate(locale, '{shots} has no rough storyboard, so it is left out. Draw it in Writer, then press Start again.', { shots })
    : translate(locale, '{shots} have no rough storyboard, so they are left out. Draw them in Writer, then press Start again.', { shots })
}

/** [시작] 때 콘티 그림을 그리는 중이라 빠지는 샷 알림(리드 2026-11-26, (f)와 같은 꼴) — 없으면 null. names = 보드 이름("샷 3"). */
export function roughDrawingNotice(locale: AppLocale, names: readonly string[]): string | null {
  if (names.length === 0) return null
  const shots = names.slice(0, NO_CONTI_LABEL_LIMIT).join(', ')
  const more = names.length - NO_CONTI_LABEL_LIMIT
  if (more > 0) {
    return translate(locale, '{shots} and {count} more are still getting their rough storyboards, so they are left out. Press Start again when they are drawn.', { shots, count: more })
  }
  return names.length === 1
    ? translate(locale, '{shots} is still getting its rough storyboard, so it is left out. Press Start again when it is drawn.', { shots })
    : translate(locale, '{shots} are still getting their rough storyboards, so they are left out. Press Start again when they are drawn.', { shots })
}
