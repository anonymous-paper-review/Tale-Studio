// Director 의 "Editor로 넘길까요?" 질문(2026-11-09, 11/5 시안 맞춰 보기에서 찾은 고장): 첫 진입 안내(단추 없음 · 닫을 수 없음)가
//   제안 자리를 잡고 있으면 질문 글만 채팅에 남고 [Editor로 넘기기] 단추가 뜨지 않았다. 그 안내는 이미 채팅에 남은 말이라
//   자리에서 내려도 잃는 것이 없다. Director 첫 안내만 비킨다. 다른 제안(선택지 · 확정 단계)은 지금 규칙대로 자리가 빌 때까지 기다린다.
//   약속: tests/director/editor-handoff-button.test.ts
import { useGlobalChatStore, type ChatSuggestion } from '@/stores/global-chat-store'

/** Director 첫 진입 안내(노드 보기 · 스토리보드 보기) id. director/page.tsx 의 `director-${key}:${projectId}`. */
const GUIDE_KEYS = ['nodeGuide', 'storyboardGuide'] as const

function isDirectorGuide(suggestion: ChatSuggestion, projectId: string): boolean {
  return suggestion.action == null && GUIDE_KEYS.some((key) => suggestion.id === `director-${key}:${projectId}`)
}

export function offerEditorHandoff(projectId: string, suggestion: ChatSuggestion): void {
  const chat = useGlobalChatStore.getState()
  if (chat.suggestion && isDirectorGuide(chat.suggestion, projectId)) chat.dismissSuggestion({ implicit: true })
  useGlobalChatStore.getState().offerSuggestion(suggestion)
}
