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
