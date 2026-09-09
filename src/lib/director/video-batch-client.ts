'use client'

import { toast } from 'sonner'
import type { DirectorNode } from '@/types/director'
import { isShotData, isVideoData } from '@/types/director'
import type { GenerationJobObserver } from '@/lib/generation-jobs-client'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { notifyBatchSummary } from '@/lib/generation-notify'
import { buildVideoBatchInputs } from '@/lib/director/video-batch-inputs'
import type { VideoBatchStartResponse, VideoBatchSummary } from '@/lib/director/video-batch-types'
import { invalidateShots } from '@/lib/shots-cache'

const EMPTY_RESULT = { total: 0, started: 0, failed: 0 }
/** 서버 저장/조회로 이어가는 배치의 진행을 다시 확인하는 주기(#batch-resume, 2026-09-09). */
const POLL_INTERVAL_MS = 2500

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * running 이면 pending 이 0이어도 아직 처리 중인 active 항목이 있을 수 있어 항상 바쁘다.
 * cancelled/paused 는 새로 내지 않지만, 이미 접수돼 도는 중인 active 항목의 수집은 끝까지 한다.
 */
function isBatchActive(summary: VideoBatchSummary): boolean {
  return summary.status === 'running' || summary.active > 0
}

/**
 * 서버가 이어가는 배치를 GET 으로 계속 읽어 store 진행 상태를 반영한다. 이 함수는 저장된
 * 항목을 읽기만 한다 — 새 제출은 절대 내지 않는다. GET 실패는 완료 증거가 아니므로 마지막
 * 진행 표시를 유지하고 다시 조회한다. ownsRun() 이 더 이상 참이 아니면(다른 프로젝트/실행으로 옮겨감)
 * 그 순간부터 이 실행의 결과는 조용히 버려진다.
 */
async function pollVideoBatch(
  projectId: string,
  batchRunId: string,
  ownsRun: () => boolean,
  initial: VideoBatchSummary,
  seenJobs: Set<string>,
  onJob?: GenerationJobObserver,
): Promise<VideoBatchSummary | null> {
  const store = useDirectorCanvasStore
  let summary = initial
  const apply = () => {
    if (!ownsRun()) return
    store.setState({
      videoBatchCancelled: summary.status === 'cancelled' || store.getState().videoBatchCancelled,
      videoBatchProgress: {
        done: summary.done + summary.failed,
        total: summary.total,
        failed: summary.failed,
      },
    })
    let sawNewTerminalJob = false
    for (const job of summary.jobs) {
      if (!job.jobId) continue
      const key = `${job.jobId}:${job.status}`
      if (seenJobs.has(key)) continue
      seenJobs.add(key)
      if (job.status === 'completed' || job.status === 'failed') sawNewTerminalJob = true
      try {
        onJob?.(job)
      } catch (error) {
        console.error('[video-batches] receipt observer failed:', error)
      }
    }
    if (sawNewTerminalJob) {
      void invalidateShots(projectId).then(async () => {
        if (!ownsRun()) return
        await store.getState().hydrateFromDb(projectId)
      }).catch((error) => {
        console.error('[video-batches] completed video refresh failed:', error)
      })
    }
  }

  while (true) {
    apply()
    if (!ownsRun()) return null
    if (!isBatchActive(summary)) return summary
    await sleep(POLL_INTERVAL_MS)
    if (!ownsRun()) return null

    let payload: { batches?: VideoBatchSummary[] } | null = null
    try {
      const res = await fetch(
        `/api/director/video-batches?projectId=${encodeURIComponent(projectId)}&batchId=${encodeURIComponent(batchRunId)}`,
      )
      if (!res.ok) continue
      payload = await res.json()
    } catch {
      continue
    }
    const next = payload?.batches?.[0]
    if (!next || next.id !== batchRunId || next.projectId !== projectId) continue
    summary = next
  }
}

/**
 * Start explicit full-video generation. The shot list picked at click time is fixed once and
 * handed to the server in a single POST (#batch-resume, 2026-09-09) — the server owns
 * submission and continuation from there on; this function only reports progress back by
 * polling the same batch's GET.
 *   약속 E(2026-09-04): `limit` 은 Take 사전 계산(video-batch-plan)이 정한 "만들 수 있는 수" — 앞에서부터 그만큼만 요청한다.
 *   끝나면 채팅에 "N개 완료, M개 실패" 한 줄을 남긴다(E4).
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
  // #batch-resume: 첫 await 전에 이번 실행이 낼 목록을 고정한다 — 그 뒤 캔버스가 바뀌어도 흔들리지 않는다.
  const { items, skipped: buildSkipped } = buildVideoBatchInputs(projectId, current.nodes, shotIds)

  // 중단 표시를 풀고 진행 상태를 연다(#batch-resume 오너 결정 ①).
  store.getState().beginVideoBatch(total)
  const batchRunId = store.getState().videoBatchRunId
  // #batch-resume: 늦게 끝난 이전 실행이 새 프로젝트나 새 일괄의 상태를 덮지 않는다.
  const ownsRun = () => {
    const state = store.getState()
    return state.projectId === projectId && state.videoBatchRunId === batchRunId
  }

  const finish = (started: number, failed: number): VideoBatchResult => {
    if (ownsRun()) store.setState({ videoBatchBusy: false, videoBatchProgress: null })
    return { total, started, failed }
  }

  if (!batchRunId || items.length === 0) {
    return finish(0, buildSkipped.length)
  }

  const seenJobs = new Set<string>()
  let skipped = buildSkipped.length
  let finalSummary: VideoBatchSummary | null = null

  try {
    const response = await fetch('/api/director/video-batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batchId: batchRunId, projectId, items }),
    })
    if (!response.ok) throw new Error(`start failed: ${response.status}`)
    const payload = (await response.json()) as VideoBatchStartResponse
    skipped += payload.skipped.length
    finalSummary = await pollVideoBatch(projectId, batchRunId, ownsRun, payload.batch, seenJobs, opts?.onJob)
  } catch {
    if (!ownsRun()) return finish(0, 0)
    // #batch-resume: POST 결과가 불명확하면 재제출하지 않고 같은 id의 GET 으로만 복구한다.
    try {
      const res = await fetch(
        `/api/director/video-batches?projectId=${encodeURIComponent(projectId)}&batchId=${encodeURIComponent(batchRunId)}`,
      )
      if (res.ok) {
        const payload = (await res.json()) as { batches?: VideoBatchSummary[] }
        const found = payload.batches?.[0]
        if (found) finalSummary = await pollVideoBatch(projectId, batchRunId, ownsRun, found, seenJobs, opts?.onJob)
      }
    } catch {
      // GET 복구마저 실패하면 아래에서 전량 실패로 마무리한다 — 재제출은 하지 않는다.
    }
  }

  if (!finalSummary) {
    if (ownsRun() && !opts?.silent) {
      toast.error(translate(useLocaleStore.getState().locale, 'Video batch generation failed'))
    }
    return finish(0, total)
  }

  // 중단·잔액 부족으로 아직 내지 않은 pending은 생성 실패와 구별한다.
  const started = finalSummary.started
  const failed = finalSummary.failedToStart + skipped
  const done = finalSummary.done
  const completedFailures = finalSummary.failed + skipped

  if (ownsRun() && total > 0) {
    const line = translate(useLocaleStore.getState().locale, '{done} videos done, {failed} failed', {
      done,
      failed: completedFailures,
    })
    notifyBatchSummary('director', `${done > 0 ? '✓' : '⚠'} ${line}`)
  }

  if (ownsRun() && !opts?.silent && total > 0 && finalSummary.status !== 'cancelled') {
    const locale = useLocaleStore.getState().locale
    if (completedFailures > 0) {
      toast.warning(translate(locale, '{started}/{total} videos generated, {failed} failed.', { started: done, total, failed: completedFailures }))
    } else {
      toast.success(translate(locale, '{started}/{total} videos generated.', { started: done, total }))
    }
  }

  return finish(started, failed)
}

/**
 * 화면 복귀 시 서버가 갖고 있는 진행 상태를 읽어 store를 복원한다(#batch-resume, 2026-09-09).
 * 완료까지 기다리지 않는다 — GET 한 번으로 busy/progress를 세팅하고 바로 반환하며, 이후 진행은
 * background poller(runVideoBatch와 같은 조회 루프)에 맡긴다. 생성 호출은 절대 하지 않는다.
 */
export async function restoreVideoBatch(projectId: string): Promise<void> {
  const store = useDirectorCanvasStore
  if (!projectId) return
  const initial = store.getState()
  const previousRunId = initial.videoBatchRunId
  if (initial.projectId !== projectId || initial.videoBatchBusy) return

  let payload: { batches?: VideoBatchSummary[] } | null = null
  try {
    const res = await fetch(`/api/director/video-batches?projectId=${encodeURIComponent(projectId)}`)
    if (!res.ok) return
    payload = await res.json()
  } catch {
    return
  }

  // #batch-resume: GET 응답이 오기 전에 새 run/프로젝트로 바뀌었으면 무시한다.
  const stateNow = store.getState()
  if (stateNow.projectId !== projectId || stateNow.videoBatchBusy || stateNow.videoBatchRunId !== previousRunId) return

  const active = (payload?.batches ?? []).find((batch) => batch.projectId === projectId && isBatchActive(batch))
  if (!active) return

  store.setState({
    videoBatchBusy: true,
    videoBatchCancelled: active.status === 'cancelled',
    videoBatchRunId: active.id,
    videoBatchProgress: { done: active.done + active.failed, total: active.total, failed: active.failed },
  })

  const batchRunId = active.id
  const ownsRun = () => {
    const state = store.getState()
    return state.projectId === projectId && state.videoBatchRunId === batchRunId
  }

  // 같은 조회 poller를 background로 붙인다 — 완료까지 이 함수 자체는 기다리지 않는다.
  void pollVideoBatch(projectId, batchRunId, ownsRun, active, new Set<string>()).then((finalSummary) => {
    if (!finalSummary || !ownsRun()) return
    store.setState({ videoBatchBusy: false, videoBatchProgress: null })
  }).catch((error) => {
    console.error('[video-batches] restored progress failed:', error)
  })
}
