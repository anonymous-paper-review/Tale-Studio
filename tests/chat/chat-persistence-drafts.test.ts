// 새로고침해도 선택지 이름은 다시 보여 주고 이미 지난 선택을 실행하지 않는다 (오너 결정 2026-08-18)
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

describe('새로고침 뒤 선택지 안내', () => {
  it('새로고침하면 선택지 이름만 다시 보여 주고 바로 실행되지는 않게 한다', async () => {
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

  it('읽을 수 없는 선택 안내는 화면에 보이지 않게 버린다', async () => {
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
