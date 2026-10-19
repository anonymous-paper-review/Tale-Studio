// 단계 화면 오른쪽 위의 다음 단계 버튼은 넘김 문장을 채팅에 남기며 넘기고, Writer 에서는 산문 확정 창을 먼저 연다 (리뉴얼 1차 2026-10-19 문장으로 고침)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource } from '@/lib/producer-gate'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_stage: 'artist' }, error: null }) }) }),
    }),
  }),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
const nav = vi.hoisted(() => ({ handoffToStage: vi.fn(async (stage: string) => `/studio/${stage}`) }))
vi.mock('@/lib/stage-nav', () => ({ handoffToStage: nav.handoffToStage }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'
import { nextStepAction } from '@/lib/handoff-intent'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const settings: ProjectSettings = {
  playtime: 30, genre: 'SF 스릴러', subGenre: '사이버펑크', format: 'horizontal_16:9', tone: ['dark'], targetEmotion: [], dialogueLanguage: 'ko',
}
const background: BackgroundSource = {
  localId: 'loc-1', locationId: 'neon_market', name: '네온 시장', visualDescription: '비에 젖은 네온 골목', purpose: '정보 거래 거점', origin: 'producer', userEdited: false, stale: false,
}
const userLines = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'user').map((m) => m.content)
let fetchSpy: { mock: { calls: unknown[][] } }
const writerStarts = () => fetchSpy.mock.calls.filter(([url]) => String(url) === '/api/writer/start')

beforeEach(() => {
  resetActionGuard()
  nav.handoffToStage.mockClear()
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useWriterRoomStore.setState({ confirmOpen: false, rewriteOpen: false })
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer' })
  useProducerStore.setState({ storyText: '스토리', storyReady: true, styleAnchorKey: 'style_a', projectSettings: settings, cast: [], backgrounds: [background] })
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
    const u = String(url)
    if (u.startsWith('/api/writer/status/')) return Response.json({ started: false, assets: { images_ready: true, chars_ready: 0, chars_total: 0, worlds_ready: 0, worlds_total: 0, queued_count: 0, failed_count: 0, stalled: false } })
    return Response.json({ runId: 'run-1', started: false })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  useLocaleStore.setState({ locale: 'en' })
})

describe('다음 단계 버튼은 단계마다 다음 단계를 가리킨다', () => {
  // 왜: 리뉴얼 단계 순서(Writer = id producer → Artist → Storyboard = id writer → Director → Editor)를 버튼 이름이 따른다.
  //   Storyboard → Director 는 보드의 [다음: Director로] 확인 창이 맡아 이 표에 없다(tests/writer/board-director-handoff).
  it('다음 단계 버튼의 이름은 단계마다 다음 단계를 가리키고, 확정한 Writer에서는 Artist로 가기가 된다', () => {
    expect(nextStepAction('producer', { producerLocked: false })).toMatchObject({ kind: 'handoff', label: 'Hand over to Artist', utterance: 'Please hand over to Artist' })
    expect(nextStepAction('artist', { producerLocked: true })).toMatchObject({ kind: 'handoff', label: 'Hand over to Storyboard' })
    expect(nextStepAction('writer', { producerLocked: true })).toBeNull()
    expect(nextStepAction('director', { producerLocked: true })).toMatchObject({ kind: 'handoff', label: 'Hand over to Editor' })
    expect(nextStepAction('editor', { producerLocked: true })).toBeNull()
    expect(nextStepAction('producer', { producerLocked: true })).toMatchObject({ kind: 'open', label: 'Go to Artist', stage: 'artist' })
  })
})

describe('Director→Editor 는 팝업 없이 넘긴다', () => {
  it('Director에서 다음 단계 버튼을 누르면 넘김 문장이 채팅에 남고 팝업 없이 Editor로 넘어간다', async () => {
    useProjectStore.setState({ currentStage: 'director', reachedStage: 'director' })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(userLines()).toEqual(['Editor로 넘겨주세요'])
    expect(nav.handoffToStage).toHaveBeenCalledWith('editor')
  })
})

describe('Writer에서 넘길 때는 산문 확정 창을 먼저 연다', () => {
  // 왜: 프로토타입 W6 — 확정하면 산문이 잠긴다. 버튼은 바로 넘기지 않고 확정 창부터 연다(예전 Producer 확정 팝업 대신).
  it('Writer에서 다음 단계 버튼을 누르면 바로 넘기지 않고 산문 확정 창을 먼저 연다', async () => {
    await useGlobalChatStore.getState().requestNextStep()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(writerStarts()).toHaveLength(0)
    expect(userLines()).toEqual([])
  })

  // 왜: [아니오]면 아무것도 잠그거나 넘기지 않는다.
  it('산문 확정 창에서 아니오를 누르면 아무것도 넘기지 않고 채팅에도 남기지 않는다', async () => {
    await useGlobalChatStore.getState().requestNextStep()
    useWriterRoomStore.getState().closeConfirm()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(false)
    expect(fetchSpy.mock.calls.some(([url]) => String(url) === '/api/writer/prose-confirm')).toBe(false)
    expect(writerStarts()).toHaveLength(0)
    expect(userLines()).toEqual([])
    expect(useProjectStore.getState().producerLocked).toBe(false)
  })

  // 왜: 확정한 산문은 다시 확정하지 않는다 — 다음 단계(Artist) 화면으로 가기만 한다.
  it('확정한 Writer의 다음 단계 버튼은 다시 확정하지 않고 Artist 화면으로 이동만 한다', async () => {
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(false)
    expect(nav.handoffToStage).toHaveBeenCalledWith('artist')
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/artist')
    expect(writerStarts()).toHaveLength(0)
    expect(userLines()).toEqual([])
  })

  // 왜: 산문 초안이 아직 없는 예전 프로젝트도 예전 Producer 넘김(설정 칩 · 캐스팅 검사 · Writer 시작)으로 가지 않는다.
  it('산문 초안이 없는 예전 프로젝트도 다음 단계 버튼은 예전 Producer 넘김을 하지 않는다', async () => {
    useProducerStore.setState({ backgrounds: [] })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(writerStarts()).toHaveLength(0)
    expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
  })

  // 왜: 채팅으로 넘겨 달라고 해도 승인 카드 · 바로 넘기기가 아니라 같은 확정 창을 연다.
  it('Writer 채팅으로 Artist로 넘겨 달라고 하면 승인 카드 없이 산문 확정 창을 연다', async () => {
    await useGlobalChatStore.getState().sendMessage('Artist로 넘겨줘')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useWriterRoomStore.getState().confirmOpen).toBe(true)
    expect(writerStarts()).toHaveLength(0)
  })
})
