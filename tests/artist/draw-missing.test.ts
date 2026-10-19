// 리뉴얼 1차: 그림 만드는 중 잠금의 [남은 그림 다시 그리기]는 대표 그림이 없는 인물 · 배경을 모두 그린다 (2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset, WorldAsset } from '@/types/asset'

const appearance = (sheetUrl: string | null) => ({
  appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present' as const, sheetUrl, portraitUrl: null, appearance: null, appearanceNative: null, viewCandidates: {},
})
const person = (id: string, sheetUrl: string | null, origin: 'producer' | 'writer'): CharacterAsset => ({
  characterId: id, name: id, entityType: 'person', views: { main: sheetUrl, back: null, sideLeft: null, sideRight: null } as never, appearances: [appearance(sheetUrl)], viewCandidates: {}, origin,
})
const world = (id: string, wideShot: string | null): WorldAsset => ({ locationId: id, name: id, sceneId: 's1', wideShot })

let view: ReturnType<typeof vi.fn>
let shot: ReturnType<typeof vi.fn>

beforeEach(() => {
  useProjectStore.setState({ projectId: 'art-1' })
  view = vi.fn(async () => ({ jobId: 'j', status: 'queued' }))
  shot = vi.fn(async () => 'https://img/w.png')
  useArtistStore.setState({
    characterAssets: [person('minho', null, 'producer'), person('boss', null, 'writer'), person('done', 'https://img/done.png', 'producer'), { ...person('cup', null, 'writer'), entityType: 'object' }],
    worldAssets: [world('hall', null), world('roof', 'https://img/roof.png')],
    generatingViews: [],
    generatingLocations: [],
    generateCharacterView: view as never,
    generateWorldShot: shot as never,
  })
})

describe('남은 그림 다시 그리기', () => {
  // 왜: 서버 초안이 실패하면(예: 검사 창구가 막힘) Producer 쪽 인물은 자동 그리기가 서버를 기다리다 영영 비어 있었다.
  it('대표 그림이 없는 인물은 서버 초안을 기다리던 인물까지 모두 그린다', async () => {
    await useArtistStore.getState().drawMissingImages()

    expect(view.mock.calls.map((call) => [call[0], call[1], call[2]])).toEqual([['minho', 'current', 'main'], ['boss', 'current', 'main']])
  })

  // 왜: 배경도 넓은 그림이 없는 것만 그린다.
  it('넓은 그림이 없는 배경만 그린다', async () => {
    await useArtistStore.getState().drawMissingImages()

    expect(shot.mock.calls.map((call) => [call[0], call[1]])).toEqual([['hall', 'wideShot']])
  })

  // 왜: 이미 그리는 중인 칸은 다시 보내지 않는다(같은 그림이 두 번 나간다).
  it('그리는 중인 배경은 다시 보내지 않는다', async () => {
    useArtistStore.setState({ generatingLocations: ['hall'] })

    await useArtistStore.getState().drawMissingImages()

    expect(shot).not.toHaveBeenCalled()
  })
})
