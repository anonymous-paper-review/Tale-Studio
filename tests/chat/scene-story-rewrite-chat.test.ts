// 채팅에서 다시 쓰기 정도를 고르면 세 가지 안을 요청하고, 안을 골라 미리 보고 적용하거나 되돌린다 (2026-10-02 오너 · 시안 v04)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { sceneGateSuggestion } from '@/lib/writer/scene-gate'

let request: ReturnType<typeof vi.fn>
const bodies = () => request.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'scene-project', currentStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  request = vi.fn(async () => Response.json({ ok: true, proposalId: 'p1' }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('다시 쓰기 정도 고르기', () => {
  it('다시 쓰기에서 정도를 고르면 세 가지 안을 요청하고 채팅에 남긴다', async () => {
    const chat = useGlobalChatStore.getState()
    expect(chat.beginSceneStoryEdit('ai')).toBe(true)
    const option = useGlobalChatStore.getState().suggestion?.action
    expect(option?.kind).toBe('choices')
    const reword = option?.kind === 'choices' ? option.options[1] : null
    await chat.sendMessage(reword!.utterance)
    expect(bodies()).toEqual([{ projectId: 'scene-project', action: 'rewrite', level: 'reword' }])
    expect(useGlobalChatStore.getState().sceneStoryProposalPending).toEqual({ projectId: 'scene-project', id: 'p1' })
    const last = useGlobalChatStore.getState().messages.at(-1)
    expect(last?.role).toBe('model')
    expect(last?.content).toContain('세 가지')
  })

  it('넘긴 뒤 확정 안내가 떠 있을 때 정도 이름만 말해도 세 가지 안을 요청한다', async () => {
    useProjectStore.setState({ producerLocked: true, treatmentDraft: false })
    useGlobalChatStore.getState().offerSuggestion(sceneGateSuggestion('scene-project', '확인해 주세요', '이대로 확정'), { preempt: true })
    await useGlobalChatStore.getState().sendMessage('아이디어부터 다시')
    expect(bodies()[0]).toEqual({ projectId: 'scene-project', action: 'rewrite', level: 'rethink' })
  })

  it('세 가지 안을 만드는 동안에는 다시 쓰기를 또 요청하지 않는다', async () => {
    const chat = useGlobalChatStore.getState()
    expect(await chat.rewriteSceneStory('polish')).toBe(true)
    expect(await chat.rewriteSceneStory('reword')).toBe(false)
    expect(request).toHaveBeenCalledOnce()
  })
})

describe('세 가지 안 고르기와 적용', () => {
  it('다른 안을 고르면 트리트먼트 미리 보기가 그 안으로 바뀐다', () => {
    useGlobalChatStore.getState().previewSceneStoryVariant('p1', 'v3')
    expect(useGlobalChatStore.getState().sceneStoryVariantPreview).toEqual({ projectId: 'scene-project', proposalId: 'p1', variantId: 'v3' })
  })

  it('고른 안을 적용하면 그 안만 보내고 본문을 다시 읽는다', async () => {
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'scene-project', id: 'p1' } })
    request.mockResolvedValue(Response.json({ ok: true, undo: { id: 'u1', label: 'v2' } }))
    const before = useGlobalChatStore.getState().sceneStoryRefresh
    expect(await useGlobalChatStore.getState().resolveSceneStoryProposal('apply', 'p1', 'v2')).toBe(true)
    expect(bodies()[0]).toEqual({ projectId: 'scene-project', action: 'apply', proposalId: 'p1', variantId: 'v2' })
    expect(useGlobalChatStore.getState().sceneStoryRefresh).toBe(before + 1)
    expect(useGlobalChatStore.getState().sceneStoryProposalPending).toBeNull()
  })

  it('셋 다 별로면 그 안들을 버리고 같은 정도로 세 가지를 다시 요청한다', async () => {
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'scene-project', id: 'p1' } })
    request.mockResolvedValueOnce(Response.json({ ok: true })).mockResolvedValueOnce(Response.json({ ok: true, proposalId: 'p2' }))
    expect(await useGlobalChatStore.getState().regenerateSceneStoryRewrite('p1', 'reword')).toBe(true)
    expect(bodies()).toEqual([
      { projectId: 'scene-project', action: 'discard', proposalId: 'p1' },
      { projectId: 'scene-project', action: 'rewrite', level: 'reword' },
    ])
  })

  it('적용한 뒤 되돌리기를 누르면 적용 전 트리트먼트로 돌려 달라고 보낸다', async () => {
    request.mockResolvedValue(Response.json({ ok: true }))
    expect(await useGlobalChatStore.getState().resolveSceneStoryUndo('undo', 'u1')).toBe(true)
    expect(bodies()[0]).toEqual({ projectId: 'scene-project', action: 'undo', undoId: 'u1' })
  })

  it('적용한 뒤 그대로 두기를 누르면 되돌리기만 거둔다', async () => {
    request.mockResolvedValue(Response.json({ ok: true }))
    expect(await useGlobalChatStore.getState().resolveSceneStoryUndo('keep', 'u1')).toBe(true)
    expect(bodies()[0]).toEqual({ projectId: 'scene-project', action: 'keep', undoId: 'u1' })
  })
})
