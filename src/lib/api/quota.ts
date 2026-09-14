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
import type { GenerationCapacityAxis } from '@/lib/generation-jobs'
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
    axis: check.axis,
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

// #generation-capacity-trigger(2026-09-14, 영상 전용 게이트 2026-09-09 의 확장): 예약 경쟁(동시
//   요청 두 개가 같은 순간 통과)은 사전 checkGenerationCapacity 만으로 못 막는다 — DB trigger 가
//   네 축(내 영상 3 · 내 이미지 6 · fal 계정별 · 전체 합계)을 원자적으로 강제하고, 넘으면 예약
//   자체가 예외로 거절한다(message=축 이름, details='n' 또는 'n/limit'). 이 헬퍼는 그 예외를 기존
//   quotaRejectionResponse 와 같은 429 + 관측 이벤트로 옮긴다 — 유료 제출(hold/provider) 이후의 오류와
//   절대 섞이지 않도록, 호출부는 예약 실패 지점의 catch 에서만 부른다.
const CAPACITY_AXIS_BY_MESSAGE: Record<string, GenerationCapacityAxis> = {
  video_user_at_capacity: 'user_video',
  image_user_at_capacity: 'user_image',
  key_at_capacity: 'key',
  global_at_capacity: 'global',
}

// 개인 축 상한은 트리거 안에 박혀 있어 detail 에 오지 않는다(generation-quota.ts 의 MAX_QUEUED_* 와 같은 값).
const USER_AXIS_LIMIT: Record<'user_video' | 'user_image', number> = { user_video: 3, user_image: 6 }
const VIDEO_KINDS = new Set(['shot_video', 'shot_previz_video'])

/** GenerationCapacityError 는 수를 이미 읽어둔 상태로 온다. 그 외엔 트리거 detail 을 그대로 파싱한다. */
function readAxisCounts(
  error: object,
  axis: GenerationCapacityAxis,
): { queued: number; limit: number } | null {
  const queued = (error as { queued?: unknown }).queued
  const limit = (error as { limit?: unknown }).limit
  if (Number.isSafeInteger(queued) && Number.isSafeInteger(limit)) {
    return { queued: queued as number, limit: limit as number }
  }
  const details = (error as { details?: unknown }).details
  if (typeof details !== 'string') return null
  if (axis === 'user_video' || axis === 'user_image') {
    if (!/^\d+$/.test(details)) return null
    const count = Number(details)
    return Number.isSafeInteger(count) ? { queued: count, limit: USER_AXIS_LIMIT[axis] } : null
  }
  const matched = /^(\d+)\/(\d+)$/.exec(details)
  if (!matched) return null
  const count = Number(matched[1])
  const max = Number(matched[2])
  return Number.isSafeInteger(count) && Number.isSafeInteger(max) ? { queued: count, limit: max } : null
}

/**
 * 예약 경쟁 중 나온 자리 거절만 골라 기존 quotaRejectionResponse 로 응답/관측한다.
 * message 가 네 축 중 하나이고 수를 확인할 수 있을 때만 처리 — 그 외는 null(호출부가 기존 오류
 * 경로로 계속 처리). 수는 전부 거절이 준 값이다: 임의의 가짜 큐 수를 만들지 않는다.
 */
export function capacityReservationRejection(
  error: unknown,
  ctx: QuotaRejectionContext,
): NextResponse | null {
  if (!error || typeof error !== 'object' || !('message' in error)) return null
  const axis = CAPACITY_AXIS_BY_MESSAGE[String((error as { message?: unknown }).message)]
  if (!axis) return null
  const counts = readAxisCounts(error, axis)
  // 상한에 닿지도 않은 수는 이 거절의 근거가 될 수 없다 — 사용자에게 모순된 수를 보이지 않는다.
  if (!counts || counts.queued < counts.limit) return null
  const scope = axis === 'user_video' || axis === 'user_image' ? 'user' : 'global'
  const category = axis === 'user_video' || VIDEO_KINDS.has(ctx.kind) ? 'video' : 'image'
  return quotaRejectionResponse(
    { ok: false, scope, category, queued: counts.queued, limit: counts.limit, axis },
    ctx,
  )
}
