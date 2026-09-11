// 요청한 모든 대상을 승인 뒤 처리하고, 보류·실패·탭 이동에도 요청과 안내를 잃지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import * as toolBindings from '@/stores/chat-tool-bindings'
import { createPendingProposal } from '@/lib/pending-proposal'
import { pollGenerationJob } from '@/lib/generation-jobs-client'

vi.mock('@/lib/chat-persistence', () => ({
  saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn(),
}))
const original = { createAppearance: useArtistStore.getState().createAppearance, createLocationAppearance: useArtistStore.getState().createLocationAppearance, generateCharacterAllViews: useArtistStore.getState().generateCharacterAllViews, generateWorldAsset: useArtistStore.getState().generateWorldAsset }
const storage = new Map<string, string>()
const appearanceCreations = [
  { characterId: 'kyotaro', label: '잠옷', appearance: 'blue pajamas' },
  { characterId: 'komatsu', label: '잠옷', appearance: 'red pajamas' },
]
function respond() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/messages')
    ? Response.json({ messages: [] })
    : Response.json({ reply: '두 사람의 잠옷 모습을 확인해 주세요.', updates: [], appearanceCreations })))
}
beforeEach(() => {
  vi.clearAllMocks()
  storage.clear()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'preservation-project', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko', projectLocaleLocked: true })
  useArtistStore.setState({
    ...original,
    characterAssets: [{ characterId: 'kyotaro', name: '쿄타로', entityType: 'person', appearances: [], views: { main: null, back: null, sideLeft: null, sideRight: null }, viewCandidates: {} }, { characterId: 'komatsu', name: '코마츠', entityType: 'person', appearances: [], views: { main: null, back: null, sideLeft: null, sideRight: null }, viewCandidates: {} }],
    worldAssets: [], error: null,
  })
  respond()
})
afterEach(() => { useArtistStore.setState(original); useGlobalChatStore.getState().reset(); vi.unstubAllGlobals() })

describe('요청 대상과 실제 실행 결과 보존', () => {
  it('여러 인물의 새 모습을 요청하면 승인 목록에 요청한 모든 인물과 모습이 표시된다', async () => {
    const create = vi.fn().mockResolvedValue('new-appearance')
    useArtistStore.setState({ createAppearance: create })
    await useGlobalChatStore.getState().sendMessage('쿄타로와 코마츠의 잠옷입은 모습도 추가해줘')
    const proposal = useGlobalChatStore.getState().pendingProposal!
    expect(proposal.target).toContain('쿄타로')
    expect(proposal.target).toContain('코마츠')
    expect(create).not.toHaveBeenCalled()
    await Promise.all([useGlobalChatStore.getState().approvePendingProposal(proposal.id), useGlobalChatStore.getState().approvePendingProposal(proposal.id)])
    expect(create.mock.calls.map(call => call[0])).toEqual(['kyotaro', 'komatsu'])
  })

  it('일부 작업이 끝나고 일부가 남으면 완료한 작업을 유지하면서 남은 대상만 이어서 처리한다', async () => {
    const create = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce(null).mockResolvedValueOnce('second')
    useArtistStore.setState({ createAppearance: create })
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    await expect(useGlobalChatStore.getState().approvePendingProposal()).resolves.toBe(false)
    const deferred = useGlobalChatStore.getState().deferredProposals
    expect(deferred).toHaveLength(1)
    expect(deferred[0].target).toContain('코마츠')
    useGlobalChatStore.getState().restorePendingProposal(deferred[0].id)
    await useGlobalChatStore.getState().approvePendingProposal()
    expect(create.mock.calls.map(call => call[0])).toEqual(['kyotaro', 'komatsu', 'komatsu'])
  })

  it('다른 유료 제안이 떠 있어도 새 요청의 모든 대상을 보류 목록에 남긴다', async () => {
    useGlobalChatStore.getState().offerPendingProposal(createPendingProposal({ id: 'occupied', stage: 'writer', kind: 'writerShrinkDialogue', target: '대사', action: '대사 줄이기', impact: [], payload: {} }))
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    expect(useGlobalChatStore.getState().pendingProposal?.id).toBe('occupied')
    expect(useGlobalChatStore.getState().deferredProposals).toHaveLength(1)
    expect(useGlobalChatStore.getState().deferredProposals[0].target).toContain('코마츠')
  })

  it('요청한 항목은 완료·진행 중·시작 실패·미처리 중 어느 상태인지 이름과 함께 알려준다', async () => {
    useArtistStore.setState({ createAppearance: vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce(null) })
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    await useGlobalChatStore.getState().approvePendingProposal()
    const reports = useGlobalChatStore.getState().messages.map(message => message.content).join('\n')
    expect(reports).toContain('쿄타로')
    expect(reports).toContain('코마츠')
    expect(reports).toMatch(/시작 실패|미처리/)
  })
})

describe('보류와 글로벌 대화', () => {
  it('나중에를 누른 작업은 접어둔 목록에 남고, 다시 펼치면 이어서 처리할 수 있다', async () => {
    const create = vi.fn().mockResolvedValue('created')
    useArtistStore.setState({ createAppearance: create })
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    const id = useGlobalChatStore.getState().pendingProposal!.id
    useGlobalChatStore.getState().deferPendingProposal(id)
    expect(create).not.toHaveBeenCalled()
    useGlobalChatStore.getState().reset()
    await useGlobalChatStore.getState().loadMessages('preservation-project')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useGlobalChatStore.getState().restorePendingProposal(id)).toBe(true)
    await useGlobalChatStore.getState().approvePendingProposal(id)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('Writer와 Artist 사이를 이동해도 이미 나온 대화와 안내는 같은 기록에서 확인할 수 있다', () => {
    useGlobalChatStore.getState().offerSuggestion({ id: 'rough:complete', stage: 'writer', content: '러프 스토리보드가 완성됐어요.', action: null })
    const before = [...useGlobalChatStore.getState().messages]
    useProjectStore.setState({ currentStage: 'writer' })
    useProjectStore.setState({ currentStage: 'artist' })
    expect(before).toHaveLength(1)
    expect(useGlobalChatStore.getState().messages).toEqual(before)
  })

  it('러프 스토리보드 완료 안내는 트리트먼트 탭에 들어가도 이전 대화 기록에 남는다', () => {
    const rough = { id: 'rough:complete', stage: 'writer' as const, content: '러프 스토리보드가 완성됐어요.', action: null }
    useGlobalChatStore.getState().offerSuggestion(rough)
    useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
    useGlobalChatStore.getState().appendLocalExchange('writer', '다음은?', '트리트먼트를 확인하세요.')
    useGlobalChatStore.getState().offerSuggestion({ id: 'script:help', stage: 'writer', content: '트리트먼트 사용법', action: null })
    useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
    useGlobalChatStore.getState().offerSuggestion(rough)
    expect(useGlobalChatStore.getState().messages.map(message => message.content)).toEqual(['러프 스토리보드가 완성됐어요.', '다음은?', '트리트먼트를 확인하세요.', '트리트먼트 사용법'])
  })

  it('다른 탭에서 승인해도 요청한 작업은 원래 담당 단계에서 실행된다', async () => {
    const create = vi.fn().mockResolvedValue('created')
    useArtistStore.setState({ createAppearance: create })
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    useProjectStore.setState({ currentStage: 'writer' })
    await useGlobalChatStore.getState().sendMessage('승인')
    expect(create).toHaveBeenCalledTimes(2)
  })
})

describe('접수된 작업과 새 요청의 경계', () => {
  it('접수된 작업의 응답을 잃어도 다시 승인하면 기존 작업만 확인한다', async () => {
    const create = vi.fn(async (_id, _label, _appearance, _time, options) => {
      options?.onCreated?.('pajamas')
      options?.onJob?.({ jobId: 'accepted-job', status: 'queued' })
      options?.onJob?.({ jobId: 'accepted-job', status: 'timed_out', error: '응답을 기다리는 중' })
      return 'pajamas'
    })
    useArtistStore.setState({ createAppearance: create })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/generation-jobs/')
      ? Response.json({ data: { status: 'completed', resultUrl: 'https://example.test/result.webp', error: null } })
      : url.includes('/messages') ? Response.json({ messages: [] })
      : Response.json({ reply: '승인을 기다려요.', updates: [], appearanceCreations: appearanceCreations.slice(0, 1) })))
    await useGlobalChatStore.getState().sendMessage('쿄타로의 잠옷 모습을 추가해줘')
    await expect(useGlobalChatStore.getState().approvePendingProposal()).resolves.toBe(false)
    const id = useGlobalChatStore.getState().deferredProposals[0].id
    useGlobalChatStore.getState().reset()
    await useGlobalChatStore.getState().loadMessages('preservation-project')
    useGlobalChatStore.getState().restorePendingProposal(id)
    await expect(useGlobalChatStore.getState().approvePendingProposal()).resolves.toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/generation-jobs/accepted-job')
    expect(useGlobalChatStore.getState().deferredProposals).toHaveLength(0)
  })

  it('생성 요청이 진행 중일 때 보류 목록을 다시 눌러도 같은 요청을 중복 실행하지 않는다', async () => {
    let complete!: (value: string) => void
    const create = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { complete = resolve })).mockResolvedValueOnce('second')
    useArtistStore.setState({ createAppearance: create })
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    const id = useGlobalChatStore.getState().pendingProposal!.id
    const approval = useGlobalChatStore.getState().approvePendingProposal(id)
    expect(useGlobalChatStore.getState().restorePendingProposal(id)).toBe(false)
    complete('first')
    await approval
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('요청 뒤 다른 탭으로 이동해도 돌아온 승인 목록에는 원래 요청 대상이 모두 남는다', async () => {
    let respond!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve })))
    const send = useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    useProjectStore.setState({ currentStage: 'writer' })
    respond(Response.json({ reply: '승인을 기다려요.', updates: [], appearanceCreations }))
    await send
    expect(useGlobalChatStore.getState().pendingProposal?.stage).toBe('artist')
    expect(useGlobalChatStore.getState().pendingProposal?.target).toContain('코마츠')
  })

  it('다른 프로젝트로 이동하면 이전 프로젝트의 보류 작업을 승인할 수 없다', async () => {
    const create = vi.fn().mockResolvedValue('created')
    useArtistStore.setState({ createAppearance: create })
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    const id = useGlobalChatStore.getState().pendingProposal!.id
    useGlobalChatStore.getState().deferPendingProposal(id)
    useProjectStore.setState({ projectId: 'different-project' })
    expect(useGlobalChatStore.getState().restorePendingProposal(id)).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('보류한 단계 안내는 새로고침 뒤 자동으로 뜨지 않고 수동으로 다시 열 수 있다', async () => {
    const suggestion = { id: 'handoff:writer', stage: 'writer' as const, content: 'Artist로 이어서 진행해요.', action: { kind: 'navigate' as const, targetStage: 'artist' as const, label: 'Artist 열기' } }
    useGlobalChatStore.getState().offerSuggestion(suggestion)
    useGlobalChatStore.getState().deferSuggestion()
    useGlobalChatStore.getState().reset()
    await useGlobalChatStore.getState().loadMessages('preservation-project')
    useGlobalChatStore.getState().offerSuggestion(suggestion)
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(useGlobalChatStore.getState().restoreSuggestion(suggestion.id)).toBe(true)
    expect(useGlobalChatStore.getState().suggestion?.action).toEqual(suggestion.action)
  })

  it('취소한 요청은 보류 목록에 남지 않고 실행하지 않는다', async () => {
    const create = vi.fn()
    useArtistStore.setState({ createAppearance: create })
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    useGlobalChatStore.getState().dismissPendingProposal()
    expect(useGlobalChatStore.getState().deferredProposals).toHaveLength(0)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('새로고침과 프로젝트 전환 중 접수 확인', () => {
  it('접수 결과를 받기 전에 새로고침하면 확인되지 않은 요청을 바로 재발주하지 않는다', async () => {
    let finish!: (value: string) => void
    const create = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
    useArtistStore.setState({ createAppearance: create })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/messages') ? Response.json({ messages: [] }) : Response.json({ reply: '확인해 주세요.', updates: [], appearanceCreations: appearanceCreations.slice(0, 1) })))
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    const id = useGlobalChatStore.getState().pendingProposal!.id
    const run = useGlobalChatStore.getState().approvePendingProposal(id)
    useGlobalChatStore.getState().reset()
    await useGlobalChatStore.getState().loadMessages('preservation-project')
    useGlobalChatStore.getState().restorePendingProposal(id)
    const retry = useGlobalChatStore.getState().approvePendingProposal(id)
    // 원래 접수의 결과를 모르면 같은 대상을 새로 만들지 않아야 한다.
    expect(create).toHaveBeenCalledTimes(1)
    finish('saved')
    await run
    // 다른 미처리 대상은 첫 대상의 접수 확인 후에만 이어서 처리한다.
    useGlobalChatStore.getState().reset()
    void retry
  })
})


describe('다른 종류의 여러 대상도 같은 승인 경로를 사용한다', () => {
  it('인물 요청의 순서를 바꾸어도 모든 인물을 각각 한 번 처리한다', async () => {
    const create = vi.fn().mockResolvedValue('created')
    useArtistStore.setState({ createAppearance: create })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: '확인해 주세요.', updates: [], appearanceCreations: [...appearanceCreations].reverse() })))
    await useGlobalChatStore.getState().sendMessage('코마츠와 쿄타로의 잠옷 모습을 추가해줘')
    await useGlobalChatStore.getState().approvePendingProposal()
    expect(create.mock.calls.map(call => call[0])).toEqual(['komatsu', 'kyotaro'])
  })

  it('여러 배경의 새 모습을 요청하면 승인 전에는 실행하지 않고 승인 뒤 모든 배경을 처리한다', async () => {
    const create = vi.fn().mockResolvedValue('night')
    useArtistStore.setState({ createLocationAppearance: create, worldAssets: [
      { locationId: 'roof', name: '옥상', sceneId: 'scene-1', wideShot: 'day', appearances: [] },
      { locationId: 'school', name: '학교', sceneId: 'scene-2', wideShot: 'day', appearances: [] },
    ] })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: '확인해 주세요.', updates: [], locationAppearanceCreations: [
      { locationId: 'roof', label: '밤', visualDescription: 'rooftop at night' },
      { locationId: 'school', label: '밤', visualDescription: 'school at night' },
    ] })))
    await useGlobalChatStore.getState().sendMessage('옥상과 학교의 밤 모습을 추가해줘')
    expect(useGlobalChatStore.getState().pendingProposal?.target).toBe('옥상, 학교')
    expect(create).not.toHaveBeenCalled()
    await useGlobalChatStore.getState().approvePendingProposal()
    expect(create.mock.calls.map(call => call[0])).toEqual(['roof', 'school'])
  })

  it('여러 배경을 다시 만들라고 하면 승인 뒤 각 배경의 재생성을 한 번씩 요청한다', async () => {
    const generate = vi.fn().mockResolvedValue(undefined)
    useArtistStore.setState({ generateWorldAsset: generate, worldAssets: [
      { locationId: 'roof', name: '옥상', sceneId: 'scene-1', wideShot: 'day', appearances: [] },
      { locationId: 'school', name: '학교', sceneId: 'scene-2', wideShot: 'day', appearances: [] },
    ] })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: '확인해 주세요.', updates: [
      { type: 'regenerateWorldAsset', locationId: 'roof' }, { type: 'regenerateWorldAsset', locationId: 'school' },
    ] })))
    await useGlobalChatStore.getState().sendMessage('옥상과 학교를 다시 그려줘')
    expect(generate).not.toHaveBeenCalled()
    const id = useGlobalChatStore.getState().pendingProposal!.id
    await useGlobalChatStore.getState().approvePendingProposal(id)
    await useGlobalChatStore.getState().approvePendingProposal(id)
    expect(generate.mock.calls.map(call => call[0])).toEqual(['roof', 'school'])
  })
})

describe('남은 요청의 취소', () => {
  it('일부 작업을 시작한 뒤 남은 요청을 취소하면 이미 시작한 작업을 중복 실행하지 않고 나머지는 시작하지 않는다', async () => {
    let complete!: (value: string) => void
    const create = vi.fn(() => new Promise<string>(resolve => { complete = resolve }))
    useArtistStore.setState({ createAppearance: create })
    await useGlobalChatStore.getState().sendMessage('두 사람의 잠옷 모습을 추가해줘')
    const id = useGlobalChatStore.getState().pendingProposal!.id
    const approval = useGlobalChatStore.getState().approvePendingProposal(id)
    useGlobalChatStore.getState().cancelDeferredProposal(id)
    complete('first')
    await approval
    expect(create).toHaveBeenCalledTimes(1)
    expect(useGlobalChatStore.getState().deferredProposals).toHaveLength(0)
  })
})

describe('설명 저장과 생성 상태 구별', () => {
  it('인물의 원래 설명을 저장했으면 생성 진행 중이 아니라 완료로 알린다', async () => {
    // 저장 재조회 계약에 맞는 데이터 어댑터 대역. 기존 완료/생성 판정은 그대로 검증한다.
    let appearance = 'old appearance'
    const adapter = vi.spyOn(toolBindings, 'createStudioToolResources').mockReturnValue({ characters: {
      read: async () => [{ id: 'kyotaro', values: { appearance } }],
      validate: patch => patch as Record<string, unknown>,
      write: async (_id, patch) => { appearance = String(patch.appearance);return { status: 'ok' } },
    } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/artist/chat'
      ? Response.json({ reply: '확인해 주세요.', updates: [], proposals: [{ characterId: 'kyotaro', appearance: 'new appearance' }] })
      : Response.json({ appearance: 'new appearance', appearanceNative: '새 설명' })))
    await useGlobalChatStore.getState().sendMessage('쿄타로의 원래 설명을 바꿔줘')
    await useGlobalChatStore.getState().approvePendingProposal()
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toBe('쿄타로: 완료')
    adapter.mockRestore()
  })
})


it('다른 화면이 이미 확인 중인 작업이 끝나면 재조회도 완료로 알린다', async () => {
  let respond!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve })))
  const existing = pollGenerationJob('already-polling')
  useGlobalChatStore.getState().offerPendingProposal(createPendingProposal({
    stage: 'artist', kind: 'artistRegenerateWorldAsset', target: '옥상', action: '기존 작업 확인', impact: [], payload: { locationId: 'roof' }, jobIds: ['already-polling'],
  }))
  const approval = useGlobalChatStore.getState().approvePendingProposal()
  respond(Response.json({ data: { status: 'completed', resultUrl: 'https://example.test/done.webp', error: null } }))
  await Promise.all([existing, approval])
  expect(useGlobalChatStore.getState().messages.at(-1)?.content).toBe('옥상: 완료')
})
