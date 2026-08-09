import { beforeEach, describe, expect, it } from 'vitest'
import { useGlobalChatStore, type ChatSuggestion } from '@/stores/global-chat-store'

// #handoff-suggestion-drop (2026-08-07) — 핸드오프 준비 완료 버튼이 채팅에 안 뜨던 버그의 회귀.
//   1) offerSuggestion 은 다른 제안이 떠 있으면 무시한다 — 호출자는 슬롯이 빌 때 재시도해야 한다.
//   2) 자동 내림(implicit)은 id 를 기록하지 않는다 — 재발사 가능해야 한다.
//   3) 명시적 "나중에"(explicit)만 세션 내 재발사를 막는다.

const handoffSuggestion: ChatSuggestion = {
  id: 'handoff:producer:p1',
  stage: 'producer',
  content: '필요한 항목이 모두 채워졌어요.',
  action: { kind: 'handoff', utterance: 'Writer로 넘겨주세요', label: 'Writer 호출하기' },
}

const choicesSuggestion: ChatSuggestion = {
  id: 'choices:abc',
  stage: 'producer',
  dismissible: true,
  content: '',
  action: { kind: 'choices', options: [{ label: 'a', utterance: 'a' }, { label: 'b', utterance: 'b' }] },
}

beforeEach(() => {
  useGlobalChatStore.getState().reset()
})

describe('suggestion dismiss 의미론', () => {
  it('다른 제안(선택지)이 떠 있으면 핸드오프 제안은 무시된다 — 슬롯이 비면 재시도로 성공', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(choicesSuggestion)
    s.offerSuggestion(handoffSuggestion) // 충돌 — 조용히 무시 (기존 버그: 여기서 원샷 ref 소모)
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:abc')

    // 선택지가 내려가고(사용) 재시도 — 이제 성공해야 한다
    useGlobalChatStore.getState().dismissSuggestion()
    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion)
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('handoff:producer:p1')
  })

  it('implicit dismiss(유저가 다른 말) 후에는 같은 id 가 다시 뜰 수 있다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(handoffSuggestion)
    useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(useGlobalChatStore.getState().dismissedSuggestionIds).not.toContain('handoff:producer:p1')

    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion)
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('handoff:producer:p1')
  })

  it('explicit dismiss("나중에") 후에는 같은 id 재발사가 막힌다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(handoffSuggestion)
    useGlobalChatStore.getState().dismissSuggestion()
    expect(useGlobalChatStore.getState().dismissedSuggestionIds).toContain('handoff:producer:p1')

    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion)
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
  })
})
