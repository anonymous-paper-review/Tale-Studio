// Producer 시작 화면 저장소: 두 탭이 같은 초안을 쓰고, 다음 · 채팅 답 · 시작을 서버에 보내며, 산문 초안이 다 될 때까지 기다렸다가 Writer로 간다 (리뉴얼 1차 2026-10-19)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntryStore, entryStarted } from '@/features/entry/entry-store'
import { chatChips, chatTranscript, currentChatQuestion, hintText } from '@/features/entry/chat-flow'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { translate } from '@/lib/i18n/translate'
import { useProjectStore } from '@/stores/project-store'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
const PID = 'project-1'
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 30초 코미디. 주인공 민호는 하나도 못 먹는다.'

interface Call { method: string; url: string; body: unknown }
let calls: Call[] = []
let routes: Record<string, (body: unknown, call: Call) => { status?: number; body: unknown }> = {}

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** 서버가 돌려줄 추천 초안 — 지금 재료에 맞춘 추천(basis)이다. */
function recommended(draft: EntryDraft, over: Partial<NonNullable<EntryDraft['rec']>> = {}): EntryDraft {
  const rec = { kind: '1-3' as const, mood: 'comedy' as const, moodWhy: '글에 "코미디"라고 적혀 있어요', runtime: 'r60' as const, runtimeWhy: '글에 "30초"라고 적혀 있어요', level: 'grow' as const, title: '자판기의 반란', source: 'llm' as const, ...over, basis: materialBasis(draft) }
  return { ...draft, rec, picks: { mood: rec.mood, runtime: rec.runtime, level: rec.level, ratio: draft.picks.ratio ?? '9:16' }, chat: { answered: {}, pre: {} } }
}

function setDraft(draft: EntryDraft) {
  useEntryStore.setState({ projectId: PID, status: 'ready', draft })
}

beforeEach(() => {
  calls = []
  routes = {}
  useEntryStore.getState().reset()
  useProjectStore.setState({ projectId: PID, reachedStage: 'entry', currentStage: 'entry', projectTitle: 'Untitled' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body ?? null
    const call = { method, url, body }
    calls.push(call)
    const key = `${method} ${url.split('?')[0]}`
    const handler = routes[key]
    if (!handler) return respond(404, { error: 'not_mocked' })
    const out = handler(body, call)
    return respond(out.status ?? 200, out.body)
  }))
})

afterEach(async () => {
  // 시험 안에서 남긴 글 저장은 그 시험 안에서 끝낸다(다음 시험의 요청 기록에 섞이지 않게).
  await useEntryStore.getState().flushIdea()
  useEntryStore.getState().reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('두 탭이 같은 초안을 쓴다', () => {
  it('화면에서 고르기 탭에서 쓴 글과 고른 값은 채팅으로 만들기 탭에서도 같은 값으로 보인다', async () => {
    // 왜: 오너 결정 "1안 · 2안을 탭으로 둘 다". 탭을 바꿔도 다시 쓰거나 다시 고르지 않는다.
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    const draft = recommended({ ...emptyEntryDraft(), idea: IDEA })
    setDraft(draft)
    await useEntryStore.getState().formPick('mood', 'horror')
    const after = useEntryStore.getState().draft
    expect(after.picks.mood).toBe('horror')
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { projectId: PID, patch: { picks: { mood: 'horror' }, chat: { answered: { mood: true } } } } })
    // 채팅 탭: 처음 글은 이미 보낸 말로 보이고, 고른 장르·분위기는 정한 값 칩에 보이며 다시 묻지 않는다.
    const items = chatTranscript(after, { showExamples: false, examplePage: 0, lengthError: false, hint: null }, ko)
    expect(items.find((i) => i.kind === 'user')).toMatchObject({ text: IDEA })
    expect(chatChips(after, ko).find((c) => c.key === 'mood')).toMatchObject({ value: '호러' })
    expect(currentChatQuestion(after)).toBe('runtime')
  })

  it('글을 고치면 잠시 뒤 한 번만 저장하고, 다음으로 가기 전에는 기다리지 않고 바로 저장한다', async () => {
    // 왜: 글자마다 저장하면 요청이 쏟아진다. 다음을 누른 순간의 글이 추천 재료여야 한다.
    vi.useFakeTimers()
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    setDraft(emptyEntryDraft())
    useEntryStore.getState().setIdea('회사')
    useEntryStore.getState().setIdea('회사 복도')
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toEqual({ projectId: PID, patch: { idea: '회사 복도' } })
    useEntryStore.getState().setIdea(IDEA)
    await useEntryStore.getState().flushIdea()
    expect(calls).toHaveLength(2)
    expect(calls[1].body).toEqual({ projectId: PID, patch: { idea: IDEA } })
  })
})

describe('다음 (이야기 재료 → 설정)', () => {
  it('글이 20자 미만이고 파일도 없으면 서버에 추천을 묻지 않고 안내를 띄운다', async () => {
    // 왜: 짧은 글로는 추천할 수 없다. 1안은 입력칸 아래, 2안은 에이전트가 채팅으로 같은 말을 한다.
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    setDraft({ ...emptyEntryDraft(), idea: '자판기 이야기' })
    expect(await useEntryStore.getState().formNext()).toBe('too_short')
    expect(useEntryStore.getState().showLengthError).toBe(true)
    expect(await useEntryStore.getState().chatSendFirst()).toBe('too_short')
    const state = useEntryStore.getState()
    expect(state.chat.lengthError).toBe(true)
    const items = chatTranscript(state.draft, state.chat, ko)
    expect(items.find((i) => i.kind === 'error')).toMatchObject({ text: expect.stringContaining('조금 더 적어 주세요. 20자 이상이면 AI가 이야기를 잡을 수 있어요. (지금 7자)') })
    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
  })

  it('파일이 있으면 글이 비어 있어도 추천을 묻고, 추천이 오면 설정 화면으로 간다', async () => {
    // 왜: 대본 파일만 올린 사람도 다음으로 간다. 추천을 기다리는 동안은 읽는 단계를 보여주며 화면을 잠근다.
    const file = { name: '대본.txt', ext: 'txt', kind: 'text' as const, size: 30, chars: 20, text: '민호: 또 안 나와?\n팀장: 고마워.', uploadedAt: '2026-10-19T00:00:00.000Z' }
    const draft = { ...emptyEntryDraft(), file }
    setDraft(draft)
    let readingDuringRequest: unknown = null
    routes['POST /api/produce/entry/recommend'] = () => {
      readingDuringRequest = useEntryStore.getState().reading
      return { body: { draft: recommended(draft) } }
    }
    expect(await useEntryStore.getState().formNext()).toBe('ok')
    expect(readingDuringRequest).toMatchObject({ image: false, step: 0 })
    const state = useEntryStore.getState()
    expect(state.reading).toBeNull()
    expect(state.formStep).toBe(2)
    expect(state.draft.rec?.mood).toBe('comedy')
  })

  it('추천이 지금 재료에 이미 맞으면 다시 묻지 않고 고른 값을 지킨 채 설정 화면으로 간다', async () => {
    // 왜: 설정에서 이야기 재료로 돌아갔다가 그대로 다음을 누르면 고른 값을 추천으로 되돌리지 않는다.
    const draft = recommended({ ...emptyEntryDraft(), idea: IDEA })
    setDraft({ ...draft, picks: { ...draft.picks, mood: 'horror' } })
    expect(await useEntryStore.getState().formNext()).toBe('ok')
    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
    expect(useEntryStore.getState().draft.picks.mood).toBe('horror')
  })

  it('글이 없는 파일이면 추천 대신 다른 파일 올리기 · 파일 빼고 진행을 고르게 하고, 파일 빼고 진행은 파일을 빼고 다음으로 간다', async () => {
    // 왜: 글을 찾지 못한 파일로는 추천할 수 없다(프로토타입 E2e). 빼고 진행하면 글만으로 간다.
    const noText = { name: '복도_풍경.png', ext: 'png', kind: 'image' as const, size: 10, chars: 0, noText: true, storagePath: 'x', uploadedAt: '2026-10-19T00:00:00.000Z' }
    setDraft({ ...emptyEntryDraft(), idea: IDEA, file: noText })
    expect(await useEntryStore.getState().formNext()).toBe('no_text')
    expect(calls.some((c) => c.url.includes('/recommend'))).toBe(false)
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended({ ...emptyEntryDraft(), idea: IDEA }) } })
    expect(await useEntryStore.getState().continueWithoutFile('form')).toBe('ok')
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ body: { patch: { file: null } } })
    expect(useEntryStore.getState().draft.file).toBeNull()
    expect(useEntryStore.getState().formStep).toBe(2)
  })
})

describe('채팅으로 만들기', () => {
  it('채팅에서 처음 보낸 글에 이미 적힌 값은 정하고 그 질문은 건너뛴다', async () => {
    // 왜: "30초 코미디"처럼 이미 말한 것을 또 묻지 않는다(프로토타입 bPre). 읽은 값은 한 줄로 알려준다.
    const draft = { ...emptyEntryDraft(), idea: IDEA }
    setDraft(draft)
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    routes['POST /api/produce/entry/recommend'] = () => ({ body: { draft: recommended(draft, { mood: 'drama', runtime: 'r300' }) } })
    expect(await useEntryStore.getState().chatSendFirst()).toBe('ok')
    const state = useEntryStore.getState()
    expect(state.draft.picks).toMatchObject({ mood: 'comedy', runtime: 'r60' })
    expect(state.draft.chat).toEqual({ answered: { mood: true, runtime: true }, pre: { mood: true, runtime: true } })
    expect(currentChatQuestion(state.draft)).toBe('level')
    const texts = chatTranscript(state.draft, state.chat, ko).map((i) => ('text' in i ? i.text : ''))
    expect(texts).toContain('말씀에서 장르·분위기 코미디, 길이 15~60초을(를) 읽었어요. 나머지만 물어볼게요.')
  })

  it('말로 답하면 읽은 값을 정하고 다음 질문으로 가며, 읽지 못하면 같은 질문을 다시 묻는다', async () => {
    // 왜: 카드 버튼 대신 말로 답해도 된다. 못 알아들었으면 그렇다고 말하고 버튼으로 고르게 한다.
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    const base = recommended({ ...emptyEntryDraft(), idea: IDEA })
    setDraft({ ...base, chat: { answered: { mood: true, runtime: true, level: true }, pre: {} } })
    expect(currentChatQuestion(useEntryStore.getState().draft)).toBe('ratio')
    await useEntryStore.getState().chatReply('음 잘 모르겠어요')
    expect(currentChatQuestion(useEntryStore.getState().draft)).toBe('ratio')
    const unknown = useEntryStore.getState()
    expect(hintText(unknown.draft, unknown.chat.hint!, ko)).toBe('"음 잘 모르겠어요": 잘 못 알아들었어요. 버튼으로 골라 주세요.')
    await useEntryStore.getState().chatReply('세로로 해 줘')
    const state = useEntryStore.getState()
    expect(state.draft.picks.ratio).toBe('9:16')
    expect(currentChatQuestion(state.draft)).toBe('confirm')
    expect(hintText(state.draft, state.chat.hint!, ko)).toBe('"세로로 해 줘": 화면 비율 9:16(으)로 정했어요.')
    // 화면에는 지금 질문 카드 앞에 그 한 줄이 보인다.
    expect(chatTranscript(state.draft, state.chat, ko).some((i) => i.kind === 'agent' && i.text === '"세로로 해 줘": 화면 비율 9:16(으)로 정했어요.')).toBe(true)
  })

  it('추천대로를 누르면 추천값으로 정하고 다음 질문으로 넘어간다', async () => {
    // 왜: 추천이 맞으면 한 번만 누르고 넘어간다.
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    const base = recommended({ ...emptyEntryDraft(), idea: IDEA })
    setDraft({ ...base, picks: { mood: null, runtime: null, level: null, ratio: null } })
    await useEntryStore.getState().chatAcceptRecommendation('mood')
    expect(useEntryStore.getState().draft.picks.mood).toBe('comedy')
    expect(currentChatQuestion(useEntryStore.getState().draft)).toBe('runtime')
    await useEntryStore.getState().chatAcceptRecommendation('ratio')
    expect(useEntryStore.getState().draft.picks.ratio).toBe('9:16')
  })

  it('정리 카드의 값 칩을 누르면 그 질문으로 돌아간다', async () => {
    // 왜: 고치고 싶은 값만 다시 고른다. 나머지 정한 값은 그대로다.
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    const base = recommended({ ...emptyEntryDraft(), idea: IDEA })
    setDraft({ ...base, chat: { answered: { mood: true, runtime: true, level: true, ratio: true }, pre: { runtime: true } } })
    expect(currentChatQuestion(useEntryStore.getState().draft)).toBe('confirm')
    await useEntryStore.getState().chatReask('runtime')
    const state = useEntryStore.getState()
    expect(currentChatQuestion(state.draft)).toBe('runtime')
    expect(state.draft.chat.answered).toMatchObject({ mood: true, level: true, ratio: true })
    expect(state.draft.chat.pre.runtime).toBeFalsy()
  })

  it('"예시 보여줘"라고 보내면 예시를 보여주고, 예시를 누르면 입력칸에 그 글이 들어간다', async () => {
    // 왜: 아이디어가 없는 사람도 시작할 수 있다. 예시는 고쳐서 보내도 된다.
    routes['PATCH /api/produce/entry'] = () => ({ body: { ok: true } })
    setDraft({ ...emptyEntryDraft(), idea: '예시 보여줘' })
    expect(await useEntryStore.getState().chatSendFirst()).toBe('examples')
    expect(useEntryStore.getState().chat.showExamples).toBe(true)
    expect(useEntryStore.getState().draft.idea).toBe('')
    useEntryStore.getState().nextExamples()
    expect(useEntryStore.getState().chat.examplePage).toBe(1)
    useEntryStore.getState().pickExample(0, ko)
    expect(useEntryStore.getState().draft.idea).toBe('회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는데, 주인공 민호만 하나도 못 먹는 이야기')
  })
})

describe('시작과 산문 초안', () => {
  const startDraft = () => recommended({ ...emptyEntryDraft(), idea: IDEA })
  const writerStart = { projectId: PID, story: IDEA, treatmentDraft: true, writerEngine: 'v1', changeLevel: 'grow' }
  const status = (over: Record<string, unknown>) => ({ body: { started: true, draft: true, pipeline_completed: false, pipeline_failed: false, current_stage: null, current_status: 'running', ...over } })

  it('시작하면 시작 요청 → Writer 시작 요청 순서로 보내고 Writer 단계를 연다', async () => {
    // 왜: 시작 요청이 화면 비율을 잠그고 이야기를 저장한 뒤에야 Writer 가 산문 초안을 쓸 수 있다.
    setDraft(startDraft())
    routes['POST /api/produce/entry/start'] = () => ({ body: { ok: true, writerStart, title: '자판기의 반란', draft: { ...startDraft(), startedAt: '2026-10-19T00:00:00.000Z' } } })
    routes['POST /api/writer/start'] = () => ({ body: { status: 'started', draft: true } })
    routes[`GET /api/writer/status/${PID}`] = () => status({ current_stage: 'dramaturgy' })
    expect(await useEntryStore.getState().start()).toBe(true)
    expect(calls.map((c) => `${c.method} ${c.url}`).slice(0, 2)).toEqual(['POST /api/produce/entry/start', 'POST /api/writer/start'])
    expect(calls[1].body).toEqual(writerStart)
    expect(useProjectStore.getState().reachedStage).toBe('producer')
    expect(useProjectStore.getState().projectTitle).toBe('자판기의 반란')
    expect(entryStarted(useEntryStore.getState())).toBe(true)
    expect(useEntryStore.getState().writing.status).toBe('writing')
    useEntryStore.getState().reset()
  })

  it('시작은 진행 중인 제목 저장이 끝난 뒤에 보낸다', async () => {
    // 왜: 머리에서 제목을 고치고 바로 시작하면, 시작이 저장 전 제목(제목 없음)을 읽고 AI 제목을 붙일 수 있었다(10/21 검토).
    //   고장: 채팅 탭에서 제목을 고친 채로 [Writer에게 써 달라고 하기]를 누를 때.
    setDraft(startDraft())
    let releaseRename!: () => void
    const renameGate = new Promise<void>((resolve) => { releaseRename = resolve })
    let renameSaved = false
    let startSawSavedTitle: boolean | null = null
    const harnessFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        await renameGate
        renameSaved = true
      }
      return harnessFetch(input, init)
    }))
    routes[`PATCH /api/project/${PID}`] = () => ({ body: { ok: true } })
    routes['POST /api/produce/entry/start'] = () => {
      startSawSavedTitle = renameSaved
      return { body: { ok: true, writerStart, title: '내가 정한 제목', draft: { ...startDraft(), startedAt: '2026-10-19T00:00:00.000Z' } } }
    }
    routes['POST /api/writer/start'] = () => ({ body: { status: 'started', draft: true } })
    routes[`GET /api/writer/status/${PID}`] = () => status({ current_stage: 'dramaturgy' })

    void useProjectStore.getState().renameProject('내가 정한 제목')
    const started = useEntryStore.getState().start()
    await new Promise((resolve) => setTimeout(resolve, 20))
    releaseRename()
    expect(await started).toBe(true)
    expect(startSawSavedTitle).toBe(true)
    useEntryStore.getState().reset()
  })

  it('시작 응답의 AI 제목은 머리 제목이 아직 제목 없음일 때만 넣는다', async () => {
    // 왜: 직접 정한 제목이 AI 제목으로 바뀌면 안 된다(10/21 검토).
    useProjectStore.setState({ projectTitle: '내가 정한 제목' })
    setDraft(startDraft())
    routes['POST /api/produce/entry/start'] = () => ({ body: { ok: true, writerStart, title: '자판기의 반란', draft: { ...startDraft(), startedAt: '2026-10-19T00:00:00.000Z' } } })
    routes['POST /api/writer/start'] = () => ({ body: { status: 'started', draft: true } })
    routes[`GET /api/writer/status/${PID}`] = () => status({ current_stage: 'dramaturgy' })
    await useEntryStore.getState().start()
    expect(useProjectStore.getState().projectTitle).toBe('내가 정한 제목')
    useEntryStore.getState().reset()
  })

  it('초안을 쓰는 동안 Writer 진행 단계를 따라 잠금 화면 단계를 바꾸고, 초안이 다 되면 다 됐다고 표시한다', async () => {
    // 왜: 산문 초안은 몇 분 걸린다. 다 되면 Writer(산문 작업공간)로 넘어간다.
    vi.useFakeTimers()
    setDraft(startDraft())
    const stages = ['dramaturgy', 'narrativeStructure', 'scenes']
    let n = 0
    routes['POST /api/produce/entry/start'] = () => ({ body: { ok: true, writerStart, title: null, draft: { ...startDraft(), startedAt: '2026-10-19T00:00:00.000Z' } } })
    routes['POST /api/writer/start'] = () => ({ body: { status: 'started', draft: true } })
    routes[`GET /api/writer/status/${PID}`] = () => (n < stages.length ? status({ current_stage: stages[n++] }) : status({ current_stage: 'storyCheck', current_status: 'awaiting_confirmation' }))
    await useEntryStore.getState().start()
    expect(useEntryStore.getState().writing).toMatchObject({ status: 'writing', step: 0 })
    await vi.advanceTimersByTimeAsync(2600)
    expect(useEntryStore.getState().writing).toMatchObject({ status: 'writing', step: 1 })
    await vi.advanceTimersByTimeAsync(2600)
    expect(useEntryStore.getState().writing).toMatchObject({ status: 'writing', step: 2 })
    await vi.advanceTimersByTimeAsync(2600)
    expect(useEntryStore.getState().writing).toMatchObject({ status: 'done' })
  })

  it('초안 쓰기가 실패하면 다시 시도를 누를 수 있고, 다시 시도는 Writer 시작을 다시 쓰기로 보낸다', async () => {
    // 왜: Writer 가 중간에 실패해도 시작은 이미 잠겼다. 같은 값으로 초안만 다시 쓴다.
    setDraft(startDraft())
    routes['POST /api/produce/entry/start'] = () => ({ body: { ok: true, writerStart, title: null, draft: { ...startDraft(), startedAt: '2026-10-19T00:00:00.000Z' } } })
    routes['POST /api/writer/start'] = () => ({ status: 500, body: { error: 'boom' } })
    expect(await useEntryStore.getState().start()).toBe(false)
    expect(useEntryStore.getState().writing.status).toBe('failed')
    routes['POST /api/writer/start'] = () => ({ body: { status: 'started', draft: true } })
    routes[`GET /api/writer/status/${PID}`] = () => status({ current_stage: 'storyCheck', current_status: 'awaiting_confirmation' })
    await useEntryStore.getState().retryWriter()
    const retry = calls.filter((c) => c.url === '/api/writer/start').at(-1)
    expect(retry?.body).toEqual({ ...writerStart, restartDraft: true })
    await vi.waitFor(() => expect(useEntryStore.getState().writing.status).toBe('done'))
  })

  it('시작 요청이 실패하면 시작하지 않은 채 설정을 다시 고칠 수 있다', async () => {
    // 왜: 서버가 거절하면(예: 고르지 않은 값) 화면 비율은 잠기지 않았다.
    setDraft(startDraft())
    routes['POST /api/produce/entry/start'] = () => ({ status: 400, body: { error: 'missing_picks' } })
    expect(await useEntryStore.getState().start()).toBe(false)
    expect(entryStarted(useEntryStore.getState())).toBe(false)
    expect(useEntryStore.getState().writing).toMatchObject({ status: 'failed', error: 'start_failed' })
    useEntryStore.getState().dismissWriting()
    expect(useEntryStore.getState().writing.status).toBe('idle')
    expect(calls.some((c) => c.url === '/api/writer/start')).toBe(false)
  })

  it('산문을 확정해 Writer 가 다음 단계를 도는 프로젝트를 열면 잠금 화면 없이 완료 화면만 보여준다', async () => {
    // 왜: 확정 뒤의 Writer 작업은 산문 초안이 아니다. 시작 화면이 그 긴 작업 내내 화면을 잠그면 안 된다.
    routes['GET /api/produce/entry'] = () => ({ body: { draft: { ...startDraft(), startedAt: '2026-10-19T00:00:00.000Z' }, title: '자판기의 반란', startedAt: '2026-10-19T00:00:00.000Z', locale: 'ko', stage: 'producer', format: 'vertical_9:16', writer: { started: true, status: 'running', draft: false }, writerStart } })
    await useEntryStore.getState().load(PID)
    expect(entryStarted(useEntryStore.getState())).toBe(true)
    expect(useEntryStore.getState().writing.status).toBe('idle')
    expect(calls.some((c) => c.url.includes('/api/writer/status'))).toBe(false)
  })

  it('이미 시작한 프로젝트를 열면 완료 화면으로 보고, Writer 가 아직 쓰는 중이면 다 될 때까지 기다린다', async () => {
    // 왜: 시작한 Producer 는 고칠 수 없는 완료 화면이다. 새로 고침해도 쓰는 중인 초안을 놓치지 않는다.
    routes['GET /api/produce/entry'] = () => ({ body: { draft: { ...startDraft(), startedAt: '2026-10-19T00:00:00.000Z' }, title: '자판기의 반란', startedAt: '2026-10-19T00:00:00.000Z', locale: 'ko', stage: 'producer', format: 'vertical_9:16', writer: { started: true, status: 'running', draft: true }, writerStart } })
    routes[`GET /api/writer/status/${PID}`] = () => status({ current_stage: 'scenes' })
    await useEntryStore.getState().load(PID)
    expect(entryStarted(useEntryStore.getState())).toBe(true)
    await vi.waitFor(() => expect(useEntryStore.getState().writing).toMatchObject({ status: 'writing', step: 2 }))
    useEntryStore.getState().reset()
  })
})
