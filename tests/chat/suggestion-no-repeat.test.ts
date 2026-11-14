// 같은 단계에 같은 문장이 이미 채팅 기록에 있으면 안내를 다시 남기지 않고, Director · Storyboard 안내는 채팅 기록을 다 읽은 뒤에만 띄운다
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: mocks.save, saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useGlobalChatStore, type ChatSuggestion } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

const GUIDE = 'This is The Set, where scenes → shots → videos connect as nodes.'
const guide = (overrides: Partial<ChatSuggestion> = {}): ChatSuggestion => ({ id: 'director-nodeGuide:p1', stage: 'director', content: GUIDE, action: null, dismissible: false, ...overrides })
const said = (stage: string, content: string) => useGlobalChatStore.getState().messages.filter((m) => m.stage === stage && m.content === content)

beforeEach(() => {
  mocks.save.mockReset()
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'p1' })
})

describe('채팅 기록에 같은 안내가 또 쌓이지 않는다', () => {
  it('같은 단계 · 같은 문장이 이미 채팅 기록에 있으면 안내를 다시 남기지 않는다', () => {
    // 왜: 이틀 뒤 다시 열자 Director 의 "채워 두면 좋은 것" 안내와 Storyboard 첫 안내가 같은 문구로 기록에 또 남았다(2026-11-14 오너).
    useGlobalChatStore.setState({ messages: [{ id: 'old', stage: 'director', role: 'model', content: GUIDE }] })

    useGlobalChatStore.getState().offerSuggestion(guide())

    expect(said('director', GUIDE)).toHaveLength(1)
    expect(mocks.save).not.toHaveBeenCalled()
    // 안내 카드 자체는 그대로 뜬다 — 채팅 줄만 다시 남기지 않는다.
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('director-nodeGuide:p1')
  })

  it('이 브라우저가 "이미 남겼다"를 기억하지 못해도(다른 브라우저 · 저장소를 지운 계정) 채팅 기록에 있으면 한 번만 남는다', () => {
    // 왜: "이미 남겼다"는 기억은 브라우저 저장소에만 있어, 같은 계정이 다른 브라우저로 열면 서버 채팅 기록과 상관없이 안내가 다시 쌓였다.
    useGlobalChatStore.setState({ messages: [{ id: 'old', stage: 'director', role: 'model', content: GUIDE }], recordedSuggestionIds: [] })

    useGlobalChatStore.getState().offerSuggestion(guide())
    useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
    useGlobalChatStore.getState().offerSuggestion(guide())

    expect(said('director', GUIDE)).toHaveLength(1)
    expect(useGlobalChatStore.getState().recordedSuggestionIds).toContain('director-nodeGuide:p1')
  })

  it('다른 단계에 남은 같은 문장이나 글자가 조금 다른 문장은 새 안내로 남긴다', () => {
    // 왜: 막는 것은 "같은 단계의 똑같은 글"뿐이어야 한다 — 수가 바뀐 안내("7개" → "6개")나 다른 단계의 같은 말까지 막으면 필요한 안내가 사라진다.
    useGlobalChatStore.setState({ messages: [
      { id: 'a', stage: 'writer', role: 'model', content: GUIDE },
      { id: 'b', stage: 'director', role: 'model', content: 'There are 7 things worth filling in:\n• Shot 1: no storyboard yet' },
    ] })

    useGlobalChatStore.getState().offerSuggestion(guide())
    useGlobalChatStore.getState().offerSuggestion(guide({ id: 'director-gaps-p1', content: 'There are 6 things worth filling in:\n• Shot 1: no storyboard yet' }))

    expect(said('director', GUIDE)).toHaveLength(1)
    expect(said('writer', GUIDE)).toHaveLength(1)
    expect(said('director', 'There are 6 things worth filling in:\n• Shot 1: no storyboard yet')).toHaveLength(1)
    expect(mocks.save).toHaveBeenCalledTimes(2)
  })

  it('사용자가 쓴 같은 글은 안내의 중복으로 세지 않는다', () => {
    // 왜: 사용자가 안내와 같은 문장을 직접 쳤다고 안내를 삼키면 안 된다 — 비교 대상은 안내(model)뿐이다.
    useGlobalChatStore.setState({ messages: [{ id: 'u', stage: 'director', role: 'user', content: GUIDE }] })

    useGlobalChatStore.getState().offerSuggestion(guide())

    expect(said('director', GUIDE)).toHaveLength(2)
  })

  it('단추가 달린 질문은 같은 문장이어도 지금처럼 채팅에 새로 남긴다', () => {
    // 왜: "다음 단계로 넘어갈까요?" 같은 질문은 다시 적용할 때마다 채팅에 새로 남는 것이 의도다(같은 카드라도) — 안내(버튼 없음)만 중복을 막는다.
    const question = 'Shall we move to the next step?'
    useGlobalChatStore.setState({ messages: [{ id: 'old', stage: 'writer', role: 'model', content: question }] })

    useGlobalChatStore.getState().offerSuggestion({ id: 'next-step:p1', stage: 'writer', content: question, action: { kind: 'handoff', utterance: 'Please hand over to Artist', label: 'Next' } })

    expect(said('writer', question)).toHaveLength(2)
  })

  it('처음 띄우는 안내는 지금처럼 채팅에 한 번 남기고, 같은 안내를 다시 띄워도 두 번 남기지 않는다', () => {
    // 왜: 정상 경로 고정 — 새 프로젝트의 첫 안내는 기록에 남아야 하고, 이어 부르는 같은 안내가 줄을 불리면 안 된다.
    useGlobalChatStore.getState().offerSuggestion(guide())
    useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
    useGlobalChatStore.getState().offerSuggestion(guide())

    expect(said('director', GUIDE)).toHaveLength(1)
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })
})

describe('화면 배선 — 기록을 다 읽은 뒤에만 안내한다', () => {
  const read = (file: string) => readFileSync(file, 'utf8')

  it('Director 의 채워 두면 좋은 것 · Editor 넘길까요 안내는 채팅 기록을 다 읽은 뒤에만 띄운다', () => {
    // 왜: 화면이 기록보다 먼저 안내를 띄우면 이미 안내한 프로젝트를 처음으로 보고 같은 안내가 한 번 더 남았다(Artist 첫 안내 · Prose 는 이미 기다린다).
    const page = read('src/app/studio/director/page.tsx')
    expect(page).toMatch(/const chatHistoryLoaded = useGlobalChatStore\(\(s\) => !!directorProjectId && s\.messagesLoadedProjectId === directorProjectId\)/)
    expect(page).toMatch(/if \(!chatHistoryLoaded\) return/)
    expect(page).toMatch(/\}, \[directorProjectId, nodes, offerSuggestion, gapNudgeContent, chatHistoryLoaded\]\)/)
    expect(page).toMatch(/shotCountForNudge, reachedStageForNudge, t, chatHistoryLoaded\]\)/)
  })

  it('Director 첫 사용법 안내는 채팅 기록을 다 읽은 뒤에만 띄운다', () => {
    // 왜: 같은 까닭 — 첫 안내가 기록을 읽기 전에 나가면 두 번 남는다.
    const page = read('src/app/studio/director/page.tsx')
    expect(page).toMatch(/const guideChatLoaded = useGlobalChatStore\(\(s\) => !!guideProjectId && s\.messagesLoadedProjectId === guideProjectId\)/)
    expect(page).toMatch(/if \(!guideChatLoaded\) return/)
    expect(page).toMatch(/\}, \[guideProjectId, viewMode, stageReady, guideChatLoaded, offerSuggestion, t\]\)/)
  })

  it('Storyboard 첫 안내는 채팅 기록을 다 읽은 뒤에만 띄운다', () => {
    // 왜: 기록이 비어 있는 동안 "writer 단계 말이 없다"로 보고 첫 안내를 또 남겼다.
    const view = read('src/features/writer/rough-storyboard-view.tsx')
    expect(view).toMatch(/const chatHistoryLoaded = useGlobalChatStore\(\(s\) => s\.messagesLoadedProjectId === projectId\)/)
    expect(view).toMatch(/if \(!projectId \|\| !chatHistoryLoaded \|\| briefedRef\.current\) return/)
    expect(view).toMatch(/busyOpen, chatMessages, chatHistoryLoaded, offerSuggestion, locale\]\)/)
  })
})
