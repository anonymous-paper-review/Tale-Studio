// 채팅 모델이 첨부 그림을 그림체로 쓰자고 해도 그림체를 저장하지 않으므로 기다리는 일도 없고 다른 프로젝트에 섞이지도 않는다 (D6 2026-11-22 그림체 추출 없앰)
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { styleChoiceBusy, useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { stylePromptDecision } from '@/lib/producer-style-prompt'
import { translate } from '@/lib/i18n'

// 2026-10-10 오너 결정("채팅 모델이 그림체로 쓰자고 하면 묻고 정한다")은 D6(2026-11-22 "스타일 추출하는 기능도 없애줘")으로 바뀌었다 —
//   모델이 첨부 그림을 그림체로 쓰자고 해도 묻지도 저장하지도 않는다.
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
// 그다음(D6 2026-11-22 로 바뀜): '채팅 모델이 첨부 그림을 그림체로 쓰자고 하면 묻는 동안과 고른 그림체를 정하는 동안에는 스타일 선택창을 띄우지 않는다'
it('채팅 모델이 첨부 그림을 그림체로 쓰자고 해도 그림체를 정하는 중으로 기다리지 않고 저장 창구도 부르지 않는다', async () => {
  // 왜: 그림에서 그림체를 정하는 길이 없어졌다(D6) — 묻거나 저장하는 동안이 없으니 기다릴 것도 없다.
  const saving = vi.fn(async () => Response.json({ key: 'custom_new', imageUrl: IMAGE, label: '내 그림체', locked: true }))
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/produce/style-anchor' ? saving() : routeOthers(url)))
  await chat.getState().sendMessage('이 그림체로 해줘', { imageUrls: [IMAGE] })
  expect(styleChoiceBusy(chat.getState(), 'attachment-project')).toBe(false)
  await pickStyle()
  expect(saving).not.toHaveBeenCalled()
  expect(styleChoiceBusy(chat.getState(), 'attachment-project')).toBe(false)
  expect(producer.getState().customStyleAnchor).toBeNull()
  expect(chat.getState().loading).toBe(false)
  expect(decision()).not.toBe('wait')
})

it('채팅 모델이 첨부 그림을 그림체로 쓰자고 한 뒤 프로젝트를 바꿔도 다른 프로젝트의 스타일을 바꾸지 않는다', async () => {
  // 왜: 이전 대화의 그림체 제안이 새 프로젝트에 섞이면 안 된다 — 저장 자체가 없어졌어도(D6) 새 프로젝트 값은 그대로여야 한다.
  const saving = vi.fn(async () => Response.json({ key: 'custom_old', imageUrl: 'https://example.com/old.png', label: '이전 그림체', locked: true }))
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/produce/style-anchor' ? saving() : routeOthers(url)))
  await chat.getState().sendMessage('이 그림체로 해줘', { imageUrls: ['https://example.com/old.png'] })
  project.setState({ projectId: 'new-project' })
  producer.setState({ styleAnchorKey: 'real' })
  await pickStyle()
  expect(saving).not.toHaveBeenCalled()
  expect(producer.getState().styleAnchorKey).toBe('real')
})
