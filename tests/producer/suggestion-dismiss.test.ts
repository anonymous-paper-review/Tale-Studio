// 제안이 겹쳐도 필요한 안내가 사라지지 않고 다시 나타나도록 보장한다 (#handoff-suggestion-drop 2026-08-07, #handoff-starved 2026-08-11, #fix-scene-gate-suggestion-resurface 2026-08-25)
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

// 씬 확정 게이트 — blocking 제안(dismissible:false). 파이프라인이 멈춰 사용자 확정을 반드시 받는다.
const sceneGate: ChatSuggestion = {
  id: 'scene-gate:p1',
  stage: 'writer',
  dismissible: false,
  content: '씬 스토리 초안이 준비됐어요.',
  action: { kind: 'confirmScenes', label: '이대로 확정' },
}

beforeEach(() => {
  useGlobalChatStore.getState().reset()
})

describe('제안을 닫고 다시 띄우는 규칙', () => {
  it('다른 선택지가 떠 있으면 다음 단계 안내를 보류하고, 자리가 비면 다시 안내한다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(choicesSuggestion)
    s.offerSuggestion(handoffSuggestion) // 충돌 — 조용히 무시 (기존 버그: 여기서 원샷 ref 소모)
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:abc')

    // 선택지가 내려가고(사용) 재시도 — 이제 성공해야 한다
    useGlobalChatStore.getState().dismissSuggestion()
    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion)
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('handoff:producer:p1')
  })

  it('사용자가 다른 말을 해 안내가 닫히면 같은 안내를 다시 띄울 수 있다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(handoffSuggestion)
    useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(useGlobalChatStore.getState().dismissedSuggestionIds).not.toContain('handoff:producer:p1')

    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion)
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('handoff:producer:p1')
  })

  it('사용자가 "나중에"를 누르면 같은 안내를 다시 띄우지 않는다', () => {
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

describe('중요한 안내가 기존 제안을 대신하는 규칙', () => {
  it('더 중요한 안내를 요청하지 않으면 기존 안내를 그대로 유지한다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(choicesSuggestion)
    s.offerSuggestion(handoffSuggestion)
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:abc')
  })

  it('더 중요한 안내를 요청하면 떠 있는 선택지를 내리고 새 안내를 보여준다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(choicesSuggestion)
    s.offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('handoff:producer:p1')
  })

  it('닫을 수 없는 안내(첫 인사 등)는 새 안내가 와도 유지한다', () => {
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

  it('같은 안내가 이미 떠 있으면 다시 요청해도 그대로 둔다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(handoffSuggestion, { preempt: true })
    const before = useGlobalChatStore.getState().suggestion
    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion).toBe(before)
  })

  it('사용자가 거절한 안내는 새 안내 요청이 와도 다시 띄우지 않는다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(handoffSuggestion)
    useGlobalChatStore.getState().dismissSuggestion()
    useGlobalChatStore.getState().offerSuggestion(choicesSuggestion)
    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:abc')
  })
})

// #fix-scene-gate-suggestion-resurface (2026-08-25) — 씬 확정 게이트는 blocking 제안이라
//   닫힘/선점으로 사라지면 안 되고, 어떤 경로로 사라져도 서버가 awaiting 인 한 되살아나야 한다.
//   핵심 계약: dismissible:false 제안은 dismissedSuggestionIds 래치에 갇히지 않는다.
describe('반드시 확인해야 하는 안내를 다시 띄우는 규칙', () => {
  it('확정하지 못해 안내를 닫아도 반드시 확인할 안내를 다시 띄운다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(sceneGate, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('scene-gate:p1')

    useGlobalChatStore.getState().dismissSuggestion()
    expect(useGlobalChatStore.getState().suggestion).toBeNull()

    useGlobalChatStore.getState().offerSuggestion(sceneGate, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('scene-gate:p1')
  })

  it('일반 안내는 사용자가 "나중에" 미루면 다시 띄우지 않는다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(handoffSuggestion)
    useGlobalChatStore.getState().dismissSuggestion()
    useGlobalChatStore.getState().offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
  })

  it('반드시 확인할 안내가 떠 있으면 다른 안내가 대신할 수 없다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(sceneGate, { preempt: true })
    s.offerSuggestion(handoffSuggestion, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('scene-gate:p1')
  })

  it('반복해서 확인해도 이미 떠 있는 확인 안내를 바꾸지 않는다', () => {
    const s = useGlobalChatStore.getState()
    s.offerSuggestion(sceneGate, { preempt: true })
    const before = useGlobalChatStore.getState().suggestion
    s.offerSuggestion(sceneGate, { preempt: true })
    s.offerSuggestion(sceneGate, { preempt: true })
    expect(useGlobalChatStore.getState().suggestion).toBe(before)
  })
})
