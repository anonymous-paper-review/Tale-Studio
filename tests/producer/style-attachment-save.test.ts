// 채팅에서 고른 첨부 스타일은 저장이 끝난 뒤에 선택을 표시하고 다른 프로젝트에 섞이지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { styleChoiceBusy, useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { stylePromptDecision } from '@/lib/producer-style-prompt'
import { translate } from '@/lib/i18n'

// 2026-10-10 오너 결정("채팅 모델이 그림체로 쓰자고 하면 묻고 정한다") — 모델이 고른 첨부 그림은 바로 저장하지 않고 묻는다.
//   고르면 새 프로젝트 · 채팅과 같은 길(매체 고르기 → 고정 → 분석)로 저장한다. 아래 두 시험은 그 길에 맞춰 묻고 고르는 단계를 넣었다.
const IMAGE = 'https://example.com/image.png'
const proposal = { reply: '그림체를 선택했어요.', extractedSettings: { styleAnchorFromAttachment: { imageIndex: 0, label: '수채화', medium: 'watercolor' } } }
const routeOthers = (url: string) => url === '/api/produce/anchor-medium'
  ? Promise.resolve(Response.json({ medium: 'watercolor' }))
  : url === '/api/produce/style-facets' ? Promise.resolve(Response.json({ ok: true, facets: true })) : Promise.resolve(Response.json(proposal))
const pickStyle = () => chat.getState().sendMessage(translate('ko', 'Use it as the art style'))

beforeEach(() => {
  project.getState().resetProject(); producer.getState().reset(); chat.getState().reset()
  project.setState({ projectId: 'attachment-project', currentStage: 'producer', reachedStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

const decision = () => stylePromptDecision('attachment-project', {
  projectId: 'attachment-project', stage: 'producer',
  loading: chat.getState().loading || styleChoiceBusy(chat.getState(), 'attachment-project'),
  approvalBusy: false, hasStyle: !!producer.getState().styleAnchorKey, catalogReady: true,
})

// 앞 문장(2026-10-10 오너 결정으로 바뀜): '채팅에서 첨부 스타일을 저장 중이면 스타일 선택창을 띄우지 않는다'
it('채팅 모델이 첨부 그림을 그림체로 쓰자고 하면 묻는 동안과 고른 그림체를 정하는 동안에는 스타일 선택창을 띄우지 않는다', async () => {
  // 왜: 응답 직후 로딩이 풀리면 묻는 말이나 그림체 저장보다 자동 선택창이 먼저 열린다.
  let finish!: (value: Response) => void
  const saving = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/produce/style-anchor' ? saving() : routeOthers(url)))
  await chat.getState().sendMessage('이 그림체로 해줘', { imageUrls: [IMAGE] })
  expect(decision()).toBe('wait')
  const choosing = pickStyle()
  await vi.waitFor(() => expect(saving).toHaveBeenCalledOnce())
  expect(decision()).toBe('wait')
  finish(Response.json({ key: 'custom_new', imageUrl: IMAGE, label: '내 그림체', locked: true }))
  await choosing
  expect(producer.getState().styleAnchorKey).toBe('custom_new')
  expect(chat.getState().loading).toBe(false)
})

it('첨부 스타일 저장 중 프로젝트를 바꾸면 새 프로젝트의 뱃지를 덮지 않는다', async () => {
  // 왜: 이전 대화에서 늦게 저장된 선택은 그 프로젝트에만 적용되어야 한다.
  const saving = vi.fn(async () => {
    project.setState({ projectId: 'new-project' })
    producer.setState({ styleAnchorKey: 'real' })
    return Response.json({ key: 'custom_old', imageUrl: 'https://example.com/old.png', label: '이전 그림체', locked: true })
  })
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/produce/style-anchor' ? saving() : routeOthers(url)))
  await chat.getState().sendMessage('이 그림체로 해줘', { imageUrls: ['https://example.com/old.png'] })
  await pickStyle()
  expect(saving).toHaveBeenCalledOnce()
  expect(producer.getState().styleAnchorKey).toBe('real')
})
