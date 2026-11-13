'use client'

// Director 샷마다 지금 상태(시안 R 416:4941) — 카드 · 노드 · 상태 고르기 · 위쪽 단추가 같은 판정을 쓴다.
//   근거는 캔버스 노드 기록 + 작업 큐(탭을 떠났다 와도 진행을 되살린다) + 실사 일괄이 맡은 샷. 판정 규칙은 lib/director/shot-state.ts.
import { useMemo } from 'react'

import { activeShotIds, useActiveGenerationJobs, type ActiveJob } from '@/lib/generation-queue'
import {
  realBatchPendingNodeIds,
  shotFactsByNode,
  shotState,
  type DirectorShotState,
  type ShotStateFacts,
} from '@/lib/director/shot-state'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStore } from '@/stores/writer-store'
import { isVideoData, type DirectorNode, type ShotNodeData } from '@/types/director'
import type { Shot } from '@/types'

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

/** 러프가 다 된 Writer 샷 id(글자 하나) — 일괄은 러프가 있는 샷만 그린다. */
function roughDoneKey(shots: readonly Shot[] | undefined): string {
  return (shots ?? [])
    .filter((shot) => shot.roughStoryboard?.status === 'completed' && !!shot.roughStoryboard.url)
    .map((shot) => shot.shotId)
    .sort()
    .join('|')
}

interface StateKeys {
  image: string
  video: string
  /** 실사 일괄이 도는 중이면 'busy', 멈추는 중이면 'cancelled', 아니면 ''. */
  batch: '' | 'busy' | 'cancelled'
  /** 일괄 대상 Writer 샷 id(null = 그림 없는 샷 전부). */
  batchShots: string | null
  rough: string
}

/** 상태 판정에 드는 바깥 근거를 원시값으로 모은다(훅 deps 가 렌더마다 바뀌지 않게). */
function useStateKeys(): StateKeys {
  // 'default' 는 프로젝트를 열기 전 자리 값 — 큐를 묻지 않는다(서버가 500 을 낸다).
  const projectId = useDirectorCanvasStore((s) => (s.projectId && s.projectId !== 'default' ? s.projectId : null))
  const queued = queuedKeys(useActiveGenerationJobs(projectId))
  const batch = useDirectorCanvasStore((s) => (!s.realBatchBusy ? '' : s.realBatchCancelled ? 'cancelled' : 'busy'))
  const batchShots = useDirectorCanvasStore((s) => (s.realBatchShotIds ? s.realBatchShotIds.join('|') : null))
  // 일괄이 돌 때만 러프를 본다(돌지 않으면 맡은 샷이 없다).
  const rough = useWriterStore((s) => (batch === 'busy' ? roughDoneKey(s.shots) : ''))
  return { image: queued.image, video: queued.video, batch, batchShots, rough }
}

function factsFor(nodes: readonly DirectorNode[], keys: StateKeys): Map<string, ShotStateFacts> {
  const pendingImageNodeIds = realBatchPendingNodeIds(nodes, {
    busy: keys.batch !== '',
    cancelled: keys.batch === 'cancelled',
    shotIds: keys.batchShots === null ? null : keys.batchShots ? keys.batchShots.split('|') : [],
    roughShotIds: idSet(keys.rough),
  })
  return shotFactsByNode(nodes, {
    queuedImageShots: idSet(keys.image),
    queuedVideoShots: idSet(keys.video),
    pendingImageNodeIds,
  })
}

export function useDirectorShotStates(): Map<string, DirectorShotState> {
  const nodes = useDirectorCanvasStore((s) => s.nodes) ?? NO_NODES
  const { image, video, batch, batchShots, rough } = useStateKeys()
  return useMemo(() => {
    const facts = factsFor(nodes, { image, video, batch, batchShots, rough })
    return new Map([...facts].map(([id, fact]) => [id, shotState(fact)]))
  }, [nodes, image, video, batch, batchShots, rough])
}

/** 노드 하나(샷 노드 id)의 상태와 근거 — 그 샷과 그 샷의 Take 만 본다. 노드형 카드가 저마다 부른다.
 *  ownData: 샷 노드가 자기 기록을 넘기면 그것으로 센다(상점에서 찾지 않아도 된다). */
export function useShotStatus(
  shotNodeId: string | null,
  ownData?: ShotNodeData | null,
): { state: DirectorShotState; facts: ShotStateFacts } | undefined {
  const nodes = useDirectorCanvasStore((s) => s.nodes) ?? NO_NODES
  const { image, video, batch, batchShots, rough } = useStateKeys()
  return useMemo(() => {
    if (!shotNodeId) return undefined
    const relevant = nodes.filter(
      (n) => (!ownData && n.id === shotNodeId) || (isVideoData(n.data) && n.data.parentShotNodeId === shotNodeId),
    )
    if (ownData) relevant.unshift({ id: shotNodeId, type: 'shot', position: { x: 0, y: 0 }, data: ownData } as DirectorNode)
    const fact = factsFor(relevant, { image, video, batch, batchShots, rough }).get(shotNodeId)
    return fact ? { state: shotState(fact), facts: fact } : undefined
  }, [nodes, image, video, batch, batchShots, rough, shotNodeId, ownData])
}

/** 노드 하나(샷 노드 id)의 상태 — 영상 노드가 부모 샷 상태로 흐림을 정할 때. */
export function useShotState(shotNodeId: string | null): DirectorShotState | undefined {
  return useShotStatus(shotNodeId)?.state
}
