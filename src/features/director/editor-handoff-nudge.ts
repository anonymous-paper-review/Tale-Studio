// Director 의 "Editor로 넘길까요?" 질문(2026-11-09, 11/5 시안 맞춰 보기에서 찾은 고장): 단추 없는 Director 안내(첫 진입 안내 ·
//   "채워 두면 좋은 것")가 제안 자리를 잡고 있으면 질문 글만 채팅에 남고 [Editor로 넘기기] 단추가 뜨지 않았다. 그 안내들은 이미
//   채팅에 남은 말이라 자리에서 내려도 잃는 것이 없다(검토 B 2번에서 "채워 두면 좋은 것"까지 넓힘). 단추가 있는 제안(선택지 · 확정 단계)은
//   지금 규칙대로 자리가 빌 때까지 기다린다. 약속: tests/director/editor-handoff-button.test.ts
import { useGlobalChatStore, type ChatSuggestion } from '@/stores/global-chat-store'

/** Director 단계의 단추 없는 안내(첫 진입 안내 `director-{nodeGuide|storyboardGuide}:…` · `director-gaps-…` 등). */
function isDirectorNotice(suggestion: ChatSuggestion): boolean {
  return suggestion.stage === 'director' && suggestion.action == null
}

/** @param _projectId 넘기기 질문의 프로젝트. 비키는 기준은 단계와 단추 없음이라 쓰지 않는다. */
export function offerEditorHandoff(_projectId: string, suggestion: ChatSuggestion): void {
  const chat = useGlobalChatStore.getState()
  // 사용자가 [나중에]로 접어 둔 질문은 다시 띄우지 않으므로(offerSuggestion 이 돌아간다) 그때는 안내도 그대로 둔다.
  const willShow = !chat.dismissedSuggestionIds.includes(suggestion.id)
  if (willShow && chat.suggestion && isDirectorNotice(chat.suggestion)) chat.dismissSuggestion({ implicit: true })
  useGlobalChatStore.getState().offerSuggestion(suggestion)
}
