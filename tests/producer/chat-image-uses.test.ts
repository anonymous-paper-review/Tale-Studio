// 채팅으로 올린 그림도 그림마다 만화 원고 · 인물 · 배경 · 그림체 · 참고 자료 중에서 고르고, 웹툰 원고 + 다른 그림체 그림도 다룬다 (2026-10-10 오너)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useLocaleStore } from '@/stores/locale-store'
import { matchImageUseAnswer, matchImageUseInText } from '@/lib/producer/image-role'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const img = (name: string) => ({ id: name, name, thumbUrl: `${MEDIA}/${name}/original.webp`, sliceUrls: [`${MEDIA}/${name}/s000.jpg`] })
const P1 = img('comic_1.webp'), P2 = img('comic_2.webp'), LOOK = img('look.png'), LOOK2 = img('look2.png')
const SCRIPT = 'S#1. 방 - 낮\n남자: 왔어.\n여자: 응.\n남자: 가자.'

let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
function stub() {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url === '/api/produce/comic-script') return Response.json({ script: SCRIPT, stats: { scenes: 1, dialogue_lines: 3 } })
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_new', imageUrl: body.imageUrl, label: body.label, medium: body.medium, ...(body.lock ? { locked: true } : {}) })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    if (url === '/api/produce/chat') return Response.json({ reply: '카드를 채웠어요.' })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const answer = (text: string) => chat.getState().sendMessage(text)

beforeEach(() => {
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  useChatUiStore.setState({ stylePickerRequest: null })
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
  stub()
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('그림마다 묻는 선택지의 그림체 · 만화 원고', () => {
  it('그림마다 묻는 선택지의 답은 그림체 · 만화 원고를 먼저 읽고, 나머지는 종전 역할 규칙을 따른다', () => {
    // 왜: "그림체"는 예전 규칙에서 참고 자료 낱말이었다 — 그림마다 묻는 질문에서는 그림체로 읽어야 한다.
    expect(matchImageUseAnswer('그림체로 써 주세요')).toBe('style')
    expect(matchImageUseAnswer('만화 원고로 써 주세요')).toBe('comic')
    expect(matchImageUseAnswer('그림체 참고만')).toBe('reference')
    expect(matchImageUseAnswer('인물')).toBe('character')
    expect(matchImageUseAnswer('참고 자료')).toBe('reference')
  })

  it('그림마다 묻는 질문에는 그림체나 만화 원고를 고르면 그림을 분석 모델로 보낸다는 안내가 있다', () => {
    // 왜: 그림체 분석 · 대본 옮기기는 그림을 분석 모델에 보내는 일이다 — 고르는 자리에서 알린다.
    chat.getState().offerImageRoles([LOOK], { typed: '', msg: '그림을 올렸어요' })
    expect(chat.getState().suggestion?.content).toMatch(/분석 모델/)
  })

  it('채팅에 올린 그림을 그림체로 고르면 매체를 고르고 그림체로 고정한 뒤 그림체 분석기로 분석한다', async () => {
    // 왜: 새 프로젝트 화면의 그림체와 같은 규칙이다 — 고른 그림체를 바탕으로 작업한다(10/9 오너 결정 A · 고정).
    chat.getState().offerImageRoles([LOOK], { typed: '', msg: '그림을 올렸어요' })
    await answer('그림체로 써 주세요')
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    expect(calls('/api/produce/anchor-medium')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, consent: 'chat-image-role-v1' })
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, lock: true })
    expect(calls('/api/produce/style-facets')[0]).toMatchObject({ consent: 'chat-image-role-v1' })
    expect(producer.getState().customStyleAnchor?.locked).toBe(true)
  })

  it('웹툰 원고와 그림체 그림을 함께 올려 그림마다 고르면 대본은 원고에서 옮기고 그림체는 고른 그림으로 정하며, 만화 그림체는 묻지 않는다', async () => {
    // 왜: 웹툰을 원작으로 하되 그림체는 다른 그림으로 바꾸는 경우(10/10 오너).
    chat.getState().offerImageRoles([P1, P2, LOOK], { typed: '', msg: '그림을 올렸어요' })
    await answer('그림마다 정할게')
    await answer('만화 원고로 써 주세요')
    await answer('만화 원고로 써 주세요')
    await answer('그림체로 써 주세요')
    await vi.waitFor(() => expect(calls('/api/produce/comic-script')).toHaveLength(1))
    expect(calls('/api/produce/comic-script')[0].pages.map((p: { name: string }) => p.name)).toEqual(['comic_1.webp', 'comic_2.webp'])
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, lock: true })
    expect(chat.getState().comicStyleGate).toBeNull()
  })

  it('그림마다 고를 때 만화 원고만 있고 그림체 그림이 없으면 그림체를 고정할지 각색할지 이어서 묻는다', async () => {
    // 왜: 만화 원고를 고르면 그림체를 정해야 한다 — 새 프로젝트 · 묶음 질문과 같다(10/9 오너).
    chat.getState().offerImageRoles([P1, P2], { typed: '', msg: '그림을 올렸어요' })
    await answer('그림마다 정할게')
    await answer('만화 원고로 써 주세요')
    await answer('만화 원고로 써 주세요')
    expect(calls('/api/produce/comic-script')).toHaveLength(0)
    const s = chat.getState().suggestion
    expect(s?.action?.kind === 'choices' ? s.action.options.map((o) => o.label) : []).toEqual(['만화 그림체로 고정', '실사 등 다른 스타일로 각색'])
    await answer('실사 같은 다른 스타일로 각색해 줘')
    await vi.waitFor(() => expect(calls('/api/produce/comic-script')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(useChatUiStore.getState().stylePickerRequest?.projectId).toBe('proj-1')
  })

  it('그림마다 고를 때 두 번째 그림을 그림체로 고르면 앞의 그림체 그림은 참고 자료로 바뀐다', async () => {
    // 왜: 그림체 그림은 프로젝트에 한 장이다 — 새 프로젝트 화면과 같은 규칙.
    chat.getState().offerImageRoles([LOOK, LOOK2], { typed: '', msg: '그림을 올렸어요' })
    await answer('그림마다 정할게')
    await answer('그림체로 써 주세요')
    await answer('그림체로 써 주세요')
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0].imageUrl).toBe(LOOK2.thumbUrl)
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0].attachmentImageUrls).toEqual(LOOK.sliceUrls)
  })

  it('그림 한 장과 함께 "이 그림체로"라고 쓰면 묻지 않고 그 그림을 그림체로 정한다', async () => {
    // 왜: 말이 분명하면 묻지 않는다(인물 · 배경과 같은 규칙). 그림체는 한 장이라 여러 장이면 묻는다.
    expect(matchImageUseInText('이 그림체로 해줘')).toBe('style')
    expect(matchImageUseInText('이 인물로 써줘')).toBe('character')
    chat.getState().offerImageRoles([LOOK], { typed: '이 그림체로 해줘', msg: '이 그림체로 해줘' })
    expect(chat.getState().imageRoleGate).toBeNull()
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: LOOK.thumbUrl, lock: true })
  })

  it('그림체가 고정된 프로젝트에서는 채팅으로 올린 그림을 그림체로 골라도 바꾸지 않고 알린다', async () => {
    // 왜: 고정된 그림체는 바꿀 수 없다(10/9 오너).
    producer.setState({ styleAnchorKey: 'custom_fixed', customStyleAnchor: { url: `${MEDIA}/fixed/original.webp`, label: '내 그림체', medium: '2d_anime', locked: true } })
    chat.getState().offerImageRoles([LOOK], { typed: '', msg: '그림을 올렸어요' })
    await answer('그림체로 써 주세요')
    await vi.waitFor(() => expect(chat.getState().messages.some((m) => m.role === 'model' && /그대로 둘게요/.test(m.content))).toBe(true))
    expect(calls('/api/produce/style-anchor')).toHaveLength(0)
    expect(producer.getState().styleAnchorKey).toBe('custom_fixed')
  })
})

describe('처음 인사가 떠 있을 때', () => {
  it('처음 인사가 떠 있는 새 프로젝트에서도 그림을 올리면 쓰임새 질문이 뜨고, 처음 인사 문장은 채팅에 남는다', () => {
    // 왜: 10/10 로컬 시험 — 빈 새 프로젝트에서 그림을 올렸더니 닫을 수 없는 처음 인사가 자리를 차지해 질문이 뜨지 않았다(올린 그림이 대답 없이 멈춤).
    chat.getState().offerSuggestion({ id: 'producer-welcome:proj-1', stage: 'producer', content: '안녕하세요! 저는 프로듀서예요.', action: null, dismissible: false })
    chat.getState().offerImageRoles([LOOK], { typed: '', msg: '그림을 올렸어요' })
    const s = chat.getState().suggestion
    expect(s?.id).toBe(`image-role:${LOOK.id}`)
    expect(chat.getState().messages.some((m) => m.content === '안녕하세요! 저는 프로듀서예요.')).toBe(true)
  })

  it('씬 스토리 확정처럼 버튼이 있는 닫을 수 없는 단계는 그림 질문이 밀어내지 않는다', () => {
    // 정상 경로 고정 — 확정 같은 단계는 사용자가 꼭 답해야 한다.
    chat.getState().offerSuggestion({ id: 'scene-gate:proj-1', stage: 'producer', content: '씬 스토리를 확정해 주세요.', action: { kind: 'confirmScenes', label: '확정' }, dismissible: false })
    chat.getState().offerImageRoles([LOOK], { typed: '', msg: '그림을 올렸어요' })
    expect(chat.getState().suggestion?.id).toBe('scene-gate:proj-1')
  })
})
