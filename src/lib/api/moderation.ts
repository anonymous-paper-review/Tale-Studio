// 내용 규칙 거절(400) · 검사 장애(503) 표준 응답 + 관측 기록 — quota.ts 와 같은 규약.
//
// 왜 한 헬퍼인가: Creem 검사는 generation_jobs 행이 생기기 **전에** 거부하므로 장부에 흔적이 없다
//   (429 와 같은 무기록 구간). 생성 진입 라우트가 각자 NextResponse 를 만들면 사용자가 보는 안내도
//   관측도 파편화되므로 응답과 기록을 여기 한 곳에 묶는다. 새 생성 라우트는 반드시 이 헬퍼를 쓸 것.
//
// server-only: recordWriterObservabilityEvent 가 service-role 클라이언트를 쓴다.
import { NextResponse } from 'next/server'
import {
  ModerationBlockedError,
  ModerationUnavailableError,
  type ModerationReceipt,
} from '@/lib/moderation/creem'
import { recordWriterObservabilityEvent } from '@/lib/writer/debug-events'

export interface ModerationRejectionContext {
  projectId: string
  /** 잡 종류 — generation_jobs.kind 와 같은 어휘를 쓴다. */
  kind: string
  userId?: string | null
}

/** 막힘 — 클라이언트가 "설명을 고쳐 다시" 안내를 띄우는 코드. */
export const CONTENT_POLICY_BLOCKED = 'content_policy_blocked'
/** 장애 — 클라이언트가 "잠시 후 다시" 안내를 띄우는 코드. */
export const MODERATION_UNAVAILABLE = 'moderation_unavailable'

/**
 * 통과한 검사를 작업 기록에 남긴다(2026-10-11 결정) — 생성 입력 스냅샷은 같은 요청이면 같은 내용이어야
 * 하므로(시각·검사 id 가 들어가면 그 성질이 깨진다) 영수증은 이 이벤트에 남긴다. 프롬프트 본문은
 * 싣지 않는다(길이와 해시만). best-effort — 기록 실패가 생성을 막거나 늦출 수 없다.
 */
export function recordModerationPass(
  receipt: ModerationReceipt | null | undefined,
  ctx: ModerationRejectionContext & { jobId: string | null },
): void {
  // 기록은 생성 동작을 바꾸지 않는다 — 영수증이 없는 값이 들어와도 던지지 않고 판정 없음(null)으로
  //   남긴다(그 자체가 "검사 기록 없는 작업"이라는 신호다). 강제는 타입과 제출 직전 검문이 맡는다.
  void recordWriterObservabilityEvent(
    ctx.projectId,
    'generation_submit_moderation_passed',
    {
      kind: ctx.kind,
      jobId: ctx.jobId,
      moderationId: receipt?.id ?? null,
      decision: receipt?.decision ?? null,
      reason: receipt?.reason ?? null,
      checkedAt: receipt?.checked_at ?? null,
      chars: receipt?.chars ?? null,
      textSha256: receipt?.text_sha256 ?? null,
      userId: ctx.userId ?? null,
    },
    { generationJobId: ctx.jobId },
  )
}

/**
 * 검사 거절·장애만 표준 응답으로 옮긴다. 그 밖의 오류는 null — 호출부가 기존 오류 경로로 계속 처리한다.
 * 기록은 fire-and-forget: 관측 실패가 응답을 늦추거나 바꾸면 안 된다.
 */
export function moderationRejectionResponse(
  error: unknown,
  ctx: ModerationRejectionContext,
): NextResponse | null {
  if (error instanceof ModerationBlockedError) {
    void recordWriterObservabilityEvent(ctx.projectId, 'generation_submit_rejected_content_policy', {
      kind: ctx.kind,
      decision: error.decision,
      moderationId: error.moderationId,
      userId: ctx.userId ?? null,
    })
    return NextResponse.json(
      {
        // 문구가 영어인 이유: server-only 라 유저 locale 을 알 방법이 없다(#i18n-s5-batch 규약).
        //   화면 안내는 code 를 보고 클라이언트가 사용자 언어로 띄운다.
        error: 'This request breaks the content rules, so it was not generated. Edit the description and try again.',
        code: CONTENT_POLICY_BLOCKED,
        policyUrl: '/acceptable-use',
      },
      { status: 400 },
    )
  }
  if (error instanceof ModerationUnavailableError) {
    void recordWriterObservabilityEvent(ctx.projectId, 'generation_submit_rejected_moderation_unavailable', {
      kind: ctx.kind,
      reason: error.reason,
      status: error.status ?? null,
      userId: ctx.userId ?? null,
    })
    return NextResponse.json(
      {
        error: 'The content check is unavailable right now, so nothing was generated. Please try again in a moment.',
        code: MODERATION_UNAVAILABLE,
      },
      { status: 503 },
    )
  }
  return null
}
