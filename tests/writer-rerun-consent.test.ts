import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource } from '@/lib/producer-gate'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import {
  useProducerStore,
  WRITER_RERUN_CONSENT_TEXT,
} from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { resetActionGuard } from '@/lib/action-guard'

const settings: ProjectSettings = {
  playtime: 30,
  genre: 'SF 스릴러',
  subGenre: '사이버펑크',
  format: 'horizontal_16:9',
  tone: ['dark'],
  targetEmotion: [],
  dialogueLanguage: 'ko',
}

const background: BackgroundSource = {
  localId: 'loc-1',
  locationId: 'neon_market',
  name: '네온 시장',
  visualDescription: '비에 젖은 네온 골목',
  purpose: '정보 거래 거점',
  origin: 'producer',
  userEdited: false,
  stale: false,
}

beforeEach(() => {
  // saveAndHandoff 성공 경로는 연타 방어 잠금을 해제하지 않는다(의도된 동작) — 테스트 간에는 모듈 전역 창을 비운다.
  resetActionGuard()
  useProducerStore.getState().reset()
  useGlobalChatStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1' })
  useProducerStore.setState({
    storyText: '스토리',
    storyReady: true,
    styleAnchorKey: 'style_a',
    projectSettings: settings,
    cast: [],
    backgrounds: [background],
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('writer rerun consent', () => {
  it('holds the initial Producer-to-Writer run behind a proposal until approval', async () => {
    const saveAndHandoff = vi.spyOn(useProducerStore.getState(), 'saveAndHandoff')
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ runId: 'run-1' }), { status: 200 }))

    await useGlobalChatStore.getState().sendMessage('Writer로 핸드오프해줘')

    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal?.kind).toBe('producerWriterInitialHandoff')
    expect(proposal?.stage).toBe('producer')
    expect(proposal?.target).toBe('Writer')
    expect(saveAndHandoff).not.toHaveBeenCalled()
    // 채팅 메시지 영속화는 fetch를 쓴다 — 승인 전 금지 대상은 Writer 시작 API뿐이다.
    expect(
      fetchSpy.mock.calls.filter(([url]) => url === '/api/writer/start'),
    ).toHaveLength(0)

    const approved = await useGlobalChatStore.getState().approvePendingProposal(proposal?.id)

    expect(approved).toBe(true)
    expect(saveAndHandoff).toHaveBeenCalledTimes(1)
    expect(saveAndHandoff).toHaveBeenCalledWith()
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/writer/start',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(useProjectStore.getState().currentStage).toBe('writer')
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/writer')
  })

  it('turns completed-run 409 into a consent proposal without rerunning', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'writer_rerun_confirmation_required',
            consentText: WRITER_RERUN_CONSENT_TEXT,
          }),
          { status: 409 },
        ),
      )

    const ok = await useProducerStore.getState().saveAndHandoff()

    expect(ok).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).not.toHaveProperty(
      'rerun',
    )
    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal?.kind).toBe('producerWriterRerunRequest')
    expect(proposal?.action).toBe(WRITER_RERUN_CONSENT_TEXT)
  })

  it('sends rerun consent with the explicit rerun flag and keeps cancellation side-effect free', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'writer_rerun_confirmation_required' }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'writer_rerun_confirmation_required' }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ runId: 'run-2' }), { status: 200 }))

    await useProducerStore.getState().saveAndHandoff()
    const proposalId = useGlobalChatStore.getState().pendingProposal?.id
    expect(proposalId).toBeTruthy()

    useGlobalChatStore.getState().dismissPendingProposal(proposalId)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // 재현을 위해 서버가 다시 동의 문구를 요구하는 응답을 세우고 승인 흐름을 검사한다.
    await useProducerStore.getState().saveAndHandoff()
    const approvalId = useGlobalChatStore.getState().pendingProposal?.id
    expect(approvalId).toBeTruthy()
    const approved = await useGlobalChatStore.getState().approvePendingProposal(approvalId)

    expect(approved).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const rerunBody = JSON.parse(String((fetchSpy.mock.calls[2][1] as RequestInit).body))
    expect(rerunBody.rerun).toBe(true)
    expect(rerunBody.chatHistory).toEqual([])
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/writer')
  })
})
