import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { choiceSuggestionMarker, parseChoiceSuggestionMarker } from '@/lib/chat-blocks'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

// 오너 결정(2026-08-18): 새로고침 후 **선택지만** 복원한다.
//   입력창에 얹어둔 첨부는 현행 유지 — 새로고침하면 사라지는 동작을 그대로 둔다.
beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'project-1', currentStage: 'producer' })
  vi.restoreAllMocks()
})

afterEach(() => {
  useProjectStore.setState({ projectId: null })
})

describe('선택지 복원 (표시 전용)', () => {
  it('새로고침 후 선택지를 라벨만 복원하고 실행 가능한 action 은 복원하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            {
              stage: 'producer',
              role: 'model',
              content: choiceSuggestionMarker({
                id: 'choices:old',
                stage: 'producer',
                content: '어떤 방향으로 갈까요?',
                labels: ['긴장감 있게', '따뜻하게'],
              }),
            },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    useGlobalChatStore.getState().offerSuggestion({
      id: 'choices:old',
      stage: 'producer',
      content: '어떤 방향으로 갈까요?',
      action: {
        kind: 'choices',
        options: [
          { label: '긴장감 있게', utterance: '긴장감 있게' },
          { label: '따뜻하게', utterance: '따뜻하게' },
        ],
      },
    })

    await useGlobalChatStore.getState().loadMessages('project-1')

    const suggestion = useGlobalChatStore.getState().suggestion
    expect(suggestion?.content).toBe('어떤 방향으로 갈까요?')
    expect(suggestion?.restoredChoices?.options).toEqual(['긴장감 있게', '따뜻하게'])
    // 되살아난 선택지에 실행 콜백이 붙으면 지나간 제안의 버튼이 살아난다 — 반드시 null.
    expect(suggestion?.action).toBeNull()
  })

  it('깨진 내부 표식은 화면에 노출하지 않고 조용히 버린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            { stage: 'producer', role: 'model', content: '⟦chat-choice:v0⟧broken' },
            { stage: 'producer', role: 'model', content: '정상 답변' },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await useGlobalChatStore.getState().loadMessages('project-1')

    expect(useGlobalChatStore.getState().messages.map((m) => m.content)).toEqual(['정상 답변'])
    expect(parseChoiceSuggestionMarker('⟦chat-choice:v0⟧broken')).toBeNull()
  })
})
