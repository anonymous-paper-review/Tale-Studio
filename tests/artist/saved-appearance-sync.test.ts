// 새 인물의 기본 모습을 바로 쓰고, 저장된 외형과 상세 화면의 설명·변경 상태를 일치시킨다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as createCharacter } from '@/app/api/artist/character/route'
import { classifyImageStale, computeImageSourceHash } from '@/lib/image-provenance'
import { requireDefaultAppearanceKey, useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset } from '@/types/asset'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true, userId: 'owner' }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: mocks.rpc } }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  appearanceI18nFields: async (_id: string, native: string) => ({
    appearance: 'red hair', appearance_native: native, i18n_provenance: {},
  }),
}))

function character(): CharacterAsset {
  const candidate = {
    id: 'old-image', url: 'https://example.test/sheet.png',
    sourceHash: computeImageSourceHash('black hair'),
    appearanceHash: computeImageSourceHash('black hair'),
    isSelected: true, generatedAt: '2026-09-09T00:00:00Z',
  }
  return {
    characterId: 'person-1', name: '옥화', entityType: 'person',
    fixedPrompt: 'black hair', appearanceNative: '검은 머리',
    views: { main: candidate.url, back: null, sideLeft: null, sideRight: null },
    viewCandidates: {},
    appearances: [
      {
        appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present',
        sheetUrl: candidate.url, portraitUrl: null, appearance: 'black hair',
        appearanceNative: '검은 머리', viewCandidates: { main: [candidate] },
      },
      {
        appearanceKey: 'young', label: '젊은 시절', isDefault: false, narrativeTime: 'past',
        sheetUrl: null, portraitUrl: null, appearance: 'young appearance',
        appearanceNative: '젊은 모습', viewCandidates: {},
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useProjectStore.setState({ projectId: 'project-1' })
  useArtistStore.setState({ characterAssets: [], sceneManifest: null, generatingViews: [], error: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('저장 뒤 Artist 화면 상태', () => {
  it('새 인물을 추가하면 기본 모습을 바로 사용할 수 있다', async () => {
    // 실제 API와 스토어를 연결하고 DB·번역만 대체한다. 이미지 생성은 호출하지 않는다.
    mocks.rpc.mockImplementation(async (_name, args) => ({
      data: { character_id: args.p_person.character_id, appearance_key: 'current' }, error: null,
    }))
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('/api/artist/character')
      return createCharacter(new Request(`http://localhost${url}`, init))
    })
    vi.stubGlobal('fetch', fetchMock)

    const id = await useArtistStore.getState().addCharacter({ name: '옥화', appearance: '붉은 머리' })

    const saved = useArtistStore.getState().characterAssets.find((item) => item.characterId === id)!
    expect(useArtistStore.getState().error).toBeNull()
    expect(saved.appearances).toHaveLength(1)
    expect(requireDefaultAppearanceKey(saved)).toBe('current')
    expect(saved.appearances[0]).toMatchObject({
      appearanceKey: 'current', isDefault: true, label: '현재', narrativeTime: 'present',
      appearance: 'red hair', appearanceNative: '붉은 머리', sheetUrl: null,
    })
    expect(saved.fixedPrompt).toBe('red hair')
    expect(saved.appearanceNative).toBe('붉은 머리')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('외형 변경이 저장되면 상세 화면도 같은 설명과 변경 상태를 보여준다', async () => {
    const original = character()
    useArtistStore.setState({ characterAssets: [original] })
    // 승인 API가 돌려준 영어 원천과 사용자 언어 설명을 그대로 적용한다.
    useArtistStore.getState().applyAppearancePatch('person-1', 'red hair', '붉은 머리')

    const saved = useArtistStore.getState().characterAssets[0]
    const appearance = saved.appearances[0]
    expect(saved.fixedPrompt).toBe('red hair')
    expect(saved.appearanceNative).toBe('붉은 머리')
    expect(appearance.appearance).toBe('red hair')
    expect(appearance.appearanceNative || appearance.appearance).toBe('붉은 머리')
    expect(classifyImageStale(appearance.appearance, null, appearance.viewCandidates.main![0])).toBe('edited')
    expect(appearance.sheetUrl).toBe(original.appearances[0].sheetUrl)
    expect(saved.appearances[1]).toEqual(original.appearances[1])

    // 상세 팝업에서 저장할 때도 서버가 반환한 두 언어를 사용한다.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ appearance: 'white hair', appearanceNative: '흰 머리' }),
    }))
    await useArtistStore.getState().updateCharacterAppearance('person-1', 'young', '흰 머리')
    const revised = useArtistStore.getState().characterAssets[0]
    expect(revised.appearances[1]).toMatchObject({ appearance: 'white hair', appearanceNative: '흰 머리' })
    expect(revised.appearances[0]).toEqual(appearance)
  })
})
