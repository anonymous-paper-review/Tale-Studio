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
