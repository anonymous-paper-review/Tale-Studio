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
