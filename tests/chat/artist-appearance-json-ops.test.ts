// Artist 채팅의 모습 삭제는 승인 뒤에만 실행되고, 안전 모드 재시도와 배경 모델 지정은 승인 카드에 그대로 실린다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { validateUpdates, extractAppearanceDeletions, extractLocationAppearanceDeletions } from '@/lib/artist/chat-updates'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
const original = { deleteAppearance: useArtistStore.getState().deleteAppearance, deleteLocationAppearance: useArtistStore.getState().deleteLocationAppearance, generateCharacterView: useArtistStore.getState().generateCharacterView, generateCharacterAllViews: useArtistStore.getState().generateCharacterAllViews, generateWorldShot: useArtistStore.getState().generateWorldShot, generateWorldAsset: useArtistStore.getState().generateWorldAsset }
const storage = new Map<string, string>()
function respond(payload: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/messages') ? Response.json({ messages: [] }) : Response.json({ reply: '확인해 주세요.', updates: [], ...payload })))
}
beforeEach(() => {
  vi.clearAllMocks(); storage.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) })
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'p', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko', projectLocaleLocked: true })
  useArtistStore.setState({ ...original, error: null,
    characterAssets: [{ characterId: 'char_doyun', name: '도윤', entityType: 'person', views: { main: null, back: null, sideLeft: null, sideRight: null }, viewCandidates: {}, appearances: [
      { appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present', sheetUrl: null, portraitUrl: null, appearance: null, appearanceNative: null, viewCandidates: {} },
      { appearanceKey: 'young', label: '젊은 시절', isDefault: false, narrativeTime: 'past', sheetUrl: null, portraitUrl: null, appearance: null, appearanceNative: null, viewCandidates: {} },
    ] }],
    worldAssets: [{ locationId: 'loc_alley', name: '빗속 골목', sceneId: 's', wideShot: null, appearances: [{ appearanceKey: 'past', label: '과거 모습', narrativeTime: 'past', visualDescription: null, visualDescriptionNative: null, wideShot: null, candidates: [] }] }],
  })
})
afterEach(() => { useArtistStore.setState(original); useGlobalChatStore.getState().reset(); vi.unstubAllGlobals() })

describe('모습 삭제·안전 재시도·배경 모델의 JSON 명령', () => {
  it('삭제 명령은 인물·배경 모두 대상 키가 있어야 통과하고 기본 모습은 거절한다', () => {
    // 왜: 기본 모습 삭제는 UI에도 없고, 키가 없는 삭제는 대상이 불명확하다.
    expect(extractAppearanceDeletions([{ type: 'deleteAppearance', characterId: 'char_doyun', appearanceKey: 'young' }, { type: 'deleteAppearance', characterId: 'char_doyun' }, { type: 'deleteAppearance', appearanceKey: 'young' }]))
      .toEqual([{ characterId: 'char_doyun', appearanceKey: 'young' }])
    expect(extractLocationAppearanceDeletions([{ type: 'deleteLocationAppearance', locationId: 'loc_alley', appearanceKey: 'past' }, { type: 'deleteLocationAppearance', locationId: 'loc_alley', appearanceKey: 'default' }]))
      .toEqual([{ locationId: 'loc_alley', appearanceKey: 'past' }])
    expect(validateUpdates([{ type: 'deleteAppearance', characterId: 'char_doyun', appearanceKey: 'young' }])).toEqual([])
  })

  it('재생성 명령의 안전 모드와 배경 이미지 모델은 유효한 값만 남긴다', () => {
    // 왜: UI의 safe 재시도·배경 모델 선택이 채팅에는 없었다. 모델 키는 목록에 있는 것만 통과한다.
    expect(validateUpdates([{ type: 'regenerateCharacter', characterId: 'char_doyun', appearanceKey: 'young', safeMode: true, model: 'flux-2-klein' }]))
      .toEqual([{ type: 'regenerateCharacter', characterId: 'char_doyun', appearanceKey: 'young', safeMode: true, model: 'flux-2-klein' }])
    expect(validateUpdates([{ type: 'regenerateCharacter', characterId: 'char_doyun', safeMode: 'yes' }])).toEqual([{ type: 'regenerateCharacter', characterId: 'char_doyun' }])
    expect(validateUpdates([{ type: 'regenerateWorldAsset', locationId: 'loc_alley', model: 'flux-2-klein', safeMode: true }]))
      .toEqual([{ type: 'regenerateWorldAsset', locationId: 'loc_alley', model: 'flux-2-klein', safeMode: true }])
    expect(validateUpdates([{ type: 'regenerateWorldAsset', locationId: 'loc_alley', model: 'unknown-model' }])).toEqual([{ type: 'regenerateWorldAsset', locationId: 'loc_alley' }])
  })

  it('모습 삭제는 승인 카드를 띄우고 승인해야 UI와 같은 삭제 함수를 부른다', async () => {
    // 왜: 삭제는 되돌릴 수 없어 승인 없이 실행하면 안 된다.
    const del = vi.fn().mockResolvedValue(undefined); const delLoc = vi.fn().mockResolvedValue(undefined)
    useArtistStore.setState({ deleteAppearance: del, deleteLocationAppearance: delLoc })
    respond({ appearanceDeletions: [{ characterId: 'char_doyun', appearanceKey: 'young' }], locationAppearanceDeletions: [{ locationId: 'loc_alley', appearanceKey: 'past' }] })
    await useGlobalChatStore.getState().sendMessage('도윤의 젊은 시절 모습과 골목의 과거 모습을 지워줘')
    const proposal = useGlobalChatStore.getState().pendingProposal!
    expect(proposal).toBeTruthy()
    expect(proposal.target).toContain('도윤')
    expect(proposal.target).toContain('빗속 골목')
    expect(del).not.toHaveBeenCalled(); expect(delLoc).not.toHaveBeenCalled()
    expect(await useGlobalChatStore.getState().approvePendingProposal(proposal.id)).toBe(true)
    expect(del).toHaveBeenCalledWith('char_doyun', 'young')
    expect(delLoc).toHaveBeenCalledWith('loc_alley', 'past')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('삭제')
  })

  it('삭제 대상이 기본 모습이거나 없으면 카드를 만들지 않고 실행하지 않는다', async () => {
    const del = vi.fn(); useArtistStore.setState({ deleteAppearance: del })
    respond({ appearanceDeletions: [{ characterId: 'char_doyun', appearanceKey: 'current' }, { characterId: 'char_doyun', appearanceKey: 'nope' }] })
    await useGlobalChatStore.getState().sendMessage('기본 모습 지워줘')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(del).not.toHaveBeenCalled()
  })

  it('안전 모드 재생성을 승인하면 UI의 safe 재시도와 같은 인자로 생성 함수를 부른다', async () => {
    // 왜: 정책 거절 뒤 재시도는 safeMode=true 로 한 장만 다시 그린다.
    const view = vi.fn().mockResolvedValue({ status: 'completed' }); const all = vi.fn()
    useArtistStore.setState({ generateCharacterView: view, generateCharacterAllViews: all })
    respond({ updates: [{ type: 'regenerateCharacter', characterId: 'char_doyun', appearanceKey: 'young', safeMode: true, model: 'flux-2-klein' }] })
    await useGlobalChatStore.getState().sendMessage('젊은 시절 시트를 안전 모드로 다시 그려줘')
    const proposal = useGlobalChatStore.getState().pendingProposal!
    expect(proposal.payload).toMatchObject({ safeMode: true, model: 'flux-2-klein', appearanceKey: 'young' })
    await useGlobalChatStore.getState().approvePendingProposal(proposal.id)
    expect(all).not.toHaveBeenCalled()
    expect(view).toHaveBeenCalledTimes(1)
    expect(view.mock.calls[0].slice(0, 7)).toEqual(['char_doyun', 'young', 'main', 'chat', undefined, true, 'flux-2-klein'])
  })

  it('배경 재생성에 모델을 지정하면 승인 실행이 그 모델로 배경 함수를 부른다', async () => {
    const shot = vi.fn().mockResolvedValue(undefined); const asset = vi.fn()
    useArtistStore.setState({ generateWorldShot: shot, generateWorldAsset: asset })
    respond({ updates: [{ type: 'regenerateWorldAsset', locationId: 'loc_alley', model: 'flux-2-klein' }] })
    await useGlobalChatStore.getState().sendMessage('골목 배경을 flux로 다시 그려줘')
    const proposal = useGlobalChatStore.getState().pendingProposal!
    expect(proposal.payload).toMatchObject({ locationId: 'loc_alley', model: 'flux-2-klein' })
    await useGlobalChatStore.getState().approvePendingProposal(proposal.id)
    expect(asset).not.toHaveBeenCalled()
    expect(shot).toHaveBeenCalledTimes(1)
    expect(shot.mock.calls[0].slice(0, 5)).toEqual(['loc_alley', 'wideShot', undefined, 'chat', 'flux-2-klein'])
    expect(shot.mock.calls[0][5]).toMatchObject({ appearanceKey: 'default' })
  })
})
