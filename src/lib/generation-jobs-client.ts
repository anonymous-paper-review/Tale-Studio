// 클라이언트용 generation_jobs polling 헬퍼 (webhook 비동기 전환).
//
// 생성 submit 라우트가 jobId를 반환하면, 인증된 /api/generation-jobs/[id]를 완료까지 polling한다.
// 라우트가 queued면 FAL을 직접 reconcile하므로 webhook이 없어도(로컬 터널 없음) 결과를 받는다.
// 여러 store가 공유 (store 간 import 금지 규칙 회피 — 공용 lib).
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

export type GenerationJobLifecycle =
  | 'queued'
  | 'completed'
  | 'failed'
  | 'deduped'
  | 'skipped'
  | 'timed_out'

export interface GenerationJobReceipt {
  jobId: string | null
  status: GenerationJobLifecycle
  resultUrl?: string | null
  error?: string | null
  httpStatus?: number | null
}

export type GenerationJobObserver = (receipt: GenerationJobReceipt) => void

export async function pollGenerationJob(
  jobId: string,
  {
    intervalMs = 3000,
    timeoutMs = 300_000,
    onStatus,
  }: {
    intervalMs?: number
    timeoutMs?: number
    onStatus?: GenerationJobObserver
  } = {},
): Promise<string> {
  const started = Date.now()
  while (true) {
    if (Date.now() - started > timeoutMs) {
      onStatus?.({
        jobId,
        status: 'timed_out',
        error: 'Generation timed out (5 min)',
      })
      throw new Error(translate(useLocaleStore.getState().locale, 'Generation timed out (5 min)'))
    }
    const res = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      onStatus?.({
        jobId,
        status: 'failed',
        httpStatus: res.status,
        error: body?.error?.message ?? `HTTP ${res.status}`,
      })
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
    }
    const { data } = (await res.json()) as {
      data: { status: string; resultUrl: string | null; error: string | null }
    }
    if (data.status === 'completed') {
      if (!data.resultUrl) {
        onStatus?.({
          jobId,
          status: 'failed',
          error: 'Completed, but no result URL',
        })
        throw new Error(translate(useLocaleStore.getState().locale, 'Completed, but no result URL'))
      }
      onStatus?.({
        jobId,
        status: 'completed',
        resultUrl: data.resultUrl,
      })
      return data.resultUrl
    }
    if (data.status === 'failed') {
      onStatus?.({
        jobId,
        status: 'failed',
        error: data.error ?? 'Generation failed',
      })
      throw new Error(data.error ?? translate(useLocaleStore.getState().locale, 'Generation failed'))
    }
    onStatus?.({ jobId, status: 'queued' })
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
