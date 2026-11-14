// 시작 화면 첫 글이 "줄거리를 줘도 될까?"처럼 이야기를 내도 되는지 허락을 묻는 말이면 이야기를 시작하지 않고 "여기에 적어 주세요"로 먼저 답한다 (오너 2026-11-14 답 A ①)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asksToShareStory } from '@/lib/entry/permission-ask'
import { useEntryStore } from '@/features/entry/entry-store'
import { CHAT_PERMISSION_ANSWER, chatTranscript } from '@/features/entry/chat-flow'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { translate } from '@/lib/i18n/translate'
import { useProjectStore } from '@/stores/project-store'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
const en = (key: string, params?: Record<string, string | number>) => translate('en', key, params)
const PID = 'project-1'
// 이 시험을 위해 새로 지은 글 — 실제 사용자의 글이 아니다.
const SEED = '비 오는 항구 도시에서 길고양이를 돌보는 노인과 매일 밤 같은 자리에 앉는 소녀의 이야기'
const QUESTION = '시리즈를 만들고 싶은데, 줄거리를 줘도 될까?'

interface Call { method: string; url: string; body: unknown }
let calls: Call[] = []
let routes: Record<string, (body: unknown, call: Call) => { status?: number; body: unknown }> = {}

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function recommended(draft: EntryDraft): EntryDraft {
  const rec = { kind: '1-3' as const, mood: 'drama' as const, moodWhy: '', runtime: 'r300' as const, runtimeWhy: '', level: 'grow' as const, title: '항구의 밤', source: 'llm' as const, basis: materialBasis(draft) }
  return { ...draft, rec, picks: { mood: null, runtime: null, level: null, ratio: null }, chat: { answered: {}, pre: {} } }
}

function setDraft(draft: EntryDraft) {
  useEntryStore.setState({ projectId: PID, status: 'ready', draft })
}

beforeEach(() => {
  calls = []
  routes = { 'PATCH /api/produce/entry': () => ({ body: { ok: true } }) }
  useEntryStore.getState().reset()
  useProjectStore.setState({ projectId: PID, reachedStage: 'entry', currentStage: 'entry', projectTitle: 'Untitled' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body ?? null
    const call = { method, url, body }
    calls.push(call)
    const handler = routes[`${method} ${url.split('?')[0]}`]
    if (!handler) return respond(404, { error: 'not_mocked' })
    const out = handler(body, call)
    return respond(out.status ?? 200, out.body)
  }))
})

afterEach(async () => {
  await useEntryStore.getState().flushIdea()
  useEntryStore.getState().reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('허락을 묻는 첫 글', () => {
  it('시작 대화 첫 글이 줄거리를 줘도 되는지 허락을 묻는 말이면 이야기를 시작하지 않고 앱 문장으로 답한다', async () => {
    // 왜: 허락을 묻는 말까지 이야기 씨앗이 되어, 대답 없이 산문이 만들어졌다(바우처 사용자 채팅 A).
    setDraft({ ...emptyEntryDraft(), idea: QUESTION })

    expect(await useEntryStore.getState().chatSendFirst()).toBe('asked')

    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
    const state = useEntryStore.getState()
    const items = chatTranscript(state.draft, state.chat, ko)
    expect(items.find((i) => i.id === 'ask-permission')).toMatchObject({ kind: 'user', text: QUESTION })
    expect(items.find((i) => i.id === 'permission-answer')).toMatchObject({ kind: 'agent', text: '네, 줄거리를 여기에 적어 주세요.' })
  })

  it('그 물음은 대화에 사용자 말로 남고 입력칸은 비워진다', async () => {
    // 왜: 물음이 입력칸에 남아 있으면 줄거리를 적을 때 물음과 섞인다. 앱이 답한 뒤에는 바로 줄거리를 적게 한다.
    setDraft({ ...emptyEntryDraft(), idea: QUESTION })

    await useEntryStore.getState().chatSendFirst()
    await useEntryStore.getState().flushIdea()

    const state = useEntryStore.getState()
    expect(state.draft.idea).toBe('')
    expect(state.chat.asked).toBe(QUESTION)
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)).toMatchObject({ body: { projectId: PID, patch: { idea: '' } } })
  })

  it('허락 물음 뒤에 적은 줄거리는 첫 글처럼 읽어 추천을 만든다', async () => {
    // 왜: 앱이 "여기에 적어 주세요"라고 했으니, 이어 적은 글이 이야기다. 물음은 이야기에 들어가지 않는다.
    setDraft({ ...emptyEntryDraft(), idea: QUESTION })
    await useEntryStore.getState().chatSendFirst()
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...useEntryStore.getState().draft, idea: SEED }) } })

    useEntryStore.getState().setIdea(SEED)
    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')

    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(true)
    expect(useEntryStore.getState().draft.idea).toBe(SEED)
    expect(useEntryStore.getState().chat.asked).toBeNull()
  })

  it('영어로 허락을 물으면 같은 뜻의 영어 문장으로 답한다', async () => {
    // 왜: 영어 화면 사용자도 같은 대접을 받는다. 앱 문장은 두 말이 같은 뜻이다.
    setDraft({ ...emptyEntryDraft(), idea: 'I have a series in mind. Can I give you my storyline?' })

    expect(await useEntryStore.getState().chatSendFirst()).toBe('asked')

    const state = useEntryStore.getState()
    expect(chatTranscript(state.draft, state.chat, en).find((i) => i.id === 'permission-answer')).toMatchObject({ text: 'Sure! Write your storyline here.' })
    expect(en(CHAT_PERMISSION_ANSWER)).toBe('Sure! Write your storyline here.')
    expect(ko(CHAT_PERMISSION_ANSWER)).toBe('네, 줄거리를 여기에 적어 주세요.')
  })

  it('20자가 안 되는 짧은 허락 물음도 "더 적어 달라"가 아니라 이 답을 받는다', async () => {
    // 왜: 허락 판별이 길이 검사보다 늦으면 "줘도 될까?"만 쓴 사람은 20자를 채우라는 말을 듣는다.
    setDraft({ ...emptyEntryDraft(), idea: '줄거리 줘도 될까요?' })

    expect(await useEntryStore.getState().chatSendFirst()).toBe('asked')

    expect(useEntryStore.getState().chat.lengthError).toBe(false)
  })

  it('화면에서 고르기 탭에서도 같은 물음이면 다음 화면으로 가지 않고 안내를 보이며 쓴 글은 지우지 않는다', async () => {
    // 왜: 첫 글은 어느 탭에서 써도 같은 규칙이다. 화면에서 고르기에는 대화 줄이 없어 입력칸 아래에 같은 문장을 보인다.
    setDraft({ ...emptyEntryDraft(), idea: QUESTION })

    expect(await useEntryStore.getState().formNext()).toBe('asked')

    const state = useEntryStore.getState()
    expect(state.formStep).toBe(1)
    expect(state.showShareAnswer).toBe(true)
    expect(state.draft.idea).toBe(QUESTION)
    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
  })

  it('파일이 붙어 있으면 허락 말이 있어도 걸지 않고 파일로 시작한다', async () => {
    // 왜: 파일이 이야기다. 글칸의 설명 한 줄이 물음이어도 읽을 재료가 이미 있다.
    const file = { name: 'script.txt', ext: 'txt', kind: 'text' as const, size: 80, chars: SEED.length, text: SEED, uploadedAt: '2026-11-14T00:00:00Z' }
    const draft: EntryDraft = { ...emptyEntryDraft(), idea: QUESTION, file }
    setDraft(draft)
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended(draft) } })

    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')
  })

  it('이야기 씨앗은 허락 물음으로 읽지 않고 그대로 시작한다', async () => {
    // 왜: 잘못 걸리면 진짜 이야기가 막힌다. 가정 · 물음이 든 씨앗도 이야기로 시작해야 한다.
    const seed = '만약 고양이가 날 수 있다면, 옥상의 비둘기들은 어떻게 반응할까?'
    setDraft({ ...emptyEntryDraft(), idea: seed })
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...emptyEntryDraft(), idea: seed }) } })

    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')
    expect(useEntryStore.getState().chat.asked ?? null).toBeNull()
  })
})

describe('허락을 묻는 말 가르기', () => {
  // 이 목록은 모두 이 시험을 위해 새로 지은 글이다.
  // 왜: 줄거리 낱말 · 주는 말 · 허락 끝이 한 문장에 있을 때만 허락 물음이다. 한국어 · 영어 모두 넉넉히 못 박는다.
  it.each([
    '줄거리를 줘도 될까?',
    '줄거리를 줘도 될까',
    '제가 먼저 줄거리를 보내도 될까요?',
    '스토리라인을 직접 써서 올려도 돼?',
    '아이디어를 먼저 말씀드려도 될까요?',
    '내가 대본을 붙여도 괜찮을까?',
    '시리즈 이야기를 만들고 싶은데, 내 시나리오를 먼저 줘도 되나요?',
    '줄거리 써서 보내도 돼?',
    '플롯은 제가 정해서 드려도 될까요?',
    '대본을 먼저 공유해도 좋을까요?',
    '이야기는 내가 직접 적어도 돼?',
    '저희가 구상한 내용을 보내도 되나요?',
    '쇼츠를 몇 편 만들고 싶어요. 이야기를 알려드려도 될까요?',
    'Can I give you my storyline?',
    'May I send you the plot first?',
    'Should I write the story myself and paste it here?',
    'Is it okay if I share my script with you?',
    'Do you mind if I tell you my idea?',
    'Could I upload my outline instead?',
    'can i give you the story line',
    'I want a series about city bakers. Can I give you the storyline?',
    'Would it be alright if I send you my synopsis?',
    'Can I just paste my script here?',
    'Am I allowed to give you the plot now?',
    "Is it ok if I send the storyline first?",
    '안녕하세요! 줄거리를 줘도 될까요?',
    '저는 요리 시리즈를 만들고 싶어요. 제 줄거리를 먼저 보내도 괜찮을까요?',
    '시나리오 있는데 올려도 돼요?',
    '이거 올려도 돼요?',
    'Hello! May I give you my storyline first?',
    'I have a script already. Can I paste it here?',
  ])('허락을 묻는 말로 읽는다: %s', (text) => {
    expect(asksToShareStory(text)).toBe(true)
  })

  // 왜: 잘못 걸리는 것이 제일 위험하다 — 이야기 씨앗 · 줄거리를 만들어 달라는 말 · 다른 사람에게 허락을 묻는 줄거리 속 말은 이야기로 시작한다.
  it.each([
    '만약 고양이가 날 수 있다면?',
    '아이가 몰래 과자를 먹어도 될까? 아빠는 모른 척하고 창밖만 본다.',
    '소녀는 고민한다. 엄마에게 이 이야기를 말해도 될까?',
    '친구에게 이야기를 보내도 될까, 하고 주인공은 한참 휴대폰을 만지작거린다.',
    '이 이야기는 어떻게 만드는 거야?',
    '줄거리를 짜 주세요.',
    SEED,
    '나 대신 줄거리를 써 줄 수 있어?',
    '그림을 그려도 돼?',
    '이 설정을 써도 돼?',
    '먹어도 될까?',
    'What if a cat could fly?',
    'Should I be worried about the neighbors?',
    'She wonders: should I tell him the truth about the story?',
    'Can I make a movie about a cat that flies?',
    'How do I give feedback on the plot?',
    'Can you write the storyline for me?',
    'Please give me a story about two rival bakers.',
    'Could I tell my mom the story? she asks herself while folding the laundry.',
    'I want a story about a lighthouse keeper.',
    'Can I use a different title for the story?',
    'Should I tell the neighbors the plot of the play?',
    // 줄거리 속 말 — 허락 말이 문장 끝이 아니거나, 앞에 이야기 글이 붙었거나, 다른 사람에게 건네는 말이다.
    '줄거리를 줘도 될까 고민하는 작가의 하루를 그린 30초 코미디',
    '로봇 청소기가 주인 몰래 시를 쓰기 시작한다. 주인은 그 시를 읽어도 될까 망설인다.',
    '아이가 엄마에게 일기를 보여줘도 될까 고민하는 아침',
    '새벽 세 시, 편의점 알바생이 손님에게 마지막 도시락을 줘도 될까 고민한다.',
    'Should I share my idea with the group? a student asks himself before the pitch meeting.',
    'A ghost asks a child: may I send you a story every night?',
    'A baker wonders: should I tell her the plot of the surprise party?',
    'Two rival chefs must share one kitchen for a night. Can I trust her? he wonders.',
    'Can I borrow your umbrella? the girl asks the stranger at the bus stop.',
    '',
    '   ',
  ])('허락을 묻는 말로 읽지 않는다: %s', (text) => {
    expect(asksToShareStory(text)).toBe(false)
  })

  // 왜: 허락 말 뒤에 이야기를 이미 길게 적었으면 그 글이 이야기다 — 막으면 쓴 줄거리가 버려진다.
  it('허락 말이 있어도 이야기가 길게 이어지면 이야기로 읽는다', () => {
    const long = '줄거리를 줘도 될까요? 바닷가 마을의 낡은 등대를 지키는 할머니는 매일 밤 같은 시간에 불을 켠다. 어느 날 폭풍 속에서 작은 어선 한 척이 그 불빛을 따라 돌아오고, 선장은 오래전 마을을 떠난 할머니의 아들이었다. 두 사람은 말없이 차를 마시며 밤을 샌다. 아침이 되자 선장은 돌아갈 배를 고치겠다고 하고, 할머니는 말없이 등대 열쇠를 건넨다.'
    expect(asksToShareStory(long)).toBe(false)
    const longEn = 'Can I give you my storyline? A lighthouse keeper lights the lamp at the same hour every night. One stormy evening a small fishing boat follows the light home, and its captain turns out to be the son who left the village long ago. They drink tea in silence until morning.'
    expect(asksToShareStory(longEn)).toBe(false)
  })
})
