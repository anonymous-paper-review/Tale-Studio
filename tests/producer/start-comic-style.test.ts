// 시작 화면에서 만화 쪽을 그대로로 시작한 프로젝트도 Writer 채팅에서 그림체를 묻지 않고, 시작 때 올린 쪽으로 그림체를 정하지 않는지 검사한다 (오너 2026-11-11 → 그림체 추출은 D6 2026-11-22 로 없앰)
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
import type { CastMember } from '@/lib/producer-gate'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
// 시작 화면에서 올린 만화 1쪽 — 서버가 시작 화면 읽기에 돌려주는 모양.
const START_PAGE = { name: 'comic_1.png', thumbUrl: `${MEDIA}/u1/original.png`, sliceUrls: [`${MEDIA}/u1/s000.jpg`, `${MEDIA}/u1/s001.jpg`] }
const SCRIPT = 'S#1. ROOM - DAY\nMAN: Hi.\nWOMAN: Hey.'
const QID = 'start-comic-style:proj-1'
// D6 전에 묻던 그림체 질문(새로 고침 뒤 칩만 돌아오는 예전 기록) — 지금은 묻지 않는다.
const OLD_QUESTION = { content: 'How should the art style work? If you keep the comic art style, it is fixed and cannot be changed later.', labels: ['Fix the comic art style', 'Adapt to another style like live action', 'Never mind'] }
const NO_STYLE_FROM_PICTURE = "I can't take an art style from a picture. Pick one of the four styles (Live Action, 2D Japanese Anime, Watercolor, Stop Motion) in the style window in Artist when you make the images."
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

describe('만화 쪽 그대로 시작 뒤에도 그림체는 묻지 않는다', () => {
  // 왜: 오너 D6(2026-11-22) "웹툰이나 이미지 입력받았을 때 스타일 추출하는 기능도 없애줘" — 11/11 에 더한 시작 만화 그림체 질문(고정 · 각색 · 그만두기)은 이제 서지 않는다.
  //   그림체는 그림을 만들 때 Artist 스타일 창에서 네 가지 중 고른다.
  it('시작 화면에서 만화 쪽을 그대로로 시작한 프로젝트도 Writer 산문이 나온 뒤 채팅에서 만화 그림체를 묻지 않는다', async () => {
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()).toBeNull()
    project.setState({ projectLocale: 'ko' })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()).toBeNull()
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/produce/entry?'))).toBe(false)
  })

  it('시작 화면에서 만화 쪽을 그대로로 시작한 프로젝트는 시작 때 올린 쪽으로 그림체를 정하지 않고 분석 모델도 부르지 않는다', async () => {
    // 왜: 그림에서 그림체를 뽑는 길이 없어졌다(D6) — 예전 칩 말을 쳐도 그림체가 정해지면 안 된다.
    await chat.getState().offerStartComicStyle('proj-1')
    await send('Keep the comic art style and fix it')
    expect(calls('/api/produce/anchor-medium')).toEqual([])
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(calls('/api/produce/style-facets')).toEqual([])
    expect(producer.getState().customStyleAnchor ?? null).toBeNull()
    expect(calls('/api/produce/comic-script')).toEqual([])
  })

  it('예전 그림체 질문의 칩 말(각색 · 그만두기)을 쳐도 그림체 답으로 받지 않고 Writer 가 그림체 답을 하지 않는다', async () => {
    // 왜: 질문이 없으니 답도 없다(D6) — 예전 "만화 그림체는 쓰지 않을게요" 같은 답이 남으면 질문이 있었던 것처럼 보인다.
    await chat.getState().offerStartComicStyle('proj-1')
    await send('Adapt it to another style like live action')
    await send("Don't use the comic")
    const replies = chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
    expect(replies).not.toContain("I won't use the comic art style. Pick the style in Artist when you make the images.")
    expect(replies).not.toContain("Okay, I won't set the art style now. You can pick it in Artist when you make the images.")
    expect(calls('/api/produce/style-anchor')).toEqual([])
  })

  it('확정 전이든 뒤든, 시작 때 올린 만화 쪽이 있든 없든 시작 그림체 질문은 서지 않는다', async () => {
    // 왜: 묻던 조건(확정 전 · 만화 쪽 있음 · 아직 안 답함)을 다 갖춰도 이제 묻지 않는다(D6).
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    project.setState({ producerLocked: true })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    project.setState({ producerLocked: false })
    comicStart = null
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()).toBeNull()
  })

  it('새로 고침 뒤 예전 그림체 질문의 칩이 돌아와도 산 질문으로 다시 묻지 않는다', async () => {
    // 왜: D6 전에 저장된 질문 기록은 칩만 돌아온다 — 질문이 없어졌으니 다시 살리지 않는다.
    history = [{ stage: 'producer', role: 'model', content: choiceSuggestionMarker({ id: QID, stage: 'producer', content: OLD_QUESTION.content, labels: OLD_QUESTION.labels }) }]
    chat.getState().reset()
    await chat.getState().loadMessages('proj-1')
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()?.action?.kind === 'choices').toBe(false)
  })

  it('새로 고친 바로 뒤 돌아온 예전 그림체 칩으로 답해도 시작 때 올린 쪽으로 그림체를 정하지 않고, 그림체는 Artist 에서 고른다고 답한다', async () => {
    // 왜: 예전 기록의 칩을 눌러도 그림체 추출이 다시 살아나면 안 된다(D6). 칩 말이 산문 고침으로 새면 "Fix the comic art style"로 산문을 고치려 든다 —
    //   고르는 곳만 한 줄로 알린다(혼자 정한 것, 되돌리기 쉬움).
    history = [{ stage: 'producer', role: 'model', content: choiceSuggestionMarker({ id: QID, stage: 'producer', content: OLD_QUESTION.content, labels: OLD_QUESTION.labels }) }]
    chat.getState().reset()
    await chat.getState().loadMessages('proj-1')
    await send('Fix the comic art style')
    expect(calls('/api/produce/anchor-medium')).toEqual([])
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(producer.getState().customStyleAnchor ?? null).toBeNull()
    expect(lastModel()).toBe("The comic art style can't be used as is. Pick one of the four styles in the style window in Artist when you make the images.")
    expect(calls('/api/writer/scene-gate')).toEqual([])
    expect(question()?.id ?? '').not.toBe(QID)
  })

  it('그림체 질문이 말을 붙잡지 않아, 칩 말이 아닌 말은 평소대로 산문 고침이 된다', async () => {
    // 왜: 예전에는 떠 있는 그림체 질문이 말을 붙잡고 "먼저 그림체를 골라 주세요"로 되물었다 — 질문이 없으니 산문 고침으로 간다.
    await chat.getState().offerStartComicStyle('proj-1')
    await send('Make the ending happier')
    expect(calls('/api/writer/scene-gate')).toHaveLength(1)
    expect(said(/Please choose first how the art style should work/)).toBe(false)
    expect(calls('/api/produce/style-anchor')).toEqual([])
  })

  it('그림체 질문이 없으니 산문 확정은 지금처럼 바로 된다', async () => {
    // 정상 경로 고정 — 확정은 막지 않는다. 그림체는 확정 뒤 Artist 에서 고른다.
    await chat.getState().offerStartComicStyle('proj-1')
    expect((await chat.getState().confirmProse()).ok).toBe(true)
    expect(calls('/api/writer/prose-confirm')).toHaveLength(1)
    expect(chat.getState().startComicStyleGate).toBeNull()
    expect(question()?.id ?? '').not.toBe(QID)
  })

  it('예전 그림체 질문의 답이 채팅에 남아 있든 없든 시작 그림체 질문은 서지 않는다', async () => {
    // 왜: 예전에는 채팅의 답으로 "이미 답했나"를 가렸다 — 이제 묻지 않으니 채팅 내용과 상관없다(D6).
    chat.setState({ messages: [
      { id: 'u1', stage: 'producer', role: 'user', content: '취소' },
      { id: 'u2', stage: 'producer', role: 'user', content: 'keep' },
    ] })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    chat.setState({ messages: [{ id: 'u3', stage: 'producer', role: 'user', content: 'Keep the comic art style and fix it' }] })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()).toBeNull()
  })
})

describe('만화 쪽 그대로 시작 뒤 채팅으로 그림을 더 올리면', () => {
  beforeEach(async () => {
    producer.setState({ cast: [MAN] })
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
  })

  // 왜: 여러 쪽 만화는 1쪽으로 시작하고 나머지 쪽 · 인물 사진을 Writer 채팅 [+]로 올리게 되는 흔한 길이다(검토 a 보통 1 O1). 답은 보이는 질문이 받는다.
  it('만화 쪽 그대로 시작 뒤 채팅으로 인물 사진을 올리면 그 사진의 쓰임새 질문과 어느 인물 질문이 차례로 뜨고, 그 답대로 카드에 잇는다', async () => {
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

  // 왜: 검토 a 보통 1(O2) — 만화 쪽을 더 올리면 산문을 만화로 다시 쓸지 먼저 묻는다. 참고로만이면 산문은 그대로다.
  it('만화 쪽 그대로 시작 뒤 채팅으로 만화 쪽을 더 올리면 산문을 만화로 다시 쓸지 묻고, 참고로만을 고르면 만화를 참고 자료로 보낸다', async () => {
    chat.getState().offerImageRoles([PAGE2], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
    expect(question()?.id ?? '').toMatch(/^comic-rewrite:/)
    await send('Use the comic only as reference')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0]).toMatchObject({ attachmentImageUrls: PAGE2.sliceUrls })
    expect(said(/Please choose first how the art style should work/)).toBe(false)
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(calls('/api/produce/style-anchor')).toEqual([])
  })

  // 왜: 검토 a 보통 1(O3)의 길 — 나머지 쪽을 올려 [다시 쓰기]를 고르면 새로 올린 쪽을 옮겨 산문을 새로 쓴다. 그림체 질문은 이제 끼지 않는다(D6).
  it('만화 쪽 그대로 시작 뒤 나머지 만화 쪽을 올려 다시 쓰기를 고르면 그림체를 묻지 않고 새로 올린 쪽을 옮겨 산문을 새로 쓰며, 그림체는 정하지 않는다', async () => {
    chat.getState().offerImageRoles([PAGE2, PAGE3], { typed: '', msg: 'Uploaded pictures' })
    expect(question()?.id ?? '').toMatch(/^image-batch:/)
    await send('Turn my comic pages into video exactly as drawn')
    expect(question()?.id ?? '').toMatch(/^comic-rewrite:/)
    await send('Rewrite the prose from the comic')
    expect(question()?.id ?? '').not.toMatch(/^comic-style:/)
    await vi.waitFor(() => expect(calls('/api/writer/start')).toHaveLength(1))
    expect(calls('/api/produce/comic-script')).toHaveLength(1)
    expect(calls('/api/produce/comic-script')[0].pages.map((p: { name: string }) => p.name)).toEqual([PAGE2.name, PAGE3.name])
    expect(calls('/api/writer/start')[0]).toMatchObject({ story: NEW_SCRIPT, restartDraft: true, preserveScript: true })
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
  })

  // 왜: 검토 a 낮음(R10)의 길 — 쓰임새를 말에 담아 올리면 묻지 않고 바로 쓴다. 시작 그림체 질문은 이제 없으니 끝나도 다시 서지 않는다.
  it('만화 쪽 그대로 시작 뒤 참고 자료라고 말에 담아 그림을 올리면 그림과 말이 채팅으로 가고, 시작 그림체 질문은 다시 서지 않는다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: 'Use it as a reference', msg: 'Use it as a reference' })
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0]).toMatchObject({ message: 'Use it as a reference', attachmentImageUrls: PERSON.sliceUrls })
    expect(said(/Please choose first how the art style should work/)).toBe(false)
    await vi.waitFor(() => expect(chat.getState().loading).toBe(false))
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()?.id ?? '').not.toBe(QID)
  })

  // 왜: 검토 a 낮음(R11)의 길 — 그림체로 쓰라고 말에 담아 올려도 그 그림을 그림체로 정하지 않는다(D6). 까닭을 말하고 쓰임새를 묻는다.
  it('만화 쪽 그대로 시작 뒤 그림체로 쓰라고 말에 담아 그림을 올려도 그 그림으로 그림체를 정하지 않고, 그림에서 가져올 수 없다는 까닭과 함께 쓰임새를 묻는다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: 'Use it as the art style', msg: 'Use it as the art style' })
    expect(question()?.id).toBe(`image-role:${PERSON.id}`)
    expect(chat.getState().messages.some((m) => m.role === 'model' && m.content === NO_STYLE_FROM_PICTURE)).toBe(true)
    await new Promise((r) => setTimeout(r, 20))
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(producer.getState().customStyleAnchor ?? null).toBeNull()
  })

  // 왜: 검토 a 낮음(R3b)의 길 — 예전에는 새로 올린 만화의 그림체 질문에 [그만두기]가 있었다. 그림체 질문이 없어져 다시 쓰기를 고르면 바로 옮긴다.
  it('채팅으로 더 올린 만화를 다시 쓰기로 고르면 그림체 질문 없이 바로 옮기고, 그만두기 답도 나오지 않는다', async () => {
    chat.getState().offerImageRoles([PAGE2], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
    await send('Rewrite the prose from the comic')
    expect(question()?.id ?? '').not.toMatch(/^comic-style:/)
    await vi.waitFor(() => expect(calls('/api/produce/comic-script')).toHaveLength(1))
    expect(lastModel()).not.toBe('Stopped. I did not use the comic pages, and the prose is unchanged.')
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
  })

  // 왜: 예전에는 다른 그림 질문이 끝나면 시작 그림체 질문을 다시 물었다 — 이제는 서지 않는다(D6).
  it('다른 그림 질문이 끝나도 시작 그림체 질문은 다시 서지 않는다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: '', msg: 'Uploaded ref-person.png' })
    expect(question()?.id).toBe(`image-role:${PERSON.id}`)
    await send('Use it as a character')
    await send('This is Man')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    await vi.waitFor(() => expect(chat.getState().loading).toBe(false))
    expect(await chat.getState().offerStartComicStyle('proj-1')).toBe(false)
    expect(question()?.id ?? '').not.toBe(QID)
    expect(calls('/api/produce/style-anchor')).toEqual([])
  })
})
