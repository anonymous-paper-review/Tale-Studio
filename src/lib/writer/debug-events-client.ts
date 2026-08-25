'use client'

export const WRITER_CLIENT_OBSERVABILITY_EVENTS = [
  'auto_check',
  'auto_submit_started',
  'auto_submit_response',
  'auto_submit_blocked',
  'cache_read',
  'cache_invalidated',
] as const

export type WriterClientObservabilityEvent =
  (typeof WRITER_CLIENT_OBSERVABILITY_EVENTS)[number]

/** 브라우저 진단은 제품 흐름을 막지 않는다 — 실패·권한 오류를 조용히 흘려보낸다. */
export function recordWriterObservabilityEventClient(
  projectId: string,
  event: WriterClientObservabilityEvent,
  payload?: Record<string, unknown>,
  refs?: { runId?: string | null; generationJobId?: string | null },
): void {
  if (!projectId || typeof window === 'undefined') return
  void fetch('/api/writer/debug-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      event,
      payload,
      runId: refs?.runId ?? undefined,
      generationJobId: refs?.generationJobId ?? undefined,
    }),
    keepalive: true,
  }).catch(() => {})
}
