// 제작자만 정한 장소는 자동 생성과 사용자 요청에 따라 수정 기록을 다르게 남긴다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneManifest } from '@/types/scene'
import type { WorldAsset } from '@/types/asset'

// markLocationUserEdited uses the browser client; resolve every op cleanly so the
// only observable difference is whether marking happened for the given actor.
vi.mock('@/lib/supabase/client', () => {
  const chain: Record<string, unknown> = {}
  const methods = ['from', 'select', 'insert', 'update', 'upsert', 'eq', 'in', 'single']
  for (const m of methods) chain[m] = () => chain
  ;(chain as { then: (resolve: (value: unknown) => unknown) => unknown }).then = (
    resolve,
  ) => resolve({ data: null, error: null })
  return { createClient: () => chain }
})

import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'

const LOC = 'neon_market'

function producerOnlyManifest(): SceneManifest {
  return {
    scenes: [], // producer-only: no writer scene references this location yet
    characters: [],
    locations: [
      {
        locationId: LOC,
        name: '네온 시장',
        visualDescription: '비에 젖은 네온 골목',
        timeOfDay: '',
        lightingDirection: '',
        purpose: '정보 거래 거점',
        origin: 'producer',
        userEdited: false,
      },
    ],
  }
}

function worldAssets(): WorldAsset[] {
  return [
    {
      locationId: LOC,
      name: '네온 시장',
      sceneId: '',
      wideShot: null,
      origin: 'producer',
      userEdited: false,
    },
  ]
}

beforeEach(() => {
  useArtistStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1' })
  // Image generation must fail fast so the test only asserts user_edited marking,
  // which happens before generation.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in test'))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('제작자가 정한 장소의 세계 이미지를 사용자 요청에 따라 만든다', () => {
  it('처음 자동으로 만들면 제작자가 정한 장소를 그대로 쓰고 사용자 수정으로 기록하지 않는다', async () => {
    useArtistStore.setState({ sceneManifest: producerOnlyManifest(), worldAssets: worldAssets() })

    await useArtistStore.getState().generateWorldAsset(LOC, 'auto')

    const asset = useArtistStore.getState().worldAssets.find((w) => w.locationId === LOC)
    expect(asset?.userEdited).toBe(false)
  })

  it('채팅으로 다시 만들면 제작자만 정한 장소도 사용자 수정으로 기록한다', async () => {
    useArtistStore.setState({ sceneManifest: producerOnlyManifest(), worldAssets: worldAssets() })

    await useArtistStore.getState().generateWorldAsset(LOC, 'chat')

    const asset = useArtistStore.getState().worldAssets.find((w) => w.locationId === LOC)
    expect(asset?.userEdited).toBe(true)
  })
})
