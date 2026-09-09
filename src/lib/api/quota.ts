// 429(동시 생성 한도) 표준 응답 + 관측 기록 (#a2-observability 2026-08-26).
//
// 왜 한 헬퍼인가: 429 는 generation_jobs 행이 생기기 **전에** 거부되므로 장부에 아무 흔적이
//   없다 — 오너 세션 부검(08-26)에서 "다 죽었다" 체감의 주범 후보가 정확히 이 무기록 구간이었다.
//   생성 진입 라우트 7곳이 각자 NextResponse 를 만들면 기록이 또 파편화되므로, 응답과 기록을
//   여기 한 곳에 묶는다. 새 생성 라우트는 반드시 이 헬퍼를 쓸 것.
//
// server-only: recordWriterObservabilityEvent 가 service-role 클라이언트를 쓴다.
import { NextResponse } from 'next/server'
import { quotaExceededBody, videoBudgetExceededBody, type ProjectVideoBudget, type QuotaCheck } from '@/lib/generation-quota'
import { recordWriterObservabilityEvent } from '@/lib/writer/debug-events'

export interface QuotaRejectionContext {
  projectId: string
  /** 잡 종류 — generation_jobs.kind 와 같은 어휘를 쓴다 (배치는 storyboard_real_grid). */
  kind: string
  userId?: string | null
}

/**
 * 한도 거부를 관측 이벤트로 남기고 표준 429 응답을 반환한다.
 * 기록은 fire-and-forget — 관측 실패가 응답을 늦추거나 바꾸면 안 된다.
 */
export function quotaRejectionResponse(
  check: QuotaCheck,
  ctx: QuotaRejectionContext,
): NextResponse {
  void recordWriterObservabilityEvent(ctx.projectId, 'generation_submit_rejected_quota', {
    kind: ctx.kind,
    scope: check.scope,
    queued: check.queued,
    limit: check.limit,
    userId: ctx.userId ?? null,
  })
  return NextResponse.json(quotaExceededBody(check), { status: 429 })
}

/** #f4: 프로젝트 영상 예산 소진 429 — 동시성 거절과 같은 관측 이벤트 규약. */
export function videoBudgetRejectionResponse(
  budget: ProjectVideoBudget,
  ctx: QuotaRejectionContext,
): NextResponse {
  void recordWriterObservabilityEvent(ctx.projectId, 'generation_submit_rejected_video_budget', {
    kind: ctx.kind,
    used: budget.used,
    limit: budget.limit,
    userId: ctx.userId ?? null,
  })
  return NextResponse.json(videoBudgetExceededBody(budget), { status: 429 })
}

// #video-capacity-trigger(2026-09-09): 예약 경쟁(동시 reserve RPC 두 개가 같은 순간 통과)은 사전
//   checkGenerationCapacity 만으로 못 막는다 — 그래서 새 DB trigger 가 최근 30분 영상 3개를
//   원자적으로 강제하고, 넘으면 reserve/기록 RPC 자체가 예외로 거절한다(message='video_user_at_capacity',
//   details=실제 큐 카운트 문자열). 이 헬퍼는 그 예외를 기존 quotaRejectionResponse 와 같은 429 +
//   관측 이벤트로 변환한다 — 유료 제출(hold/provider) 이후의 오류와 절대 섞이지 않도록, 호출부는
//   reserve/기록 RPC 실패 지점의 catch 에서만 이 헬퍼를 부른다.
const VIDEO_CAPACITY_REJECTION_MESSAGE = 'video_user_at_capacity'

/**
 * 예약 경쟁 중 DB trigger 가 던진 영상 한도 거절만 골라 기존 quotaRejectionResponse 로 응답/관측한다.
 * message 가 일치하고 details 가 유효한 정수(≥3)일 때만 처리 — 그 외는 null(호출부가 기존 오류
 * 경로로 계속 처리). count 는 details 를 그대로 쓴다: 임의의 가짜 큐 수를 만들지 않는다.
 */
export function videoCapacityReservationRejection(
  error: unknown,
  ctx: QuotaRejectionContext,
): NextResponse | null {
  if (
    !error || typeof error !== 'object'
    || !('message' in error) || error.message !== VIDEO_CAPACITY_REJECTION_MESSAGE
  ) return null
  const rawDetails = (error as { details?: unknown }).details
  if (typeof rawDetails !== 'string' || !/^\d+$/.test(rawDetails)) return null
  const count = Number(rawDetails)
  if (!Number.isSafeInteger(count) || count < 3) return null
  return quotaRejectionResponse(
    { ok: false, scope: 'user', category: 'video', queued: count, limit: 3 },
    ctx,
  )
}
