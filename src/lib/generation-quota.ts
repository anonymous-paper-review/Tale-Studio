// 유저별 동시 생성 작업 쿼터 (chat-proactive-copilot Phase 3 — 멀티유저).
//
// 단일 FAL_KEY 동시 풀을 한 유저가 독점하지 못하게 앱 레이어에서 막는 가드.
// fal 은 초과분을 큐 대기시키므로(거부 아님) 이 쿼터는 "대기 폭주로 인한 UX 저하" 방지용.
// 진짜 fair-queue(유저 라운드로빈 디스패치)는 후속 — 지금은 관대한 상한 + 친절한 429.
import { countQueuedJobsByUser } from '@/lib/generation-jobs'

// 유저 1명이 동시에 큐에 올릴 수 있는 최대 생성 작업 수. 캐릭터 1명(4뷰)+배경 몇 개를
// 한꺼번에 돌려도 막히지 않게 관대하게 잡는다. 멀티유저 부하 패턴 관측 후 조정.
export const MAX_QUEUED_JOBS_PER_USER = 30

export interface QuotaCheck {
  ok: boolean
  queued: number
  limit: number
}

/** 유저의 현재 queued 작업 수가 상한 미만이면 ok. 집계 실패 시 fail-open(차단하지 않음). */
export async function checkUserQuota(userId: string): Promise<QuotaCheck> {
  try {
    const queued = await countQueuedJobsByUser(userId)
    return { ok: queued < MAX_QUEUED_JOBS_PER_USER, queued, limit: MAX_QUEUED_JOBS_PER_USER }
  } catch {
    // 쿼터 집계 실패가 생성 자체를 막으면 안 됨 — fail-open.
    return { ok: true, queued: 0, limit: MAX_QUEUED_JOBS_PER_USER }
  }
}

/** 429 응답 본문 표준 형태. */
export function quotaExceededBody(check: QuotaCheck) {
  return {
    error: `생성 대기열이 가득 찼어요 (${check.queued}/${check.limit}). 진행 중인 작업이 끝나면 다시 시도해주세요.`,
    code: 'quota_exceeded' as const,
    queued: check.queued,
    limit: check.limit,
  }
}
