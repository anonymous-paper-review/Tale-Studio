import type { ChatTrace } from '@/lib/chat-trace'

/** 프로젝트마다 아직 끝나지 않은 마지막 대화 줄 저장 — 다음 줄은 이것이 끝난 뒤에 보낸다. */
const pendingSaves = new Map<string, Promise<void>>()

/**
 * 대화 줄 하나를 저장한다(기다리지 않아도 된다). 같은 프로젝트의 줄은 부른 차례대로 보낸다 — 줄마다 따로 보내면 늦게 닿은 쪽이
 *   나중 시각을 받아, 바로 답하는 한 턴(빠른 칩 · 바로 답하는 되묻기)에서 다시 열면 Lumi 답이 내 말 위에 보였다(2026-11-22, 모든 화면 공통).
 *   앞 줄이 없으면 지금처럼 바로 보낸다. 약속: tests/chat/save-order.test.ts
 */
export function saveChatMessage(
  projectId: string,
  stage: string,
  role: 'user' | 'model',
  content: string,
): void {
  const send = (): Promise<void> =>
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
  const previous = pendingSaves.get(projectId)
  const saving = previous ? previous.then(send) : send()
  pendingSaves.set(projectId, saving)
  void saving.then(() => {
    if (pendingSaves.get(projectId) === saving) pendingSaves.delete(projectId)
  })
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
