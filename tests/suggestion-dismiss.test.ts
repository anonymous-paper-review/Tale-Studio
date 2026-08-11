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

// #handoff-starved (2026-08-11) — 위 1)의 "슬롯이 빌 때 재시도"만으로는 부족했던 이유의 회귀.
//   producer 채팅은 되물을 거리가 있으면 거의 매 응답마다 [CHOICES] 를 내고, 선택지도 같은 슬롯을
//   쓴다. 그래서 게이트가 충족되는 순간에도 슬롯이 늘 차 있어 "Writer 호출하기"가 못 떴다.
//   처방: 명시적 선점(preempt)만 기존 제안을 밀어낸다.

describe('선점(preempt)', () => {
  it('선점 요청이 없으면 기존 제안이 유지된다 (암묵 교체 금지)', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(choicesSuggestion)
    s.offerSuggestion(handoffSuggestion)
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:abc')
  })

  it('선점 요청이 있으면 떠 있는 선택지를 밀어낸다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(choicesSuggestion)
    s.offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('handoff:producer:p1')
  })

  it('내릴 수 없는 제안(웰컴 등)은 선점해도 밀리지 않는다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion({
      id: 'producer-welcome:p1',
      stage: 'producer',
      content: '안녕하세요',
      action: null,
      dismissible: false,
    })
    s.offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('producer-welcome:p1')
  })

  it('이미 그 제안이 떠 있으면 선점해도 그대로 (반복 호출이 상태를 흔들지 않는다)', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(handoffSuggestion, { preempt: true })
    const before = useGlobalChatStore.getState().suggestion
    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion).toBe(before)
  })

  it('명시적으로 거절한 제안은 선점으로도 되살아나지 않는다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(handoffSuggestion)
    useGlobalChatStore.getState().dismissSuggestion()
    useGlobalChatStore.getState().offerSuggestion(choicesSuggestion)
    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:abc')
  })
})
