// Writer 화면 채팅의 그림 질문은 칩 말 · 짧은 답만 답으로 받고, 만화 그림체 질문의 그만두기 · 새로 고침 뒤 복원된 질문도 산문 고침으로 빠지지 않는지 검사한다
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
import { matchWriterBatch, matchWriterComicRewrite, matchWriterComicStyle, matchWriterImageUse } from '@/lib/producer/chip-answer'

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
    const comicStyle = async () => {
      chat.getState().offerImageRoles([PAGE1], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
      await send('Rewrite the prose from the comic')
    }
    const probes = [
      { setup: comicStyle, text: 'Fix the typo in scene 2', id: /^comic-style:/ },
      { setup: comicStyle, text: 'Never mind, keep my prose', id: /^comic-style:/ },
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

  // 왜(혼자 정한 것): 짧은 답 = 칩 낱말 하나(인물 · 배경 · 그림체 · 참고 · 만화 · 고정 · 각색 · 다시 쓰기 · 참고로만 · 그만두기와 같은 영어 낱말).
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
    expect(matchWriterComicStyle('고정')).toBe('lock')
    expect(matchWriterComicStyle('각색')).toBe('adapt')
    expect(matchWriterComicStyle('Adapt')).toBe('adapt')
    expect(matchWriterComicStyle('Fix the typo in scene 2')).toBeNull()
    expect(matchWriterComicStyle('Never mind, keep my prose')).toBeNull()
    expect(matchWriterComicRewrite('참고로만')).toBe('reference')
    expect(matchWriterComicRewrite('다시 쓰기')).toBe('rewrite')
    expect(matchWriterComicRewrite('Rewrite the ending')).toBeNull()
  })

  // 왜(혼자 정한 것): 채팅 모델이 묻는 "이 그림을 그림체로 쓸까요?"도 그림 질문이다 — "Fix the style of scene 2"가 그림체 고정으로 읽혔다.
  //   이 질문은 닫을 수 있는 질문이라 답이 아닌 말은 다시 묻지 않고 평소대로(산문 고침) 처리한다.
  it('Writer 화면 채팅에서 그림체로 쓸지 묻는 동안 칩 말이 아닌 말은 그림체를 정하지 않고 평소대로 산문 고침 요청이 된다', async () => {
    chat.setState({
      styleAttachmentGate: { projectId: 'proj-1', image: LOOK },
      suggestion: { id: 'style-attachment:1', stage: 'producer', content: 'Use this picture as the art style?', dismissible: true, action: { kind: 'choices', options: [{ label: 'Use as the art style', utterance: 'Use it as the art style' }, { label: 'Keep as reference', utterance: 'Use it as reference only' }] } },
    })
    await send('Fix the style of scene 2')
    await vi.waitFor(() => expect(calls('/api/writer/scene-gate')).toHaveLength(1))
    expect(calls('/api/produce/style-anchor')).toEqual([])
    expect(chat.getState().styleAttachmentGate).toBeNull()
  })
})

describe('만화 그림체 질문의 그만두기', () => {
  // 왜: 검토 a 보통 2 — 만화 그림체 질문은 닫을 수 없는데 고정 · 각색 말고는 빠져나갈 길이 없었다("Run breakdown" · "Rewrite it"도 다시 묻기만 했다).
  //   오너 답: 그만두기 칩을 둔다. 고르면 만화 원고를 쓰지 않고 산문도 그대로다.
  it('Writer 화면의 만화 그림체 질문에는 그만두기 칩이 있고, 고르면 만화 원고를 쓰지 않고 산문도 그대로 둔다', async () => {
    chat.getState().offerImageRoles([PAGE1], { typed: 'Turn my comic into video as drawn', msg: 'Turn my comic into video as drawn' })
    await send('Rewrite the prose from the comic')
    expect(choiceLabels()).toEqual(['Fix the comic art style', 'Adapt to another style like live action', 'Never mind'])
    expect(translate('ko', 'Never mind')).toBe('그만두기')
    await send("Don't use the comic")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(nothingRan()).toEqual(NOTHING)
    expect(chat.getState().comicStyleGate).toBeNull()
    expect(question()?.id ?? '').not.toMatch(/^comic-/)
    expect(lastModel()).toMatch(/^Stopped\. I did not use the comic pages/)
    expect(producer.getState()).toMatchObject({ storyText: OLD_IDEA, preserveScript: null })
  })

  // 왜(혼자 정한 것): 그림체 질문은 만화 원고에 대한 것이다 — 같이 올려 인물 카드로 고른 그림까지 버리면 고른 것이 조용히 사라진다.
  it('그만두기를 골라도 같이 올려 인물 · 배경 카드로 고른 그림은 고른 대로 쓴다', async () => {
    chat.getState().offerImageRoles([PAGE1, PERSON], { typed: '', msg: 'Uploaded pictures' })
    await send('I will decide for each picture')
    await send('Use it as a comic page')
    await send('Use it as a character')
    await send('Rewrite the prose from the comic')
    await send("Don't use the comic")
    await vi.waitFor(() => expect(calls('/api/produce/chat')).toHaveLength(1))
    expect(calls('/api/produce/chat')[0].cardFill?.kind).toBe('character')
    expect(producer.getState().cast).toHaveLength(1)
    expect(calls('/api/produce/comic-script')).toEqual([])
    expect(calls('/api/writer/start')).toEqual([])
  })
})

describe('새로 고침 뒤 복원된 그림 질문', () => {
  // 왜: 검토 a 보통 3 — 새로 고치면 올린 그림과 질문 상태는 빠지고 질문 칩만 돌아온다. 칩을 눌러 보내면 산문 고침 요청으로 빠졌다(고치기 전에도).
  //   오너 답: "새로 고침으로 그림이 빠졌어요, 다시 올려 주세요"라고 답하고 산문 고침으로 보내지 않는다.
  it('새로 고침 뒤 복원된 그림 질문에 답하면 "새로 고침으로 그림이 빠졌어요. 다시 올려 주세요."라고 답하고 산문을 고치지 않는다', async () => {
    // 칩이 다섯 개인 그림마다 묻는 질문(image-role:)은 칩 기록이 2~4개만 돌아와 새로 고침 뒤에 다시 뜨지 않는다 — 돌아오는 질문만 본다.
    const restored = [
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
