// 429(동시 생성 한도) 표준 응답 + 관측 기록 (#a2-observability 2026-08-26).
//
// 왜 한 헬퍼인가: 429 는 generation_jobs 행이 생기기 **전에** 거부되므로 장부에 아무 흔적이
//   없다 — 오너 세션 부검(08-26)에서 "다 죽었다" 체감의 주범 후보가 정확히 이 무기록 구간이었다.
//   생성 진입 라우트 7곳이 각자 NextResponse 를 만들면 기록이 또 파편화되므로, 응답과 기록을
//   여기 한 곳에 묶는다. 새 생성 라우트는 반드시 이 헬퍼를 쓸 것.
//
// server-only: recordWriterObservabilityEvent 가 service-role 클라이언트를 쓴다.
import { NextResponse } from 'next/server'
import { quotaExceededBody, type QuotaCheck } from '@/lib/generation-quota'
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
