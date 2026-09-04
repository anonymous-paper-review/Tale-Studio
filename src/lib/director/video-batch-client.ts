'use client'

import { toast } from 'sonner'
import type { DirectorNode } from '@/types/director'
import { isShotData, isVideoData } from '@/types/director'
import type { GenerationJobObserver, GenerationJobReceipt } from '@/lib/generation-jobs-client'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { notifyBatchSummary } from '@/lib/generation-notify'

/** 완료 영수증이 끝내 안 오는 잡(새로고침·유실)이 있어도 요약 줄은 남긴다. */
const BATCH_SUMMARY_TIMEOUT_MS = 15 * 60 * 1000

const EMPTY_RESULT = { total: 0, started: 0, failed: 0 }

/**
 * Return shots that do not already have a playable completed video or an
 * in-flight video attempt. Node order is the canvas order used by Director.
 */
export function eligibleVideoBatchShotIds(nodes: DirectorNode[]): string[] {
  const videosByShot = new Map<string, DirectorNode[]>()
  for (const node of nodes) {
    if (!isVideoData(node.data) || node.data.parentShotNodeId === null) continue
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

/**
 * Run explicit full-video generation using the existing per-shot pipeline.
 *   약속 E(2026-09-04): `limit` 은 Take 사전 계산(video-batch-plan)이 정한 "만들 수 있는 수" — 앞에서부터 그만큼만 요청한다.
 *   끝나면 채팅에 "N개 완료, M개 실패" 한 줄을 남긴다(E4): 제출 실패는 바로, 제출된 잡은 완료 영수증을 세어서.
 */
export async function runVideoBatch(
  projectId: string,
  opts?: { onJob?: GenerationJobObserver; silent?: boolean; limit?: number },
): Promise<VideoBatchResult> {
  const store = useDirectorCanvasStore
  const current = store.getState()
  if (!projectId || current.projectId !== projectId || current.videoBatchBusy) {
    return { ...EMPTY_RESULT }
  }

  const eligible = eligibleVideoBatchShotIds(current.nodes)
  const limit = opts?.limit == null ? eligible.length : Math.max(0, Math.min(eligible.length, Math.floor(opts.limit)))
  const shotIds = eligible.slice(0, limit)
  const total = shotIds.length

  // 완료 집계 — 잡 id 마다 첫 종결 영수증만 센다.
  const settledJobs = new Set<string>()
  let completed = 0
  let failedJobs = 0
  let summarized = false
  const locale = () => useLocaleStore.getState().locale
  const summarize = () => {
    if (summarized || total === 0) return
    summarized = true
    const doneCount = completed
    const failedCount = failedJobs + failed
    const line = translate(locale(), '{done} videos done, {failed} failed', { done: doneCount, failed: failedCount })
    notifyBatchSummary('director', `${doneCount > 0 ? '✓' : '⚠'} ${line}`)
  }
  const onJob: GenerationJobObserver = (receipt: GenerationJobReceipt) => {
    opts?.onJob?.(receipt)
    if (receipt.status === 'queued' || !receipt.jobId || settledJobs.has(receipt.jobId)) return
    settledJobs.add(receipt.jobId)
    if (receipt.status === 'completed') completed += 1
    else failedJobs += 1
    if (submissionDone && settledJobs.size >= started) summarize()
  }
  let submissionDone = false
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
          onJob,
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
    submissionDone = true
    if (started === 0 || settledJobs.size >= started) summarize()
    else setTimeout(summarize, BATCH_SUMMARY_TIMEOUT_MS)
    if (!opts?.silent && total > 0) {
      const locale = useLocaleStore.getState().locale
      if (failed > 0) {
        toast.warning(
          translate(locale, '{started}/{total} videos generated, {failed} failed.', {
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
