'use client'

import { activeShotIds, refreshGenerationQueue, useActiveGenerationJobs, useGenerationQueueStatus, type GenerationQueueStatus } from '@/lib/generation-queue'
import { useDirectorCanvasStore } from '@/stores/director-store'
import type { ShotNodeData, StoryboardImage } from '@/types/director'

export function storyboardImageGenerationState({
  image,
  queued,
  batchBusy,
  queueStatus,
}: {
  image: StoryboardImage | null | undefined
  queued: boolean
  batchBusy: boolean
  queueStatus: GenerationQueueStatus
}) {
  const generating = queued || image?.status === 'generating'
  const phase = queued ? 'generating'
    : generating ? image?.errorMessage ? 'uncertain' : 'submitting'
      : batchBusy ? 'waiting' : queueStatus
  return {
    generating,
    batchBusy,
    disabled: generating || batchBusy || queueStatus !== 'ready',
    phase,
    label: phase === 'generating' ? 'Generating image'
      : phase === 'submitting' ? 'Submitting image request…'
        : phase === 'waiting' ? 'Waiting to generate image'
          : phase === 'loading' || phase === 'uncertain' ? 'Checking image generation…'
            : phase === 'error' ? 'Could not check image generation.'
              : null,
  } as const
}

/** 응답을 놓쳤을 때는 접수를 반복하지 않고 저장된 결과와 현재 작업만 다시 읽는다. */
export function checkStoryboardImageStatus() {
  void useDirectorCanvasStore.getState().hydrateFreshFromDb().catch(() => {})
  refreshGenerationQueue()
}

/** 패널·팝업·노드는 접수 직후의 로컬 상태와 재진입 후의 서버 작업을 함께 읽는다. */
export function useStoryboardImageGeneration(data: ShotNodeData | null) {
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const batchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)
  const jobs = useActiveGenerationJobs(projectId)
  const queueStatus = useGenerationQueueStatus(projectId)
  const queued = !!data?.writerShotId && activeShotIds(jobs, ['shot_storyboard', 'storyboard_real_grid']).has(data.writerShotId)
  return storyboardImageGenerationState({ image: data?.storyboardImage, queued, batchBusy, queueStatus })
}
