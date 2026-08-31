'use client'

import { toast } from 'sonner'
import type { DirectorNode } from '@/types/director'
import { isShotData, isVideoData } from '@/types/director'
import type { GenerationJobObserver } from '@/lib/generation-jobs-client'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

const EMPTY_RESULT = { total: 0, started: 0, failed: 0 }

/**
 * Return shots that do not already have a playable completed video or an
 * in-flight video attempt. Node order is the canvas order used by Director.
 */
export function eligibleVideoBatchShotIds(nodes: DirectorNode[]): string[] {
  const videosByShot = new Map<string, DirectorNode[]>()
  for (const node of nodes) {
    if (!isVideoData(node.data)) continue
    const videos = videosByShot.get(node.data.parentShotNodeId) ?? []
    videos.push(node)
    videosByShot.set(node.data.parentShotNodeId, videos)
  }

  return nodes
    .filter((node) => isShotData(node.data))
    .filter((shot) => {
      const children = videosByShot.get(shot.id) ?? []
      return !children.some((video) => {
        if (!isVideoData(video.data)) return false
        const playable =
          video.data.status === 'completed' &&
          typeof video.data.videoUrl === 'string' &&
          video.data.videoUrl.trim().length > 0
        const generating =
          video.data.status === 'generating' ||
          video.data.lastAttemptStatus === 'generating'
        return playable || generating
      })
    })
    .map((shot) => shot.id)
}

export type VideoBatchResult = {
  total: number
  started: number
  failed: number
}

/** Run explicit full-video generation using the existing per-shot pipeline. */
export async function runVideoBatch(
  projectId: string,
  opts?: { onJob?: GenerationJobObserver; silent?: boolean },
): Promise<VideoBatchResult> {
  const store = useDirectorCanvasStore
  const current = store.getState()
  if (!projectId || current.projectId !== projectId || current.videoBatchBusy) {
    return { ...EMPTY_RESULT }
  }

  const shotIds = eligibleVideoBatchShotIds(current.nodes)
  const total = shotIds.length
  store.setState({
    videoBatchBusy: true,
    videoBatchProgress: { done: 0, total, failed: 0 },
  })

  let cursor = 0
  let done = 0
  let started = 0
  let failed = 0

  const settle = (wasStarted: boolean) => {
    if (wasStarted) started += 1
    else failed += 1
    done += 1
    store.setState({ videoBatchProgress: { done, total, failed } })
  }

  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= shotIds.length) return
      let result: string | null = null
      try {
        result = await store.getState().generateVideoForShot(shotIds[index]!, {
          batch: true,
          onJob: opts?.onJob,
        })
      } catch {
        // A rejected per-shot action is a settled failed shot, just like null.
        result = null
      }
      settle(result !== null)
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(3, total) }, () => worker()),
    )
    if (!opts?.silent && total > 0) {
      const locale = useLocaleStore.getState().locale
      if (failed > 0) {
        toast.warning(
          translate(locale, '{started}/{total} videos generated — {failed} failed.', {
            started,
            total,
            failed,
          }),
        )
      } else {
        toast.success(
          translate(locale, '{started}/{total} videos generated.', { started, total }),
        )
      }
    }
  } catch (error) {
    // Worker-level failures are converted to failed shots above. This catch is
    // reserved for an unexpected runner failure and still leaves state clean.
    if (!opts?.silent) {
      const message =
        error instanceof Error ? error.message : translate(useLocaleStore.getState().locale, 'Video batch generation failed')
      toast.error(message)
    }
  } finally {
    store.setState({ videoBatchBusy: false, videoBatchProgress: null })
  }

  return { total, started, failed }
}
