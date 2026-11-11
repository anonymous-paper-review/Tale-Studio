// 시작 화면에서 만화 쪽을 그대로로 시작한 프로젝트는 Writer 산문이 나온 뒤 채팅에서 그림체를 칩으로 묻고, 고정이면 시작 때 올린 쪽으로 그림체를 정하는지 검사한다 (오너 2026-11-11)
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
import { choiceSuggestionMarker } from '@/lib/chat-blocks'
import { comicStyleQuestion } from '@/lib/producer/comic-intake'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
// 시작 화면에서 올린 만화 1쪽 — 서버가 시작 화면 읽기에 돌려주는 모양.
const START_PAGE = { name: 'comic_1.png', thumbUrl: `${MEDIA}/u1/original.png`, sliceUrls: [`${MEDIA}/u1/s000.jpg`, `${MEDIA}/u1/s001.jpg`] }
const SCRIPT = 'S#1. ROOM - DAY\nMAN: Hi.\nWOMAN: Hey.'
const QID = 'start-comic-style:proj-1'

let fetchMock: ReturnType<typeof vi.fn>
let comicStart: typeof START_PAGE | null
let history: unknown[] = []
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
function stub() {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url.startsWith('/api/produce/entry?')) return Response.json({ draft: {}, comicStart })
    if (url === '/api/project/proj-1/messages') return Response.json({ messages: history })
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_comic', imageUrl: body.imageUrl, label: body.label, medium: body.medium, ...(body.lock ? { locked: true } : {}) })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    if (url === '/api/writer/prose-confirm') return Response.json({ ok: true })
    if (url === '/api/writer/scene-gate') return Response.json({ proposalId: 'proposal-1' })
    if (url === '/api/produce/chat') return Response.json({ reply: 'Okay.' })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const send = (text: string) => chat.getState().sendMessage(text)
const question = () => chat.getState().suggestion
const labels = () => { const s = question(); return s?.action?.kind === 'choices' ? s.action.options.map((o) => o.label) : [] }
const said = (pattern: RegExp) => chat.getState().messages.some((m) => m.role === 'model' && pattern.test(m.content))
const lastModel = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''

beforeEach(() => {
  history = []
  comicStart = START_PAGE
  localStorage.clear()
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  // Writer 화면(확정 전) — 시작 화면에서 만화 쪽을 그대로로 시작해 산문은 옮긴 대본(대본 그대로)이다.
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', treatmentDraft: true, producerLocked: false, projectLocale: 'en', projectLocaleLocked: true })
  producer.setState({ storyText: SCRIPT, preserveScript: true })
  chat.setState({ messagesLoadedProjectId: 'proj-1' })
  useLocaleStore.setState({ locale: 'en' })
  stub()
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('만화 쪽 그대로 시작 뒤 그림체 묻기', () => {
  // 왜: 시작 화면에서 만화 쪽을 그대로로 시작하면 그림체를 묻지 않았고, 확정 뒤에는 그 만화 그림체를 쓸 길이 없었다.
  //   오너 결정(11/11 밤): 시작한 뒤 Writer 채팅에서 채팅 길과 같은 그림체 질문을 칩으로 묻는다 — 새 화면 없이.
  it('시작 화면에서 만화 쪽을 그대로로 시작한 프로젝트는 Writer 산문이 나오면 채팅에서 만화 그림체를 고정할지 각색할지 칩으로 묻는다', async () => {
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
    expect(question()).toMatchObject({ id: QID, stage: 'producer', dismissible: false, content: comicStyleQuestion('en').content })
    expect(labels()).toEqual(['Fix the comic art style', 'Adapt to another style like live action', 'Never mind'])
    // 한국어 프로젝트면 채팅 길의 한국어 문구 그대로 묻는다.
    chat.getState().reset()
    chat.setState({ messagesLoadedProjectId: 'proj-1' })
    project.setState({ projectLocale: 'ko' })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
    expect(question()?.content).toBe(comicStyleQuestion('ko').content)
    expect(labels()).toEqual(['만화 그림체로 고정', '실사 등 다른 스타일로 각색', '그만두기'])
  })

  // 왜: 채팅 길의 "만화 그림체로 고정"과 같은 그림체 등록 · 고정 · 분석이다. 시작 때 올린 쪽은 저장돼 있어 다시 올리지 않는다.
  //   대본은 시작할 때 이미 옮겼다 — 다시 옮기지 않는다(혼자 정한 것).
  it('그림체 질문에 고정을 고르면 시작 때 올린 쪽으로 채팅 길과 같이 그림체를 정해 고정하고 분석하며, 대본은 다시 옮기지 않는다', async () => {
    await chat.getState().offerStartComicStyle('proj-1')
    await send('Keep the comic art style and fix it')
    await vi.waitFor(() => expect(calls('/api/produce/style-facets')).toHaveLength(1))
    expect(calls('/api/produce/anchor-medium')[0]).toMatchObject({ projectId: 'proj-1', imageUrl: START_PAGE.thumbUrl })
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ projectId: 'proj-1', imageUrl: START_PAGE.thumbUrl, lock: true })
    expect(producer.getState().styleAnchorKey).toBe('custom_comic')
    expect(producer.getState().customStyleAnchor).toMatchObject({ url: START_PAGE.thumbUrl, locked: true })
    expect(chat.getState().messages.some((m) => m.role === 'user' && m.content === 'Keep the comic art style and fix it')).toBe(true)
    await vi.waitFor(() => expect(said(/Finished analyzing the art style/)).toBe(true))
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(calls('/api/writer/start')).toEqual([])
    expect(calls('/api/writer/scene-gate')).toEqual([])
    expect(question()?.id ?? '').not.toBe(QID)
  })

  // 왜: 각색 · 그만두기는 지금처럼 Artist [만들기]의 스타일 창에서 고른다. 그만두기의 채팅 길 문구("만화 원고는 쓰지 않았다")는 여기선 틀린 말이라 따로 말한다(혼자 정한 것).
  it('각색이나 그만두기를 고르면 그림체를 정하지 않고 Artist 에서 고르게 한다', async () => {
    await chat.getState().offerStartComicStyle('proj-1')
    await send('Adapt it to another style like live action')
    expect(lastModel()).toBe("I won't use the comic art style. Choose the style to make it in.")
    chat.getState().reset()
    chat.setState({ messagesLoadedProjectId: 'proj-1' })
    await chat.getState().offerStartComicStyle('proj-1')
    await send("Don't use the comic")
    expect(lastModel()).toBe("Okay, I won't set the art style now. You can pick it in Artist when you make the images.")
    expect(calls('/api/produce/anchor-medium')).toEqual([])
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(producer.getState().customStyleAnchor ?? null).toBeNull()
  })

  // 왜(혼자 정한 것): 한 번만 묻는다 — 이미 답했으면(채팅에 그 답이 남아 있음) 다시 묻지 않는다. 확정한 뒤 · 서버가 물을 것 없다고 하면(다듬기 · 만화 아님 · 그림체 있음) 묻지 않는다.
  it('이미 답했거나 산문을 확정했거나 물을 만화 쪽이 없으면 그림체를 다시 묻지 않는다', async () => {
    chat.setState({ messages: [{ id: 'm1', stage: 'producer', role: 'user', content: "Don't use the comic" }] })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    chat.setState({ messages: [] })
    project.setState({ producerLocked: true })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    project.setState({ producerLocked: false })
    comicStart = null
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()).toBeNull()
    comicStart = START_PAGE
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
  })

  // 왜(혼자 정한 것): 새로 고치면 채팅의 질문은 칩만 돌아온다. 이 질문의 그림(시작 때 올린 쪽)은 저장돼 있으니 "다시 올려 주세요"가 아니라 같은 질문을 산 칩으로 다시 묻는다.
  it('새로 고침 뒤에도 답하지 않았으면 같은 질문을 산 칩으로 다시 묻고, 시작 때 올린 쪽을 다시 올려 달라고 하지 않는다', async () => {
    history = [{ stage: 'producer', role: 'model', content: choiceSuggestionMarker({ id: QID, stage: 'producer', content: comicStyleQuestion('en').content, labels: comicStyleQuestion('en', { stop: true }).options.map((o) => o.label) }) }]
    chat.getState().reset()
    await chat.getState().loadMessages('proj-1')
    expect(question()?.restoredChoices).toBeDefined()
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
    expect(question()).toMatchObject({ id: QID, action: { kind: 'choices' } })
    expect(question()?.restoredChoices).toBeUndefined()
    await send('Fix the comic art style')
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: START_PAGE.thumbUrl, lock: true })
    expect(said(/cleared when the page reloaded/)).toBe(false)
  })

  // 왜(혼자 정한 것): 새로 고친 바로 뒤 화면이 서버를 읽는 사이(질문이 다시 서기 전)에 돌아온 칩을 누르면 그 말이 산문 고침으로 샜다 — 질문을 먼저 다시 세우고 그 답으로 받는다.
  it('새로 고친 바로 뒤 질문이 다시 서기 전에 돌아온 칩으로 답해도 산문 고침으로 보내지 않고 시작 때 올린 쪽으로 그림체를 정한다', async () => {
    history = [{ stage: 'producer', role: 'model', content: choiceSuggestionMarker({ id: QID, stage: 'producer', content: comicStyleQuestion('en').content, labels: comicStyleQuestion('en', { stop: true }).options.map((o) => o.label) }) }]
    chat.getState().reset()
    await chat.getState().loadMessages('proj-1')
    expect(question()?.restoredChoices).toBeDefined()
    await send('Fix the comic art style')
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: START_PAGE.thumbUrl, lock: true })
    expect(calls('/api/writer/scene-gate')).toEqual([])
    expect(calls('/api/produce/chat')).toEqual([])
    expect(said(/cleared when the page reloaded/)).toBe(false)
  })

  // 왜(혼자 정한 것): Writer 화면의 다른 그림 질문과 같다 — 칩 말이 아닌 말이 질문의 답으로 잡히거나 산문 고침으로 새지 않게 다시 묻는다.
  it('그림체 질문이 떠 있는 동안 칩 말이 아닌 말은 산문 고침으로 보내지 않고 다시 묻는다', async () => {
    await chat.getState().offerStartComicStyle('proj-1')
    await send('Make the ending happier')
    expect(calls('/api/writer/scene-gate')).toEqual([])
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(question()?.id).toBe(QID)
    expect(lastModel()).toMatch(/^Please choose first how the art style should work/)
  })

  // 왜(혼자 정한 것): 답하지 않고 확정해도 막지 않는다 — 그림체는 지금처럼 Artist 에서 고른다. 확정한 뒤에는 묻지 않으니 질문을 거둔다.
  it('답하지 않고 산문을 확정해도 막지 않고, 확정하면 그림체 질문을 거둔다', async () => {
    await chat.getState().offerStartComicStyle('proj-1')
    expect((await chat.getState().confirmProse()).ok).toBe(true)
    expect(calls('/api/writer/prose-confirm')).toHaveLength(1)
    expect(chat.getState().startComicStyleGate).toBeNull()
    expect(question()?.id ?? '').not.toBe(QID)
  })
})
