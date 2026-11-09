// Director 첫 안내가 떠 있어도 Editor로 넘길지 묻는 질문의 단추가 뜬다 (11/5 시안 맞춰 보기에서 찾은 고장, 리드 2026-11-09)
import { beforeEach, describe, expect, it } from 'vitest'
import { useGlobalChatStore, type ChatSuggestion } from '@/stores/global-chat-store'
import { offerEditorHandoff } from '@/features/director/editor-handoff-nudge'

const PROJECT = 'project-1'
const guide = (key: string): ChatSuggestion => ({
  id: `director-${key}:${PROJECT}`,
  stage: 'director',
  dismissible: false,
  action: null,
  content: '여기는 The Set, 촬영장이에요.',
})
const handoff: ChatSuggestion = {
  id: `handoff:director:${PROJECT}`,
  stage: 'director',
  content: '샷 5개 중 4개에 영상이 있어요. Editor로 넘어가 편집을 시작할까요?',
  action: { kind: 'handoff', utterance: 'Editor로 넘겨주세요', label: 'Editor로 넘기기' },
}

beforeEach(() => {
  useGlobalChatStore.getState().reset()
})

describe('혼자 정한 것', () => {
  // 왜: Director 첫 진입 안내(단추 없음 · 닫을 수 없음)가 제안 자리를 잡고 있으면, 샷 대부분에 영상이 생겨 Editor 로 넘길지 물어도
  //   질문 글만 채팅에 남고 [Editor로 넘기기] 단추가 뜨지 않았다. 안내는 채팅에 말을 해야 내려가는데, v3 에서 Director 채팅을
  //   닫아 두어 그럴 일이 더 줄었다(11/5 시안 맞춰 보기 2026-11-09, 개발 DB 에서 확인).
  it.each([['노드 보기 안내', 'nodeGuide'], ['스토리보드 보기 안내', 'storyboardGuide']])(
    'Director 첫 안내가 떠 있어도 Editor로 넘길지 묻는 질문에는 단추가 뜬다 (%s)',
    (_label, key) => {
      useGlobalChatStore.getState().offerSuggestion(guide(key))

      offerEditorHandoff(PROJECT, handoff)

      const shown = useGlobalChatStore.getState().suggestion
      expect(shown?.id).toBe(handoff.id)
      expect(shown?.action).toMatchObject({ kind: 'handoff', label: 'Editor로 넘기기' })
    },
  )

  // 왜: 안내를 제안 자리에서 내릴 뿐이다. 이미 채팅에 남긴 안내 말은 지우지 않는다.
  it('Director 첫 안내를 내려도 그 안내 문장은 채팅에 남는다', () => {
    useGlobalChatStore.getState().offerSuggestion(guide('nodeGuide'))

    offerEditorHandoff(PROJECT, handoff)

    const contents = useGlobalChatStore.getState().messages.map((message) => message.content)
    expect(contents).toContain(guide('nodeGuide').content)
    expect(contents).toContain(handoff.content)
  })

  // 왜: 정상 경로 고정. 사용자가 답하려던 질문(선택지 등)은 넘기기 질문이 소리 없이 밀어내지 않는다.
  //   (문장은 검토 B 2번 뒤 리드 2026-11-09 승인으로 고침: 단추 없는 Director 안내는 이제 모두 비킨다.)
  it('단추가 있는 다른 제안(선택지 등)이 떠 있으면 넘기기 질문은 지금처럼 자리가 빌 때까지 기다린다', () => {
    const choices: ChatSuggestion = {
      id: 'choices:director',
      stage: 'director',
      dismissible: true,
      content: '',
      action: { kind: 'choices', options: [{ label: 'a', utterance: 'a' }, { label: 'b', utterance: 'b' }] },
    }
    useGlobalChatStore.getState().offerSuggestion(choices)

    offerEditorHandoff(PROJECT, handoff)

    expect(useGlobalChatStore.getState().suggestion?.id).toBe('choices:director')
  })

  // 왜: 두 번째 방문부터는 "채워 두면 좋은 것" 안내(단추 없음)가 2초 뒤 제안 자리를 잡고, 채팅이 닫혀 있어 내려가지 않는다.
  //   첫 안내만 비키게 했더니 이 경우 넘기기 질문의 단추가 다시 안 떴다(검토 B 2번, 리드 2026-11-09).
  it('Director 단계의 단추 없는 안내가 떠 있어도 Editor로 넘길지 묻는 질문에는 단추가 뜬다', () => {
    useGlobalChatStore.getState().offerSuggestion({
      id: `director-gaps-${PROJECT}`,
      stage: 'director',
      content: '채워 두면 좋은 것이 2개 있어요.',
      action: null,
    })

    offerEditorHandoff(PROJECT, handoff)

    const shown = useGlobalChatStore.getState().suggestion
    expect(shown?.id).toBe(handoff.id)
    expect(shown?.action).toMatchObject({ kind: 'handoff', label: 'Editor로 넘기기' })
  })
})
