// 화면 전환 — 디졸브(검은 화면 전환) (2026-09-08 오너 지시 2번).
//
//   브라우저에서 두 영상을 섞어 그리는 것은 무겁고 불안정하다 — 오너 결정: 검은 막 하나를 영상 위에 두고 시간에 따라 투명도만
//   바꾼다. 클립 앞 경계(transitionIn)를 중심으로 디졸브 길이의 절반 동안 막이 짙어지고, 경계를 지나며 같은 시간 동안 옅어진다.
//   미리보기가 이 순수 함수로 막의 투명도를 정한다. 내보내기 합성은 없다(샷 ZIP 은 원본 파일이라 전환이 실리지 않는다).
import type { ClipTransition, VideoClip } from '@/types/shot'

export type { ClipTransition }

export const DISSOLVE_DEFAULT_SEC = 1
/** 우클릭 메뉴가 고르는 길이. */
export const DISSOLVE_CHOICES = [0.5, 1, 2] as const

export interface LayoutItem {
  shotId: string
  startSec: number
  durationSec: number
}

/**
 * 전역 시각 t 에서 검은 막의 투명도(0 = 없음, 1 = 완전한 검정).
 *   디졸브가 걸린 클립의 시작 경계 B, 길이 D 에 대해 |t − B| < D/2 이면 1 − |t − B| / (D/2). 여러 경계가 겹치면 짙은 쪽.
 */
export function dissolveOpacityAt(layout: readonly LayoutItem[], clips: readonly Pick<VideoClip, 'shotId' | 'transitionIn'>[], t: number): number {
  let opacity = 0
  for (const item of layout) {
    const clip = clips.find((c) => c.shotId === item.shotId)
    const tr = clip?.transitionIn
    if (!tr || tr.type !== 'dissolve') continue
    const half = Math.max(0.05, tr.durationSec) / 2
    const d = Math.abs(t - item.startSec)
    if (d >= half) continue
    opacity = Math.max(opacity, 1 - d / half)
  }
  return Math.min(1, Math.max(0, Math.round(opacity * 1000) / 1000))
}
