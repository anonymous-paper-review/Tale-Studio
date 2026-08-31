import type { ChatTrace } from '@/lib/chat-trace'

export function saveChatMessage(
  projectId: string,
  stage: string,
  role: 'user' | 'model',
  content: string,
): void {
  fetch(`/api/project/${projectId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, role, content }),
  })
    .then((res) => {
      // 4xx/5xx 는 catch 에 안 걸린다 — 조용히 증발한 대화행 미스터리를 로그로는 남긴다.
      if (!res.ok) console.error(`[chat-persistence] save rejected: HTTP ${res.status} (${role})`)
    })
    .catch((err) => console.error(`[chat-persistence] save failed:`, err))
}

/** Trace는 채팅 화면의 캐시이면서 서버에 남는 관측 기록이다. 저장 실패가 채팅을 막아서는 안 된다. */
export function saveChatTrace(projectId: string, trace: ChatTrace): void {
  fetch('/api/chat/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, trace }),
  })
    .then((res) => {
      if (!res.ok) console.error(`[chat-persistence] trace save rejected: HTTP ${res.status}`)
    })
    .catch((err) => console.error('[chat-persistence] trace save failed:', err))
}

export function saveChatTracePatch(
  projectId: string,
  traceId: string,
  patch: Partial<ChatTrace>,
): void {
  fetch('/api/chat/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, traceId, patch }),
  })
    .then((res) => {
      if (!res.ok) console.error(`[chat-persistence] trace patch rejected: HTTP ${res.status}`)
    })
    .catch((err) => console.error('[chat-persistence] trace patch failed:', err))
}

export async function loadLatestChatTrace(projectId: string): Promise<ChatTrace | null> {
  try {
    const res = await fetch(`/api/chat/trace?projectId=${encodeURIComponent(projectId)}`)
    if (!res.ok) return null
    const body = (await res.json()) as { trace?: ChatTrace | null }
    return body.trace ?? null
  } catch (err) {
    console.error('[chat-persistence] trace load failed:', err)
    return null
  }
}
