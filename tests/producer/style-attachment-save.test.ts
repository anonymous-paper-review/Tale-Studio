// 채팅에서 고른 첨부 스타일은 저장이 끝난 뒤에 선택을 표시하고 다른 프로젝트에 섞이지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { stylePromptDecision } from '@/lib/producer-style-prompt'

beforeEach(() => {
  project.getState().resetProject(); producer.getState().reset(); chat.getState().reset()
  project.setState({ projectId: 'attachment-project', currentStage: 'producer', reachedStage: 'producer' })
})
afterEach(() => vi.unstubAllGlobals())

it('채팅에서 첨부 스타일을 저장 중이면 스타일 선택창을 띄우지 않는다', async () => {
  // 왜: 응답 직후 로딩이 풀리면 첨부 스타일 저장보다 자동 선택창이 먼저 열린다.
  let finish!: (value: Response) => void
  const saving = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/produce/style-anchor' ? saving() : Promise.resolve(Response.json({ reply: '그림체를 선택했어요.', extractedSettings: { styleAnchorFromAttachment: { imageIndex: 0, label: '수채화', medium: 'watercolor' } } }))))
  const sending = chat.getState().sendMessage('이 그림체로 해줘', { imageUrls: ['https://example.com/image.png'] })
  await vi.waitFor(() => expect(saving).toHaveBeenCalledOnce())
  expect(stylePromptDecision('attachment-project', { projectId: 'attachment-project', stage: 'producer', loading: chat.getState().loading, approvalBusy: false, hasStyle: !!producer.getState().styleAnchorKey, catalogReady: true })).toBe('wait')
  finish(Response.json({ key: 'custom_new', imageUrl: 'https://example.com/image.png', label: '수채화' }))
  await sending
  expect(producer.getState().styleAnchorKey).toBe('custom_new')
  expect(chat.getState().loading).toBe(false)
})

it('첨부 스타일 저장 중 프로젝트를 바꾸면 새 프로젝트의 뱃지를 덮지 않는다', async () => {
  // 왜: 이전 대화에서 늦게 저장된 선택은 그 프로젝트에만 적용되어야 한다.
  const saving = vi.fn(async () => {
    project.setState({ projectId: 'new-project' })
    producer.setState({ styleAnchorKey: 'real' })
    return Response.json({ key: 'custom_old', imageUrl: 'https://example.com/old.png', label: '이전 그림체' })
  })
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/produce/style-anchor' ? saving() : Promise.resolve(Response.json({ reply: '그림체를 선택했어요.', extractedSettings: { styleAnchorFromAttachment: { imageIndex: 0 } } }))))
  await chat.getState().sendMessage('이 그림체로 해줘', { imageUrls: ['https://example.com/old.png'] })
  expect(saving).toHaveBeenCalledOnce()
  expect(producer.getState().styleAnchorKey).toBe('real')
})
