// 시작 화면 첫 글이 "줄거리를 줘도 될까?"처럼 이야기를 내도 되는지 허락을 묻는 말이면 이야기를 시작하지 않고 "여기에 적어 주세요"로 먼저 답하고, 물음 앞에 적은 설명은 이어 적은 줄거리와 함께 이야기 씨앗으로 쓴다 (오너 2026-11-14 답 A ① · 리드 11/14). 120자 이하의 허락 물음은 뒤에 줄거리든 사정 말이든 무엇이 와도 먼저 허락 답을 하고, 앞 · 뒤에 쓴 글은 설명으로 들고 있다가 이어 보낸 말과 합쳐 씨앗으로 쓴다(리드 11/14 최종 규칙)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asksToShareStory, splitPermissionAsk, storyWithoutPermissionAsk, withoutPermissionAsk } from '@/lib/entry/permission-ask'
import { useEntryStore } from '@/features/entry/entry-store'
import { CHAT_PERMISSION_ANSWER, chatTranscript } from '@/features/entry/chat-flow'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { ideaLength } from '@/features/entry/options'
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

  it('화면에서 고르기 탭에서 안내를 본 뒤 글을 고치지 않고 다시 다음을 눌렀는데 설명이 20자가 안 되면 안내를 다시 보인다', async () => {
    // 왜: 아무것도 답하지 않았는데 이야기로 넘기면 물음이 이야기가 된다 — 고친 것이 있거나 설명이 20자 이상일 때만 답한 것으로 본다(설명이 충분하면 아래 "화면에서 고르기 탭도 같은 규칙이다").
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
    // 허락 말 + 주는 말 + 줄거리 낱말이 한 문장에 있으면 사이에 my · a · the · 꾸밈말이 있어도 건다(리드 검토 11/14 보통 2).
    'Can I share my two-page script?',
    'Can I send my long story?',
    'Is it okay to send the plot?',
    'Could I give a synopsis?',
    'Can I upload a story?',
    'May I share an idea?',
    'Can I paste a script?',
    'Could I send my rough outline?',
    'Is it alright to upload my plot?',
    'May I give the storyline now?',
    // 존댓말로 말한 앞 문장은 이야기 속 말이 아니다(리드 검토 11/14 낮음 3) — 끝맺음이 "…다"인 말하기만 줄거리 속 말이다.
    '제가 먼저 말씀드렸어요. 줄거리를 줘도 될까요?',
    '시리즈를 만들고 싶다고 말했어요. 줄거리를 줘도 될까요?',
    '시리즈를 만들고 싶어. 줄거리를 줘도 될까?',
    // 말꼬리처럼 보여도 사용자 자신의 말이면 건다(리드 11/14 낮음 b) — 쉼표 뒤가 말하는 사람 + 말하기뿐일 때만 줄거리 속 말이다.
    'Can I send you my plot, please?',
    'Could I give you my idea, if that is okay?',
    'Can I send you my story? I asked my sister and she said yes.',
    'Can I share my idea? Everyone said yes.',
    '줄거리를 줘도 될까요? 친구가 좋다고 했어요.',
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
    // 주는 말이어도 받는 사람이 다른 사람이거나 줄거리 속 말이면 걸지 않는다(막이는 그대로).
    'Can I send my long story to my teacher?',
    'Can I share my script with the group?',
    'Could I tell my mom the story?',
    'Can I give him my script?',
    'Can I send my friend a story?',
    'Should I write a story about a lighthouse keeper?',
    'Can I use a different script for the second scene?',
    // 줄거리 속 말(한국어) — 앞 문장이 "물었다 · 말했다 · 속삭였다"처럼 말하기로 끝나면 이야기 속 인물이 하는 말이다(리드 검토 11/14 낮음 3).
    '소년은 소녀에게 물었다. 내 이야기를 들려줘도 될까?',
    '노인이 천천히 말했다. 내 줄거리를 보내도 될까?',
    '아이는 작게 속삭였다. 이 이야기를 들려줘도 돼?',
    '소녀가 조용히 묻는다. 내 이야기를 들려줘도 될까?',
    '소년이 말했다: 내 이야기를 들려줘도 될까?',
    '소년은 소녀에게 물었다\n내 이야기를 들려줘도 될까?',
    // 말꼬리가 뒤에 붙은 줄거리 속 말(리드 11/14 낮음 b) — 같은 문장 끝의 ", she wondered." · 바로 뒤의 짧은 "he asked." / "소년이 물었다."
    'Could I give my idea a chance, she wondered.',
    'May I send you my story first, he asked.',
    'Can I share my plot, Minsu whispered.',
    'Could I give my idea a chance? she wondered.',
    'Can I send you my script? he asked quietly.',
    'Can I send you my script? The girl asked softly.',
    '내 이야기를 들려줘도 될까? 소년이 물었다.',
    '내 줄거리를 보내도 될까? 소녀가 조용히 속삭였다.',
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

  it('허락 뒤에 짧은 확인 말만 보냈는데 설명이 20자가 안 되면 더 적어 달라고 한다', async () => {
    // 왜: 확인 말("ㅇㅋ")은 이야기가 아니라 글자 수에 들지 않는다 — 설명이 20자가 안 되면 "ㅇㅋ"로 이야기가 시작되지 않고 더 적어 달라고 한다(리드 11/14 최종 규칙).
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
    ['Can I paste my script here? It is long, about 3 pages.', true, 'It is long, about 3 pages.'],
    ['Can I paste my script here? Thanks in advance.', true, ''],
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
    // 꾸밈말 + 줄거리 낱말뿐이면 설명으로 남기지 않는다(리드 검토 11/14 낮음 2).
    ['엄청 긴 이야기를 보내도 될까요?', true, ''],
    ['재밌는 아이디어를 보내도 될까요?', true, ''],
    ['제 소설 줄거리를 줘도 될까요?', true, ''],
    ['짧은 줄거리를 보내도 괜찮을까요?', true, ''],
    ['제 시리즈의 줄거리를 줘도 될까요?', true, ''],
    ['무서운 귀신 이야기를 보내도 될까요?', true, '무서운 귀신 이야기'],
    // 새로 걸리는 영어 허락 말의 설명(리드 검토 11/14 보통 2)
    ['Can I tell the story of a fox and a crow?', true, 'a fox and a crow'],
    ['Can I share the plot of my script?', true, ''],
    ['Can I share my two-page script?', true, ''],
    // 물음의 틀 낱말(here · instead · first …)은 설명 끝에 남기지 않는다.
    ['Can I paste my script for a five-episode series about bakers here?', true, 'about bakers'],
    ['Could I upload my outline - a drama about two chefs - instead?', true, 'a drama about two chefs'],
    // of 로 시작하는 조각은 앞 of 를 떼고, 뒤에 글이 이어지면 문장으로 끊어 붙인다(리드 11/14 낮음 a).
    ['May I share the story of how my parents met?', true, 'how my parents met'],
    ['May I share the story of how my parents met? It was in a small bakery.', true, 'how my parents met. It was in a small bakery.'],
    ['Can I tell you a story about a dragon who learns to fly? It is for kids.', true, 'about a dragon who learns to fly. It is for kids.'],
    ['I want a series, and can I give you the storyline? It is about bakers.', true, 'I want a series. It is about bakers.'],
    ['Can I share a story of my own?', true, ''],
    ['Can I tell you the story of a man who talks about birds?', true, 'a man who talks about birds'],
    // 허락 문장 밖의 글은 앞뒤 차례대로 모두 설명이 된다 — 인사 · 고마움 말 · 짧은 확인 말 · 물음꼴 문장만 뺀다(리드 11/14 최종 규칙).
    ['I want a series about bakers. Can I send you my script? How long can it be? It is a comedy.', true, 'I want a series about bakers. It is a comedy.'],
    ['What genre suits it best? I want a series about bakers. Can I send you my script?', true, 'I want a series about bakers.'],
    ['시리즈를 만들고 싶어요. 줄거리를 줘도 될까요? 감사합니다! 한 편은 30초 안팎이에요.', true, '시리즈를 만들고 싶어요. 한 편은 30초 안팎이에요.'],
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

// 120자를 넘는 줄거리 — 이 시험을 위해 새로 지은 글이다(실제 사용자의 글이 아니다).
const LONG_KO = '비 오는 항구 도시에서 길고양이를 돌보는 노인과 매일 밤 같은 자리에 앉는 소녀가 있다. 노인은 소녀에게 고양이들의 이름을 하나씩 알려 주고, 소녀는 그 이름을 공책에 적어 둔다. 어느 날 노인이 보이지 않자 소녀는 공책을 들고 항구의 가게들을 돌며 노인의 행방을 묻는다. 가게 주인들은 저마다 노인이 마지막으로 들른 날을 다르게 기억한다.'
const LONG_EN = 'A lighthouse keeper lights the lamp at the same hour every night. One stormy evening a small fishing boat follows the light home, and its captain turns out to be the son who left the village long ago. They drink tea in silence until morning.'

// 허락 물음 뒤에 글이 붙은 첫 글 — 앞의 11개(한국어 5 · 영어 6)는 자기 사정을 말한 글, 다음 3개는 줄거리를 이미 쓴 글(예전에는 바로 시작했다), 나머지는 숫자와 단위가 섞인 줄거리다.
// 이 목록은 모두 이 시험을 위해 새로 지은 글이다 — 실제 사용자의 글이 아니다.
const AFTER_TALK: Array<[string, string]> = [
  // 자기 사정을 말한 글 — 한국어 5
  ['줄거리 보내도 될까요? 처음 써 보는 거라 많이 서툴러요 ㅠㅠ', '처음 써 보는 거라 많이 서툴러요 ㅠㅠ'],
  ['줄거리를 줘도 될까요? 친구들이 재밌다고 해서 용기를 내 봤어요.', '친구들이 재밌다고 해서 용기를 내 봤어요.'],
  ['아이디어를 보내도 될까요? 제가 영상은 처음이라 잘 모르겠어요.', '제가 영상은 처음이라 잘 모르겠어요.'],
  ['시나리오를 먼저 올려도 돼요? 아직 다듬는 중이라 부끄럽네요.', '아직 다듬는 중이라 부끄럽네요.'],
  ['이야기를 들려드려도 될까요? 퇴근하고 틈틈이 써 둔 거예요.', '퇴근하고 틈틈이 써 둔 거예요.'],
  // 영어 6
  ['Can I share my story? My friends said it was really good.', 'My friends said it was really good.'],
  ['May I share an idea? I am new here and not sure how this works.', 'I am new here and not sure how this works.'],
  ['Can I send you my script? I wrote it last summer during a long train ride.', 'I wrote it last summer during a long train ride.'],
  ['Could I paste my outline here? It has been sitting in my notebook for years.', 'It has been sitting in my notebook for years.'],
  ['Can I give you my plot? I have never made a video before, so please bear with me.', 'I have never made a video before, so please bear with me.'],
  ['May I share my storyline? My sister loves mysteries and helped me a lot.', 'My sister loves mysteries and helped me a lot.'],
  // 줄거리를 이미 쓴 글 3 — 예전에는 바로 시작했다. 이제는 이것도 허락 답을 먼저 한다.
  ['May I give you my plot? A girl swaps bodies with her grandmother for one summer.', 'A girl swaps bodies with her grandmother for one summer.'],
  ['줄거리를 줘도 될까요? 우주로 간 고양이가 열 년 만에 집으로 돌아오는 이야기예요.', '우주로 간 고양이가 열 년 만에 집으로 돌아오는 이야기예요.'],
  ['Can I share my idea? A robot learns to paint after its owner goes blind.', 'A robot learns to paint after its owner goes blind.'],
  // 숫자와 단위가 섞인 줄거리도 같다.
  ['줄거리를 줘도 될까요? 세 자매가 한 장 남은 지도를 들고 바닷가 마을로 떠나는 이야기예요.', '세 자매가 한 장 남은 지도를 들고 바닷가 마을로 떠나는 이야기예요.'],
  ['Can I share my idea? A 3 pages story about a baker who meets a ghost.', 'A 3 pages story about a baker who meets a ghost.'],
]

describe('허락 물음 뒤에 쓴 글은 줄거리든 사정 말이든 먼저 허락 답을 한다', () => {
  // 왜: 물음 뒤의 글을 줄거리로 읽어 바로 시작하면 "처음 써 보는 거라 서툴러요" 같은 자기 사정 말이 이야기가 되어, 허락 물음에 답이 없는 채로 산문이 만들어진다(11/14 채팅 점검 A 가 다시 난다).
  //   120자 이하의 허락 물음은 뒤에 무엇이 오든 늘 먼저 허락 답을 하고, 뒤에 쓴 글은 버리지 않고 설명으로 들고 있다가 이어 보낸 말 앞에 붙인다(리드 11/14 최종 규칙).

  it.each(AFTER_TALK)('%s → 허락 답을 하고 뒤에 쓴 글은 설명으로 들고 있는다: %j', (text, preface) => {
    // 왜: 물음 뒤에 줄거리가 오든 사정 말이 오든 같은 규칙이어야 한다 — 글을 읽어 가르는 규칙을 늘리면 가르기가 틀린 글이 다시 바로 시작된다.
    expect(splitPermissionAsk(text)).toEqual({ asking: true, preface })
    expect(storyWithoutPermissionAsk(text)).toBeNull()
    expect(asksToShareStory(text)).toBe(true)
  })

  // 왜: 인사 · 고마움 말 · 짧은 확인 말 · 물음꼴 문장은 설명이 아니다 — 앞에 있든 뒤에 있든 이 말들만 뺀다. 나머지는 차례대로 모두 남는다.
  it.each([
    ['줄거리를 줘도 될까요? 감사합니다!', ''],
    ['줄거리를 줘도 될까요? 영상은 몇 분까지 되나요?', ''],
    ['줄거리를 줘도 될까요? 네.', ''],
    ['Can I share my idea? OK.', ''],
    ['May I give you my plot? Thanks a lot.', ''],
    ['Can I share my idea? How long can it be?', ''],
    ['Can I share my idea? Thanks! Is there a length limit?', ''],
    ['줄거리를 줘도 될까요?', ''],
    ['시리즈를 만들고 싶은데, 줄거리를 줘도 될까요? 우주로 간 고양이가 열 년 만에 집으로 돌아오는 이야기예요.', '시리즈를 만들고 싶은데 우주로 간 고양이가 열 년 만에 집으로 돌아오는 이야기예요.'],
    ['줄거리를 줘도 될까요? 우주로 간 고양이가 열 년 만에 집으로 돌아오는 이야기예요. 감사합니다!', '우주로 간 고양이가 열 년 만에 집으로 돌아오는 이야기예요.'],
    ['Can I share my idea? A robot learns to paint after its owner goes blind. How long can it be?', 'A robot learns to paint after its owner goes blind.'],
    ['Hi! Can I send you my script? Thanks! A baker finds a letter hidden inside a loaf of bread.', 'A baker finds a letter hidden inside a loaf of bread.'],
  ])('%s → 빼는 말만 빼고 설명 %j', (text, preface) => {
    expect(splitPermissionAsk(text)).toEqual({ asking: true, preface })
    expect(storyWithoutPermissionAsk(text)).toBeNull()
  })

  it('허락 물음이 없는 글은 그대로 두고 허락 답도 하지 않는다', () => {
    // 왜: 정상 경로 고정 — 물음이 없으면 건드릴 것이 없다.
    expect(storyWithoutPermissionAsk(SEED)).toBeNull()
    expect(storyWithoutPermissionAsk('')).toBeNull()
    expect(asksToShareStory(SEED)).toBe(false)
  })
})

describe('허락 문장 밖 글이 120자를 넘으면 이미 쓴 이야기로 읽고 물음 문장만 빼고 바로 시작한다', () => {
  const count = (text: string) => Array.from(text.replace(/\s+/g, '')).length
  let saved = ''
  beforeEach(() => {
    saved = ''
    routes['PATCH /api/produce/entry'] = (body) => {
      const idea = (body as { patch?: { idea?: string } } | null)?.patch?.idea
      if (typeof idea === 'string') saved = idea
      return { body: { ok: true } }
    }
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...useEntryStore.getState().draft, idea: saved }) } })
  })

  it.each([
    [`${LONG_KO} 줄거리를 줘도 될까요?`, LONG_KO],
    [`줄거리를 줘도 될까요? ${LONG_KO}`, LONG_KO],
    [`시리즈를 만들고 싶은데, 줄거리를 줘도 될까요? ${LONG_KO}`, `시리즈를 만들고 싶은데 ${LONG_KO}`],
    [`Can I give you my storyline? ${LONG_EN}`, LONG_EN],
    [`${LONG_EN} Can I give you my storyline?`, LONG_EN],
  ])('%s → 물음 문장만 빼고 그 글로 시작한다', (text, story) => {
    // 왜: 이미 이야기를 길게 적은 사람에게 "여기에 적어 주세요"라고 하며 쓴 글을 버리면 같은 글을 다시 써야 한다. 길이는 허락 문장 밖의 글만 잰다.
    expect(count(story)).toBeGreaterThan(120)
    expect(storyWithoutPermissionAsk(text)).toBe(story)
    expect(asksToShareStory(text)).toBe(false)
  })

  it('120자 이하이면 같은 꼴의 글도 시작하지 않고 허락 답을 한다', () => {
    // 왜: 정상 경로 고정 — 경계 바로 아래의 글은 바로 시작하지 않는다.
    const edge = '가'.repeat(120)
    expect(count(edge)).toBe(120)
    expect(storyWithoutPermissionAsk(`줄거리를 줘도 될까요? ${edge}`)).toBeNull()
    expect(asksToShareStory(`줄거리를 줘도 될까요? ${edge}`)).toBe(true)
    expect(storyWithoutPermissionAsk(`줄거리를 줘도 될까요? ${edge}가`)).toBe(`${edge}가`)
  })

  it('시작 대화에서 120자를 넘는 글은 허락 답 없이 물음 문장만 빼고 바로 시작한다', async () => {
    // 왜: 이미 쓴 이야기를 버리지 않는다 — 추천까지 바로 간다.
    setDraft({ ...emptyEntryDraft(), idea: `${QUESTION_ONLY} ${LONG_KO}` })

    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')

    const state = useEntryStore.getState()
    expect(state.draft.idea).toBe(LONG_KO)
    expect(state.chat.asked ?? null).toBeNull()
    expect(chatTranscript(state.draft, state.chat, ko).some((i) => i.id === 'permission-answer')).toBe(false)
    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(true)
  })

  it('화면에서 고르기 탭도 120자를 넘는 글이면 안내 없이 물음 문장만 빼고 다음으로 간다', async () => {
    // 왜: 두 탭이 같은 규칙이다.
    setDraft({ ...emptyEntryDraft(), idea: `시리즈를 만들고 싶은데, ${QUESTION_ONLY} ${LONG_KO}` })

    expect(await useEntryStore.getState().formNext()).toBe('ok')

    const state = useEntryStore.getState()
    expect(state.draft.idea).toBe(`시리즈를 만들고 싶은데 ${LONG_KO}`)
    expect(state.showShareAnswer).toBe(false)
    expect(state.formStep).toBe(2)
  })
})

describe('허락 답 뒤에 보낸 말은 설명과 합쳐 이야기 씨앗이 된다', () => {
  // 이 시험을 위해 새로 지은 글 — 실제 사용자의 글이 아니다.
  const REMARK = '친구들이 재밌다고 해서 용기를 내 봤어요.'
  const ASK_REMARK = `줄거리를 줘도 될까요? ${REMARK}`
  const PREFACE = '시리즈를 만들고 싶은데'
  let saved = ''
  beforeEach(() => {
    saved = ''
    routes['PATCH /api/produce/entry'] = (body) => {
      const idea = (body as { patch?: { idea?: string } } | null)?.patch?.idea
      if (typeof idea === 'string') saved = idea
      return { body: { ok: true } }
    }
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...useEntryStore.getState().draft, idea: saved }) } })
  })

  async function ask(idea: string) {
    setDraft({ ...emptyEntryDraft(), idea })
    expect(await useEntryStore.getState().chatSendFirst()).toBe('asked')
  }

  it.each(AFTER_TALK)('%s → 허락 답을 하고, 다음에 보낸 줄거리와 합쳐 이야기 씨앗이 된다', async (text, preface) => {
    // 왜: 사정 말이든 줄거리든 앱이 먼저 답한 뒤 이어 보낸 글과 함께 씨앗이 되어야, 쓴 말이 하나도 버려지지 않고 물음은 씨앗에 남지 않는다.
    await ask(text)
    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
    expect(useEntryStore.getState().chat.seedPrefix).toBe(preface)
    expect(useEntryStore.getState().draft.idea).toBe('')
    const state = useEntryStore.getState()
    expect(chatTranscript(state.draft, state.chat, ko).find((i) => i.id === 'permission-answer')).toMatchObject({ kind: 'agent' })

    useEntryStore.getState().setIdea(SEED)
    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(`${preface}\n\n${SEED}`)
    expect(useEntryStore.getState().chat.seedPrefix ?? null).toBeNull()
  })

  it.each(['네', '응', 'ok', 'OK!', '그게 다예요', '네, 그게 다예요.', "that's it", "That's all.", 'ㅇㅋ', '네 감사합니다', 'OK, thanks!'])('설명이 20자 이상이면 짧은 확인 말 %j 만 보내도 그 말은 빼고 설명만으로 시작한다', async (word) => {
    // 왜: 줄거리를 이미 다 말한 사람은 "네"나 "그게 다예요"만 보낸다 — 그 말이 씨앗에 붙거나 더 적어 달라는 말을 들으면 안 된다.
    await ask(ASK_REMARK)
    useEntryStore.getState().setIdea(word)

    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(REMARK)
    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(true)
  })

  it('설명이 20자가 안 되면 짧은 확인 말만 보내도 더 적어 달라고 한다', async () => {
    // 왜: 설명이 짧은데 "네"만 오면 이야기로 삼을 글이 없다 — 지금처럼 더 적어 달라고 한다. 확인 말이 글자 수를 채워 주면 안 된다.
    await ask(QUESTION)
    expect(useEntryStore.getState().chat.seedPrefix).toBe(PREFACE)
    useEntryStore.getState().setIdea('네, 그게 다예요')

    expect(await useEntryStore.getState().chatSendFirst()).toBe('too_short')

    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
    expect(useEntryStore.getState().chat.seedPrefix).toBe(PREFACE)
    expect(useEntryStore.getState().draft.idea).toBe('네, 그게 다예요')
  })

  it('설명이 없으면(물음만 썼으면) 짧은 확인 말만 보내도 더 적어 달라고 한다', async () => {
    // 왜: 정상 경로 고정 — 들고 있는 설명이 없으면 지금과 같다.
    await ask(QUESTION_ONLY)
    useEntryStore.getState().setIdea('네')

    expect(await useEntryStore.getState().chatSendFirst()).toBe('too_short')

    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
  })

  it('이번에 보낸 글이 20자가 안 돼도 설명과 합쳐 20자 이상이면 이야기 씨앗이 된다', async () => {
    // 왜: 길이는 합친 글로 잰다 — 사정 말을 길게 쓴 사람이 짧은 줄거리 한 줄을 보냈다고 다시 적게 하지 않는다.
    await ask(QUESTION)
    useEntryStore.getState().setIdea('비 오는 항구 이야기')
    expect(ideaLength('비 오는 항구 이야기')).toBeLessThan(20)

    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(`${PREFACE}\n\n비 오는 항구 이야기`)
  })

  it('설명과 합쳐도 20자가 안 되면 더 적어 달라고 하며 합친 글자 수를 알려 주고 보낸 글은 지우지 않는다', async () => {
    // 왜: 안내 문구의 "지금 N자"가 실제로 잰 글자 수와 달라 보이면 사람이 무엇을 더 적어야 하는지 알 수 없다.
    await ask(QUESTION)
    useEntryStore.getState().setIdea('고양이요')

    expect(await useEntryStore.getState().chatSendFirst()).toBe('too_short')

    const state = useEntryStore.getState()
    expect(state.draft.idea).toBe('고양이요')
    expect(state.chat.seedPrefix).toBe(PREFACE)
    expect(chatTranscript(state.draft, state.chat, en).find((i) => i.id === 'too-short')).toMatchObject({ text: expect.stringContaining('(Now 18 characters)') })
  })

  it('"네"로 시작해도 이야기를 이어 쓴 말은 확인 말이 아니라 설명 뒤에 그대로 붙는다', async () => {
    // 왜: 확인 말 가르기가 넓어지면 이야기의 첫머리가 잘린다 — 확인 말만으로 된 글만 뺀다.
    await ask(ASK_REMARK)
    useEntryStore.getState().setIdea('네, 비 오는 항구 도시의 이야기예요')

    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(`${REMARK}\n\n네, 비 오는 항구 도시의 이야기예요`)
  })

  it('들고 있는 설명이 있어도 120자를 넘는 글을 보내면 물음 문장은 빼고 설명 뒤에 붙는다', async () => {
    // 왜: 설명을 들고 있다가 긴 줄거리를 허락 물음과 함께 붙여 넣는 사람도 설명이 사라지지 않고 물음이 씨앗에 남지 않는다.
    await ask(ASK_REMARK)
    useEntryStore.getState().setIdea(`${QUESTION_ONLY} ${LONG_KO}`)

    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(`${REMARK}\n\n${LONG_KO}`)
  })
})

describe('화면에서 고르기 탭도 같은 규칙이다', () => {
  // 이 시험을 위해 새로 지은 글 — 실제 사용자의 글이 아니다.
  const REMARK = '친구들이 재밌다고 해서 용기를 내 봤어요.'
  const ASK_REMARK = `줄거리를 줘도 될까요? ${REMARK}`
  let saved = ''
  beforeEach(() => {
    saved = ''
    routes['PATCH /api/produce/entry'] = (body) => {
      const idea = (body as { patch?: { idea?: string } } | null)?.patch?.idea
      if (typeof idea === 'string') saved = idea
      return { body: { ok: true } }
    }
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...useEntryStore.getState().draft, idea: saved }) } })
  })

  it('120자 이하의 허락 물음은 뒤에 사정 말이 있어도 다음으로 가지 않고 안내를 보이며 쓴 글은 지우지 않는다', async () => {
    // 왜: 채팅 탭과 같은 규칙이다 — 뒤의 글이 사정 말인지 줄거리인지 가르지 않고 먼저 허락 답을 한다.
    setDraft({ ...emptyEntryDraft(), idea: ASK_REMARK })

    expect(await useEntryStore.getState().formNext()).toBe('asked')

    const state = useEntryStore.getState()
    expect(state.formStep).toBe(1)
    expect(state.showShareAnswer).toBe(true)
    expect(state.draft.idea).toBe(ASK_REMARK)
    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
  })

  it('안내를 본 뒤 글을 고치지 않고 다시 다음을 눌렀을 때 설명이 20자 이상이면 그 설명으로 이어 간다', async () => {
    // 왜: 채팅 탭의 "그게 다예요"와 같다 — 더 보탤 말이 없는 사람이 같은 안내만 계속 보면 물음 문장을 손으로 지워야 한다.
    setDraft({ ...emptyEntryDraft(), idea: ASK_REMARK })
    expect(await useEntryStore.getState().formNext()).toBe('asked')

    expect(await useEntryStore.getState().formNext()).toBe('ok')

    const state = useEntryStore.getState()
    expect(state.draft.idea).toBe(REMARK)
    expect(state.showShareAnswer).toBe(false)
    expect(state.formStep).toBe(2)
  })

  it('안내를 본 뒤 줄거리를 이어 적으면 물음 문장만 덜어 내고 이어 간다 — 이어 적은 글이 120자 이하여도 같다', async () => {
    // 왜: 안내를 본 사람이 "여기에 적어 주세요"대로 쓴 글에 또 안내를 보이면 같은 자리에서 막힌다.
    setDraft({ ...emptyEntryDraft(), idea: ASK_REMARK })
    expect(await useEntryStore.getState().formNext()).toBe('asked')

    useEntryStore.getState().setIdea(`${ASK_REMARK} ${SEED}`)
    expect(await useEntryStore.getState().formNext()).toBe('ok')

    expect(useEntryStore.getState().draft.idea).toBe(`${REMARK} ${SEED}`)
  })
})

describe('허락 물음 뒤의 덧말', () => {
  // 지금은 덧말이 아닌 글도 같은 규칙이다(위 "허락 물음 뒤에 쓴 글은 줄거리든 사정 말이든 먼저 허락 답을 한다") — 이 표는 길이 · 형식을 말한 덧말의 설명이 그대로 남는지 고정한다.
  // 왜: "It is long, about 3 pages."를 줄거리로 보고 시작하면 답 없이 엉뚱한 씨앗으로 이야기가 시작된다(리드 검토 11/14). 길이 · 형식 · 소개만 말한 덧말은 줄거리가 아니라 허락 답을 하고,
  //   덧말은 이야기 씨앗 앞 설명으로 들고 있어 잃지 않는다.
  it.each([
    ['Can I paste my script here? It is long, about 3 pages.', 'It is long, about 3 pages.'],
    ['줄거리를 줘도 될까요? 8회짜리예요.', '8회짜리예요.'],
    ["May I give you my plot? It's a comedy about two rival bakers.", "It's a comedy about two rival bakers."],
    ['Can I share my idea? This is my first try.', 'This is my first try.'],
    ['줄거리를 줘도 될까요? 3페이지 정도예요.', '3페이지 정도예요.'],
    ['Can I paste my script? About 3 pages.', 'About 3 pages.'],
    ['Can I paste my script? Roughly 2,000 words.', 'Roughly 2,000 words.'],
    ['줄거리를 줘도 될까요? 총 8편이에요.', '총 8편이에요.'],
    ['Can I send my outline? It is long. Thanks!', 'It is long.'],
    ['시리즈를 만들고 싶은데, 줄거리를 줘도 될까요? 8회짜리예요.', '시리즈를 만들고 싶은데 8회짜리예요.'],
    ['Can I share my idea? That is why I wrote it. Is there a length limit?', 'That is why I wrote it.'],
    // 길이 · 분량 · 형식 말이 여럿이어도 숫자 + 단위와 군말뿐이면 덧말이다.
    ['Can I send my script? 12 episodes, 10 minutes each.', '12 episodes, 10 minutes each.'],
    ['줄거리를 줘도 될까요? A4 두 장 분량이에요.', 'A4 두 장 분량이에요.'],
    ['줄거리를 줘도 될까요? 한 편은 30초 안팎이에요.', '한 편은 30초 안팎이에요.'],
  ])('%s → 허락 답을 하고 덧말은 설명으로 들고 있는다: %s', (text, preface) => {
    expect(splitPermissionAsk(text)).toEqual({ asking: true, preface })
    expect(storyWithoutPermissionAsk(text)).toBeNull()
  })

  it('물음 뒤에 덧말만 있으면 줄거리로 시작하지 않고 허락 답을 하며 덧말은 이야기 씨앗 앞에 들고 있는다', async () => {
    // 왜: 덧말을 줄거리로 읽으면 답 없이 "It is long, about 3 pages."로 이야기가 시작된다. 덧말은 줄거리를 이어 적을 때 앞 설명으로 붙는다.
    setDraft({ ...emptyEntryDraft(), idea: 'Can I paste my script here? It is long, about 3 pages.' })

    expect(await useEntryStore.getState().chatSendFirst()).toBe('asked')

    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
    expect(useEntryStore.getState().chat.seedPrefix).toBe('It is long, about 3 pages.')
    expect(useEntryStore.getState().draft.idea).toBe('')
  })
})
