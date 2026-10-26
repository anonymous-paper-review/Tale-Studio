// 리뉴얼 1차: Writer 채팅은 산문만 고친다 — 적용하면 다음 단계를 묻고, 넘김 말 · "다시 써줘"는 확정 창 · 조건을 연다 (2026-10-19)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import { SceneStoryProposalCard } from '@/components/layout/scene-story-proposal-card'
import { unresolvedSceneStoryProposal, type SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'

let request: ReturnType<typeof vi.fn>
const bodies = () => request.mock.calls.map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }))

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useWriterRoomStore.setState({ rewriteOpen: false, confirmOpen: false, manualRequest: 0 })
  useProjectStore.setState({ projectId: 'prose-project', currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  request = vi.fn(async () => Response.json({ ok: true, proposalId: 'p1' }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('Writer 채팅', () => {
  // 왜: Writer 는 산문만 다룬다 — 고칠 점을 말하면 Producer 카드가 아니라 산문 수정안으로 간다.
  it('Writer 채팅에 고칠 점을 말하면 산문 수정안을 요청한다', async () => {
    await useGlobalChatStore.getState().sendMessage('팀장을 더 얄밉게 해줘')

    expect(bodies()).toEqual([{ url: '/api/writer/scene-gate', body: { projectId: 'prose-project', action: 'revise', feedback: '팀장을 더 얄밉게 해줘' } }])
  })

  // 왜: 프로토타입 — "다시 써줘"라고만 하면 조건(러닝타임 · 장르·분위기 · 소재)을 먼저 묻는다.
  it('"다시 써줘"라고만 하면 요청을 보내지 않고 다시 쓰기 조건을 연다', async () => {
    await useGlobalChatStore.getState().sendMessage('다시 써줘')

    expect(request).not.toHaveBeenCalled()
    expect(useWriterRoomStore.getState().rewriteOpen).toBe(true)
    expect(useGlobalChatStore.getState().messages.at(-1)?.role).toBe('model')
  })

  // 왜: 확정하면 산문이 잠긴다 — 채팅 말로 바로 넘기지 않고 확정 창에서 한 번 더 묻는다.
  it('Artist로 넘겨 달라고 하면 바로 넘기지 않고 산문 확정 창을 연다', async () => {
    await useGlobalChatStore.getState().sendMessage('Artist로 넘겨줘')

    expect(request).not.toHaveBeenCalled()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
  })

  // 왜: 오른쪽 위 다음 단계 버튼도 같은 확정 창을 연다(예전 Producer 확정 창 · 바로 넘기기가 아니다).
  it('다음 단계 버튼을 누르면 산문 확정 창을 연다', async () => {
    await useGlobalChatStore.getState().requestNextStep()

    expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  // 왜: 조건으로 다시 쓰기는 고른 조건을 그대로 보낸다(안을 적용하기 전에는 산문 조건이 그대로다).
  it('조건을 골라 다시 쓰면 그 조건으로 세 가지 안을 요청한다', async () => {
    const conditions = { runtimeSeconds: 300, genre: '코미디', seed: 'keep' as const }

    expect(await useGlobalChatStore.getState().rewriteSceneStory(null, conditions)).toBe(true)

    expect(bodies()).toEqual([{ url: '/api/writer/scene-gate', body: { projectId: 'prose-project', action: 'rewrite', conditions } }])
  })
})

describe('다음 단계 묻기', () => {
  // 왜: 프로토타입 WP — 고친 걸 적용하면 "적용했어요. 다음 단계로 넘어갈까요?"를 묻는다.
  it('AI 안을 적용하면 다음 단계로 넘어갈지 묻는다', async () => {
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'prose-project', id: 'p1' } })
    request.mockResolvedValue(Response.json({ ok: true }))

    expect(await useGlobalChatStore.getState().resolveSceneStoryProposal('apply', 'p1', 'v1')).toBe(true)

    const suggestion = useGlobalChatStore.getState().suggestion
    expect(suggestion?.action).toEqual({ kind: 'writerNext', step: 'ask' })
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('다음 단계로 넘어갈까요?')
  })

  // 왜: 프로토타입 WN — "아니요, 더 고칠래요"면 할 일을 버튼으로 보인다.
  it('아니요를 고르면 할 일을 버튼으로 보여 준다', () => {
    useGlobalChatStore.getState().offerWriterNext('ask')

    useGlobalChatStore.getState().offerWriterNext('more')

    expect(useGlobalChatStore.getState().suggestion?.action).toEqual({ kind: 'writerNext', step: 'more' })
  })

  // 왜: 다시 적용하면 또 묻는다 — 같은 카드라도 채팅에 새로 남는다.
  it('다시 적용하면 다음 단계를 또 묻는다', () => {
    useGlobalChatStore.getState().offerWriterNext('ask')
    const first = useGlobalChatStore.getState().messages.length
    useGlobalChatStore.getState().offerWriterNext('more')

    useGlobalChatStore.getState().offerWriterNext('ask')

    expect(useGlobalChatStore.getState().messages.length).toBe(first + 2)
    expect(useGlobalChatStore.getState().suggestion?.action).toEqual({ kind: 'writerNext', step: 'ask' })
  })

  // 왜: 버린 안은 적용이 아니다 — 묻지 않는다.
  it('AI 안을 버리면 다음 단계를 묻지 않는다', async () => {
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'prose-project', id: 'p1' } })
    request.mockResolvedValue(Response.json({ ok: true }))

    await useGlobalChatStore.getState().resolveSceneStoryProposal('discard', 'p1')

    expect(useGlobalChatStore.getState().suggestion).toBeNull()
  })
})

describe('바꿀 곳이 없는 수정안', () => {
  it('바꿀 곳이 없었던 수정안은 카드 없이 내리고 채팅에 바꿀 곳을 찾지 못했다고 알린다', async () => {
    // 왜: 바뀐 것이 0개인 수정안을 적용하면 아무것도 안 바뀌는데 '적용했어요'가 뜨고, 요청 문장이 이후 수정 지시로 계속 남았다(디자이너 QA 1차 #01).
    const unchanged: SceneStoryProposalView = {
      id: 'p1', status: 'failed', error: 'scene_story_proposal_unchanged', feedback: '다음 챕터로 이동해줘', createdAt: '2026-10-27T00:00:00Z', stale: false,
      before: [{ sceneId: 's1', index: 0, beats: ['원문'] }], after: [],
    }
    expect(renderToStaticMarkup(createElement(SceneStoryProposalCard, { projectId: 'prose-project', proposal: unchanged }))).toBe('')
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'prose-project', id: 'p1' } })
    request.mockImplementation(async () => Response.json({ ok: true }))

    await useGlobalChatStore.getState().settleUnchangedSceneStoryProposal('p1')
    await useGlobalChatStore.getState().settleUnchangedSceneStoryProposal('p1')

    expect(bodies()).toEqual([{ url: '/api/writer/scene-gate', body: { projectId: 'prose-project', action: 'discard', proposalId: 'p1' } }])
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    const notes = useGlobalChatStore.getState().messages.filter((message) => message.content === '바꿀 곳을 찾지 못해 산문을 그대로 뒀어요. 어떻게 고칠지 조금 더 구체적으로 말해 주세요.')
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ stage: 'producer', role: 'model' })
  })
})

describe('넘어갈지는 한 곳에서 묻는다', () => {
  it('산문 확정 창을 열면 채팅에 떠 있던 "다음 단계로 넘어갈까요?" 질문은 내린다', async () => {
    // 왜: 같은 질문이 확정 창과 채팅 두 곳에 동시에 떠 있었다(디자이너 QA 1차 #08). 창은 [브레이크다운하기] · 다음 단계 버튼 · 채팅 넘김 말 어디서든 열린다.
    const ways = [
      () => useWriterRoomStore.getState().openConfirm(),
      () => useGlobalChatStore.getState().requestNextStep(),
      () => useGlobalChatStore.getState().sendMessage('다음 단계로'),
    ]
    for (const open of ways) {
      useWriterRoomStore.setState({ confirmOpen: false })
      useGlobalChatStore.getState().offerWriterNext('ask')
      expect(useGlobalChatStore.getState().suggestion?.action).toEqual({ kind: 'writerNext', step: 'ask' })

      await open()

      expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
      expect(useGlobalChatStore.getState().suggestion).toBeNull()
    }
  })

  it('산문 확정 창에서 아니오를 고른 뒤 고친 걸 적용하면 다음 단계를 다시 묻지 않고 적용했다고만 알린다', async () => {
    // 왜: 넘어가겠다고 한 번 말해 확정 창을 본 사람에게, 고친 걸 적용할 때마다 채팅에서 같은 질문이 또 들어왔다(디자이너 QA 1차 #08). 넘어가기는 [브레이크다운하기] · "다음 단계로"로 언제든 연다.
    const plain = '적용했어요. 넘어갈 준비가 되면 [브레이크다운하기]를 누르거나 "다음 단계로"라고 말해 주세요.'
    await useGlobalChatStore.getState().requestNextStep()
    useGlobalChatStore.getState().declineProseConfirm()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(false)
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'prose-project', id: 'p1' } })
    request.mockImplementation(async () => Response.json({ ok: true }))

    expect(await useGlobalChatStore.getState().resolveSceneStoryProposal('apply', 'p1')).toBe(true)

    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(useGlobalChatStore.getState().messages.at(-1)).toMatchObject({ stage: 'producer', role: 'model', content: plain })
    // 직접 고친 걸 저장해도(직접 작성 팝업의 저장이 같은 묻기를 부른다) 적용했다고만 알린다.
    useGlobalChatStore.getState().offerWriterNext('ask')
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(useGlobalChatStore.getState().messages.filter((message) => message.content === plain)).toHaveLength(2)
  })
})

describe('정한 수정안 카드는 바로 내려간다', () => {
  it('AI 안을 적용하면 그 수정안 카드는 다음 단계 질문과 같은 순간에 내려간다', async () => {
    // 왜: 적용한 카드가 다음 새로고침까지 남아 있다가 늦게 사라져 질문 단추가 아래에 떴다가 위로 튀었고(오클릭), 남은 [적용]을 또 누르면 오류가 났다(디자이너 QA 1차 관찰 26).
    const stalePreview = { id: 'p1' } // 미리 보기를 다시 읽기 전에는 적용한 안이 그대로 실려 온다.
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'prose-project', id: 'p1' } })
    request.mockImplementation(async () => Response.json({ ok: true }))
    const cardWhenAsked: unknown[] = []
    const stop = useGlobalChatStore.subscribe((state) => {
      if (state.suggestion?.action?.kind === 'writerNext' && cardWhenAsked.length === 0) cardWhenAsked.push(unresolvedSceneStoryProposal(stalePreview, state.sceneStoryResolved, 'prose-project'))
    })

    expect(await useGlobalChatStore.getState().resolveSceneStoryProposal('apply', 'p1')).toBe(true)
    stop()

    expect(cardWhenAsked).toEqual([null])
    // 다음에 새로 오는 수정안 카드는 가리지 않는다.
    expect(unresolvedSceneStoryProposal({ id: 'p2' }, useGlobalChatStore.getState().sceneStoryResolved, 'prose-project')).toEqual({ id: 'p2' })
  })

  it('AI 안을 버리면 그 수정안 카드는 버리는 순간 내려간다', async () => {
    // 왜: 버린 카드도 다음 새로고침까지 남아 있으면 남은 단추를 또 누르게 된다(디자이너 QA 1차 관찰 26).
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'prose-project', id: 'p1' } })
    request.mockImplementation(async () => Response.json({ ok: true }))
    const cardWhenCleared: unknown[] = []
    const stop = useGlobalChatStore.subscribe((state, before) => {
      if (before.sceneStoryProposalPending && !state.sceneStoryProposalPending) cardWhenCleared.push(unresolvedSceneStoryProposal({ id: 'p1' }, state.sceneStoryResolved, 'prose-project'))
    })

    expect(await useGlobalChatStore.getState().resolveSceneStoryProposal('discard', 'p1')).toBe(true)
    stop()

    expect(cardWhenCleared).toEqual([null])
  })
})

describe('산문 확정', () => {
  // 왜: [예, 확정하기] → 산문 목록을 저장하고 확정을 보낸 뒤 Artist 를 연다(산문은 잠긴다).
  it('산문을 확정하면 인물 · 배경 목록을 저장하고 Artist 를 연다', async () => {
    const save = vi.spyOn(useProducerStore.getState(), 'saveDraftNow').mockResolvedValue(true)
    request.mockResolvedValue(Response.json({ ok: true }))

    const result = await useGlobalChatStore.getState().confirmProse()

    expect(result.ok).toBe(true)
    expect(save).toHaveBeenCalled()
    expect(bodies()).toEqual([{ url: '/api/writer/prose-confirm', body: { projectId: 'prose-project' } }])
    expect(useProjectStore.getState().producerLocked).toBe(true)
    expect(useProjectStore.getState().reachedStage).toBe('artist')
    save.mockRestore()
  })

  // 왜: 서버가 막으면(정하지 않은 수정안 등) 잠그지 않고 까닭을 돌려준다.
  it('확정을 서버가 막으면 산문을 잠그지 않고 까닭을 알려 준다', async () => {
    const save = vi.spyOn(useProducerStore.getState(), 'saveDraftNow').mockResolvedValue(true)
    request.mockResolvedValue(Response.json({ code: 'scene_story_proposal_pending' }, { status: 409 }))

    const result = await useGlobalChatStore.getState().confirmProse()

    expect(result).toEqual({ ok: false, code: 'scene_story_proposal_pending' })
    expect(useProjectStore.getState().producerLocked).toBe(false)
    save.mockRestore()
  })
})
