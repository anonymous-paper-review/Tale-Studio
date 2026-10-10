// 씬 스토리 AI는 원문을 잠그지 않고 수정안을 만들며, 사용자가 적용하거나 버릴 때만 처리한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { sceneGateSuggestion } from '@/lib/writer/scene-gate'

let request: ReturnType<typeof vi.fn>
beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'scene-project', currentStage: 'producer', producerLocked: true })
  request = vi.fn(async () => Response.json({ ok: true, proposalId: 'proposal-1' }))
  vi.stubGlobal('fetch', request)
})
afterEach(() => { vi.unstubAllGlobals() })

it('직접 고치는 동안에는 채팅이나 AI 수정이나 확정을 실행하지 않는다', async () => {
  const chat = useGlobalChatStore.getState()
  expect(chat.beginSceneStoryEdit('manual')).toBe(true)
  await chat.sendMessage('결말을 줄여줘')
  expect(await chat.reviseSceneGate('결말을 줄여줘')).toBe(false)
  expect(await chat.confirmSceneGate()).toBeNull()
  expect(request).not.toHaveBeenCalled()
  expect(useGlobalChatStore.getState().messages).toEqual([])
})

it('AI 고치기를 시작하면 채팅 선택지를 띄우고 화면은 잠그지 않는다', () => {
  const chat = useGlobalChatStore.getState()
  chat.offerSuggestion(sceneGateSuggestion('scene-project', '확인해 주세요', '확정'))
  expect(chat.beginSceneStoryEdit('ai')).toBe(true)
  expect(useGlobalChatStore.getState().sceneStoryEdit).toBeNull()
  expect(useGlobalChatStore.getState().suggestion?.action).toMatchObject({ kind: 'choices', options: expect.any(Array) })
  expect(useGlobalChatStore.getState().suggestion?.id).toBe('scene-story-edit:scene-project')
  expect(chat.beginSceneStoryEdit('manual')).toBe(true)
})

it('AI 수정안을 만드는 동안에도 직접 고치기를 열 수 있다', async () => {
  let finish!: (value: Response) => void
  request.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve }))
  const chat = useGlobalChatStore.getState()
  chat.beginSceneStoryEdit('ai')
  const sending = chat.sendMessage('사건 흐름을 더 자연스럽게 고쳐줘')
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ projectId: 'scene-project', action: 'revise', feedback: '사건 흐름을 더 자연스럽게 고쳐줘' })
  expect(useGlobalChatStore.getState().loading).toBe(false)
  expect(chat.beginSceneStoryEdit('manual')).toBe(true)
  finish(Response.json({ ok: true, proposalId: 'proposal-1' }))
  await sending
  expect(useGlobalChatStore.getState().sceneStoryEdit?.mode).toBe('manual')
  expect(useGlobalChatStore.getState().sceneStoryRefresh).toBe(1)
})

it('씬 확정 안내에서 수정 요청을 입력하면 잠금 없이 수정안을 만든다', async () => {
  const chat = useGlobalChatStore.getState()
  chat.offerSuggestion(sceneGateSuggestion('scene-project', '확인해 주세요', '확정'))
  await chat.sendMessage('결말을 줄여줘')
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ projectId: 'scene-project', action: 'revise', feedback: '결말을 줄여줘' })
  expect(useGlobalChatStore.getState().sceneStoryEdit).toBeNull()
})

it('미처리 수정안이 있으면 추가 수정 요청과 씬 확정을 보류한다', async () => {
  const chat = useGlobalChatStore.getState()
  expect(await chat.reviseSceneGate('결말을 줄여줘')).toBe(true)
  expect(await chat.reviseSceneGate('더 줄여줘')).toBe(false)
  expect(await chat.confirmSceneGate()).toBeNull()
  expect(request).toHaveBeenCalledOnce()
  expect(useGlobalChatStore.getState().error).toBeTruthy()
})

it('직접 고치기 팝업이 열려 있으면 수정안을 적용하거나 버리지 않는다', async () => {
  const chat = useGlobalChatStore.getState()
  chat.beginSceneStoryEdit('manual')
  expect(await chat.resolveSceneStoryProposal('apply', 'proposal-1')).toBe(false)
  expect(await chat.resolveSceneStoryProposal('discard', 'proposal-1')).toBe(false)
  expect(request).not.toHaveBeenCalled()
})

it.each([{ action: 'apply', label: '적용' }, { action: 'discard', label: '버림' }] as const)('수정안을 $label 처리하면 해당 수정안만 처리하고 본문을 다시 읽는다', async ({ action }) => {
  const chat = useGlobalChatStore.getState()
  chat.syncSceneStoryProposal('scene-project', 'proposal-1')
  expect(await chat.resolveSceneStoryProposal(action, 'proposal-1')).toBe(true)
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ projectId: 'scene-project', action, proposalId: 'proposal-1' })
  expect(useGlobalChatStore.getState().sceneStoryProposalPending).toBeNull()
  expect(useGlobalChatStore.getState().sceneStoryRefresh).toBe(1)
})

it('수정안 적용 중 원문 변경이 발견되면 성공 처리하지 않고 다시 읽는다', async () => {
  request.mockResolvedValue(Response.json({ error: 'changed', code: 'scene_story_changed' }, { status: 409 }))
  const chat = useGlobalChatStore.getState()
  chat.syncSceneStoryProposal('scene-project', 'proposal-1')
  expect(await chat.resolveSceneStoryProposal('apply', 'proposal-1')).toBe(false)
  expect(useGlobalChatStore.getState().sceneStoryProposalPending?.id).toBe('proposal-1')
  expect(useGlobalChatStore.getState().sceneStoryRefresh).toBe(1)
  expect(useGlobalChatStore.getState().error).toBeTruthy()
})

it('AI 수정 요청이 실패하면 편집 잠금 없이 다시 요청할 수 있다', async () => {
  request.mockResolvedValue(Response.json({ error: 'failed' }, { status: 500 }))
  const chat = useGlobalChatStore.getState()
  chat.beginSceneStoryEdit('ai')
  await chat.sendMessage('결말을 줄여줘')
  expect(useGlobalChatStore.getState().sceneStoryEdit).toBeNull()
  expect(useGlobalChatStore.getState().sceneStoryProposalPending).toBeNull()
  expect(useGlobalChatStore.getState().error).toBeTruthy()
  expect(chat.beginSceneStoryEdit('manual')).toBe(true)
})

it('이전 프로젝트의 수정 응답이 늦게 오면 새 프로젝트의 메시지나 수정안 상태를 바꾸지 않는다', async () => {
  let finish!: (value: Response) => void
  request.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve }))
  const chat = useGlobalChatStore.getState()
  chat.beginSceneStoryEdit('ai')
  const sending = chat.sendMessage('결말을 줄여줘')
  chat.reset()
  useProjectStore.setState({ projectId: 'another-project' })
  finish(Response.json({ ok: true, proposalId: 'proposal-1' }))
  await sending
  expect(useGlobalChatStore.getState().sceneStoryEdit).toBeNull()
  expect(useGlobalChatStore.getState().sceneStoryProposalPending).toBeNull()
  expect(useGlobalChatStore.getState().sceneStoryRefresh).toBe(0)
  expect(useGlobalChatStore.getState().messages).toEqual([])
})

it('다른 프로젝트의 조회 응답은 현재 프로젝트의 수정안을 바꾸지 않는다', () => {
  const chat = useGlobalChatStore.getState()
  chat.syncSceneStoryProposal('scene-project', 'proposal-1')
  chat.syncSceneStoryProposal('another-project', null)
  expect(useGlobalChatStore.getState().sceneStoryProposalPending?.id).toBe('proposal-1')
})

it('일반 채팅이 답하는 중에도 직접 고치기 팝업을 열 수 있다', () => {
  useGlobalChatStore.setState({ loading: true })
  expect(useGlobalChatStore.getState().beginSceneStoryEdit('manual')).toBe(true)
})

it('미처리 수정안이 있어도 일반 질문이면 정상 채팅으로 보낸다', async () => {
  const chat = useGlobalChatStore.getState()
  chat.syncSceneStoryProposal('scene-project', 'proposal-1')
  request.mockResolvedValue(Response.json({ reply: '이 장면은 긴장감을 쌓는 역할이에요.' }))
  await chat.sendMessage('이 장면은 어떤 분위기야?')
  expect(request.mock.calls[0][0]).toBe('/api/produce/chat')
  expect(useGlobalChatStore.getState().sceneStoryProposalPending?.id).toBe('proposal-1')
  expect(useGlobalChatStore.getState().sceneStoryEdit).toBeNull()
})
