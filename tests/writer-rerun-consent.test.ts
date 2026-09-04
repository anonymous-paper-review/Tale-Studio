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
import { handoffMarker } from '@/lib/chat-blocks'

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
    // vi.spyOn 금지(zustand): set()이 상태를 스프레드 복사해 스파이가 다음 테스트까지 살아남고,
    //   같은 프로퍼티를 다시 spyOn하면 기존 목이 카운트째 재사용된다 — 카운터 교체+복원 패턴을 쓴다.
    const originalSaveAndHandoff = useProducerStore.getState().saveAndHandoff
    const handoffCalls: unknown[][] = []
    useProducerStore.setState({
      saveAndHandoff: async (...args) => {
        handoffCalls.push(args)
        return originalSaveAndHandoff(...args)
      },
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ runId: 'run-1' }), { status: 200 }))

    await useGlobalChatStore.getState().sendMessage('Writer로 핸드오프해줘')

    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal?.kind).toBe('producerWriterInitialHandoff')
    expect(proposal?.stage).toBe('producer')
    expect(proposal?.target).toBe('Writer')
    expect(handoffCalls).toHaveLength(0)
    // D11: 제안 순간 발화는 안내 문장 — "승인 전에는 실행 없음"만 덩그러니 남지 않는다.
    const proposalReply = useGlobalChatStore.getState().messages.at(-1)
    expect(proposalReply?.role).toBe('model')
    expect(proposalReply?.content).toContain('Approve the card below')
    // 채팅 메시지 영속화는 fetch를 쓴다 — 승인 전 금지 대상은 Writer 시작 API뿐이다.
    expect(
      fetchSpy.mock.calls.filter(([url]) => url === '/api/writer/start'),
    ).toHaveLength(0)

    const approved = await useGlobalChatStore.getState().approvePendingProposal(proposal?.id)

    expect(approved).toBe(true)
    expect(handoffCalls).toEqual([[]])
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/writer/start',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(useProjectStore.getState().currentStage).toBe('writer')
    // D11: ⇄ 연출이 보일 시간을 준 뒤 이동 — 네비는 HANDOFF_INVITE_NAVIGATE_MS 뒤에 설정된다.
    await vi.waitFor(
      () => expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/writer'),
      { timeout: 2500 },
    )
    useProducerStore.setState({ saveAndHandoff: originalSaveAndHandoff })
    // D11: 승인 즉시 반응 발화가 스레드에 남는다 — 무반응 공백 제거.
    const reaction = useGlobalChatStore
      .getState()
      .messages.find((m) => m.role === 'model' && m.content.includes('handing your materials to the Writer'))
    expect(reaction).toBeTruthy()
    // D11: ⇄ 초대 연출 마커가 승인 경로에도 남는다 — 멈칫 대신 전이 애니메이션.
    expect(
      useGlobalChatStore
        .getState()
        .messages.some((m) => m.content === handoffMarker('producer', 'writer')),
    ).toBe(true)
  })

  it('runs the handoff directly without a second approval card when the explicit button consents', async () => {
    // D12(2026-08-31 오너): "Writer 호출하기를 늈는데 승인 카드가 또 뜨는 게 이상함" —
    //   명시 버튼이 곳 동의다. 카드 없이 바로 실행하고, 즉시 반응 발화 + ⇄ 연출이 남는다.
    const originalSaveAndHandoff = useProducerStore.getState().saveAndHandoff
    const handoffCalls: unknown[][] = []
    useProducerStore.setState({
      saveAndHandoff: async (...args) => {
        handoffCalls.push(args)
        return originalSaveAndHandoff(...args)
      },
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ runId: 'run-1' }), { status: 200 }))

    await useGlobalChatStore
      .getState()
      .sendMessage('Writer로 핸드오프해줘', undefined, { consentedHandoff: true })

    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(handoffCalls).toHaveLength(1)
    expect(
      fetchSpy.mock.calls.filter(([url]) => url === '/api/writer/start'),
    ).toHaveLength(1)
    const contents = useGlobalChatStore.getState().messages.map((m) => m.content)
    expect(contents.some((c) => c.includes('handing your materials to the Writer'))).toBe(true)
    expect(contents.some((c) => c === handoffMarker('producer', 'writer'))).toBe(true)
    expect(useProjectStore.getState().currentStage).toBe('writer')
    useProducerStore.setState({ saveAndHandoff: originalSaveAndHandoff })
  })

  it('speaks an honest failure message when the approved handoff fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ runId: 'run-1' }), { status: 200 }),
    )
    await useGlobalChatStore.getState().sendMessage('Writer로 핸드오프해줘')
    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal?.kind).toBe('producerWriterInitialHandoff')

    // 승인 후 saveAndHandoff 실패 — "넘어갈게요" 뒤 침묵이면 거짓 수락이 된다(B 그룹과 같은 원칙).
    //   spyOn 금지: zustand set()이 상태 객체를 스프레드 복사해 mock 참조가 다음 테스트로 샐 —
    //   setState 교체 + 복원 패턴을 쓴다(pending-proposal-store.test.ts와 동일).
    const originalSaveAndHandoff = useProducerStore.getState().saveAndHandoff
    useProducerStore.setState({ saveAndHandoff: async () => false })
    try {
      const approved = await useGlobalChatStore.getState().approvePendingProposal(proposal?.id)

      expect(approved).toBe(false)
      const contents = useGlobalChatStore.getState().messages.map((m) => m.content)
      expect(contents.some((c) => c.includes('handing your materials to the Writer'))).toBe(true)
      expect(contents.some((c) => c.includes('Handoff failed'))).toBe(true)
    } finally {
      useProducerStore.setState({ saveAndHandoff: originalSaveAndHandoff })
    }
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
    // D11 반응 발화의 채팅 영속화 fetch가 사이에 끼어도 깨지지 않게 위치 순서가 아니라 URL로 라우팅한다.
    let writerStartCalls = 0
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === '/api/writer/start') {
        writerStartCalls += 1
        if (writerStartCalls <= 2)
          return new Response(
            JSON.stringify({ code: 'writer_rerun_confirmation_required' }),
            { status: 409 },
          )
        return new Response(JSON.stringify({ runId: 'run-2' }), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    })

    await useProducerStore.getState().saveAndHandoff()
    const proposalId = useGlobalChatStore.getState().pendingProposal?.id
    expect(proposalId).toBeTruthy()

    useGlobalChatStore.getState().dismissPendingProposal(proposalId)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(writerStartCalls).toBe(1)

    // 재현을 위해 서버가 다시 동의 문구를 요구하는 응답을 세우고 승인 흐름을 검사한다.
    await useProducerStore.getState().saveAndHandoff()
    const approvalId = useGlobalChatStore.getState().pendingProposal?.id
    expect(approvalId).toBeTruthy()
    const approved = await useGlobalChatStore.getState().approvePendingProposal(approvalId)

    expect(approved).toBe(true)
    expect(writerStartCalls).toBe(3)
    const writerCalls = fetchSpy.mock.calls.filter(([u]) => String(u) === '/api/writer/start')
    const rerunBody = JSON.parse(String((writerCalls[2][1] as RequestInit).body))
    expect(rerunBody.rerun).toBe(true)
    // D11 반응 발화(모델 역할)가 이력에 실린다 — 사용자 발화를 지어내거나 지어내지 않은
    //   사용자 발화가 끼어들지 않는다는 것만 잠그고, 정확한 개수에는 의존하지 않는다.
    expect(
      (rerunBody.chatHistory as Array<{ role: string }>).every((m) => m.role === 'model'),
    ).toBe(true)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    await vi.waitFor(
      () => expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/writer'),
      { timeout: 2500 },
    )
  })
})
