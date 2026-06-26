'use client'

// Director 노드 뷰: Shot 노드의 '목각(rough)' 단계 이미지를 writer-store에서 읽는 훅.
//
// roughStoryboard는 writer-store의 shots[]에 있고 director-store에는 없다.
// ShotNode가 writer-store 전체(s.shots)를 직접 구독하면 무관한 샷 변경마다
// 모든 ShotNode가 재렌더되고 director↔writer 레이어 결합이 확산된다.
// 그래서 writerShotId 스코프로 좁힌 셀렉터/훅으로 캡슐화한다.

import { useWriterStore } from '@/stores/writer-store'
import type { RoughStoryboardImage, Shot } from '@/types'

/**
 * 순수 셀렉터 — 주어진 writerShotId의 roughStoryboard 객체 참조(또는 null)만 반환.
 * 동일 입력에 대해 저장된 객체 참조를 그대로 반환하므로, 무관한 샷/필드가 바뀌어도
 * 출력 참조가 안정적이다(useSyncExternalStore 재렌더 최소화).
 */
export function selectRoughStoryboard(
  shots: Shot[],
  writerShotId: string | null,
): RoughStoryboardImage | null {
  if (!writerShotId) return null
  const shot = shots.find((s) => s.shotId === writerShotId)
  return shot?.roughStoryboard ?? null
}

/**
 * Shot 노드의 목각 단계 이미지(roughStoryboard)를 writerShotId 스코프로 구독한다.
 * writer-store 전체를 구독하지 않는다 — 해당 샷의 roughStoryboard만 추적.
 */
export function useRoughStoryboard(
  writerShotId: string | null,
): RoughStoryboardImage | null {
  return useWriterStore((s) => selectRoughStoryboard(s.shots, writerShotId))
}
