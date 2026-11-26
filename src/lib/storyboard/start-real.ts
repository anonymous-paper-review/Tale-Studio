'use client'

// Storyboard [시작] · [멈추기](오너 2026-11-26 m1126 S2 "콘티인 상태로 시작 누르면 (현재)디렉터의 스토리보드 상태").
//   새 길을 만들지 않는다 — Director [이미지 만들기] · [모두 멈추기]와 같은 러너(real-batch-client) · 같은 서버 요청 · 같은 진행 깃발.
//   다른 것은 둘: 끝 알림 한 줄이 Storyboard 채팅에 남고(stage 'writer'), [멈추기]는 실사 작업만 멈춘다(Storyboard 는 영상을 만들지 않는다).
//   약속: tests/writer/real-start.test.ts · tests/writer/real-start-runner.test.ts
import { toast } from 'sonner'
import { afterStoppedRealBatch, cancelRealBatchResume, cancelWaitingRealBatch, runRealBatch } from '@/lib/director/real-batch-client'
import { freshActiveJobs } from '@/lib/director/stop-all-client'
import { stopNotice, stoppableJobs, stoppedCounts } from '@/lib/director/stop-work'
import { translate } from '@/lib/i18n/translate'
import { REAL_IMAGE_JOB_KINDS } from '@/lib/storyboard/real-board'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'

/** [시작] — 화면이 센 샷(실사 없음 · 콘티 그림 있음)만 싣는다. 비어 있으면 보내지 않는다(서버는 목록이 없으면 실사 없는 샷 전부를 고른다).
 *  멈춘 앞 판이 정리 중이면 정리가 끝난 뒤 시작한다(Director 와 같은 문, 검토 a S1e). */
export function startStoryboardReal(projectId: string, shotIds: readonly string[]): Promise<void> {
  if (!projectId || shotIds.length === 0) return Promise.resolve()
  const batch = [...shotIds]
  return afterStoppedRealBatch(() => {
    void runRealBatch(projectId, { shotIds: batch, stage: 'writer' })
  }, JSON.stringify(['storyboard-start', batch]))
}

/** [멈추기] — 일괄의 남은 장은 보내지 않고, 다시 돌기 예약 · 정리를 기다리던 누름도 거두고, 만들고 있는 실사 작업은 화면에서 멈춘다.
 *  멈춘 작업은 fal 에서 끝까지 돌고 뒤늦게 끝나면 버전에만 남는다(오너 2026-11-14 7번). 영상은 멈추지 않는다. */
export async function stopStoryboardReal(projectId: string): Promise<void> {
  const run = useDirectorCanvasStore.getState()
  cancelRealBatchResume(projectId)
  const batchWasLive = run.realBatchBusy && !run.realBatchCancelled
  if (batchWasLive) run.cancelRealBatch()
  cancelWaitingRealBatch()
  const locale = useLocaleStore.getState().locale
  try {
    const asked = stoppableJobs(await freshActiveJobs(projectId)).filter((job) => REAL_IMAGE_JOB_KINDS.includes(job.kind))
    const stopped = new Set(asked.length > 0 ? await run.cancelRunningJobs(asked.map((job) => job.id)) : [])
    toast.info(translate(locale, stopNotice(stoppedCounts(asked, stopped, batchWasLive))))
  } catch (error) {
    console.error('[storyboard] stop failed:', error)
    toast.error(translate(locale, 'Could not stop it. Try again.'))
  }
}
