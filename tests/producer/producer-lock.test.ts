// Writer로 넘긴 프로젝트의 Producer는 영구히 읽기 전용이고, 채팅으로 바꿔 달라고 해도 바꾸지 않고 잠겨 있다고 답한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource, CastMember } from '@/lib/producer-gate'

const db = vi.hoisted(() => ({ writes: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        db.writes.push(patch)
        const done = { error: null, data: { producer_draft: patch.producer_draft ?? null } }
        return { eq: () => Object.assign(Promise.resolve(done), { select: () => ({ single: async () => done }) }) }
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_stage: 'artist' }, error: null }), limit: async () => ({ data: [{ scene_id: 'sc_1' }], error: null }) }) }),
    }),
  }),
  createCatalogClient: vi.fn(),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'
import { lockedProducerDirective } from '@/app/api/produce/chat/preserve-context'
import { detectScript, parseScript } from '@/lib/writer/script/parse'

const settings: ProjectSettings = {
  playtime: 30, genre: 'SF 스릴러', subGenre: '사이버펑크', format: 'horizontal_16:9', tone: ['dark'], targetEmotion: [], dialogueLanguage: 'ko',
}
const background: BackgroundSource = {
  localId: 'loc-1', locationId: 'neon_market', name: '네온 시장', visualDescription: '비에 젖은 네온 골목', purpose: '정보 거래 거점', origin: 'producer', userEdited: false, stale: false,
}
const hero: CastMember = { localId: 'c-1', name: '하나', entityType: 'person', appearance: '짧은 머리', origin: 'producer', userEdited: false }

let fetchMock: ReturnType<typeof vi.fn>
const chatBodies = () => fetchMock.mock.calls.filter(([url]) => String(url) === '/api/produce/chat').map(([, init]) => JSON.parse(String((init as RequestInit).body)))
const lastReply = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''

beforeEach(() => {
  resetActionGuard()
  db.writes.length = 0
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', projectLocale: 'ko' })
  useProducerStore.setState({ storyText: '스토리', storyReady: true, styleAnchorKey: 'style_a', projectSettings: settings, cast: [hero], backgrounds: [background] })
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/project/init')) return Response.json({ workspaceId: 'ws', projectId: 'proj-2', project: { title: '잠긴 이야기', current_stage: 'artist', locale: 'ko', locale_locked: false, settings: { format: 'horizontal_16:9' } } })
    if (url.startsWith('/api/writer/status/')) return Response.json({ started: false })
    if (url === '/api/writer/start') return Response.json({ runId: 'run-1' })
    return Response.json({ reply: '장르를 코미디로 바꿨어요.', extractedSettings: { genre: '코미디' } })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('언제 Producer가 잠기는가', () => {
  it('Writer로 넘긴 프로젝트를 열면 Producer가 잠겨 있다', async () => {
    useProjectStore.getState().resetProject()
    await useProjectStore.getState().initProject('proj-2')
    expect(useProjectStore.getState().producerLocked).toBe(true)
  })

  it('Producer 단계에 머문 프로젝트는 잠기지 않는다', async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ workspaceId: 'ws', projectId: 'proj-3', project: { title: '새 이야기', current_stage: 'producer', locale: 'ko', locale_locked: false, settings: null } }))
    useProjectStore.getState().resetProject()
    await useProjectStore.getState().initProject('proj-3')
    expect(useProjectStore.getState().producerLocked).toBe(false)
  })

  it('Writer 시작에 성공하면 그 자리에서 Producer가 잠긴다', async () => {
    const ok = await useProducerStore.getState().saveAndHandoff()
    expect(ok).toBe(true)
    expect(useProjectStore.getState().producerLocked).toBe(true)
  })

  it('Writer 시작에 실패하면 Producer는 잠기지 않는다', async () => {
    fetchMock.mockImplementation(async (url: string) => (url === '/api/writer/start' ? Response.json({ error: 'down' }, { status: 500 }) : Response.json({})))
    const ok = await useProducerStore.getState().saveAndHandoff()
    expect(ok).toBe(false)
    expect(useProjectStore.getState().producerLocked).toBe(false)
  })

  it('잠긴 Producer는 Writer가 실패해 되돌아와도 잠겨 있고 새 프로젝트를 열어야만 풀린다', () => {
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    // Writer 결과가 없어 Producer로 되돌아오는 경우(verifyWriterGate)를 흉내 낸다.
    useProjectStore.setState({ currentStage: 'producer', reachedStage: 'producer' })
    expect(useProjectStore.getState().producerLocked).toBe(true)
    useProjectStore.getState().resetProject()
    expect(useProjectStore.getState().producerLocked).toBe(false)
  })
})

describe('잠긴 Producer는 바뀌지 않는다', () => {
  beforeEach(() => {
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
  })

  it('잠긴 Producer는 이야기·설정·인물·배경을 바꾸지 않는다', async () => {
    const { storyText, preserveScript, projectSettings, cast, backgrounds } = useProducerStore.getState()
    const before = structuredClone({ storyText, preserveScript, projectSettings, cast, backgrounds })
    const p = useProducerStore.getState()
    p.setStoryText('완전히 새 이야기')
    p.setPreserveScript(true)
    p.updateSettings({ genre: '코미디' })
    p.addCastMember('person')
    p.updateCastMember('c-1', { name: '두리' })
    p.removeCastMember('c-1')
    p.addBackground()
    p.updateBackground('loc-1', { name: '다른 장소' })
    p.removeBackground('loc-1')
    expect(p.addCastFromImage('https://img.test/a.png')).toBe('')
    expect(p.addBackgroundFromImage('https://img.test/b.png')).toBe('')
    expect(p.applyExtractedSettings({ genre: '코미디' })).toBe('locked')
    p.applyProducerSourcePatch({ storyText: '덮어쓰기' })
    expect(await p.setStyleAnchor('style_b')).toBe(false)
    const after = useProducerStore.getState()
    expect(after.storyText).toBe(before.storyText)
    expect(after.preserveScript).toBe(before.preserveScript)
    expect(after.projectSettings).toEqual(before.projectSettings)
    expect(after.cast).toEqual(before.cast)
    expect(after.backgrounds).toEqual(before.backgrounds)
    expect(after.styleAnchorKey).toBe('style_a')
    expect(db.writes).toEqual([])
  })

  it('잠긴 Producer에서도 Writer가 실패했으면 같은 내용으로 다시 넘길 수 있다', async () => {
    const ok = await useProducerStore.getState().saveAndHandoff()
    expect(ok).toBe(true)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/writer/start')).toHaveLength(1)
    expect(useProducerStore.getState().storyText).toBe('스토리')
  })
})

describe('잠긴 Producer와의 채팅', () => {
  beforeEach(() => {
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
  })

  it('잠긴 Producer에 채팅으로 바꿔 달라고 하면 바꾸지 않고 잠겨 있다고 답한다', async () => {
    await useGlobalChatStore.getState().sendMessage('장르를 코미디로 바꿔줘')
    expect(useProducerStore.getState().projectSettings.genre).toBe('SF 스릴러')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(lastReply()).toContain('Producer는 Writer로 넘기면서 확정돼서 바꾸지 않았어요.')
    expect(lastReply()).not.toContain('바꿨어요.')
  })

  it('잠긴 Producer에 질문하면 답은 그대로 한다', async () => {
    fetchMock.mockImplementation(async () => Response.json({ reply: '지금 장르는 SF 스릴러예요.' }))
    await useGlobalChatStore.getState().sendMessage('지금 장르가 뭐야?')
    expect(lastReply()).toBe('지금 장르는 SF 스릴러예요.')
  })

  it('잠긴 Producer의 채팅 요청에는 잠겨 있다는 사실을 함께 보내고, 서버는 모델에게 바꾸지 말라고 알린다', async () => {
    await useGlobalChatStore.getState().sendMessage('지금 장르가 뭐야?')
    expect(chatBodies()[0]?.producerLocked).toBe(true)
    expect(lockedProducerDirective(true)).toContain('[Locked Producer]')
    expect(lockedProducerDirective(false)).toBeNull()
    expect(lockedProducerDirective('true')).toBeNull()
  })

  it('잠긴 Producer에 그림을 올려도 인물·배경 카드로 쓸지 묻지 않는다', () => {
    const offered = useGlobalChatStore.getState().offerImageRoles(
      [{ id: 'img-1', name: 'a.png', thumbUrl: 'https://img.test/a.png', sliceUrls: ['https://img.test/a.png'] }],
      { typed: '', msg: '' },
    )
    expect(offered).toBe(false)
    expect(useGlobalChatStore.getState().imageRoleGate).toBeNull()
    expect(useProducerStore.getState().cast).toHaveLength(1)
  })

  it('잠긴 Producer에 대본을 붙여 넣어도 그대로 보존할지 묻지 않는다', () => {
    const script = ['S#1. 교실 / 낮', '하나: 안녕.', '두리: 응, 안녕.', 'S#2. 옥상 / 밤', '하나: 여기 있었구나.', '두리: 응.', '하나: 가자.'].join('\n')
    // 잠기지 않았다면 물었을 글이어야 이 검사가 의미가 있다.
    expect(detectScript(script).kind).not.toBe('none')
    expect(parseScript(script)).not.toBeNull()
    const asked = useGlobalChatStore.getState().offerScriptPreserve(script)
    expect(asked).toBe(false)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useProducerStore.getState().storyText).toBe('스토리')
  })
})

describe('잠기기 전에 떠 있던 Producer 변경 카드', () => {
  it('잠기기 전에 떠 있던 Producer 변경 카드를 잠긴 뒤 승인하면 바꾸지 않고 잠겨 있다고 답한다', async () => {
    // 왜: 카드를 띄워 둔 채 Writer로 넘긴 뒤 그 카드를 승인하면, 종전에는 "저장 실패"로 보였다.
    useProjectStore.setState({ reachedStage: 'writer' })
    useProducerStore.getState().applyExtractedSettings({ genre: '코미디' })
    const card = useGlobalChatStore.getState().pendingProposal
    expect(card?.kind).toBe('producerSourcePatch')
    useProjectStore.setState({ producerLocked: true })
    const approved = await useGlobalChatStore.getState().approvePendingProposal(card?.id)
    expect(approved).toBe(false)
    expect(useProducerStore.getState().projectSettings.genre).toBe('SF 스릴러')
    expect(lastReply()).toContain('Producer는 Writer로 넘기면서 확정돼서 바꾸지 않았어요.')
  })
})

describe('Writer가 이미 시작된 프로젝트의 잠금', () => {
  it('Writer가 이미 시작된 프로젝트를 다시 넘기면 Producer가 잠긴다', async () => {
    // 왜: Writer 시작은 됐는데 단계 저장이 실패했거나 다른 탭에서 넘긴 경우, 기존 실행으로 이어 가면서도 잠그지 않았다(검토 지적).
    fetchMock.mockImplementation(async (url: string) => (url.startsWith('/api/writer/status/') ? Response.json({ started: true }) : Response.json({})))
    await useGlobalChatStore.getState().sendMessage('Writer로 넘겨줘', undefined, { consentedHandoff: true })
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/writer/start')).toHaveLength(0)
    expect(useProjectStore.getState().producerLocked).toBe(true)
  })

  it('Writer가 시작된 프로젝트를 열면 단계 기록이 Producer에 머물러 있어도 잠긴다', async () => {
    // 왜: 단계 저장만 실패한 프로젝트를 다시 열면 잠기지 않아, Writer가 받지 않은 값으로 고칠 수 있었다(검토 지적).
    fetchMock.mockImplementation(async (url: string) => (url.startsWith('/api/writer/status/') ? Response.json({ started: true, pipeline_completed: true }) : Response.json({})))
    await useProjectStore.getState().verifyWriterGate('proj-1')
    expect(useProjectStore.getState().producerLocked).toBe(true)
  })

  it('잠긴 Producer에서 Writer로 다시 넘겨 달라고 하면 승인 카드 없이 같은 내용으로 다시 넘긴다', async () => {
    // 왜: Writer가 결과 없이 끝나 Producer로 되돌아온 잠긴 프로젝트에서, 카드의 승인 버튼이 아무 일도 하지 않았다(검토 지적).
    useProjectStore.setState({ producerLocked: true, reachedStage: 'producer' })
    await useGlobalChatStore.getState().sendMessage('Writer로 넘겨줘')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/writer/start')).toHaveLength(1)
    expect(useProducerStore.getState().storyText).toBe('스토리')
  })

  it('잠긴 Producer에 바꾸면서 넘겨 달라고 해도 바꾸지 않았다고 답한다', async () => {
    // 왜: "바꾸고 넘겨줘"처럼 한 말에 두 요청이 섞이면 고정 문장 대신 모델의 "바꿨어요"가 남았다(검토 지적).
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/produce/chat') return Response.json({ reply: '장르를 스릴러로 바꾸고 넘겼어요.', extractedSettings: { genre: '스릴러' } })
      if (url.startsWith('/api/writer/status/')) return Response.json({ started: true, pipeline_completed: true, assets: { images_ready: true, chars_ready: 0, chars_total: 0, worlds_ready: 0, worlds_total: 0, queued_count: 0, failed_count: 0, stalled: false } })
      return Response.json({})
    })
    await useGlobalChatStore.getState().sendMessage('장르를 스릴러로 바꾸고 Writer로 넘겨줘')
    await vi.waitFor(() => expect(useGlobalChatStore.getState().loading).toBe(false))
    const replies = useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
    expect(replies.some((c) => c.includes('바꿨어요') || c.includes('바꾸고 넘겼어요'))).toBe(false)
    expect(replies.some((c) => c.includes('Producer는 Writer로 넘기면서 확정돼서 바꾸지 않았어요.'))).toBe(true)
    expect(useProducerStore.getState().projectSettings.genre).toBe('SF 스릴러')
  })
})
