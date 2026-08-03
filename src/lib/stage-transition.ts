// 스테이지 탭 전환 연출 (#tab-slide 2026-08-03) — 슬라이드 방향 + 채팅 임시 요소 등장 타이밍.
//
// 파이프라인(producer → … → editor)은 순서가 있으므로 전환도 방향을 갖는다: 순방향이면
//   오른쪽에서, 역방향이면 왼쪽에서 미끄러져 들어온다. 방향 판정은 순수 함수로 분리해 테스트한다.

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
 *  갱신은 commit(effect) 시점에만 — StrictMode 이중 렌더가 같은 값을 읽게. */
export const stageNavMemory: { lastIndex: number | null } = { lastIndex: null }
