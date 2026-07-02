// FAL 큐 상태를 진실로 삼아 generation_job 을 reconcile — webhook 누락/조기-에러 공통 안전망.
//
// 두 호출처가 공유한다(중복 finalize 디스패치 제거):
//   1) GET /api/generation-jobs/[id] — queued 잡 폴링 시 webhook 미도착 대비.
//   2) POST /api/fal/webhook — 사유 없는 generic 'ERROR' webhook(느린 i2i 의 fal 조기/타임아웃)을
//      터미널로 믿지 않고 FAL 큐 진실로 재확인(완료면 회수). shot 이미지가 영영 실패로 굳던 버그(2026-06-30).
//
// 멱등: 호출 전 job.status==='queued' 전제(각 finalize 가 다시 가드). COMPLETED→finalize, FAILED→fail,
//   그 외(IN_QUEUE/IN_PROGRESS/일시오류)→그대로 두어 다음 폴링/webhook 이 마저 처리.
import { failGenerationJob, type GenerationJob } from '@/lib/generation-jobs'
import { falImageFetch, falVideoFetch } from '@/lib/writer/llm/fal'
import {
  finalizeCharacterViewJob,
  finalizeWorldShotJob,
  finalizeShotStoryboardJob,
  finalizeShotRoughStoryboardJob,
  finalizeShotVideoJob,
} from '@/lib/fal/finalize'

/** queued job 을 FAL 큐 진실로 reconcile — 완료면 finalize, FAL이 FAILED면 fail, 그 외는 그대로(진행중/일시오류). */
export async function reconcileJobFromFal(job: GenerationJob): Promise<GenerationJob> {
  try {
    if (job.kind === 'shot_video') {
      const r = await falVideoFetch(job.model, job.request_id)
      if (r.status === 'COMPLETED') {
        const url = await finalizeShotVideoJob(job, r.url)
        return { ...job, status: 'completed', result_url: url }
      }
      if (r.status === 'FAILED') {
        await failGenerationJob(job.id, r.error)
        return { ...job, status: 'failed', error: r.error }
      }
    } else {
      // 이미지 계열 (character_view / world_shot / shot_storyboard / shot_rough_storyboard)
      const r = await falImageFetch(job.model, job.request_id)
      if (r.status === 'COMPLETED') {
        let url: string
        if (job.kind === 'character_view') url = await finalizeCharacterViewJob(job, r.url)
        else if (job.kind === 'world_shot') url = await finalizeWorldShotJob(job, r.url)
        else if (job.kind === 'shot_rough_storyboard')
          url = await finalizeShotRoughStoryboardJob(job, r.url)
        else url = await finalizeShotStoryboardJob(job, r.url)
        return { ...job, status: 'completed', result_url: url }
      }
      if (r.status === 'FAILED') {
        await failGenerationJob(job.id, r.error)
        return { ...job, status: 'failed', error: r.error }
      }
    }
  } catch (e) {
    // 일시 오류 → queued 유지, 다음 polling/webhook 에서 재시도
    console.error('[fal/reconcile] failed:', e instanceof Error ? e.message : e)
  }
  return job
}
