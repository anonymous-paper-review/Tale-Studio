// 채팅에서 지정한 모습·모델·수정 지시를 승인 뒤 생성 요청까지 유지한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useArtistStore, type ArtistUpdate } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset, WorldAsset } from '@/types/asset'

vi.mock('@/lib/chat-persistence', () => ({
  saveChatMessage: vi.fn(),
  saveChatTrace: vi.fn(),
  saveChatTracePatch: vi.fn(),
  loadLatestChatTrace: vi.fn(),
}))

const supabase = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: supabase.from }),
  createCatalogClient: vi.fn(),
}))

const originalGeneration = {
  generateCharacterAllViews: useArtistStore.getState().generateCharacterAllViews,
  generateWorldAsset: useArtistStore.getState().generateWorldAsset,
  generateWorldShot: useArtistStore.getState().generateWorldShot,
}

const character: CharacterAsset = {
  characterId: 'char_3', name: '옥화', entityType: 'person',
  views: { main: 'current-sheet', back: null, sideLeft: null, sideRight: null },
  viewCandidates: {},
  appearances: [
    {
      appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present',
      sheetUrl: 'current-sheet', portraitUrl: 'current-face', appearance: 'current appearance',
      appearanceNative: null, viewCandidates: {},
    },
    {
      appearanceKey: 'young', label: '젊은 시절', isDefault: false, narrativeTime: 'past',
      sheetUrl: 'young-sheet', portraitUrl: 'young-face', appearance: 'young appearance',
      appearanceNative: null, viewCandidates: {},
    },
  ],
}

const world: WorldAsset = {
  locationId: 'market', name: '시장', sceneId: 'scene-1', wideShot: 'market-image',
  appearances: [{
    appearanceKey: 'winter', label: '겨울', narrativeTime: 'past',
    visualDescription: 'market covered with snow', visualDescriptionNative: '눈 덮인 시장',
    wideShot: 'winter-market-image', candidates: [],
  }],
}

const sceneManifest = {
  scenes: [{
    sceneId: 'scene-1', narrativeSummary: '시장에 도착한다', originalTextQuote: '시장',
    location: 'market', timeOfDay: 'day', mood: 'quiet', charactersPresent: [],
    estimatedDurationSeconds: 5,
  }],
  characters: [],
  locations: [{
    locationId: 'market', name: '시장', visualDescription: 'market',
    timeOfDay: 'day', lightingDirection: 'soft',
  }],
}

function respondWith(updates: ArtistUpdate[]) {
  const fetchMock = vi.fn(async (url: string) => {
    expect(url).toBe('/api/artist/chat')
    return Response.json({ reply: '이미지 생성 요청을 확인해 주세요.', updates })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function installWorldGenerationBoundary(upload: 'http' | 'missing' | 'empty') {
  const blobUrl = 'blob:artist-world'
  const image = new Blob(['world image'], { type: 'image/png' })
  type Query = {
    update: (...values: unknown[]) => Query
    select: (...values: unknown[]) => Query
    eq: (...values: unknown[]) => Query
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise<unknown>
  }
  const query = {} as Query
  query.update = () => query
  query.select = () => query
  query.eq = () => query
  query.then = (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
  supabase.from.mockReturnValue(query)

  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => blobUrl) })
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/artist/chat') {
      return Response.json({
        reply: '이미지 생성 요청을 확인해 주세요.',
        updates: [{ type: 'regenerateWorldAsset', locationId: 'market' }],
      })
    }
    if (url === '/api/generate/image' || url === blobUrl) {
      return new Response(image, { status: 200 })
    }
    if (url === '/api/assets/upload-image') {
      if (upload === 'http') return Response.json({ error: '저장 거절' }, { status: 500 })
      return Response.json(upload === 'missing' ? {} : { publicUrl: '' }, { status: 200 })
    }
    if (url.startsWith('/api/artist/generation-status')) {
      return Response.json({ failures: [], worldFailures: [] })
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { blobUrl, fetchMock }
}

async function expectWorldGenerationSaveFailure(upload: 'http' | 'missing' | 'empty') {
  const { blobUrl } = installWorldGenerationBoundary(upload)
  useProjectStore.setState({ projectLocale: 'ko', projectLocaleLocked: true })
  useArtistStore.setState({
    imageProvider: 'gemini',
    sceneManifest: structuredClone(sceneManifest),
  })

  await useGlobalChatStore.getState().sendMessage('시장의 배경을 다시 그려줘')
  const proposal = useGlobalChatStore.getState().pendingProposal
  expect(proposal).not.toBeNull()

  await expect(useGlobalChatStore.getState().approvePendingProposal(proposal!.id)).resolves.toBe(false)

  const artist = useArtistStore.getState()
  expect(artist.worldAssets[0].wideShot).toBe('market-image')
  expect(artist.worldAssets[0].wideShot).not.toBe(blobUrl)
  expect(artist.worldAssets.flatMap(asset => [
    asset.wideShot,
    ...(asset.appearances ?? []).map(appearance => appearance.wideShot),
  ])).not.toContain(blobUrl)
  expect(useGlobalChatStore.getState().lastTrace?.generationStatus).toBe('failed')
  expect(useGlobalChatStore.getState().messages.some(message => /완료|Completed/.test(message.content))).toBe(false)
}

beforeEach(() => {
  vi.clearAllMocks()
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ currentStage: 'artist', reachedStage: 'artist', projectId: 'project-1' })
  useArtistStore.setState({
    ...originalGeneration,
    characterAssets: [structuredClone(character)],
    worldAssets: [structuredClone(world)],
    generatingViews: [], generatingLocations: [], error: null,
  })
})

afterEach(() => {
  useArtistStore.setState(originalGeneration)
  useGlobalChatStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('인물 재생성 채팅과 승인', () => {
  it('지정한 모습·모델·수정 지시가 승인 실행까지 유지된다', async () => {
    // 실제 채팅 스토어를 실행한다. LLM 응답·생성 함수·대화 저장만 대체한다.
    const generate = vi.fn().mockResolvedValue(null)
    useArtistStore.setState({ generateCharacterAllViews: generate })
    const fetchMock = respondWith([{
      type: 'regenerateCharacter', characterId: 'char_3', appearanceKey: 'young',
      model: 'gpt-image-2', instruction: '더 낡은 옷으로',
    }])

    await useGlobalChatStore.getState().sendMessage('옥화의 젊은 모습을 GPT로 더 낡은 옷으로 다시 그려줘')
    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal).not.toBeNull()
    expect(generate).not.toHaveBeenCalled()

    await expect(useGlobalChatStore.getState().approvePendingProposal(proposal!.id)).resolves.toBe(true)

    expect(generate).toHaveBeenCalledExactlyOnceWith(
      'char_3', 'young', 'chat', '더 낡은 옷으로', 'gpt-image-2',
      expect.objectContaining({ onJob: expect.any(Function) }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('배경 재생성 채팅과 승인', () => {
  it('지정한 모습·모델·수정 지시가 승인 실행까지 유지된다', async () => {
    // 배경 명령의 현행 지원 범위는 모습 지정뿐이다. 모델·지시 신규 지원은 이 테스트 범위 밖이다.
    const generate = vi.fn().mockResolvedValue(undefined)
    const generateDefault = vi.fn().mockResolvedValue(undefined)
    useArtistStore.setState({ generateWorldShot: generate, generateWorldAsset: generateDefault })
    const fetchMock = respondWith([{
      type: 'regenerateWorldAsset', locationId: 'market', appearanceKey: 'winter',
    }])

    await useGlobalChatStore.getState().sendMessage('시장의 겨울 모습을 다시 그려줘')
    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal).not.toBeNull()
    expect(generate).not.toHaveBeenCalled()
    expect(generateDefault).not.toHaveBeenCalled()

    await expect(useGlobalChatStore.getState().approvePendingProposal(proposal!.id)).resolves.toBe(true)

    expect(generate).toHaveBeenCalledExactlyOnceWith(
      'market', 'wideShot', undefined, 'chat', undefined,
      expect.objectContaining({ appearanceKey: 'winter' }),
    )
    expect(generateDefault).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('이미지 업로드가 실패하면 승인 결과를 완료로 알리지 않고 기존 배경을 유지한다', async () => {
    await expectWorldGenerationSaveFailure('http')
  })

  it('업로드 응답에 공개 주소가 없으면 승인 결과를 완료로 알리지 않고 기존 배경을 유지한다', async () => {
    await expectWorldGenerationSaveFailure('missing')
  })

  it('업로드 응답의 공개 주소가 비어 있으면 승인 결과를 완료로 알리지 않고 기존 배경을 유지한다', async () => {
    await expectWorldGenerationSaveFailure('empty')
  })
})
