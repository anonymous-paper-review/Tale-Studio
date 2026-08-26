'use client'

// 큐 축소 → 캔버스 재수화 (#live-refresh 2026-08-12, StoryboardGridView 에서 페이지 레벨로 승격).
//
// 잡이 큐에서 빠졌다 = 웹훅이 DB 를 갱신했다. 그 순간 hydrateFromDb 를 불러 새로고침 없이
//   새 이미지·영상이 보이게 한다. 그리드 뷰에만 있던 것을 훅으로 빼서 Node 뷰(SHOT IMAGE /
//   SHOT VIDEO 노드)도 같은 신선도를 갖게 한다 — 어느 뷰를 보고 있든 완료가 즉시 반영된다.

import { useEffect, useMemo, useRef } from 'react'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useActiveGenerationJobs, type ActiveJob } from '@/lib/generation-queue'
import { invalidateShots } from '@/lib/shots-cache'
import { computeSettledJobs, reportUiReflected } from '@/lib/generation-ui-reflected'

const WATCHED_KINDS = new Set([
  'shot_storyboard',
  'storyboard_real_grid',
  'shot_video',
  'shot_previz_video',
])

export function useQueueRehydrate(projectId: string | null): void {
  const hydrateFromDb = useDirectorCanvasStore((s) => s.hydrateFromDb)
  const activeJobs = useActiveGenerationJobs(projectId)
  const watched = useMemo(
    () => activeJobs.filter((j) => WATCHED_KINDS.has(j.kind)),
    [activeJobs],
  )
  const prevRef = useRef<readonly ActiveJob[]>([])
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = watched
    if (!projectId) return
    // 잡이 큐에서 빠졌다 = 웹훅이 완료를 확정했다 — writer/editor 의 shots 사물함도
    //   낡음으로 표시해야 다음 진입이 새 행을 받는다(#shots-cache-invalidate).
    const settled = computeSettledJobs(prev, watched)
    if (settled.length === 0) return
    void invalidateShots(projectId)
    void hydrateFromDb(projectId)
      .then(() => {
        // 좌표 ④ (#a2-observability): 재수화까지 끝나 결과가 화면 상태에 반영된 시점 보고.
        reportUiReflected(projectId, settled, 'director-canvas')
      })
      .catch(() => {})
  }, [watched, projectId, hydrateFromDb])
}
