interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

export async function loadChatMessages(
  projectId: string,
  stage: string,
): Promise<ChatMessage[]> {
  try {
    const res = await fetch(
      `/api/project/${projectId}/messages?stage=${stage}`,
    )
    if (!res.ok) return []
    const { messages } = await res.json()
    return messages ?? []
  } catch {
    return []
  }
}

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
  }).catch((err) =>
    console.error(`[chat-persistence] save failed:`, err),
  )
}
