/**
 * L0 Asset Storage → P4 (Director) compatibility adapter.
 * Maps RegisteredCharacter/RegisteredWorld → existing CharacterAsset/WorldAsset
 * so the legacy P4 pipeline can read newly registered entities without changes.
 *
 * Mapping rules: see specs/data/asset_storage.md §4.1
 */

import { useAssetStorageStore } from '@/stores/asset-storage-store'
import type {
  RegisteredCharacter,
  RegisteredWorld,
} from '@/stores/asset-storage-store'
import type { CharacterAsset, WorldAsset } from '@/types/asset'

function pickByView(
  fiveView: RegisteredCharacter['views']['fiveView'],
  key: 'front' | 'left' | 'right' | 'back' | 'detail',
): string | null {
  return fiveView.find((img) => img.view === key)?.url ?? null
}

export function toCharacterAsset(
  reg: RegisteredCharacter,
): CharacterAsset {
  return {
    characterId: reg.alias || reg.id,
    name: reg.name,
    views: {
      front: pickByView(reg.views.fiveView, 'front'),
      side: pickByView(reg.views.fiveView, 'left'),
      back: pickByView(reg.views.fiveView, 'back'),
      threeQuarterLeft: pickByView(reg.views.fiveView, 'detail'),
      threeQuarterRight: pickByView(reg.views.fiveView, 'right'),
    },
    locked: true,
  }
}

export function toWorldAsset(reg: RegisteredWorld): WorldAsset {
  // L0 has no explicit "wide" / "establishing" shot. Use first two single images.
  const wide = reg.views.single[0]?.url ?? null
  const establishing = reg.views.single[1]?.url ?? wide
  return {
    locationId: reg.alias || reg.id,
    name: reg.name,
    sceneId: '', // L0 doesn't track sceneId; P4 fills from writer-store
    wideShot: wide,
    establishingShot: establishing,
  }
}

export function exportCharacterAssets(projectId: string): CharacterAsset[] {
  return useAssetStorageStore
    .getState()
    .listCharactersByProject(projectId)
    .map(toCharacterAsset)
}

export function exportWorldAssets(projectId: string): WorldAsset[] {
  return useAssetStorageStore
    .getState()
    .listWorldsByProject(projectId)
    .map(toWorldAsset)
}
