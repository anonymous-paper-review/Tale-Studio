// 스테이지 탭 전환 연출 (#tab-slide 2026-08-03, 세로 연속 스트립 #tab-slide-v2) —
//   슬라이드 방향 + View Transition 오케스트레이션 + 채팅 임시 요소 등장 타이밍.
//
// 레일이 세로(producer 위 → editor 아래)이므로 다섯 탭을 세로로 이어 붙인 필름 스트립으로
//   연출한다: 순방향이면 스트립이 위로 감겨 옛 화면이 위로 빠지고 새 화면이 아래에서 이어져
//   들어온다(역방향은 반대). 옛 화면까지 함께 미는 연속 슬라이드는 View Transitions API 로만
//   가능하다 — 지원 브라우저는 startStageViewTransition 이 old/new 스냅샷을 같은 거리·타이밍으로
//   밀고(globals.css §stage-strip), 미지원/reduced-motion 은 template.tsx 의 마운트 슬라이드
//   (새 화면만)로 폴백한다. 방향 판정은 순수 함수로 분리해 테스트한다.

import { STAGES } from '@/lib/constants'

/** 탭 전환 직후 채팅 임시 요소(제안·승인 카드·팁)를 숨기는 시간. 이후 계단식 등장. */
export const EPHEMERAL_SETTLE_MS = 1000
/** 계단식 등장의 블록 간 간격. */
export const CASCADE_STEP_MS = 150

export type SlideDirection = 'forward' | 'back' | 'none'

export function stageIndexFromPathname(pathname: string): number {
  return STAGES.findIndex((s) => pathname.startsWith(s.path))
}

export function slideDirectionBetween(prev: number | null, next: number): SlideDirection {
  if (prev === null || prev === -1 || next === -1 || prev === next) return 'none'
  return next > prev ? 'forward' : 'back'
}

/** 직전 stage 인덱스 — template 인스턴스 간 공유(라우트 전환마다 template 은 새로 마운트).
 *  갱신은 commit(effect) 시점에만 — StrictMode 이중 렌더가 같은 값을 읽게.
 *  viaViewTransition: VT 가 old/new 를 함께 밀고 있다는 표시 — template 폴백이 이중 연출을 피한다.
 *  resolveCommit: VT 의 DOM 갱신 대기 약속 — 새 라우트의 template 마운트가 해소한다. */
export const stageNavMemory: {
  lastIndex: number | null
  viaViewTransition: boolean
  resolveCommit: (() => void) | null
} = { lastIndex: null, viaViewTransition: false, resolveCommit: null }

// ── View Transition 오케스트레이션 (#tab-slide-v2) ──────────────────────────────

/** VT 콜백이 라우트 커밋을 기다리는 상한 — 이 동안 화면이 스냅샷으로 얼어 있으므로 짧게.
 *  (프리페치된 프로덕션 커밋은 보통 100ms 미만. 늦으면 연출을 접고 즉시 해동 — 전환은 그냥 일어난다.) */
export const STAGE_VT_COMMIT_TIMEOUT_MS = 400

/** 라우트 커밋을 기다리는 약속 — resolveStageCommit(새 template 마운트) 또는 타임아웃으로 해소. */
export function createStageCommitWaiter(
  timeoutMs: number = STAGE_VT_COMMIT_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (stageNavMemory.resolveCommit === done) stageNavMemory.resolveCommit = null
      resolve()
    }, timeoutMs)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    stageNavMemory.resolveCommit = done
  })
}

/** 새 라우트의 template 이 마운트됐다는 신호. 1회용 — StrictMode 이중 effect 는 두 번째가 no-op. */
export function resolveStageCommit(): void {
  const done = stageNavMemory.resolveCommit
  stageNavMemory.resolveCommit = null
  done?.()
}

type DocumentWithVT = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> }
}

/**
 * 세로 연속 슬라이드로 스테이지를 전환한다. 방향을 <html data-stage-nav> 로 지정해
 * globals.css 의 stage-strip 키프레임이 old/new 스냅샷을 같은 거리로 밀게 하고,
 * DOM 갱신(navigate)은 VT 콜백 안에서 수행한다. 미지원·reduced-motion·방향 없음이면 그냥 이동.
 */
export function startStageViewTransition(direction: SlideDirection, navigate: () => void): void {
  const doc = typeof document !== 'undefined' ? (document as DocumentWithVT) : null
  const reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (direction === 'none' || !doc?.startViewTransition || reduced) {
    navigate()
    return
  }
  doc.documentElement.dataset.stageNav = direction
  stageNavMemory.viaViewTransition = true
  const vt = doc.startViewTransition(() => {
    navigate()
    return createStageCommitWaiter()
  })
  void vt.finished.finally(() => {
    delete doc.documentElement.dataset.stageNav
    stageNavMemory.viaViewTransition = false
  })
}

/** 현재 경로 → 목적 경로의 방향을 계산해 전환한다 — 사이드바·채팅 핸드오프 공용 진입점. */
export function navigateWithStageSlide(
  currentPathname: string,
  targetPath: string,
  navigate: () => void,
): void {
  startStageViewTransition(
    slideDirectionBetween(stageIndexFromPathname(currentPathname), stageIndexFromPathname(targetPath)),
    navigate,
  )
}
