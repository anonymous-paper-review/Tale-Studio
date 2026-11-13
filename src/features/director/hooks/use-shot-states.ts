'use client'

// Director 샷마다 지금 상태(시안 R 416:4941) — 카드 · 노드 · 상태 고르기 · 위쪽 단추가 같은 판정을 쓴다.
//   근거는 캔버스 노드 기록 + 작업 큐(탭을 떠났다 와도 진행을 되살린다). 판정 규칙은 lib/director/shot-state.ts.
import { useMemo } from 'react'

import { activeShotIds, useActiveGenerationJobs, type ActiveJob } from '@/lib/generation-queue'
import { shotFactsByNode, shotState, type DirectorShotState } from '@/lib/director/shot-state'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData, type DirectorNode } from '@/types/director'

const NO_NODES: readonly DirectorNode[] = []

/** 큐에 떠 있는 이미지 · 영상 작업의 Writer 샷 id 를 글자 하나로 — 폴링마다 새 배열이 와도 같은 내용이면 다시 계산하지 않는다. */
function queuedKeys(jobs: readonly ActiveJob[]): { image: string; video: string } {
  return {
    image: [...activeShotIds(jobs, ['shot_storyboard', 'storyboard_real_grid'])].sort().join('|'),
    video: [...activeShotIds(jobs, ['shot_video'])].sort().join('|'),
  }
}

function idSet(key: string): ReadonlySet<string> {
  return new Set(key ? key.split('|') : [])
}

export function useDirectorShotStates(): Map<string, DirectorShotState> {
  const nodes = useDirectorCanvasStore((s) => s.nodes) ?? NO_NODES
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const queued = queuedKeys(useActiveGenerationJobs(projectId))
  const imageKey = queued.image
  const videoKey = queued.video
  return useMemo(() => {
    const facts = shotFactsByNode(nodes, { queuedImageShots: idSet(imageKey), queuedVideoShots: idSet(videoKey) })
    return new Map([...facts].map(([id, fact]) => [id, shotState(fact)]))
  }, [nodes, imageKey, videoKey])
}

/** 노드 하나(샷 노드 id)의 상태 — 그 샷과 그 샷의 Take 만 본다. 노드형 카드가 저마다 부른다. */
export function useShotState(shotNodeId: string | null): DirectorShotState | undefined {
  const nodes = useDirectorCanvasStore((s) => s.nodes) ?? NO_NODES
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const queued = queuedKeys(useActiveGenerationJobs(projectId))
  const imageKey = queued.image
  const videoKey = queued.video
  return useMemo(() => {
    if (!shotNodeId) return undefined
    const relevant = nodes.filter(
      (n) => n.id === shotNodeId || (isVideoData(n.data) && n.data.parentShotNodeId === shotNodeId),
    )
    const fact = shotFactsByNode(relevant, { queuedImageShots: idSet(imageKey), queuedVideoShots: idSet(videoKey) }).get(shotNodeId)
    return fact ? shotState(fact) : undefined
  }, [nodes, imageKey, videoKey, shotNodeId])
}
