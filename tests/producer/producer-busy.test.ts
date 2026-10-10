// 새 프로젝트가 넘긴 일(만화 읽기 · 카드 채우기)이나 만화 옮기기를 하는 동안 Producer 본문을 막고 로딩 원을 보인다 (2026-10-09 오너)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { producerBusyKind } from '@/lib/producer/busy'
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { PendingCreation } from '@/stores/pending-creation-store'

const PAGE = { id: 'p1', name: 'comic_1.webp', thumbUrl: 'https://img.test/p1.webp', sliceUrls: ['https://img.test/p1-1.jpg'] }
const PAGE2 = { id: 'p2', name: 'comic_2.webp', thumbUrl: 'https://img.test/p2.webp', sliceUrls: ['https://img.test/p2-1.jpg'] }
const plan = (over: Partial<PendingCreation>): PendingCreation => ({
  locale: 'ko', original: null, comicPages: [], comicStyle: null, styleImage: null, cards: [], references: [], note: null, startTreatment: false, ...over,
})

let releaseScript!: () => void
function stub() {
  const scriptGate = new Promise<void>((resolve) => { releaseScript = resolve })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/produce/comic-script') {
      await scriptGate
      return Response.json({ script: 'S#1. 방 - 낮\n남자: 왔어.\n여자: 응.\n남자: 가자.', stats: { scenes: 1, dialogue_lines: 3 } })
    }
    if (url === '/api/produce/chat') return Response.json({ reply: '카드를 채웠어요.' })
    return Response.json({ ok: true })
  }))
}

beforeEach(() => {
  project.getState().resetProject()
  producer.getState().reset()
  chat.getState().reset()
  project.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('Producer 본문 로딩 표시', () => {
  it('새 프로젝트가 넘긴 일이 남아 있거나 하는 중이면 Producer 본문을 막고 로딩 원과 지금 하는 일을 보인다', () => {
    // 왜: 10/9 오너 — 새 프로젝트로 들어온 직후 만화를 읽는 1~2분 동안 아무 표시가 없어 일하는 중인지 알기 어려웠다.
    expect(producerBusyKind('proj-1', { pending: plan({ original: 'comic', comicPages: [PAGE] }), busy: null })).toBe('comic')
    expect(producerBusyKind('proj-1', { pending: plan({ cards: [{ image: PAGE, role: 'character' }] }), busy: null })).toBe('materials')
    expect(producerBusyKind('proj-1', { pending: null, busy: { projectId: 'proj-1', kind: 'comic' } })).toBe('comic')
    expect(producerBusyKind('proj-1', { pending: null, busy: { projectId: 'other', kind: 'comic' } })).toBeNull()
    expect(producerBusyKind('proj-1', { pending: null, busy: null })).toBeNull()
    const board = readFileSync('src/features/producer/readiness-board.tsx', 'utf8')
    expect(board).toMatch(/producerBusyKind\(/)
    expect(board).toMatch(/data-testid="producer-busy"/)
  })

  it('새 프로젝트가 넘긴 일을 마치면 로딩 표시를 걷는다', async () => {
    // 정상 경로 고정 — 막는 것은 일하는 동안뿐이다.
    stub()
    const run = chat.getState().runCreationPlan(plan({ original: 'comic', comicPages: [PAGE], comicStyle: 'adapt' }))
    expect(chat.getState().boardBusy).toEqual({ projectId: 'proj-1', kind: 'comic' })
    releaseScript()
    await run
    expect(chat.getState().boardBusy).toBeNull()
  })

  it('채팅에서 만화를 고른 경우에도 대본으로 옮기는 동안 Producer 본문에 로딩 표시를 하고, 끝나면 걷는다', async () => {
    // 왜: 채팅에서 고른 만화도 1분쯤 대본을 옮긴다 — 그동안 보드를 고치면 옮긴 대본과 엇갈린다.
    stub()
    chat.getState().offerImageRoles([PAGE, PAGE2], { typed: '내 만화를 영상화해 줘', msg: '내 만화를 영상화해 줘' })
    await chat.getState().sendMessage('실사 같은 다른 스타일로 각색해 줘')
    await vi.waitFor(() => expect(chat.getState().boardBusy).toEqual({ projectId: 'proj-1', kind: 'comic' }))
    releaseScript()
    await vi.waitFor(() => expect(chat.getState().boardBusy).toBeNull())
    expect(producer.getState().preserveScript).toBe(true)
  })
})
