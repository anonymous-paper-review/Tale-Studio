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
import type { CastMember } from '@/lib/producer-gate'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
// 시작 화면에서 올린 만화 1쪽 — 서버가 시작 화면 읽기에 돌려주는 모양.
const START_PAGE = { name: 'comic_1.png', thumbUrl: `${MEDIA}/u1/original.png`, sliceUrls: [`${MEDIA}/u1/s000.jpg`, `${MEDIA}/u1/s001.jpg`] }
const SCRIPT = 'S#1. ROOM - DAY\nMAN: Hi.\nWOMAN: Hey.'
const QID = 'start-comic-style:proj-1'
// 시작한 뒤 Writer 채팅 [+]로 올리는 그림 — 인물 사진 · 나머지 만화 쪽.
const img = (name: string) => ({ id: name, name, thumbUrl: `${MEDIA}/${name}/original.webp`, sliceUrls: [`${MEDIA}/${name}/s000.jpg`] })
const PERSON = img('ref-person.png'), PAGE2 = img('comic_2.png'), PAGE3 = img('comic_3.png')
const NEW_SCRIPT = 'S#2. STREET - NIGHT\nMAN: Wait.\nWOMAN: No.'
// 산문(옮긴 대본)이 부른 인물 카드 — 이 시험을 위해 지은 이름이다.
const MAN: CastMember = { localId: 'cast-man', name: 'Man', entityType: 'person', appearance: 'A young man in a T-shirt', origin: 'treatment', userEdited: false }

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
    if (url === '/api/produce/comic-script') return Response.json({ script: NEW_SCRIPT, stats: { scenes: 1, dialogue_lines: 2 } })
    if (url === '/api/writer/start') return Response.json({ runId: 'run-2' })
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
  //   각색도 어디서 고르는지 말한다 — 채팅 길 문구("만들 스타일을 골라 주세요")만으로는 어디서 고르는지 몰랐다(검토 a 낮음 3).
  it('각색이나 그만두기를 고르면 그림체를 정하지 않고 Artist 에서 고르게 한다', async () => {
    await chat.getState().offerStartComicStyle('proj-1')
    await send('Adapt it to another style like live action')
    expect(lastModel()).toBe("I won't use the comic art style. Pick the style in Artist when you make the images.")
    chat.getState().reset()
    chat.setState({ messagesLoadedProjectId: 'proj-1' })
    await chat.getState().offerStartComicStyle('proj-1')
    await send("Don't use the comic")
    expect(lastModel()).toBe("Okay, I won't set the art style now. You can pick it in Artist when you make the images.")
    // 한국어 프로젝트도 그림을 만들 때 Artist 에서 고르라고 말한다.
    project.setState({ projectLocale: 'ko' })
    const ko = comicStyleQuestion('ko', { stop: true }).options
    for (const [answer, reply] of [
      [ko[1].utterance, '만화 그림체는 쓰지 않을게요. 그림을 만들 때 Artist에서 스타일을 골라 주세요.'],
      [ko[2].utterance, '알겠어요. 그림체는 지금 정하지 않을게요. 그림을 만들 때 Artist에서 골라 주세요.'],
    ]) {
      chat.getState().reset()
      chat.setState({ messagesLoadedProjectId: 'proj-1' })
      await chat.getState().offerStartComicStyle('proj-1')
      await send(answer)
      expect(lastModel(), answer).toBe(reply)
    }
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

  // 왜: 검토 a 낮음 2 — "이미 답했나"를 칩 낱말로 가리면 질문과 상관없는 짧은 말(취소 · 그만 · keep)에도 걸려 영영 묻지 않았다.
  //   저장 형식은 그대로 두고 그 질문의 답만 알아본다: 칩이 보내는 문장, 또는 그 답에 Writer 가 한 말. 짧게 쳐서 답해도 Writer 의 대답 말로 알아본다(혼자 정한 것).
  it('이미 답했는지는 그림체 질문의 답(칩 말 · 그 답에 Writer 가 한 말)으로만 보고, 질문과 상관없는 짧은 말(취소 · 그만 · keep)은 답으로 보지 않는다', async () => {
    chat.setState({ messages: [
      { id: 'u1', stage: 'producer', role: 'user', content: '취소' },
      { id: 'm1', stage: 'producer', role: 'model', content: 'Cancelled the pending change. Nothing was executed.' },
      { id: 'u2', stage: 'producer', role: 'user', content: 'keep' },
      { id: 'u3', stage: 'producer', role: 'user', content: '그만' },
    ] })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
    expect(question()?.id).toBe(QID)
    // 짧게 쳐서 답했다(각색) — 새로 고친 뒤 같은 채팅이 돌아와도 다시 묻지 않는다.
    await send('adapt')
    expect(lastModel()).toBe("I won't use the comic art style. Pick the style in Artist when you make the images.")
    const answered = chat.getState().messages
    chat.getState().reset()
    chat.setState({ messagesLoadedProjectId: 'proj-1', messages: answered })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
  })
})

describe('시작 그림체 질문이 떠 있을 때 채팅으로 그림을 더 올리면', () => {
  beforeEach(async () => {
    producer.setState({ cast: [MAN] })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
  })

  // 왜: 검토 a 보통 1(O1) — 시작 질문(닫을 수 없음)이 자리를 지켜 쓰임새 질문 · 어느 인물 질문이 뜨지 못했고, 누른 답은 보이지 않는 시작 질문이 받았다.
  //   여러 쪽 만화는 1쪽으로 시작하고 나머지 쪽 · 인물 사진을 Writer 채팅 [+]로 올리게 되는 흔한 길이다. 답은 늘 지금 보이는 질문이 받는다.
  it('시작 그림체 질문이 떠 있을 때 채팅으로 인물 사진을 올리면 그 사진의 쓰임새 질문과 어느 인물 질문이 차례로 뜨고, 답은 보이는 질문이 받는다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: '', msg: 'Uploaded ref-person.png' })
    expect(question()?.id).toBe(`image-role:${PERSON.id}`)
    await send('Use it as a character')
    expect(question()?.id).toBe(`image-character:${PERSON.id}`)
    expect(labels()).toContain('Man')
    await send('This is Man')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(producer.getState().cast.find((c) => c.localId === 'cast-man')?.sourceImageUrl).toBe(PERSON.thumbUrl)
    expect(said(/Please choose first how the art style should work/)).toBe(false)
    expect(calls('/api/produce/anchor-medium')).toEqual([])
    expect(calls('/api/produce/style-anchor')).toEqual([])
  })

  // 왜: 검토 a 보통 1(O2) — 만화 쪽을 더 올리면 다시 쓰기 질문과 시작 질문이 꼬였다.
  it('시작 그림체 질문이 떠 있을 때 채팅으로 만화 쪽을 더 올리면 산문을 만화로 다시 쓸지 묻는 질문이 뜨고, 참고로만을 고르면 그 질문이 받아 만화를 참고 자료로 보낸다', async () => {
    chat.getState().offerImageRoles([PAGE2], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
    expect(question()?.id ?? '').toMatch(/^comic-rewrite:/)
    await send('Use the comic only as reference')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0]).toMatchObject({ attachmentImageUrls: PAGE2.sliceUrls })
    expect(said(/Please choose first how the art style should work/)).toBe(false)
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(calls('/api/produce/style-anchor')).toEqual([])
  })

  // 왜: 검토 a 보통 1(O3) — 나머지 쪽을 올려 [다시 쓰기] → 새 만화의 그림체 질문에서 [고정]을 누르면 숨은 시작 질문이 답을 받아
  //   그림체가 시작 때 쪽으로 고정되고 새 만화 옮기기는 시작되지 않았다. 고정은 채팅 길 그대로 — 새로 올린 첫 쪽이 그림체다.
  it('시작 그림체 질문이 떠 있을 때 나머지 만화 쪽을 올려 다시 쓰기를 고르면 그 만화의 그림체 질문이 뜨고, 고정을 고르면 새로 올린 쪽을 옮기고 그 첫 쪽으로 그림체를 정한다', async () => {
    chat.getState().offerImageRoles([PAGE2, PAGE3], { typed: '', msg: 'Uploaded pictures' })
    expect(question()?.id ?? '').toMatch(/^image-batch:/)
    await send('Turn my comic pages into video exactly as drawn')
    expect(question()?.id ?? '').toMatch(/^comic-rewrite:/)
    await send('Rewrite the prose from the comic')
    expect(question()?.id ?? '').toMatch(/^comic-style:/)
    await send('Keep the comic art style and fix it')
    await vi.waitFor(() => expect(calls('/api/writer/start')).toHaveLength(1))
    expect(calls('/api/produce/comic-script')).toHaveLength(1)
    expect(calls('/api/produce/comic-script')[0].pages.map((p: { name: string }) => p.name)).toEqual([PAGE2.name, PAGE3.name])
    expect(calls('/api/writer/start')[0]).toMatchObject({ story: NEW_SCRIPT, restartDraft: true, preserveScript: true })
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: PAGE2.thumbUrl, lock: true })
    expect(said(/Please choose first how the art style should work/)).toBe(false)
    // 새 만화의 그림체 질문에 답했다 — 시작 그림체 질문은 다시 묻지 않는다.
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
  })

  // 왜: 검토 a 낮음(R10) — 쓰임새를 말에 담아 올리면 묻지 않고 바로 쓰는 길이라 그림 질문이 서지 않아 시작 질문이 자리를 지켰고,
  //   참고 자료로 보낸 말을 시작 질문이 받아 "그림체를 먼저 골라 주세요"로 되묻고 사진은 모델에 가지 않았다. 그림을 올리면 늘 자리를 내준다.
  it('시작 그림체 질문이 떠 있을 때 참고 자료라고 말에 담아 그림을 올리면 시작 질문이 자리를 내주고 그림과 말이 채팅으로 가며, 끝나면 시작 질문을 다시 묻는다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: 'Use it as a reference', msg: 'Use it as a reference' })
    expect(question()?.id ?? '').not.toBe(QID)
    expect(chat.getState().startComicStyleGate).toBeNull()
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0]).toMatchObject({ message: 'Use it as a reference', attachmentImageUrls: PERSON.sliceUrls })
    expect(said(/Please choose first how the art style should work/)).toBe(false)
    await vi.waitFor(() => expect(chat.getState().loading).toBe(false))
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
    expect(question()?.id).toBe(QID)
  })

  // 왜: 검토 a 낮음(R11) — 그림체로 쓰라고 말에 담아 올리면 그 사진으로 그림체가 정해졌는데 시작 질문이 그대로 떠 있었고, [고정]을 누르면 시작 쪽으로 바뀌었다.
  //   그림체를 정했으면 시작 질문은 다시 묻지 않는다.
  it('시작 그림체 질문이 떠 있을 때 그림체로 쓰라고 말에 담아 그림을 올리면 시작 질문이 자리를 내주고 그 그림으로 그림체를 정하며, 시작 질문은 다시 묻지 않는다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: 'Use it as the art style', msg: 'Use it as the art style' })
    expect(question()?.id ?? '').not.toBe(QID)
    expect(chat.getState().startComicStyleGate).toBeNull()
    await vi.waitFor(() => expect(producer.getState().customStyleAnchor).toMatchObject({ url: PERSON.thumbUrl, locked: true }))
    expect(calls('/api/produce/style-anchor')).toHaveLength(1)
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: PERSON.thumbUrl, lock: true })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()?.id ?? '').not.toBe(QID)
  })

  // 왜: 검토 a 낮음(R3b) — 채팅으로 더 올린 만화의 그림체 질문에서 [그만두기]를 고르면 새로 올린 쪽을 쓰지 않겠다는 답인데,
  //   시작 질문에 답한 것으로 세어 시작 쪽 그림체를 다시 묻지 않았다. 그 칩 말과 바로 뒤 Writer 말("만화 원고는 쓰지 않았어요")은 세지 않는다.
  it('채팅으로 더 올린 만화의 그림체 질문에서 그만두기를 고르면 시작 그림체 질문에 답한 것으로 세지 않고 다시 묻는다', async () => {
    chat.getState().offerImageRoles([PAGE2], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
    await send('Rewrite the prose from the comic')
    expect(question()?.id ?? '').toMatch(/^comic-style:/)
    await send("Don't use the comic")
    expect(lastModel()).toBe('Stopped. I did not use the comic pages, and the prose is unchanged.')
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
    expect(question()?.id).toBe(QID)
  })

  // 왜: 다른 그림 질문에 자리를 내준 시작 질문은 답하지 않은 것으로 남는다 — 그 질문이 끝나면 Writer 화면이 다시 부르고 다시 묻는다(검토 a 보통 1 방향).
  it('다른 그림 질문이 끝나면 시작 그림체 질문을 다시 묻고, 그 답은 시작 질문이 받는다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: '', msg: 'Uploaded ref-person.png' })
    // 다른 그림 질문이 떠 있는 동안은 다시 묻지 않는다.
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()?.id).toBe(`image-role:${PERSON.id}`)
    await send('Use it as a character')
    await send('This is Man')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    await vi.waitFor(() => expect(chat.getState().loading).toBe(false))
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(true)
    expect(question()?.id).toBe(QID)
    await send('Keep the comic art style and fix it')
    await vi.waitFor(() => expect(calls('/api/produce/style-anchor')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')[0]).toMatchObject({ imageUrl: START_PAGE.thumbUrl, lock: true })
  })
})
