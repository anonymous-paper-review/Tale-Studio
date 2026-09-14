// 이전 대화와 응답 통계가 늦게 도착해도 새로 나눈 대화와 선택지를 유지한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { choiceSuggestionMarker } from '@/lib/chat-blocks'
import { loadLatestChatTrace } from '@/lib/chat-persistence'
import { buildChatTrace, type ChatTrace } from '@/lib/chat-trace'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

vi.mock('@/lib/chat-persistence', () => ({
  saveChatMessage: vi.fn(),
  saveChatTrace: vi.fn(),
  saveChatTracePatch: vi.fn(),
  loadLatestChatTrace: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function trace(traceId: string): ChatTrace {
  return buildChatTrace({ traceId, stage: 'producer', route: 'produce/chat', system: '', history: [], contextMessage: '' })
}

function historyResponse(content = '이전에 대사 언어를 물었어요.') {
  return Response.json({ messages: [
    { stage: 'producer', role: 'model', content },
    { stage: 'producer', role: 'model', content: choiceSuggestionMarker({
      id: 'old-choice', stage: 'producer', content: '', labels: ['한국어로', '대사 없이 영상만'],
    }) },
  ] })
}

function respondToChat(history: Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/produce/chat'
    ? Promise.resolve(Response.json({ reply: '영상의 분위기를 정해 주세요.', choices: ['잔잔하게', '역동적으로'], trace: trace('new-response') }))
    : history))
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.setState({ projectId: 'history-project', currentStage: 'producer', reachedStage: 'producer', projectLocale: 'ko', projectLocaleLocked: true })
  vi.mocked(loadLatestChatTrace).mockResolvedValue(null)
})

afterEach(() => {
  useGlobalChatStore.getState().reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('늦게 불러온 이전 대화', () => {
  it('이전 대화를 늦게 불러오면 그사이에 새로 나눈 대화와 선택지를 유지한다', async () => {
    const history = deferred<Response>()
    respondToChat(history.promise)
    const loading = useGlobalChatStore.getState().loadMessages('history-project')
    await useGlobalChatStore.getState().sendMessage('대사 없이 영상만')
    const current = useGlobalChatStore.getState()

    history.resolve(historyResponse())
    await loading

    expect(useGlobalChatStore.getState().messages).toEqual(current.messages)
    expect(useGlobalChatStore.getState().suggestion).toEqual(current.suggestion)
    expect(useGlobalChatStore.getState().suggestion?.action?.kind).toBe('choices')
    expect(useGlobalChatStore.getState().messagesLoadedProjectId).toBe('history-project')
  })

  it('응답 통계 조회가 늦으면 대화부터 표시한다', async () => {
    const statistics = deferred<ChatTrace | null>()
    vi.mocked(loadLatestChatTrace).mockReturnValue(statistics.promise)
    respondToChat(Promise.resolve(historyResponse()))
    const loading = useGlobalChatStore.getState().loadMessages('history-project')

    try {
      await vi.waitFor(() => {
        expect(useGlobalChatStore.getState().messages.map(message => message.content)).toEqual(['이전에 대사 언어를 물었어요.'])
        expect(useGlobalChatStore.getState().messagesLoadedProjectId).toBe('history-project')
      }, { timeout: 200 })
    } finally {
      statistics.resolve(null)
      await loading
    }
  })

  it('이전 대화 조회가 거절되면 그사이에 새로 나눈 대화와 선택지를 유지한다', async () => {
    const history = deferred<Response>()
    respondToChat(history.promise)
    const loading = useGlobalChatStore.getState().loadMessages('history-project')
    await useGlobalChatStore.getState().sendMessage('대사 없이 영상만')
    const current = useGlobalChatStore.getState()

    history.resolve(Response.json({ error: '조회 실패' }, { status: 503 }))
    await loading

    expect(useGlobalChatStore.getState().messages).toEqual(current.messages)
    expect(useGlobalChatStore.getState().suggestion).toEqual(current.suggestion)
    expect(useGlobalChatStore.getState().lastTrace).toEqual(current.lastTrace)
    expect(useGlobalChatStore.getState().messagesLoadedProjectId).toBe('history-project')
  })

  it('이전 대화 조회 중 연결이 끊기면 그사이에 새로 나눈 대화와 선택지를 유지한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const history = deferred<Response>()
    respondToChat(history.promise)
    const loading = useGlobalChatStore.getState().loadMessages('history-project')
    await useGlobalChatStore.getState().sendMessage('대사 없이 영상만')
    const current = useGlobalChatStore.getState()

    history.reject(new Error('연결 끊김'))
    await loading

    expect(useGlobalChatStore.getState().messages).toEqual(current.messages)
    expect(useGlobalChatStore.getState().suggestion).toEqual(current.suggestion)
    expect(useGlobalChatStore.getState().lastTrace).toEqual(current.lastTrace)
    expect(useGlobalChatStore.getState().messagesLoadedProjectId).toBe('history-project')
  })

  it('이전 응답 통계가 늦게 도착하면 새 응답 통계를 유지한다', async () => {
    const statistics = deferred<ChatTrace | null>()
    vi.mocked(loadLatestChatTrace).mockReturnValue(statistics.promise)
    respondToChat(Promise.resolve(historyResponse()))
    const loading = useGlobalChatStore.getState().loadMessages('history-project')
    await useGlobalChatStore.getState().sendMessage('대사 없이 영상만')

    statistics.resolve(trace('old-response'))
    await loading
    await vi.waitFor(() => expect(useGlobalChatStore.getState().lastTrace?.traceId).toBe('new-response'))
  })

  it('응답 통계를 먼저 불러오면 뒤이어 도착한 이전 대화도 표시한다', async () => {
    const response = historyResponse()
    const savedHistory = await response.json()
    const history = deferred<typeof savedHistory>()
    vi.spyOn(response, 'json').mockReturnValue(history.promise)
    vi.mocked(loadLatestChatTrace).mockResolvedValue(trace('saved-response'))
    respondToChat(Promise.resolve(response))
    const loading = useGlobalChatStore.getState().loadMessages('history-project')

    try {
      await vi.waitFor(() => expect(useGlobalChatStore.getState().lastTrace?.traceId).toBe('saved-response'))
    } finally {
      history.resolve(savedHistory)
      await loading
    }

    expect(useGlobalChatStore.getState().messages.map(message => message.content)).toEqual(['이전에 대사 언어를 물었어요.'])
    expect(useGlobalChatStore.getState().lastTrace?.traceId).toBe('saved-response')
    expect(useGlobalChatStore.getState().suggestion?.restoredChoices?.options).toEqual(['한국어로', '대사 없이 영상만'])
  })

  it('같은 프로젝트 대화를 겹쳐 불러오면 나중에 요청한 결과를 유지한다', async () => {
    const first = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(historyResponse('나중에 조회한 대화예요.')))
    const firstLoad = useGlobalChatStore.getState().loadMessages('history-project')
    await useGlobalChatStore.getState().loadMessages('history-project')

    first.resolve(historyResponse('먼저 조회한 오래된 대화예요.'))
    await firstLoad

    expect(useGlobalChatStore.getState().messages.map(message => message.content)).toEqual(['나중에 조회한 대화예요.'])
  })

  it('다른 프로젝트로 전환하면 이전 프로젝트의 대화 조회 결과를 버린다', async () => {
    const first = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(historyResponse('새 프로젝트의 대화예요.')))
    const firstLoad = useGlobalChatStore.getState().loadMessages('history-project')
    useGlobalChatStore.getState().reset()
    useProjectStore.setState({ projectId: 'next-project' })
    await useGlobalChatStore.getState().loadMessages('next-project')

    first.resolve(historyResponse())
    await firstLoad

    expect(useGlobalChatStore.getState().messages.map(message => message.content)).toEqual(['새 프로젝트의 대화예요.'])
    expect(useGlobalChatStore.getState().messagesLoadedProjectId).toBe('next-project')
  })
})
