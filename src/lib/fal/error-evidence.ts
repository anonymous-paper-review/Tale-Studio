// 실패 증거 조립 순수 유틸 (#a2-observability 2026-08-26).
//
// 별도 모듈인 이유: reconcile/generation-jobs 는 테스트들이 통째로 mock 하는 부수효과 모듈이다.
// 순수 함수를 거기 두면 mock 팩토리마다 재정의를 강요한다 — 여기는 아무도 mock 하지 않는다.
//
// 배경(오너 부검 08-26): 실패 잡 2건의 error 가 리터럴 "<none>"(fal 의 무상세 플레이스홀더)로
// 저장돼 error_class=unknown, UI 표시 불가였다. 플레이스홀더는 맥락과 함께 감싸고,
// finalize 예외는 name/status/cause 까지 합성해 남긴다.

const MEANINGLESS_FAILURE_RE = /^(?:<none>|undefined|null|error|\[object object\])$/i

/** Upgrade meaningless placeholder strings into contextual evidence; real messages pass through. */
export function normalizeFailureEvidence(message: string, kind?: string): string {
  const trimmed = message.trim()
  if (!MEANINGLESS_FAILURE_RE.test(trimmed)) return trimmed
  return `provider reported no failure detail (raw: ${JSON.stringify(trimmed)}${kind ? `, kind: ${kind}` : ''}) - inspect response_snapshot / fal request log`
}

/** Compose readable failure evidence from a thrown error - name, HTTP status and cause included. */
export function describeFinalizeError(error: unknown): string {
  if (error instanceof Error) {
    const statusValue =
      (error as { status?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode
    const parts = [
      error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message,
    ]
    if (typeof statusValue === 'number' && Number.isFinite(statusValue)) parts.push(`(status ${statusValue})`)
    const cause = (error as { cause?: unknown }).cause
    if (cause instanceof Error && cause.message) parts.push(`caused by: ${cause.message}`)
    return parts.join(' ')
  }
  return String(error)
}
