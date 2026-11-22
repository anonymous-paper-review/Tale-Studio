// 채팅 모델이 첨부 그림을 그림체로 쓰자고 해도 앱은 묻지도 정하지도 않고, 그림은 참고 자료로만 쓴다 (오너 결정 2026-10-10 → 그림체 추출은 D6 2026-11-22 로 없앰)
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
  it('채팅 모델이 첨부 그림을 그림체로 쓰자고 해도 그림체로 쓸지 묻지 않고, 그림을 분석 모델로도 보내지 않는다', async () => {
    // 왜: 오너 "웹툰이나 이미지 입력받았을 때 스타일 추출하는 기능도 없애줘"(D6) — 그림체는 그림을 만들 때 Artist 에서 네 가지 중 고른다.
    stub()
    await proposeStyle()
    expect(calls('/api/produce/anchor-medium')).toHaveLength(0)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(chat.getState().suggestion?.id ?? '').not.toMatch(/^style-attachment:/)
    expect(chat.getState().styleAttachmentGate).toBeNull()
  })

  it('채팅 모델의 첨부 그림체 제안 뒤에 "그림체로 써 주세요"라고 해도 그림체로 정하지 않는다', async () => {
    // 왜: 그림에서 그림체를 정하는 길이 없어졌다(D6) — 묻던 질문의 칩 말을 쳐도 그림체가 정해지면 안 된다.
    stub()
    await proposeStyle()
    await chat.getState().sendMessage(ko('Use it as the art style'))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(calls('/api/produce/style-facets')).toHaveLength(0)
    expect(producer.getState().customStyleAnchor).toBeNull()
  })

  it('모델이 잘린 그림의 한 조각을 그림체로 쓰자고 해도 원본이든 조각이든 그림체로 정하지 않는다', async () => {
    // 왜: 긴 그림은 조각으로 잘려 모델에 간다 — 어느 조각을 짚어도 그림체를 정하는 길은 없다(D6).
    stub(1)
    await proposeStyle()
    await chat.getState().sendMessage(ko('Use it as the art style'))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
  })

  it('채팅 모델이 첨부 그림을 그림체로 쓰자고 한 뒤에도 그 그림은 이번 말과 함께 참고 자료로만 모델에 갔다', async () => {
    // 정상 경로 고정 — 그림을 붙여 보낸 말은 그 그림을 참고 자료로 싣고 간다. 그림체 제안이 와도 더 할 일이 없다.
    stub()
    await proposeStyle()
    expect(calls('/api/produce/chat')[0].attachmentImageUrls).toEqual(LOOK.sliceUrls)
    expect(producer.getState().customStyleAnchor).toBeNull()
    expect(chat.getState().messages.some((m) => m.content === '참고 자료로 둘게요.')).toBe(false)
  })

  it('채팅 모델의 첨부 그림체 제안 뒤에 "응" · "아니"라고 답해도 그림체 질문의 답으로 읽지 않고 평소대로 채팅이 받는다', async () => {
    // 왜: 묻는 질문이 없어졌다(D6) — 짧은 답도 평소 대화로 간다.
    stub()
    await proposeStyle()
    await chat.getState().sendMessage('응')
    await chat.getState().sendMessage('아니')
    expect(calls('/api/produce/chat')).toHaveLength(3)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
  })

  it('채팅 모델의 첨부 그림체 제안 뒤에 다른 말을 하면 그 말을 이어서 처리한다', async () => {
    // 정상 경로 고정 — 그림체 제안 때문에 대화가 막히면 안 된다.
    stub()
    await proposeStyle()
    await chat.getState().sendMessage('주인공은 고양이야')
    expect(calls('/api/produce/chat')).toHaveLength(2)
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(chat.getState().styleAttachmentGate).toBeNull()
  })

  it('채팅 모델이 지시를 어기고 첨부 그림을 그림체로 쓰자고 하면 그림에서 그림체를 가져올 수 없다는 말을 한 줄 덧붙인다', async () => {
    // 왜(혼자 정한 것, 되돌리기 쉬움): 모델 답만 남으면 그 그림체로 그려지는 줄 안다 — 예전에도 그림체를 못 정하면 채팅에 알렸다(D6).
    stub()
    await proposeStyle()
    const models = chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
    expect(models.at(-1)).toBe(ko("I can't take an art style from a picture. Pick one of the four styles (Live Action, 2D Japanese Anime, Watercolor, Stop Motion) in the style window in Artist when you make the images."))
  })

  it('채팅 모델에게 첨부 그림에서 그림체를 가져올 수 없다고 말하고 그림체 필드를 내지 말라고 이른다', () => {
    // 왜: 모델이 "이 그림체로 잡았어요"라고 하면 거짓말이 된다 — 그림체는 그림을 만들 때 Artist 에서 네 가지 중 고른다(D6).
    for (const locale of ['ko', 'en'] as const) {
      const system = buildProducerSystem(locale)
      expect(system).toContain('taking an art style from a picture is not available')
      expect(system).toContain('Do not emit styleAnchorFromAttachment')
      expect(system).not.toContain('does NOT set the style')
    }
  })

  it('그림을 붙이고 "이 그림체로"라고 해도, 채팅은 그림을 보고 가까운 스타일을 고르거나 권하지 않고, 고를 수 있는 네 가지 이름과 고르는 곳(Artist 스타일 창)만 알려 준다', () => {
    // 왜: QA(2026-11-23, 운영 프로젝트 복사본)에서 그림을 붙여 "이 그림체로 해줘"라고 하자 모델이 그림을 보고 "가장 가까운 건 수채예요"라고 권했다 —
    //   리드 결정 "그림 보고 권하기 안 함(이름만)"과 어긋난다. 모델이 지키는지는 시험으로 못 잡는다 — 첨부 그림 규칙 자리에 그 지시가 있는지만 고정한다.
    for (const locale of ['ko', 'en'] as const) {
      const system = buildProducerSystem(locale)
      const rule = system.slice(system.indexOf('<attached_images>'), system.indexOf('</attached_images>'))
      expect(rule).toContain('Do not look at the picture to pick or recommend the closest of the four styles either — only name the four and the place to pick them (the style window in Artist).')
    }
  })
})
