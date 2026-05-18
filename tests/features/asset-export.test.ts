import { beforeEach, describe, expect, it } from 'vitest'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import type { GeneratedImage } from '@/stores/canvas-store'
import {
  toCharacterAsset,
  toWorldAsset,
  exportCharacterAssets,
  exportWorldAssets,
} from '@/features/artist/asset-export'

beforeEach(() => {
  useAssetStorageStore.getState().reset()
})

function img(view?: GeneratedImage['view'], url = 'data:img'): GeneratedImage {
  return {
    id: `i_${url}`,
    url,
    prompt: 'p',
    modelId: 'imagen',
    createdAt: 1,
    view,
  }
}

describe('toCharacterAsset', () => {
  it('5-View 이미지 → front/side(left)/back/3qLeft(detail)/3qRight(right) 매핑', () => {
    const reg = {
      id: 'reg_1',
      projectId: 'proj_a',
      sourceCanvasNodeId: 'n_x',
      name: 'Kai',
      alias: 'kai',
      background: 'bg',
      description: 'd',
      prompt: 'p',
      referenceImages: [],
      views: {
        single: [],
        fiveView: [
          img('front', 'data:front'),
          img('left', 'data:left'),
          img('right', 'data:right'),
          img('back', 'data:back'),
          img('detail', 'data:detail'),
        ],
        sixteenAngle: [],
      },
      statusVariants: [],
      registeredAt: 1,
      updatedAt: 1,
    }
    const out = toCharacterAsset(reg)
    expect(out.characterId).toBe('kai') // alias 우선
    expect(out.name).toBe('Kai')
    expect(out.locked).toBe(true)
    expect(out.views.front).toBe('data:front')
    expect(out.views.side).toBe('data:left') // L0의 left → P4의 side
    expect(out.views.back).toBe('data:back')
    expect(out.views.threeQuarterLeft).toBe('data:detail') // L0의 detail → 3qLeft
    expect(out.views.threeQuarterRight).toBe('data:right') // L0의 right → 3qRight
  })

  it('alias 비어있으면 id를 characterId로 fallback', () => {
    const reg = {
      id: 'reg_1',
      projectId: 'proj_a',
      sourceCanvasNodeId: 'n_x',
      name: 'Kai',
      alias: '',
      background: 'bg',
      description: 'd',
      prompt: 'p',
      referenceImages: [],
      views: { single: [], fiveView: [], sixteenAngle: [] },
      statusVariants: [],
      registeredAt: 1,
      updatedAt: 1,
    }
    expect(toCharacterAsset(reg).characterId).toBe('reg_1')
    expect(toCharacterAsset(reg).views.front).toBeNull()
  })
})

describe('toWorldAsset', () => {
  it('single[0] → wide, single[1] → establishing', () => {
    const reg = {
      id: 'w1',
      projectId: 'proj_a',
      sourceCanvasNodeId: 'n_x',
      name: 'Lab',
      alias: 'lab',
      background: 'bg',
      description: 'd',
      prompt: 'p',
      referenceImages: [],
      views: {
        single: [img(undefined, 'data:wide'), img(undefined, 'data:est')],
        fiveView: [],
        sixteenAngle: [],
      },
      statusVariants: [],
      registeredAt: 1,
      updatedAt: 1,
    }
    const out = toWorldAsset(reg)
    expect(out.locationId).toBe('lab')
    expect(out.name).toBe('Lab')
    expect(out.wideShot).toBe('data:wide')
    expect(out.establishingShot).toBe('data:est')
    expect(out.sceneId).toBe('') // L0에는 sceneId 없음
  })

  it('single 1장이면 establishing은 wide와 동일', () => {
    const reg = {
      id: 'w1',
      projectId: 'proj_a',
      sourceCanvasNodeId: 'n_x',
      name: 'Lab',
      alias: 'lab',
      background: 'bg',
      description: 'd',
      prompt: 'p',
      referenceImages: [],
      views: {
        single: [img(undefined, 'data:only')],
        fiveView: [],
        sixteenAngle: [],
      },
      statusVariants: [],
      registeredAt: 1,
      updatedAt: 1,
    }
    const out = toWorldAsset(reg)
    expect(out.wideShot).toBe('data:only')
    expect(out.establishingShot).toBe('data:only')
  })
})

describe('exportCharacterAssets / exportWorldAssets (project 격리)', () => {
  it('현재 projectId 소속만 export', () => {
    const baseInput = (projectId: string, name: string) => ({
      projectId,
      sourceCanvasNodeId: 'n_x',
      name,
      alias: name.toLowerCase(),
      background: 'bg',
      description: 'd',
      prompt: 'p',
      referenceImages: [],
      views: { single: [], fiveView: [], sixteenAngle: [] },
      statusVariants: [],
    })
    const store = useAssetStorageStore.getState()
    store.registerCharacter('c1', baseInput('proj_a', 'Kai'))
    store.registerCharacter('c2', baseInput('proj_b', 'Other'))
    store.registerWorld('w1', baseInput('proj_a', 'Lab'))

    const chars = exportCharacterAssets('proj_a')
    const worlds = exportWorldAssets('proj_a')
    expect(chars).toHaveLength(1)
    expect(chars[0].name).toBe('Kai')
    expect(worlds).toHaveLength(1)
    expect(worlds[0].name).toBe('Lab')
  })
})
