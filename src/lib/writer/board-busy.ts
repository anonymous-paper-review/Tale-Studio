// Storyboard 잠금 표시 (리뉴얼 1차 2026-10-19, 프로토타입 S0 · 원칙 "AI가 일하는 동안은 전체 잠금").
//   씬 · 샷을 나누는 동안(Artist [완료하기] 뒤 실행 08~15)과 러프를 그리는 동안 보드 위에 AiBusyOverlay 를 띄운다.
//   보드는 뒤에 그대로 그려져 다 그린 샷부터 보인다. 다 그리면 잠금을 풀고, 실패한 컷이 남으면 실패 안내를 둔다.
//   화면(rough-storyboard-view)은 그때그때의 사실만 넘기고, 언제 잠그고 무엇을 보일지는 여기서만 정한다.
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { writerProgressView } from '@/lib/writer/progress-view'
import type { RoughProgress } from '@/lib/writer/rough-progress'
import type { WriterStatus } from '@/lib/writer/use-writer-status'

/** 한 순간의 사실 — 화면이 렌더마다 모은다. */
export interface BoardLockFacts {
  /** Writer 실행이 지금 일하는 중(멈춤 · 실패 · 완료가 아님). */
  runActive: boolean
  /** 실행이 끝난 뒤 저장된 샷을 다시 읽는 중(샷이 도착하면 더 기다리지 않는다). */
  reloading: boolean
  hasShots: boolean
  /** 그리는 중인 컷 수(생성 큐 + 화면이 보낸 것). */
  generating: number
  /** 그리지 못한 컷 수. */
  failed: number
  /** 화면의 그리기(빠진 패널 채우기 · 남은 컷 그리기)가 도는 중. */
  pumpActive: boolean
  /** 화면에 들어오자마자 빠진 패널을 자동으로 채우기 직전. */
  autoDrawPending: boolean
}

/** 순간과 순간 사이에 이어지는 잠금 상태. */
export interface BoardLockState {
  /** 이 화면에서 실행(씬 · 샷 나누기)이나 진입 자동 그리기를 봤고, 첫 러프를 아직 다 그리지 않았다. */
  awaitingFirstDraw: boolean
  /** 직전 순간에 그리고 있었다 — 그리기가 끝나는 순간을 잡는다. */
  wasDrawing: boolean
  /** 그리기가 실패를 남기고 끝났다 — [닫기] 전까지 실패 안내를 띄운다. */
  failureNotice: boolean
}

export const INITIAL_BOARD_LOCK: BoardLockState = { awaitingFirstDraw: false, wasDrawing: false, failureNotice: false }

/** 실행이 일하는 중인가 — Artist [완료하기] · 씬 초안 확정을 기다리는 정지는 일이 아니다. */
export function isBoardRunActive(status: Partial<WriterStatus> | null | undefined): boolean {
  return !!(status?.started && !status.pipeline_completed && !status.pipeline_failed && status.current_status === 'running')
}

export function isBoardDrawing(facts: BoardLockFacts): boolean {
  return facts.hasShots && (facts.generating > 0 || facts.pumpActive || facts.autoDrawPending)
}

/** 실행이 끝났는데 저장된 샷이 아직 도착하지 않았다 — 그 틈에 빈 보드가 번쩍이지 않게 첫 그리기 잠금을 잇는다. */
function awaitingShots(facts: BoardLockFacts): boolean {
  return facts.reloading && !facts.hasShots
}

export function advanceBoardLock(prev: BoardLockState, facts: BoardLockFacts): BoardLockState {
  const drawing = isBoardDrawing(facts)
  let awaitingFirstDraw = prev.awaitingFirstDraw || facts.runActive || facts.autoDrawPending
  // 실행이 멈췄거나 끝났고, 샷을 기다리지도 않고, 그리는 일도 없다 → 첫 그리기는 끝났다(또는 그릴 것이 없다).
  if (awaitingFirstDraw && !facts.runActive && !awaitingShots(facts) && !drawing) awaitingFirstDraw = false
  const failureNotice = drawing ? false : prev.failureNotice || (prev.wasDrawing && facts.failed > 0)
  return { awaitingFirstDraw, wasDrawing: drawing, failureNotice }
}

/** 실패 안내의 [닫기] — 잠금만 푼다. 실패한 카드는 보드에 남아 다시 그릴 수 있다. */
export function dismissBoardFailure(prev: BoardLockState): BoardLockState {
  return { ...prev, failureNotice: false }
}

export interface StoryboardBusyStep {
  label: string
  state: 'done' | 'current' | 'todo'
}

export interface StoryboardBusyView {
  open: boolean
  phase: 'split' | 'draw' | 'failed' | null
  title: string
  description?: string
  steps?: StoryboardBusyStep[]
  /** 0~100. null 이면 막대를 그리지 않는다. */
  progress: number | null
  progressLabel?: string
  failed: number
  /** 실패 안내의 버튼 이름. */
  actions?: { redraw: string; close: string }
}

// 씬 · 샷 나누기 단계 → 잠금 표시의 줄(0~3). v2Design 등 앞 단계는 [완료하기] 직후 실행이 다음 단계로 들어가기 전의 틈이다.
const SPLIT_STEP: Record<string, number> = {
  visualFormat: 0,
  actVisualArc: 0,
  v2Design: 0,
  sceneCinematography: 1,
  decoupage: 2,
  sceneStage: 2,
  shotsAndDialogue: 3,
  persistShots: 3,
}
const SPLIT_STEPS = 4
const ROUGH_STEP = SPLIT_STEPS

function steps(current: number, sceneCount: number, rough: RoughProgress | null, locale: AppLocale): StoryboardBusyStep[] {
  const labels = [
    translate(locale, 'Reading the prose'),
    sceneCount > 0 ? translate(locale, 'Splitting into {count} scenes', { count: sceneCount }) : translate(locale, 'Splitting into scenes'),
    translate(locale, 'Placing the camera and shots'),
    translate(locale, 'Choosing shot size, angle and movement'),
    current >= ROUGH_STEP && rough && rough.total > 0
      ? translate(locale, 'Drawing roughs {done}/{total}', { done: rough.completed, total: rough.total })
      : translate(locale, 'Draw the roughs'),
  ]
  return labels.map((label, index) => ({ label, state: index < current ? 'done' : index === current ? 'current' : 'todo' }))
}

function roughPercent(rough: RoughProgress): number | null {
  return rough.total > 0 ? Math.round((rough.completed / rough.total) * 100) : null
}

export function storyboardBusyView(
  input: {
    status: Partial<WriterStatus> | null | undefined
    facts: BoardLockFacts
    lock: BoardLockState
    rough: RoughProgress
    /** 씬 수(인물 · 배경 디자인 때 저장된 씬) — 0 이면 줄에 적지 않는다. */
    sceneCount: number
  },
  locale: AppLocale,
): StoryboardBusyView {
  const { status, facts, lock, rough, sceneCount } = input
  const closed: StoryboardBusyView = { open: false, phase: null, title: '', progress: null, failed: rough.failed }

  if (facts.runActive) {
    const step = status?.engine !== 'v2' ? SPLIT_STEP[status?.current_stage ?? ''] : undefined
    if (step === undefined) {
      // 씬 · 샷 나누기가 아닌 실행(산문 초안 · 실험 엔진)이 이 화면에서 돈다 — Writer 진행 문구로 잠근다.
      const progress = writerProgressView(status, locale)
      return { open: true, phase: 'split', title: progress.label, description: progress.detail, progress: progress.percent, progressLabel: progress.countLabel, failed: rough.failed }
    }
    const percent = Math.round((step / SPLIT_STEPS) * 100)
    return {
      open: true,
      phase: 'split',
      title: translate(locale, 'Moving to Storyboard'),
      description: translate(locale, 'Splitting into scenes and shots, then drawing the roughs. This can take a few minutes. The screen and chat stay locked until it is done.'),
      steps: steps(step, sceneCount, null, locale),
      progress: percent,
      progressLabel: translate(locale, 'Step {current}/{total} · {percent}%', { current: step + 1, total: SPLIT_STEPS, percent }),
      failed: rough.failed,
    }
  }

  const percent = roughPercent(rough)
  const roughLabel = percent === null ? undefined
    : translate(locale, 'Rough {done}/{total} · {percent}%', { done: rough.completed, total: rough.total, percent })

  // 실행이 끝나고 샷을 다시 읽는 틈도 첫 그리기다 — 빈 보드가 번쩍이지 않게 잠금을 이어 간다.
  if (isBoardDrawing(facts) || (lock.awaitingFirstDraw && awaitingShots(facts))) {
    const firstDraw = lock.awaitingFirstDraw || facts.autoDrawPending
    return {
      open: true,
      phase: 'draw',
      title: translate(locale, 'Drawing the roughs'),
      description: translate(locale, 'Finished shots appear on the board behind as they are drawn. The screen and chat stay locked until the roughs are done.'),
      steps: firstDraw ? steps(ROUGH_STEP, sceneCount, rough, locale) : undefined,
      progress: percent,
      progressLabel: roughLabel,
      failed: rough.failed,
    }
  }

  if (lock.failureNotice && rough.failed > 0) {
    return {
      open: true,
      phase: 'failed',
      title: translate(locale, '{count} roughs could not be drawn', { count: rough.failed }),
      description: translate(locale, 'Draw the remaining cuts again, or close this and redraw them on the board.'),
      progress: percent,
      progressLabel: roughLabel,
      failed: rough.failed,
      actions: { redraw: translate(locale, 'Draw the remaining cuts again'), close: translate(locale, 'Close') },
    }
  }

  return closed
}
