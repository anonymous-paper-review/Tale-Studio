import { beforeEach, describe, expect, it } from 'vitest'
import {
  useAssetStorageStore,
  type RegisterCharacterInput,
} from '@/stores/asset-storage-store'

beforeEach(() => {
  useAssetStorageStore.getState().reset()
})

function api() {
  return useAssetStorageStore.getState()
}

function makeInput(
  projectId: string,
  name: string,
): RegisterCharacterInput {
  return {
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
  }
}

describe('asset-storage-store.registerCharacter', () => {
  it('id로 저장 + getCharacter 조회', () => {
    api().registerCharacter('reg_1', makeInput('proj_a', 'Kai'))
    const got = api().getCharacter('reg_1')
    expect(got?.name).toBe('Kai')
    expect(got?.registeredAt).toBeGreaterThan(0)
    expect(got?.updatedAt).toBeGreaterThan(0)
  })
})

describe('asset-storage-store.listByProject (격리)', () => {
  it('listCharactersByProject는 projectId 일치하는 것만 반환', () => {
    api().registerCharacter('a1', makeInput('proj_a', 'Kai'))
    api().registerCharacter('a2', makeInput('proj_a', 'Mira'))
    api().registerCharacter('b1', makeInput('proj_b', 'Other'))

    const aList = api().listCharactersByProject('proj_a')
    const bList = api().listCharactersByProject('proj_b')
    expect(aList).toHaveLength(2)
    expect(aList.map((c) => c.name).sort()).toEqual(['Kai', 'Mira'])
    expect(bList).toHaveLength(1)
    expect(bList[0].name).toBe('Other')
  })

  it('listWorldsByProject도 projectId 격리', () => {
    api().registerWorld('w1', makeInput('proj_a', 'Lab'))
    api().registerWorld('w2', makeInput('proj_b', 'Forest'))
    expect(api().listWorldsByProject('proj_a').map((w) => w.name)).toEqual([
      'Lab',
    ])
    expect(api().listWorldsByProject('proj_b').map((w) => w.name)).toEqual([
      'Forest',
    ])
  })
})

describe('asset-storage-store.unregister', () => {
  it('해당 id 캐릭터/월드 삭제', () => {
    api().registerCharacter('c1', makeInput('proj_a', 'Kai'))
    api().registerWorld('w1', makeInput('proj_a', 'Lab'))
    api().unregister('c1')
    expect(api().getCharacter('c1')).toBeUndefined()
    expect(api().getWorld('w1')).toBeDefined()
    api().unregister('w1')
    expect(api().getWorld('w1')).toBeUndefined()
  })
})

describe('asset-storage-store.updateRegistration', () => {
  it('updatedAt 갱신 + patch 병합', async () => {
    api().registerCharacter('c1', makeInput('proj_a', 'Kai'))
    const before = api().getCharacter('c1')!.updatedAt
    // 1ms 텀 보장
    await new Promise((r) => setTimeout(r, 2))
    api().updateRegistration('c1', { description: 'updated' })
    const after = api().getCharacter('c1')!
    expect(after.description).toBe('updated')
    expect(after.updatedAt).toBeGreaterThan(before)
  })
})
