// Storyboard 실사 보기가 씬 · 샷 나누기를 기다리는 동안 무엇을 보일지(검토 2026-11-26 rev-flow) — 예전 Storyboard(러프 보드)와 같은 규칙.
//   예전 흐름 프로젝트(저장 단계 artist)는 나누기(실행 08~15) 중에도 Artist [완료하기]로 넘어온다 — 그 창이 "아직 만드는 씬 · 샷 · 러프는 거기서 이어진다"고 약속한다.
//   나누는 중이면 예전 보드의 잠금 표시(lib/writer/board-busy storyboardBusyView 의 나누기 모습 — 단계 · 진행 · 큰 Lumi)를 그대로 쓴다.
//   다만 Storyboard 는 콘티 그림을 카드마다 그리며 잠그지 않으므로(덧붙임 2 w) 잠금 안내는 "나누기가 끝날 때까지"만 말한다.
//   끝나 다시 읽는 틈에는 기다림, 멈췄으면 까닭과 [이어서 다시 시도]. 약속: tests/writer/real-split-wait.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { INITIAL_BOARD_LOCK, isBoardRunActive, storyboardBusyView, type StoryboardBusyView } from '@/lib/writer/board-busy'
import { writerProgressView } from '@/lib/writer/progress-view'
import type { WriterStatus } from '@/lib/writer/use-writer-status'

export type StoryboardSplitState =
  /** 씬 · 샷을 나누는 중 — 잠금 표시(샷이 있어도 다시 나누는 중이면 덮는다, 예전 보드와 같다). */
  | { kind: 'split'; busy: StoryboardBusyView }
  /** 나누기가 끝나 저장된 씬 · 샷을 다시 읽는 틈(샷이 아직 없음) — 빈 보드 안내 대신 기다림. */
  | { kind: 'reloading' }
  /** 나누기가 멈춤(샷 없음) — 까닭 + [이어서 다시 시도]. */
  | { kind: 'failed'; error: string | null }
  /** 실행이 다음 차례를 기다림(Artist [완료하기] · 씬 초안 확정, 샷 없음) — 그 진행 문구. */
  | { kind: 'waiting'; label: string; detail?: string }
  /** 실행도 샷도 없음 — 빈 보드 안내. */
  | { kind: 'empty' }
  /** 샷이 있다 — 보드. */
  | { kind: 'board' }

const NO_ROUGH = { total: 0, completed: 0, generating: 0, waiting: 0, failed: 0 }

export function storyboardSplitState(
  input: {
    status: Partial<WriterStatus> | null | undefined
    hasShots: boolean
    /** 나누기가 끝난 뒤 다시 읽기가 끝났나(또는 기다림 상한이 지났나). */
    reloadSettled: boolean
    /** 인물 · 배경 디자인 때 저장된 씬 수 — 잠금 표시의 "씬 N개로 나누기"에 적는다. */
    sceneCount: number
  },
  locale: AppLocale,
): StoryboardSplitState {
  const { status, hasShots } = input
  if (isBoardRunActive(status)) {
    const busy = storyboardBusyView(
      {
        status,
        facts: { runActive: true, reloading: false, hasShots, generating: 0, failed: 0, pumpActive: false, autoDrawPending: false },
        lock: INITIAL_BOARD_LOCK,
        rough: NO_ROUGH,
        sceneCount: input.sceneCount,
        boardStage: 'writer',
      },
      locale,
    )
    // 씬 · 샷 나누기 단계의 잠금이면(큰 Lumi) 안내와 마지막 단계 이름만 Storyboard 의 말로 — 실험 엔진 · 산문 실행의 진행 문구는 그대로.
    if (!busy.lumi) return { kind: 'split', busy }
    const steps = busy.steps?.map((step, index, all) => (index === all.length - 1 ? { ...step, label: translate(locale, 'Draw the rough sketches') } : step))
    return {
      kind: 'split',
      busy: {
        ...busy,
        description: translate(locale, 'Splitting into scenes and shots. This can take a few minutes. The screen and chat stay locked until the split is done, then each card draws its rough sketch.'),
        ...(steps ? { steps } : {}),
      },
    }
  }
  if (hasShots) return { kind: 'board' }
  if (status?.pipeline_completed && !input.reloadSettled) return { kind: 'reloading' }
  if (status?.pipeline_failed) return { kind: 'failed', error: status.error ?? null }
  if (status?.current_status === 'awaiting_artist' || status?.current_status === 'awaiting_confirmation') {
    const progress = writerProgressView(status, locale)
    return { kind: 'waiting', label: progress.label, ...(progress.detail ? { detail: progress.detail } : {}) }
  }
  return { kind: 'empty' }
}
