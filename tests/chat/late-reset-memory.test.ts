// 읽어 둔 지금 프로젝트의 채팅 기억(답을 기다리는 제안 · 닫은 제안)이 늦게 비워지면, 다시 읽기 전에는 그 빈 기억으로 이 브라우저에 저장된 기억을 덮어쓰지 않는지 검사한다 (QA 2026-11-03 밤 늦은 비우기 유실 점검)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({
  saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn(),
}))

import { useGlobalChatStore as chat, type ChatSuggestion } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { createPendingProposal } from '@/lib/pending-proposal'

const key = (projectId: string) => `tale:chat-actions:${projectId}`
const stored = new Map<string, string>()
// 이 브라우저에 저장해 둔 기억 — 답을 기다리는 승인 카드 하나와 닫은 제안 하나.
const waiting = createPendingProposal({ id: 'waiting-approval', projectId: 'p-open', stage: 'producer', kind: 'producerSourcePatch', target: 'Settings', action: '언어 변경', impact: [], payload: { patch: { dialogueLanguage: 'ko' } } })
const savedMemory = { pendingProposal: waiting, deferredProposals: [], deferredSuggestions: [], dismissedSuggestionIds: ['closed-tip'], recordedSuggestionIds: ['closed-tip'], suggestion: null, cancelledProposalIds: [] }
const newTip: ChatSuggestion = { id: 'new-tip', stage: 'artist', content: '', action: null }
const memoryOf = (projectId: string) => JSON.parse(stored.get(key(projectId)) ?? 'null')

beforeEach(() => {
  stored.clear()
  stored.set(key('p-open'), JSON.stringify(savedMemory))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ messages: [] })))
  project.setState({ projectId: null })
  chat.getState().reset()
  project.setState({ projectId: 'p-open', currentStage: 'artist', reachedStage: 'artist' })
})
afterEach(() => {
  project.setState({ projectId: null })
  chat.getState().reset()
  vi.unstubAllGlobals()
})

describe('늦게 비워진 채팅 기억', () => {
  it('화면이 이미 읽어 둔 지금 프로젝트의 채팅이 늦게 비워지면, 다시 읽기 전에는 빈 기억으로 저장된 제안 기억을 덮어쓰지 않는다', async () => {
    // 왜: 프로젝트를 여는 길의 늦은 비우기가 읽어 둔 채팅 기억을 비운다. 그 빈 채팅에서 무엇이든 하면(말 걸기 · 새 제안) 빈 기억이
    //   이 브라우저에 저장돼, 답을 기다리던 승인 카드가 사라지고 닫은 제안이 새로 고침 뒤 다시 떴다.
    await chat.getState().loadMessages('p-open')
    expect(chat.getState().pendingProposal?.id).toBe('waiting-approval')
    chat.getState().reset()
    chat.getState().offerSuggestion(newTip)
    expect(memoryOf('p-open')).toMatchObject({ pendingProposal: { id: 'waiting-approval' }, dismissedSuggestionIds: ['closed-tip'] })
  })

  it('그 프로젝트 채팅을 다시 읽은 뒤에는 지금처럼 제안 기억을 저장한다', async () => {
    // 왜: 막는 것은 읽지 않은 빈 기억뿐이다 — 다시 읽으면 저장해 둔 기억 위에 새 제안만 더해 저장한다.
    await chat.getState().loadMessages('p-open')
    chat.getState().reset()
    await chat.getState().loadMessages('p-open')
    chat.getState().offerSuggestion(newTip)
    expect(memoryOf('p-open')).toMatchObject({ pendingProposal: { id: 'waiting-approval' }, dismissedSuggestionIds: ['closed-tip'], suggestion: { id: 'new-tip' } })
  })

  it('다른 프로젝트로 바꾸며 비운 뒤 새 프로젝트의 제안 기억은 지금처럼 저장한다', async () => {
    // 왜: 정상 경로 고정 — 이전 프로젝트를 비우는 것은 늦은 비우기가 아니다. 새 프로젝트의 기억은 막지 않고, 이전 프로젝트 기억은 그대로 남는다.
    await chat.getState().loadMessages('p-open')
    project.setState({ projectId: 'p-next' })
    chat.getState().reset()
    chat.getState().offerSuggestion(newTip)
    expect(memoryOf('p-next')).toMatchObject({ suggestion: { id: 'new-tip' } })
    expect(memoryOf('p-open')).toMatchObject({ pendingProposal: { id: 'waiting-approval' } })
  })
})
