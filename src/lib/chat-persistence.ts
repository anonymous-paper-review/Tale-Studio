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
