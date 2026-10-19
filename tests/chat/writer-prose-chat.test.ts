// 리뉴얼 1차: Writer 채팅은 산문만 고친다 — 적용하면 다음 단계를 묻고, 넘김 말 · "다시 써줘"는 확정 창 · 조건을 연다 (2026-10-19)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

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
