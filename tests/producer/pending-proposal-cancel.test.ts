// 대기 중인 변경은 간단한 취소 요청으로 닫되, 취소의 부정이나 새로운 요청을 취소로 삼키지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({
  saveChatMessage: vi.fn(),
  saveChatTrace: vi.fn(),
  saveChatTracePatch: vi.fn(),
  loadLatestChatTrace: vi.fn().mockResolvedValue(null),
}))

import { createPendingProposal, isCancellationUtterance } from '@/lib/pending-proposal'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

const originalApprove = useGlobalChatStore.getState().approvePendingProposal
const approve = vi.fn().mockResolvedValue(true)
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ reply: '일반 LLM 응답', updates: [] })))

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useGlobalChatStore.setState({ approvePendingProposal: approve })
  useProjectStore.setState({ projectId: 'cancel-proposal-test', currentStage: 'producer' })
  approve.mockClear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  useGlobalChatStore.getState().reset()
  useGlobalChatStore.setState({ approvePendingProposal: originalApprove })
  vi.unstubAllGlobals()
})

describe('대기 중인 변경의 취소', () => {
  it('간단한 한국어·영어 취소나 나중에 하자는 말만 취소로 알아듣는다', () => {
    for (const text of [
      '취소', '취소해', '취소해줘', '취소해 주세요.', '그거 취소해줘', '이번 제안 취소',
      '나중에', '나중에 하자', '보류해줘', '하지 마', '진행하지 마', '안 할래', '아니요',
      'cancel', 'Cancel it.', 'please cancel', 'cancel this proposal',
      'never mind', 'nevermind', 'not now', 'later', 'maybe later', 'no thanks',
    ]) {
      expect(isCancellationUtterance(text), text).toBe(true)
    }
  })

  it('취소하지 말라는 말이나 질문·복합 수정 요청은 취소로 처리하지 않는다', () => {
    for (const text of [
      '', '취소하지 마', '취소하지 말아줘', '취소하지 말고 진행해줘', '취소해줘?',
      '취소하면 어떻게 돼', '취소하고 다른 캐릭터로 바꿔줘', '나중에 배경을 바꿔줘',
      '진행해줘', '"취소해줘"라는 문구를 바꿔줘',
      "don't cancel", 'do not cancel', 'cancel?', 'can I cancel',
      'cancel this and make a new character', 'not now, change the scene first',
      'please cancel the running video', 'cancel the subscription',
    ]) {
      expect(isCancellationUtterance(text), text).toBe(false)
    }
    expect(isCancellationUtterance(null)).toBe(false)
    expect(isCancellationUtterance(undefined)).toBe(false)
  })

  it('대기 중인 변경을 취소한다고 말하면 해당 승인을 닫고 실행하지 않는다', async () => {
    for (const [stage, kind, text] of [
      ['producer', 'producerSourcePatch', '취소해줘'],
      ['writer', 'writerShrinkDialogue', '나중에 하자'],
      ['artist', 'artistRegenerateWorldAsset', 'Cancel it.'],
      ['director', 'directorGenerateVideoBatch', 'not now'],
    ] as const) {
      useGlobalChatStore.getState().reset()
      useProjectStore.setState({ currentStage: stage })
      const proposal = createPendingProposal({
        stage, kind, target: '대기 중인 변경', action: '변경하기', impact: [], payload: {},
      })
      useGlobalChatStore.getState().offerPendingProposal(proposal)

      await useGlobalChatStore.getState().sendMessage(text)

      expect(useGlobalChatStore.getState().pendingProposal, stage).toBeNull()
      expect(approve).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(useGlobalChatStore.getState().messages.some((m) => m.role === 'user' && m.content === text)).toBe(true)
      expect(useGlobalChatStore.getState().messages.at(-1)?.role).toBe('model')
    }
  })

  it('다른 단계의 승인이나 취소의 부정은 대기 중인 변경을 닫지 않는다', async () => {
    const proposal = createPendingProposal({
      stage: 'writer', kind: 'writerShrinkDialogue', target: '대사', action: '줄이기', impact: [], payload: {},
    })
    useGlobalChatStore.getState().offerPendingProposal(proposal)
    await useGlobalChatStore.getState().sendMessage('취소해줘')
    expect(useGlobalChatStore.getState().pendingProposal?.id).toBe(proposal.id)

    useProjectStore.setState({ currentStage: 'writer' })
    await useGlobalChatStore.getState().sendMessage('취소하지 마')
    expect(useGlobalChatStore.getState().pendingProposal?.id).toBe(proposal.id)
    expect(approve).not.toHaveBeenCalled()
  })
})
