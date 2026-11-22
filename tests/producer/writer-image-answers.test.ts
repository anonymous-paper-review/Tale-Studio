// Writer 화면 채팅의 그림 질문은 칩 말 · 짧은 답만 답으로 받고, 만화를 고르면 그림체 질문 없이 옮기며, 새로 고침 뒤 복원된 질문도 산문 고침으로 빠지지 않는지 검사한다 (그림체 질문은 D6 2026-11-22 로 없앰)
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
import { choiceSuggestionMarker } from '@/lib/chat-blocks'
import { translate } from '@/lib/i18n'
import { matchWriterBatch, matchWriterComicRewrite, matchWriterImageUse } from '@/lib/producer/chip-answer'

const MEDIA = 'https://example.supabase.co/storage/v1/object/public/media/ws-1/proj-1/uploads'
const img = (name: string) => ({ id: name, name, thumbUrl: `${MEDIA}/${name}/original.webp`, sliceUrls: [`${MEDIA}/${name}/s000.jpg`] })
const PERSON = img('ref-person.png'), ROOM = img('bg-classroom.png'), LOOK = img('ref-style-chibi.png'), PAGE1 = img('comic_1.webp'), PAGE2 = img('comic_2.webp')
const OLD_IDEA = 'Two kids fight over a kite and make up.'
const SCRIPT = 'S#1. ROOM - DAY\nMAN: Hi.\nWOMAN: Hey.'
const CLEARED = 'The pictures were cleared when the page reloaded. Please upload them again.'

let fetchMock: ReturnType<typeof vi.fn>
let history: unknown[] = []
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
function stub() {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url === '/api/project/proj-1/messages') return Response.json({ messages: history })
    if (url === '/api/produce/comic-script') return Response.json({ script: SCRIPT, stats: { scenes: 1, dialogue_lines: 2 } })
    if (url === '/api/produce/anchor-medium') return Response.json({ medium: '2d_anime' })
    if (url === '/api/produce/style-anchor') return Response.json({ key: 'custom_new', imageUrl: body.imageUrl, label: body.label, medium: body.medium, ...(body.lock ? { locked: true } : {}) })
    if (url === '/api/produce/style-facets') return Response.json({ ok: true, facets: true, figure: true })
    if (url === '/api/produce/chat') return Response.json({ reply: 'Filled it in.' })
    if (url === '/api/writer/scene-gate') return Response.json({ proposalId: 'proposal-1' })
    if (url === '/api/writer/start') return Response.json({ runId: 'run-2' })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const send = (text: string) => chat.getState().sendMessage(text)
const lastModel = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''
const question = () => chat.getState().suggestion
const choiceLabels = () => {
  const s = question()
  return s?.action?.kind === 'choices' ? s.action.options.map((o) => o.label) : []
}
const nothingRan = () => ({
  comicScript: calls('/api/produce/comic-script').length,
  writerStart: calls('/api/writer/start').length,
  sceneGate: calls('/api/writer/scene-gate').length,
  chat: calls('/api/produce/chat').length,
  styleAnchor: calls('/api/produce/style-anchor').length,
  cards: producer.getState().cast.length + producer.getState().backgrounds.length,
})
const NOTHING = { comicScript: 0, writerStart: 0, sceneGate: 0, chat: 0, styleAnchor: 0, cards: 0 }
// 새로 고침 = 질문 상태 없이 지난 대화(질문 칩 기록 포함)만 다시 읽는다.
async function reloadWith(questionId: string, labels: string[]) {
  chat.getState().reset()
  history = [
    { stage: 'producer', role: 'user', content: 'Uploaded a picture' },
    { stage: 'producer', role: 'model', content: choiceSuggestionMarker({ id: questionId, stage: 'producer', content: 'How should I use this picture?', labels }) },
  ]
  await chat.getState().loadMessages('proj-1')
  expect(question()?.restoredChoices?.options).toEqual(labels)
}

beforeEach(() => {
  history = []
  localStorage.clear()
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  useChatUiStore.setState({ stylePickerRequest: null })
  // Writer 화면(id producer) — 넘기기 전 산문 초안이 있어 말은 산문 고침 요청으로 간다.
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', treatmentDraft: true, producerLocked: false, projectLocale: 'en', projectLocaleLocked: true })
  producer.setState({ storyText: OLD_IDEA, preserveScript: null })
  useLocaleStore.setState({ locale: 'en' })
  stub()
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('Writer 화면의 그림 질문은 칩 말만 답으로 받는다', () => {
  // 왜: 검토 a 보통 2(2026-11-10) — 그림 질문이 떠 있으면 산문 고침 말이 낱말 하나("fix" · "keep" · "background" · "그대로") 때문에 답으로 잡혀
  //   만화를 옮기거나 배경 카드를 만들었다. 오너 답: Writer 화면에서는 칩 말(또는 짧은 답)만 받고, 나머지 말은 아무 일도 하지 않고 다시 묻는다.
  it('Writer 화면 채팅에 그림 질문이 떠 있는 동안 칩 말이 아닌 산문 고침 말을 보내면 아무 일도 하지 않고 같은 질문을 다시 띄운다', async () => {
    // 만화 그림체 질문(고정 · 각색 · 그만두기)은 D6(2026-11-22)로 없어져 그 질문의 줄은 뺐다.
    const probes = [
      { setup: async () => { chat.getState().offerImageRoles([ROOM], { typed: '', msg: 'Uploaded a picture' }) }, text: 'Make the background darker', id: /^image-role:/ },
      { setup: async () => { chat.getState().offerImageRoles([PAGE1, PAGE2], { typed: '', msg: 'Uploaded pictures' }) }, text: '대사는 그대로 두고 줄여줘', id: /^image-batch:/ },
      { setup: async () => { chat.getState().offerImageRoles([PAGE1], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' }) }, text: 'Make the ending happier', id: /^comic-rewrite:/ },
    ]
    for (const probe of probes) {
      chat.getState().reset()
      fetchMock.mockClear()
      await probe.setup()
      const asked = question()?.id ?? ''
      expect(asked, probe.text).toMatch(probe.id)
      await send(probe.text)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(nothingRan(), probe.text).toEqual(NOTHING)
      expect(question()?.id, probe.text).toBe(asked)
      expect(lastModel(), probe.text).toMatch(/^Please choose first/)
      expect(producer.getState().storyText, probe.text).toBe(OLD_IDEA)
    }
  })

  // 왜(혼자 정한 것): 짧은 답 = 칩 낱말 하나(인물 · 배경 · 그림체 · 참고 · 만화 · 다시 쓰기 · 참고로만과 같은 영어 낱말). 그림체는 칩이 없어도 알아듣고 까닭을 말한다(D6).
  //   길이로는 못 가른다 — "Fix the typo in scene 2"도 짧다. 칩 이름(새로 고침 뒤 칩을 눌러 입력칸에 넣은 말)도 답이다.
  it('Writer 화면 채팅의 그림 질문에는 칩 말과 칩 낱말 하나로 된 짧은 답도 답으로 받는다', async () => {
    chat.getState().offerImageRoles([PERSON], { typed: '', msg: 'Uploaded a picture' })
    await send('인물로')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0].cardFill?.kind).toBe('character')
    chat.getState().offerImageRoles([ROOM], { typed: '', msg: 'Uploaded a picture' })
    await send('Background card')
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(2))
    expect(calls('/api/produce/chat')[1].cardFill?.kind).toBe('background')
    expect(calls('/api/writer/scene-gate')).toEqual([])
    // 답 읽기 규칙 — 칩 말 · 칩 낱말은 답, 문장은 답이 아니다.
    expect(matchWriterImageUse('Reference only')).toBe('reference')
    expect(matchWriterImageUse('그림체로 써 주세요')).toBe('style')
    expect(matchWriterImageUse('Make the background darker')).toBeNull()
    expect(matchWriterBatch('그림마다')).toBe('each')
    expect(matchWriterBatch('대사는 그대로 두고 줄여줘')).toBeNull()
    expect(matchWriterComicRewrite('참고로만')).toBe('reference')
    expect(matchWriterComicRewrite('다시 쓰기')).toBe('rewrite')
    expect(matchWriterComicRewrite('Rewrite the ending')).toBeNull()
  })

  // 왜: 예전에는 채팅 모델이 "이 그림을 그림체로 쓸까요?"를 물었고, 그동안 "Fix the style of scene 2"가 그림체 고정으로 읽혔다.
  //   그 질문이 없어져(D6) Writer 화면의 말은 늘 평소대로 산문 고침이다.
  it('Writer 화면 채팅에서 그림체로 쓸지 묻는 질문이 없으니, 스타일 낱말이 든 말도 그림체를 정하지 않고 평소대로 산문 고침 요청이 된다', async () => {
    await send('Fix the style of scene 2')
    await vi.waitFor(() => expect(calls('/api/writer/scene-gate')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(chat.getState().styleAttachmentGate).toBeNull()
  })
})

describe('만화 그림체 질문은 없다', () => {
  // 왜: 예전에는 다시 쓰기를 고르면 만화 그림체 질문(고정 · 각색 · 그만두기)이 떴다 — D6(2026-11-22)로 그 질문이 없어졌다.
  //   만화를 쓰지 않고 빠져나가는 길은 다시 쓰기 질문의 [참고로만]이다(writer-comic-rewrite).
  it('Writer 화면에서 만화로 다시 쓰기를 고르면 그림체 질문 없이 바로 대본으로 옮긴다', async () => {
    chat.getState().offerImageRoles([PAGE1], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
    await send('Rewrite the prose from the comic')
    expect(question()?.id ?? '').not.toMatch(/^comic-style:/)
    expect(choiceLabels()).not.toContain('Never mind')
    await vi.waitFor(() => expect(calls('/api/produce/comic-script')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(chat.getState().comicStyleGate).toBeNull()
  })

  // 왜(혼자 정한 것): 같이 올려 인물 카드로 고른 그림은 그림체 질문과 상관없이 고른 대로 쓴다.
  it('만화 원고와 인물 사진을 함께 올려 다시 쓰기를 고르면 그림체 질문 없이 만화는 대본으로 옮기고 인물 사진은 고른 대로 카드에 쓴다', async () => {
    chat.getState().offerImageRoles([PAGE1, PERSON], { typed: '', msg: 'Uploaded pictures' })
    await send('I will decide for each picture')
    await send('Use it as a comic page')
    await send('Use it as a character')
    await send('Rewrite the prose from the comic')
    await vi.waitFor(() => expect(calls('/api/produce/comic-script')).toHaveLength(1))
    await vi.waitFor(() => expect(calls('/api/produce/chat').some((b) => b.cardFill?.kind === 'character')).toBe(true))
    expect(producer.getState().cast).toHaveLength(1)
    expect(calls('/api/produce/style-anchor')).toEqual([])
  })
})

describe('새로 고침 뒤 복원된 그림 질문', () => {
  // 왜: 검토 a 보통 3 — 새로 고치면 올린 그림과 질문 상태는 빠지고 질문 칩만 돌아온다. 칩을 눌러 보내면 산문 고침 요청으로 빠졌다(고치기 전에도).
  //   오너 답: "새로 고침으로 그림이 빠졌어요, 다시 올려 주세요"라고 답하고 산문 고침으로 보내지 않는다.
  it('새로 고침 뒤 복원된 그림 질문에 답하면 "새로 고침으로 그림이 빠졌어요. 다시 올려 주세요."라고 답하고 산문을 고치지 않는다', async () => {
    // 그림마다 묻는 질문(image-role:)은 D6(2026-11-22)로 칩이 넷이 되어 새로 고침 뒤에도 돌아온다 — 다른 그림 질문과 같이 받는다.
    //   만화 그림체(comic-style:) · 그림체로 쓸지(style-attachment:)는 D6로 없어진 질문이지만, 그 전에 남은 기록의 칩이 돌아올 수 있어 같이 본다.
    const restored = [
      { id: `image-role:${PERSON.id}`, labels: ['Comic pages', 'Character card', 'Background card', 'Reference only'], answer: 'Character card' },
      { id: `image-batch:${PAGE1.id}`, labels: ['Turn the comic into video as drawn', 'Decide for each picture', 'Use them all as reference'], answer: 'Turn the comic into video as drawn' },
      { id: `comic-style:${PAGE1.id}`, labels: ['Fix the comic art style', 'Adapt to another style like live action', 'Never mind'], answer: 'Fix the comic art style' },
      { id: `comic-rewrite:${PAGE1.id}`, labels: ['Rewrite', 'Only as reference'], answer: 'Rewrite' },
      { id: 'style-attachment:1', labels: ['Use as the art style', 'Keep as reference'], answer: 'Use as the art style' },
    ]
    for (const q of restored) {
      fetchMock.mockClear()
      await reloadWith(q.id, q.labels)
      await send(q.answer)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(nothingRan(), q.id).toEqual(NOTHING)
      expect(lastModel(), q.id).toBe(CLEARED)
      expect(question(), q.id).toBeNull()
    }
    expect(translate('ko', CLEARED)).toBe('새로 고침으로 그림이 빠졌어요. 다시 올려 주세요.')
  })

  // 왜(혼자 정한 것): 복원된 질문은 그림이 빠져 물을 것이 없다 — 답이 아닌 말까지 붙들면 산문을 고칠 길이 막힌다. 그 말은 평소대로 산문 고침이다.
  it('새로 고침 뒤 복원된 그림 질문이 떠 있어도 답이 아닌 말은 평소대로 산문 고침 요청이 된다', async () => {
    await reloadWith(`image-batch:${PAGE1.id}`, ['Turn the comic into video as drawn', 'Decide for each picture', 'Use them all as reference'])
    await send('Make the ending happier')
    await vi.waitFor(() => expect(calls('/api/writer/scene-gate')).toHaveLength(1))
    expect(calls('/api/writer/scene-gate')[0]).toMatchObject({ action: 'revise', feedback: 'Make the ending happier' })
    expect(lastModel()).not.toBe(CLEARED)
  })
})
