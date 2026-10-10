// 채팅 모델이 첨부 그림을 그림체로 쓰자고 하면 바로 정하지 않고 묻고, 고르면 새 프로젝트 · 채팅과 같은 길로 고정 · 분석한다 (오너 결정 2026-10-10)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n'
import { buildProducerSystem } from '@/app/api/produce/chat/system-prompt'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const LOOK = { id: 'look', name: 'look.png', thumbUrl: `${MEDIA}/look/original.webp`, sliceUrls: [`${MEDIA}/look/s000.jpg`, `${MEDIA}/look/s001.jpg`] }
const ko = (text: string) => translate('ko', text)

let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
function stub(imageIndex = 0) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_new', imageUrl: body.imageUrl, label: body.label, medium: body.medium, ...(body.lock ? { locked: true } : {}) })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    if (url === '/api/produce/chat') {
      const first = calls('/api/produce/chat').length === 1
      return Response.json(first
        ? { reply: '맑은 수채 느낌이에요.', extractedSettings: { styleAnchorFromAttachment: { imageIndex, label: '맑은 수채', medium: 'watercolor' } } }
        : { reply: '좋아요.' })
    }
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const proposeStyle = () => chat.getState().sendMessage('이 분위기로 해줘', { imageUrls: LOOK.sliceUrls, thumbUrls: [LOOK.thumbUrl], images: [LOOK] })

beforeEach(() => {
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('채팅 모델이 첨부 그림을 그림체로 쓰자고 할 때', () => {
  it('채팅 모델이 첨부 그림을 그림체로 쓰자고 하면 바로 정하지 않고, 분석 모델로 보내고 고정된다는 안내와 함께 그림체로 쓸지 묻는다', async () => {
    // 왜: 10/10 운영 806e2cc2 — 모델이 정한 그림체는 고정도 분석도 없이 들어갔다. 그림체는 사용자가 골라야 고정된다(10/9 오너).
    stub()
    await proposeStyle()
    expect(calls('/api/produce/anchor-medium')).toHaveLength(0)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    const s = chat.getState().suggestion
    expect(s?.id.startsWith('style-attachment:')).toBe(true)
    expect(s?.content).toMatch(/분석 모델/)
    expect(s?.content).toMatch(/고정/)
    expect(s?.action?.kind === 'choices' ? s.action.options.map((o) => o.label) : []).toEqual(['그림체로 쓰기', '참고 자료로 두기'])
  })

  it('그림체로 쓰기를 고르면 새 프로젝트 · 채팅과 같은 길로 매체를 고르고 고정한 뒤 분석한다', async () => {
    // 왜: 10/10 오너 "프로젝트 생성 시 입력하는 플로우랑 채팅으로 나중에 입력하는 플로우 모두 똑같은 기능으로".
    stub()
    await proposeStyle()
    await chat.getState().sendMessage(ko('Use it as the art style'))
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    expect(calls('/api/produce/anchor-medium')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, consent: 'chat-style-confirm-v1' })
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, lock: true })
    expect(calls('/api/produce/style-facets')[0]).toMatchObject({ consent: 'chat-style-confirm-v1' })
    expect(producer.getState().customStyleAnchor?.locked).toBe(true)
    expect(chat.getState().styleAttachmentGate).toBeNull()
  })

  it('모델이 고른 그림이 여러 조각으로 잘린 그림의 한 조각이면 그 그림의 원본을 그림체로 쓴다', async () => {
    // 왜: 긴 그림은 조각으로 잘려 모델에 간다. 조각 하나를 그림체로 삼으면 그림의 일부만 그림체가 된다(806e2cc2 의 앵커가 s000 조각이었다).
    stub(1)
    await proposeStyle()
    await chat.getState().sendMessage(ko('Use it as the art style'))
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0].imageUrl).toBe(LOOK.thumbUrl)
  })

  it('참고 자료로 두기를 고르면 그림체를 정하지 않는다', async () => {
    // 정상 경로 고정 — 고르지 않은 그림체는 들어가지 않는다.
    stub()
    await proposeStyle()
    await chat.getState().sendMessage(ko('Use it as reference only'))
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(producer.getState().customStyleAnchor).toBeNull()
    expect(chat.getState().messages.at(-1)?.content).toBe('참고 자료로 둘게요.')
  })

  it('그림체로 쓸지 물었을 때 "응"이라고 답하면 그림체로 쓰고, "아니"라고 답하면 참고 자료로 둔다', async () => {
    // 왜: 예 · 아니오로 묻는 말에는 짧게 답한다 — 단추 문구를 그대로 쓰지 않아도 알아들어야 한다.
    stub()
    await proposeStyle()
    await chat.getState().sendMessage('응')
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    chat.getState().reset()
    producer.getState().reset()
    project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
    stub()
    await proposeStyle()
    await chat.getState().sendMessage('아니')
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(chat.getState().messages.at(-1)?.content).toBe('참고 자료로 둘게요.')
  })

  it('답하지 않고 다른 말을 하면 그림체를 정하지 않고 그 말을 이어서 처리한다', async () => {
    // 왜: 묻는 말 때문에 대화가 막히면 안 된다 — 그림은 이미 참고 자료로 갔다.
    stub()
    await proposeStyle()
    await chat.getState().sendMessage('주인공은 고양이야')
    expect(calls('/api/produce/chat')).toHaveLength(2)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(chat.getState().styleAttachmentGate).toBeNull()
  })

  it('채팅 모델에게 첨부 그림을 그림체로 정했다고 말하지 말고 그림체로 쓸지 묻겠다고 말하라고 이른다', () => {
    // 왜: 앱이 묻기 전에 모델이 "정했어요"라고 하면 거짓말이 된다. 고정되면 나중에 바꿀 수도 없다.
    for (const locale of ['ko', 'en'] as const) {
      const system = buildProducerSystem(locale)
      expect(system).toContain('does NOT set the style')
      expect(system).not.toContain('say they can change it any time')
    }
  })
})
