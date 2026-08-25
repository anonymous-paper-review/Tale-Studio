'use client'

// 큐 축소 → 캔버스 재수화 (#live-refresh 2026-08-12, StoryboardGridView 에서 페이지 레벨로 승격).
//
// 잡이 큐에서 빠졌다 = 웹훅이 DB 를 갱신했다. 그 순간 hydrateFromDb 를 불러 새로고침 없이
//   새 이미지·영상이 보이게 한다. 그리드 뷰에만 있던 것을 훅으로 빼서 Node 뷰(SHOT IMAGE /
//   SHOT VIDEO 노드)도 같은 신선도를 갖게 한다 — 어느 뷰를 보고 있든 완료가 즉시 반영된다.

import { useEffect, useMemo, useRef } from 'react'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useActiveGenerationJobs, activeShotIds } from '@/lib/generation-queue'
import { invalidateShots } from '@/lib/shots-cache'

export function useQueueRehydrate(projectId: string | null): void {
  const hydrateFromDb = useDirectorCanvasStore((s) => s.hydrateFromDb)
  const activeJobs = useActiveGenerationJobs(projectId)
  const watched = useMemo(
    () =>
      new Set([
        ...activeShotIds(activeJobs, ['shot_storyboard', 'storyboard_real_grid']),
        ...activeShotIds(activeJobs, ['shot_video', 'shot_previz_video']),
      ]),
    [activeJobs],
  )
  const prevRef = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = watched
    if (!projectId) return
    for (const id of prev) {
      if (!watched.has(id)) {
        // 잡이 큐에서 빠졌다 = 웹훅이 완료를 확정했다 — writer/editor 의 shots 사물함도
        //   낡음으로 표시해야 다음 진입이 새 행을 받는다(#shots-cache-invalidate).
        void invalidateShots(projectId)
        void hydrateFromDb(projectId).catch(() => {})
        return
      }
    }
  }, [watched, projectId, hydrateFromDb])
}
