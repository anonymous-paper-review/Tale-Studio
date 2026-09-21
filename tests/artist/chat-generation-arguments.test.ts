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

function respondWith(updates: ArtistUpdate[]) {
  const fetchMock = vi.fn(async (url: string) => {
    expect(url).toBe('/api/artist/chat')
    return Response.json({ reply: '이미지 생성 요청을 확인해 주세요.', updates })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
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
})
