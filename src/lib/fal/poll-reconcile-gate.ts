// 폴링 라우트가 생성 서비스(fal)에 직접 물어볼 차례인지 정하는 문지기 — 완료 알림(웹훅)을 믿고 기다리는 시간을 둔다.
import { POLL_RECONCILE_THROTTLE_MS, WEBHOOK_GRACE_MS } from '@/lib/generation-job-timing'

const MAX_TRACKED_JOBS = 1000

// 잡별 마지막 질문 시각. Map 은 삽입 순서를 지키므로 맨 앞이 가장 오래된 기록이다.
const lastAskedAt = new Map<string, number>()

export interface ProviderAskJob {
  id: string
  request_id: string
  submitted_at?: string | null
  created_at?: string | null
}

export function shouldAskProvider(
  job: ProviderAskJob,
  opts: { webhookConfigured: boolean; now?: number },
): boolean {
  if (job.request_id?.startsWith('reserved:')) return false
  if (!opts.webhookConfigured) return true

  const now = opts.now ?? Date.now()
  const since = Date.parse(job.submitted_at ?? job.created_at ?? '')
  // 제출 시각을 알 수 없으면 기다릴 근거가 없으니 확인한다(실제 행은 created_at 이 항상 있다).
  if (!Number.isFinite(since)) return true
  if (now - since < WEBHOOK_GRACE_MS) return false

  const last = lastAskedAt.get(job.id)
  if (last !== undefined && now - last < POLL_RECONCILE_THROTTLE_MS) return false

  lastAskedAt.delete(job.id)
  lastAskedAt.set(job.id, now)
  while (lastAskedAt.size > MAX_TRACKED_JOBS) {
    const oldest = lastAskedAt.keys().next().value
    if (oldest === undefined) break
    lastAskedAt.delete(oldest)
  }
  return true
}

/** 잡이 끝났을 때 그 잡의 질문 기록을 지운다. */
export function forgetProviderAsk(jobId: string): void {
  lastAskedAt.delete(jobId)
}

export function _resetPollReconcileGateForTests(): void {
  lastAskedAt.clear()
}
