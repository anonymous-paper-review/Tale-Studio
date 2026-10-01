// 단계 화면 오른쪽 위의 다음 단계 버튼은 넘김 문장을 채팅에 남기며 넘기고, Producer에서 Writer로 넘길 때만 확정 팝업을 먼저 연다
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
  it('다음 단계 버튼의 이름은 단계마다 다음 단계를 가리키고, 잠긴 Producer에서는 Writer로 가기가 된다', () => {
    expect(nextStepAction('producer', { producerLocked: false })).toMatchObject({ kind: 'handoff', label: 'Hand over to Writer', utterance: 'Please hand over to Writer' })
    expect(nextStepAction('writer', { producerLocked: true })).toMatchObject({ kind: 'handoff', label: 'Hand over to Artist' })
    expect(nextStepAction('artist', { producerLocked: true })).toMatchObject({ kind: 'handoff', label: 'Hand over to Director' })
    expect(nextStepAction('director', { producerLocked: true })).toMatchObject({ kind: 'handoff', label: 'Hand over to Editor' })
    expect(nextStepAction('editor', { producerLocked: true })).toBeNull()
    expect(nextStepAction('producer', { producerLocked: true })).toMatchObject({ kind: 'open', label: 'Go to Writer', stage: 'writer' })
  })
})

describe('Writer→Artist, Director→Editor 는 팝업 없이 넘긴다', () => {
  it('Writer에서 다음 단계 버튼을 누르면 넘김 문장이 채팅에 남고 팝업 없이 Artist로 넘어간다', async () => {
    useProjectStore.setState({ currentStage: 'writer', reachedStage: 'artist' })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(userLines()).toEqual(['Artist로 넘겨주세요'])
    expect(nav.handoffToStage).toHaveBeenCalledWith('artist', { verify: true })
  })

  it('Director에서 다음 단계 버튼을 누르면 넘김 문장이 채팅에 남고 팝업 없이 Editor로 넘어간다', async () => {
    useProjectStore.setState({ currentStage: 'director', reachedStage: 'director' })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(userLines()).toEqual(['Editor로 넘겨주세요'])
    expect(nav.handoffToStage).toHaveBeenCalledWith('editor')
  })
})

describe('Producer에서 Writer로 넘길 때는 확정 팝업을 먼저 연다', () => {
  it('Producer에서 다음 단계 버튼을 누르면 바로 넘기지 않고 확정 팝업을 먼저 연다', async () => {
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm?.kind).toBe('producerLock')
    expect(writerStarts()).toHaveLength(0)
    expect(userLines()).toEqual([])
  })

  it('Producer의 필수 정보가 비어 있으면 확정 팝업 대신 채팅이 빈 곳을 알려준다', async () => {
    useProducerStore.setState({ backgrounds: [] })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(userLines()).toEqual(['Writer로 넘겨주세요'])
    expect(writerStarts()).toHaveLength(0)
    expect(useGlobalChatStore.getState().messages.at(-1)?.role).toBe('model')
  })

  it('확정 팝업에서 확정하면 넘김 문장이 채팅에 남고 Writer가 시작되며 Producer가 잠긴다', async () => {
    await useGlobalChatStore.getState().requestNextStep()
    await useGlobalChatStore.getState().confirmProducerLock()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(userLines()).toEqual(['Writer로 넘겨주세요'])
    expect(writerStarts()).toHaveLength(1)
    expect(useProjectStore.getState().producerLocked).toBe(true)
  })

  it('확정 팝업에서 더 고칠게요를 누르면 아무것도 넘기지 않고 채팅에도 남기지 않는다', async () => {
    await useGlobalChatStore.getState().requestNextStep()
    useGlobalChatStore.getState().closeHandoffConfirm()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(writerStarts()).toHaveLength(0)
    expect(userLines()).toEqual([])
    expect(useProjectStore.getState().producerLocked).toBe(false)
  })

  it('잠긴 Producer의 다음 단계 버튼은 다시 넘기지 않고 Writer 화면으로 이동만 한다', async () => {
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).toHaveBeenCalledWith('writer')
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/writer')
    expect(writerStarts()).toHaveLength(0)
    expect(userLines()).toEqual([])
  })

  it('채팅으로 승인한다고 답해도 Writer 첫 넘김은 확정 팝업을 거친다', async () => {
    // 왜: 카드의 승인 버튼만 팝업을 열고 "승인"·"ok" 같은 말은 바로 넘겨, 잠금 경고를 건너뛰었다(검토 지적).
    await useGlobalChatStore.getState().sendMessage('Writer로 넘겨줘')
    const card = useGlobalChatStore.getState().pendingProposal
    expect(card?.kind).toBe('producerWriterInitialHandoff')
    await useGlobalChatStore.getState().sendMessage('승인')
    expect(useGlobalChatStore.getState().handoffConfirm?.kind).toBe('producerLock')
    expect(writerStarts()).toHaveLength(0)
    await useGlobalChatStore.getState().confirmProducerLock()
    expect(writerStarts()).toHaveLength(1)
    expect(useProjectStore.getState().producerLocked).toBe(true)
  })

  it('그림 쓰임새 질문에 답하기 전에는 확정 팝업을 열지 않고 먼저 고르라고 알린다', async () => {
    // 왜: 확정하고 넘기기를 눌러도 그림 질문이 말을 가로채 아무것도 넘어가지 않았다(검토 지적).
    useGlobalChatStore.setState({
      imageRoleGate: { items: [{ image: { id: 'img-1', name: 'a.png', thumbUrl: 'https://img.test/a.png', sliceUrls: ['https://img.test/a.png'] }, role: null }], typed: '', msg: '' },
    })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(writerStarts()).toHaveLength(0)
    expect(useGlobalChatStore.getState().messages.at(-1)?.role).toBe('model')
  })

  it('채팅으로 Writer 넘김을 요청하면 승인 카드에 넘긴 뒤 Producer를 고칠 수 없다는 안내가 붙는다', async () => {
    useLocaleStore.setState({ locale: 'en' })
    await useGlobalChatStore.getState().sendMessage('Please hand over to Writer')
    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal?.kind).toBe('producerWriterInitialHandoff')
    expect(proposal?.impact.some((line) => line.includes('Producer is locked'))).toBe(true)
  })
})
