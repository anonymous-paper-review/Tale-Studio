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
import {
  computeSettledJobs,
  fetchUnreflectedCompletedJobs,
  reportUiReflected,
} from '@/lib/generation-ui-reflected'
import {
  isShotData,
  isVideoData,
  type DirectorNode,
} from '@/types/director'

const WATCHED_KINDS = new Set([
  'shot_storyboard',
  'storyboard_real_grid',
  'shot_video',
  'shot_previz_video',
])

/** DB 재수화가 끝났어도 대상 노드가 없으면 "화면 반영"이 아니다. 실제 완료 미디어만 통과시킨다. */
export function reflectedDirectorJobs(
  jobs: readonly ActiveJob[],
  nodes: readonly DirectorNode[],
): ActiveJob[] {
  const shotNodeByWriterId = new Map(
    nodes
      .filter((node) => isShotData(node.data) && !!node.data.writerShotId)
      .map((node) => [node.data.writerShotId as string, node]),
  )
  const completedStoryboardShots = new Set(
    [...shotNodeByWriterId]
      .filter(([, node]) => {
        const data = node.data
        return isShotData(data) && data.storyboardImage?.status === 'completed'
      })
      .map(([writerShotId]) => writerShotId),
  )
  const completedVideoShots = new Set<string>()
  for (const node of nodes) {
    if (!isVideoData(node.data) || node.data.status !== 'completed' || !node.data.videoUrl) continue
    const parent = nodes.find((candidate) => candidate.id === node.data.parentShotNodeId)
    if (parent && isShotData(parent.data) && parent.data.writerShotId) {
      completedVideoShots.add(parent.data.writerShotId)
    }
  }

  return jobs.filter((job) => {
    const targetIds = [
      ...(job.target?.writerShotIds ?? []),
      job.target?.writerShotId,
      job.target?.shotId,
    ].filter((id): id is string => !!id)
    if (targetIds.length === 0) return false
    if (job.kind === 'shot_storyboard' || job.kind === 'storyboard_real_grid') {
      return targetIds.every((id) => completedStoryboardShots.has(id))
    }
    if (job.kind === 'shot_video') {
      return targetIds.some((id) => completedVideoShots.has(id))
    }
    return false
  })
}

export function useQueueRehydrate(projectId: string | null): void {
  const hydrateFromDb = useDirectorCanvasStore((s) => s.hydrateFromDb)
  const activeJobs = useActiveGenerationJobs(projectId)
  const watched = useMemo(
    () => activeJobs.filter((j) => WATCHED_KINDS.has(j.kind)),
    [activeJobs],
  )
  const prevRef = useRef<readonly ActiveJob[]>([])

  // 스테이지 밖에서 완료된 잡은 prev active 목록에 없어서 아래 transition 감지로는 영원히 못 잡는다.
  // Director 복귀 마운트 때 DB 를 무조건 한 번 재수화하고, 최근 완료·미반영 잡을 좌표 ④로 보고한다.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const unreflectedPromise = fetchUnreflectedCompletedJobs(projectId)
    void invalidateShots(projectId)
      .then(() => hydrateFromDb(projectId))
      .then(async () => {
        const unreflected = await unreflectedPromise
        if (!cancelled) {
          const reflected = reflectedDirectorJobs(
            unreflected,
            useDirectorCanvasStore.getState().nodes,
          )
          reportUiReflected(projectId, reflected, 'director-canvas-reentry')
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectId, hydrateFromDb])

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
