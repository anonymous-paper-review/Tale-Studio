// 시작 화면 첫 글이 "줄거리를 줘도 될까?"처럼 이야기를 내도 되는지 허락을 묻는 말이면 이야기를 시작하지 않고 "여기에 적어 주세요"로 먼저 답하고, 물음 앞에 적은 설명은 이어 적은 줄거리와 함께 이야기 씨앗으로 쓴다 (오너 2026-11-14 답 A ① · 리드 11/14)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asksToShareStory, splitPermissionAsk, withoutPermissionAsk } from '@/lib/entry/permission-ask'
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
// 앞에 적은 설명 없이 물음만 쓴 글.
const QUESTION_ONLY = '줄거리를 줘도 될까?'

interface Call { method: string; url: string; body: unknown }
let calls: Call[] = []
let savedForm = ''
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
    // 왜: 허락을 묻는 말까지 이야기 씨앗이 되어, 대답 없이 산문이 만들어졌다(11/14 채팅 점검 A).
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
    // 왜: 앱이 "여기에 적어 주세요"라고 했으니, 이어 적은 글이 이야기다. 물음은 이야기에 들어가지 않는다(앞에 적은 설명이 있을 때는 아래 "허락 물음 앞에 적은 설명").
    setDraft({ ...emptyEntryDraft(), idea: QUESTION_ONLY })
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

  it('화면에서 고르기 탭에서 안내를 보고 줄거리를 이어 적어 다음을 누르면 물음 문장만 덜어 내고 이어 간다', async () => {
    // 왜: 안내를 본 사람은 "여기에 적어 주세요"대로 물음 뒤에 줄거리를 이어 적는다 — 이때 또 안내를 보이면 시험 없이 같은 자리에서 막힌다. 물음 앞에 적은 설명은 남는다.
    setDraft({ ...emptyEntryDraft(), idea: QUESTION })
    expect(await useEntryStore.getState().formNext()).toBe('asked')
    routes['PATCH /api/produce/entry'] = (body) => {
      const idea = (body as { patch?: { idea?: string } } | null)?.patch?.idea
      if (typeof idea === 'string') savedForm = idea
      return { body: { ok: true } }
    }
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...useEntryStore.getState().draft, idea: savedForm }) } })

    useEntryStore.getState().setIdea(`${QUESTION} ${SEED}`)
    expect(await useEntryStore.getState().formNext()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(`시리즈를 만들고 싶은데 ${SEED}`)
    expect(useEntryStore.getState().showShareAnswer).toBe(false)
  })

  it('화면에서 고르기 탭에서 안내를 본 뒤 긴 줄거리를 이어 적어도 물음 문장만 덜어 내고 이어 간다', async () => {
    // 왜: 이어 적은 글이 120자를 넘으면 "이미 이야기를 적은 글"로 읽혀 물음 문장이 씨앗에 남았다(리드 검토 11/14 보통 3) — 안내를 본 뒤의 누름에서는 길이와 상관없이 물음만 덜어 낸다.
    const long = '비 오는 항구 도시에서 길고양이를 돌보는 노인과 매일 밤 같은 자리에 앉는 소녀가 있다. 노인은 소녀에게 고양이들의 이름을 하나씩 알려 주고, 소녀는 그 이름을 공책에 적어 둔다. 어느 날 노인이 보이지 않자 소녀는 공책을 들고 항구의 가게들을 돌며 노인의 행방을 묻는다.'
    setDraft({ ...emptyEntryDraft(), idea: QUESTION })
    expect(await useEntryStore.getState().formNext()).toBe('asked')
    routes['PATCH /api/produce/entry'] = (body) => {
      const idea = (body as { patch?: { idea?: string } } | null)?.patch?.idea
      if (typeof idea === 'string') savedForm = idea
      return { body: { ok: true } }
    }
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...useEntryStore.getState().draft, idea: savedForm }) } })

    useEntryStore.getState().setIdea(`${QUESTION} ${long}`)
    expect(await useEntryStore.getState().formNext()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(`시리즈를 만들고 싶은데 ${long}`)
  })

  it('화면에서 고르기 탭에서 안내를 본 뒤 글을 고치지 않고 다시 다음을 누르면 안내를 다시 보인다', async () => {
    // 왜: 아무것도 답하지 않았는데 이야기로 넘기면 물음이 이야기가 된다 — 고친 것이 있을 때만 답한 것으로 본다.
    setDraft({ ...emptyEntryDraft(), idea: QUESTION })
    expect(await useEntryStore.getState().formNext()).toBe('asked')

    expect(await useEntryStore.getState().formNext()).toBe('asked')

    expect(useEntryStore.getState().draft.idea).toBe(QUESTION)
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
    // 존댓말로 말한 앞 문장은 이야기 속 말이 아니다(리드 검토 11/14 낮음 3) — 끝맺음이 "…다"인 말하기만 줄거리 속 말이다.
    '제가 먼저 말씀드렸어요. 줄거리를 줘도 될까요?',
    '시리즈를 만들고 싶다고 말했어요. 줄거리를 줘도 될까요?',
    '시리즈를 만들고 싶어. 줄거리를 줘도 될까?',
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
    // 줄거리 속 말(한국어) — 앞 문장이 "물었다 · 말했다 · 속삭였다"처럼 말하기로 끝나면 이야기 속 인물이 하는 말이다(리드 검토 11/14 낮음 3).
    '소년은 소녀에게 물었다. 내 이야기를 들려줘도 될까?',
    '노인이 천천히 말했다. 내 줄거리를 보내도 될까?',
    '아이는 작게 속삭였다. 이 이야기를 들려줘도 돼?',
    '소녀가 조용히 묻는다. 내 이야기를 들려줘도 될까?',
    '소년이 말했다: 내 이야기를 들려줘도 될까?',
    '소년은 소녀에게 물었다\n내 이야기를 들려줘도 될까?',
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

describe('허락 물음 앞에 적은 설명', () => {
  // 이 시험을 위해 새로 지은 글 — 실제 사용자의 글이 아니다.
  const PREFACE = '시리즈를 만들고 싶은데'
  const MERGED = `${PREFACE}\n\n${SEED}`
  const SEED_EN = 'A new baker at a neighborhood bakery learns why an elderly regular buys the same loaf every single day'

  async function ask(idea: string) {
    setDraft({ ...emptyEntryDraft(), idea })
    expect(await useEntryStore.getState().chatSendFirst()).toBe('asked')
  }
  // 진짜 서버처럼 저장된 초안의 글을 읽어 추천한다 — 합친 글이 추천을 묻기 전에 저장되지 않았다면 돌아온 초안의 글이 합쳐지지 않은 채로 남는다.
  let savedIdea = ''
  beforeEach(() => {
    savedIdea = ''
    routes['PATCH /api/produce/entry'] = (body) => {
      const idea = (body as { patch?: { idea?: string } } | null)?.patch?.idea
      if (typeof idea === 'string') savedIdea = idea
      return { body: { ok: true } }
    }
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...useEntryStore.getState().draft, idea: savedIdea }) } })
  })

  it('허락 물음 앞에 적은 설명은 이어 적은 줄거리와 함께 이야기 씨앗이 된다', async () => {
    // 왜: 허락 물음에 답한 뒤 사용자가 시리즈 콘셉트를 다시 쓰지 않게 한다 — 물음 문장만 빼고 앞에 적은 설명은 이어 적은 줄거리 앞에 붙는다(리드 2026-11-14).
    await ask(QUESTION)
    expect(useEntryStore.getState().chat.seedPrefix).toBe(PREFACE)
    expect(useEntryStore.getState().draft.idea).toBe('')

    useEntryStore.getState().setIdea(SEED)
    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(MERGED)
    expect(useEntryStore.getState().chat.seedPrefix ?? null).toBeNull()
  })

  it('허락 물음 문장 자체는 이야기 씨앗에 들어가지 않는다 — 영어도 같다', async () => {
    // 왜: 물음은 앱에게 한 말이지 이야기가 아니다. 설명이 따로 문장이어도 물음 문장만 뺀다.
    const preface = 'I want to make a few episodes about city bakers, like a documentary.'
    await ask(`${preface} Can I give you my storyline?`)
    expect(useEntryStore.getState().chat.seedPrefix).toBe(preface)

    useEntryStore.getState().setIdea(SEED_EN)
    await useEntryStore.getState().chatSendFirst()

    expect(useEntryStore.getState().draft.idea).toBe(`${preface}\n\n${SEED_EN}`)
    expect(useEntryStore.getState().draft.idea).not.toContain('Can I give you')
  })

  it('허락 물음 뒤에 쓴 말은 이야기 씨앗에 들어가지 않는다', async () => {
    // 왜: "감사합니다!" · 덧붙인 다른 물음이 이야기 맨 앞에 붙으면 산문이 인사나 물음으로 시작한다(리드 검토 11/14 보통 1).
    await ask('시리즈를 만들고 싶은데, 줄거리를 줘도 될까요? 감사합니다!')
    expect(useEntryStore.getState().chat.seedPrefix).toBe(PREFACE)

    useEntryStore.getState().setIdea(SEED)
    await useEntryStore.getState().chatSendFirst()

    expect(useEntryStore.getState().draft.idea).toBe(MERGED)
  })

  it('허락 문장 안에 쓴 이야기는 버리지 않고 이어 적은 줄거리 앞에 붙는다', async () => {
    // 왜: "고양이가 우주로 가는 이야기를 보내도 될까요?"처럼 이야기를 물음에 담은 사람의 글이 입력칸과 함께 사라졌다(리드 검토 11/14 보통 2).
    await ask('고양이가 우주로 가는 이야기를 보내도 될까요?')
    expect(useEntryStore.getState().chat.seedPrefix).toBe('고양이가 우주로 가는 이야기')

    useEntryStore.getState().setIdea(SEED)
    await useEntryStore.getState().chatSendFirst()

    expect(useEntryStore.getState().draft.idea).toBe(`고양이가 우주로 가는 이야기\n\n${SEED}`)
  })

  it('물음만 쓴 첫 글이면 붙일 설명이 없어 이어 적은 줄거리만 이야기 씨앗이 된다', async () => {
    // 왜: 정상 경로 고정 — 설명이 없는데 빈 줄이나 물음이 앞에 붙으면 안 된다.
    await ask(QUESTION_ONLY)
    expect(useEntryStore.getState().chat.seedPrefix ?? null).toBeNull()

    useEntryStore.getState().setIdea(SEED)
    await useEntryStore.getState().chatSendFirst()

    expect(useEntryStore.getState().draft.idea).toBe(SEED)
  })

  it('인사말만 앞에 붙은 허락 물음은 인사말을 이야기 씨앗에 넣지 않는다', async () => {
    // 왜: "안녕하세요!"가 이야기 맨 앞에 붙으면 산문 초안이 인사로 시작한다.
    await ask('안녕하세요! 줄거리를 줘도 될까요?')
    expect(useEntryStore.getState().chat.seedPrefix ?? null).toBeNull()
  })

  it('허락을 또 물으면 앞에 적은 설명이 이어 쌓여 줄거리 앞에 함께 붙는다', async () => {
    // 왜: 두 번째 물음에 덧붙인 설명도 버리지 않는다.
    await ask(QUESTION)
    useEntryStore.getState().setIdea('한 편은 30초 안팎이에요. 지금 줄거리를 보내도 될까요?')
    expect(await useEntryStore.getState().chatSendFirst()).toBe('asked')
    expect(useEntryStore.getState().chat.seedPrefix).toBe(`${PREFACE}\n\n한 편은 30초 안팎이에요.`)

    useEntryStore.getState().setIdea(SEED)
    await useEntryStore.getState().chatSendFirst()

    expect(useEntryStore.getState().draft.idea).toBe(`${PREFACE}\n\n한 편은 30초 안팎이에요.\n\n${SEED}`)
  })

  it('허락 뒤에 20자가 안 되는 짧은 말만 보내면 앞에 적은 설명이 있어도 더 적어 달라고 한다', async () => {
    // 왜: 합친 글로 길이를 재면 설명이 길 때 "ㅇㅋ" 같은 말이 이야기가 되어 추천이 엉뚱하게 만들어진다. 길이는 이번에 보낸 글만 잰다.
    await ask(QUESTION)
    useEntryStore.getState().setIdea('ㅇㅋ')

    expect(await useEntryStore.getState().chatSendFirst()).toBe('too_short')

    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
    expect(useEntryStore.getState().chat.seedPrefix).toBe(PREFACE)
    expect(useEntryStore.getState().draft.idea).toBe('ㅇㅋ')
  })

  it('예시를 골라 쓰면 앞에 적은 설명은 붙이지 않는다', async () => {
    // 왜: 예시를 고른 것은 그 이야기로 가겠다는 뜻이다 — 이전 콘셉트가 예시 앞에 섞이면 안 된다.
    await ask(QUESTION)
    expect(useEntryStore.getState().chat.seedPrefix).toBe(PREFACE)

    useEntryStore.getState().pickExample(0, ko)

    expect(useEntryStore.getState().chat.seedPrefix ?? null).toBeNull()
  })

  it('화면에서 고르기 탭으로 옮겨 줄거리를 적고 다음을 눌러도 앞에 적은 설명이 붙는다', async () => {
    // 왜: 두 탭이 같은 초안을 쓴다 — 어느 탭에서 줄거리를 보내도 설명이 사라지지 않는다.
    await ask(QUESTION)

    useEntryStore.getState().setIdea(SEED)
    expect(await useEntryStore.getState().formNext()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(MERGED)
    expect(useEntryStore.getState().chat.seedPrefix ?? null).toBeNull()
  })
})

describe('허락 물음 나누기', () => {
  // 왜: 물음 문장만 빼고 앞에 적은 설명은 남긴다 — 같은 문장 안의 쉼표 앞 설명도 남기고, 인사말만이면 비운다. 이 목록은 모두 새로 지은 글이다.
  it.each([
    ['줄거리를 줘도 될까?', true, ''],
    ['시리즈를 만들고 싶은데, 줄거리를 줘도 될까?', true, '시리즈를 만들고 싶은데'],
    ['요리 시리즈를 몇 편 만들고 싶어요. 어느 정도 현실적인 분위기예요. 줄거리를 먼저 보내도 괜찮을까요?', true, '요리 시리즈를 몇 편 만들고 싶어요. 어느 정도 현실적인 분위기예요.'],
    ['안녕하세요! 줄거리를 줘도 될까요?', true, ''],
    ['Can I give you my storyline?', true, ''],
    ['I want to make a few episodes about city bakers, like a documentary. Can I give you my storyline?', true, 'I want to make a few episodes about city bakers, like a documentary.'],
    ['I want a series, and can I give you the storyline?', true, 'I want a series'],
    ['Hi! Can I send you my script first?', true, ''],
    // 물음 앞에 문장 둘 — 쉼표가 든 문장도 통째로 남는다.
    ['동네 빵집 이야기를 여섯 편짜리 시리즈로 만들려고 해요. 잔잔한 다큐 같은 분위기, 새벽 장면이 많아요. 줄거리를 지금 보내도 괜찮을까요?', true, '동네 빵집 이야기를 여섯 편짜리 시리즈로 만들려고 해요. 잔잔한 다큐 같은 분위기, 새벽 장면이 많아요.'],
    ['저기, 줄거리를 줘도 될까요?', true, ''],
    ['안녕하세요, 제 줄거리를 먼저 보내도 될까요?', true, ''],
    ['시리즈를 만들고 싶어요\n줄거리를 줘도 될까요?', true, '시리즈를 만들고 싶어요'],
    ['콘셉트: 요리 시리즈\n분량: 5편\n줄거리를 줘도 될까요?', true, '콘셉트: 요리 시리즈\n분량: 5편'],
    ['Hello! I have a question. Can I send you my script first?', true, ''],
    // 물음 뒤에 쓴 말은 씨앗에 넣지 않는다(리드 검토 11/14 보통 1) — 설명은 물음 앞 글만이다.
    ['줄거리를 줘도 될까요? 감사합니다!', true, ''],
    ['시리즈를 만들고 싶어요. 줄거리를 줘도 될까요? 영상은 몇 분까지 되나요?', true, '시리즈를 만들고 싶어요.'],
    ['Can I paste my script here? It is long, about 3 pages.', true, ''],
    ['Hello! Can I send you my script first? Thanks a lot.', true, ''],
    // 허락 문장 안에 쓴 이야기 · 설명도 남긴다(리드 검토 11/14 보통 2).
    ['고양이가 우주로 가는 이야기를 보내도 될까요?', true, '고양이가 우주로 가는 이야기'],
    ['Can I tell you a story about a dragon who learns to fly?', true, 'about a dragon who learns to fly'],
    ['Could I share my idea: a lonely robot finds…', true, 'a lonely robot finds…'],
    ['시리즈를 만들고 싶은데 줄거리를 줘도 될까?', true, '시리즈를 만들고 싶은데'],
    ['저는 영상 작가인데 줄거리를 먼저 보내도 괜찮을까요?', true, '저는 영상 작가인데'],
    ['서윤 이야기를 먼저 보내도 될까요?', true, '서윤 이야기'],
    ['시리즈를 몇 편 만들어요. 고양이가 우주로 가는 이야기를 보내도 될까요?', true, '시리즈를 몇 편 만들어요. 고양이가 우주로 가는 이야기'],
    // 물음의 틀뿐인 말(나 · 먼저 · 직접 · 쓴 …)은 설명이 아니다.
    ['제가 쓴 줄거리를 먼저 보내도 될까요?', true, ''],
    ['내 줄거리를 줘도 될까?', true, ''],
    ['직접 줄거리를 적어도 돼?', true, ''],
    ['Can I tell you about my idea?', true, ''],
    // 물음의 틀 낱말(here · instead · first …)은 설명 끝에 남기지 않는다.
    ['Can I paste my script for a five-episode series about bakers here?', true, 'about bakers'],
    ['Could I upload my outline - a drama about two chefs - instead?', true, 'a drama about two chefs'],
    ['만약 고양이가 날 수 있다면?', false, ''],
    ['소녀는 고민한다. 엄마에게 이 이야기를 말해도 될까?', false, ''],
    ['', false, ''],
  ])('%s → 허락 %s · 앞에 적은 설명 %j', (text, asking, preface) => {
    expect(splitPermissionAsk(text)).toEqual({ asking, preface })
  })
})

describe('허락 물음 문장만 덜어 낸 글', () => {
  // 왜: 화면에서 고르기 탭은 안내를 본 사람이 물음 뒤에 줄거리를 이어 적는다 — 그때 물음 문장만 덜고 나머지(앞 · 물음 속 · 뒤)는 그대로 둔다.
  it.each([
    [`${QUESTION} ${SEED}`, `시리즈를 만들고 싶은데 ${SEED}`],
    [`줄거리를 줘도 될까요? ${SEED}`, SEED],
    ['줄거리를 줘도 될까요? 감사합니다!', '감사합니다!'],
    [`고양이가 우주로 가는 이야기를 보내도 될까요? ${SEED}`, `고양이가 우주로 가는 이야기 ${SEED}`],
    ['I have a plan. Can I give you my storyline? It is about a baker.', 'I have a plan. It is about a baker.'],
    ['허락 물음이 없는 그냥 이야기 한 줄', '허락 물음이 없는 그냥 이야기 한 줄'],
  ])('%s → %s', (text, expected) => {
    expect(withoutPermissionAsk(text)).toBe(expected)
  })

  it('길이와 상관없이 허락 물음 문장만 덜어 낸다', () => {
    // 왜: 안내를 본 뒤 긴 줄거리를 이어 적어도 물음이 씨앗에 남지 않아야 한다(120자 가름은 첫 글을 읽을 때만 쓴다).
    const long = '비 오는 항구 도시에서 길고양이를 돌보는 노인과 매일 밤 같은 자리에 앉는 소녀가 있다. 노인은 소녀에게 고양이들의 이름을 하나씩 알려 주고, 소녀는 그 이름을 공책에 적어 둔다. 어느 날 노인이 보이지 않자 소녀는 공책을 들고 항구의 가게들을 돌며 노인의 행방을 묻는다.'

    expect(asksToShareStory(`${QUESTION} ${long}`)).toBe(false)
    expect(withoutPermissionAsk(`${QUESTION} ${long}`)).toBe(`시리즈를 만들고 싶은데 ${long}`)
  })
})

describe('허락 문장 안에 쓴 글의 길이', () => {
  it('허락 문장 안에 쓴 이야기가 길면(120자가 넘으면) 이야기를 이미 적은 것으로 읽는다', () => {
    // 왜: 설명으로 남기는 글도 120자 셈에 든다 — 긴 이야기를 물음 하나에 담은 사람의 글을 막으면 쓴 이야기가 버려진다.
    const longInside = '새벽 네 시에 문을 여는 동네 빵집에서 일하는 은퇴한 제빵사와 그의 손녀, 그리고 건너편 꽃집 주인이 매일 아침 인사를 나누며 서로의 사정을 조금씩 알아 가고, 계절마다 단골들의 사연이 하나씩 밝혀지며, 마지막 겨울에는 노인이 떠나고 손녀가 가게를 이어받아 새벽마다 같은 자리에 변함없이 불을 켜는 장면으로 끝나는 이야기를 보내도 될까요?'
    expect(Array.from(withoutPermissionAsk(longInside).replace(/\s+/g, '')).length).toBeGreaterThan(120)

    expect(asksToShareStory(longInside)).toBe(false)
    expect(asksToShareStory('고양이가 우주로 가는 이야기를 보내도 될까요?')).toBe(true)
  })
})
