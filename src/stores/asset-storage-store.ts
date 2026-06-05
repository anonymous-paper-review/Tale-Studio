import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GeneratedImage, CharacterAsset, WorldAsset } from '@/types/asset'

// ============================================================================
// Types — see specs/data/asset_storage.md
// ============================================================================

export type RegisteredCharacter = {
  id: string
  projectId: string
  sourceCanvasNodeId: string

  name: string
  alias: string
  background: string
  description: string

  prompt: string
  referenceImages: string[]

  views: {
    single: GeneratedImage[]
    fiveView: GeneratedImage[]
    sixteenAngle: GeneratedImage[]
  }
  statusVariants: {
    label: string
    prompt: string
    images: GeneratedImage[]
  }[]

  registeredAt: number
  updatedAt: number
}

export type RegisteredWorld = Omit<RegisteredCharacter, never>

export type RegisterCharacterInput = Omit<
  RegisteredCharacter,
  'id' | 'registeredAt' | 'updatedAt'
>

interface AssetStorageState {
  characters: Record<string, RegisteredCharacter>
  worlds: Record<string, RegisteredWorld>

  registerCharacter: (
    id: string,
    input: RegisterCharacterInput,
  ) => string
  registerWorld: (id: string, input: RegisterCharacterInput) => string
  unregister: (id: string) => void
  updateRegistration: (
    id: string,
    patch: Partial<RegisteredCharacter>,
  ) => void
  getCharacter: (id: string) => RegisteredCharacter | undefined
  getWorld: (id: string) => RegisteredWorld | undefined
  listCharactersByProject: (projectId: string) => RegisteredCharacter[]
  listWorldsByProject: (projectId: string) => RegisteredWorld[]

  reset: () => void
}

export const useAssetStorageStore = create<AssetStorageState>()(
  persist(
    (set, get) => ({
      characters: {},
      worlds: {},

      registerCharacter: (id, input) => {
        const now = Date.now()
        const record: RegisteredCharacter = {
          ...input,
          id,
          registeredAt: now,
          updatedAt: now,
        }
        set((s) => ({ characters: { ...s.characters, [id]: record } }))
        return id
      },

      registerWorld: (id, input) => {
        const now = Date.now()
        const record: RegisteredWorld = {
          ...input,
          id,
          registeredAt: now,
          updatedAt: now,
        }
        set((s) => ({ worlds: { ...s.worlds, [id]: record } }))
        return id
      },

      unregister: (id) => {
        set((s) => {
          const characters = { ...s.characters }
          const worlds = { ...s.worlds }
          delete characters[id]
          delete worlds[id]
          return { characters, worlds }
        })
      },

      updateRegistration: (id, patch) => {
        set((s) => {
          const existing = s.characters[id] ?? s.worlds[id]
          if (!existing) return s
          const updated = { ...existing, ...patch, updatedAt: Date.now() }
          if (s.characters[id]) {
            return { characters: { ...s.characters, [id]: updated } }
          }
          return { worlds: { ...s.worlds, [id]: updated } }
        })
      },

      getCharacter: (id) => get().characters[id],
      getWorld: (id) => get().worlds[id],

      listCharactersByProject: (projectId) =>
        Object.values(get().characters).filter(
          (c) => c.projectId === projectId,
        ),

      listWorldsByProject: (projectId) =>
        Object.values(get().worlds).filter((w) => w.projectId === projectId),

      reset: () => set({ characters: {}, worlds: {} }),
    }),
    {
      name: 'tale-asset-storage-v1-default',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

// ============================================================================
// Card → Asset Storage adapter (hybrid)
//
// The Artist UI is card-based (artist-store: CharacterAsset / WorldAsset) but
// the Director contract reads from Asset Storage (RegisteredCharacter /
// RegisteredWorld via getCharacter/getWorld). These helpers bridge the two so
// assets registered from a card resolve in director-canvas-store's
// pickAssetImageUrl / resolveShotAssetImages.
//
// Mapping note: we register with `id === characterId` / `id === locationId` so
// the stable card id is the lookup key shots reference. The first non-null view
// image is placed in BOTH `referenceImages` and `views.single` to satisfy
// pickAssetImageUrl (referenceImages[0] → views.single[0].url fallback).
//
// Writer 정의(description/prompt)는 카드(CharacterAsset.description/fixedPrompt,
// WorldAsset.visualDescription)에서 계승해 채운다.
// Fields lost in the card→registered mapping (no card equivalent — left empty):
//   alias, background, statusVariants, views.fiveView, views.sixteenAngle.
// sourceCanvasNodeId no longer maps to a node (cards have none) → filled with
// the card id for traceability, signature preserved.
// ============================================================================

function viewToGeneratedImage(
  url: string,
  view: GeneratedImage['view'],
): GeneratedImage {
  return {
    id: `cardimg_${url.slice(-12)}_${view ?? 'single'}`,
    url,
    prompt: '',
    view,
    modelId: 'imagen',
    createdAt: Date.now(),
  }
}

/** CharacterAsset (front/side/back card) → RegisterCharacterInput */
export function characterAssetToRegisterInput(
  asset: CharacterAsset,
  projectId: string,
): RegisterCharacterInput {
  // main(정면 대표)이 front 역할을 겸한다 (별도 front 뷰 폐기, 2026-06-05).
  // 다운스트림 GeneratedImage.view='front' 계약은 유지하고 소스만 main 으로.
  const main = asset.views.main
  const single = main ? [viewToGeneratedImage(main, 'front')] : []
  const fiveView: GeneratedImage[] = (
    [
      ['front', asset.views.main],
      ['left', asset.views.sideLeft],
      ['right', asset.views.sideRight],
      ['back', asset.views.back],
    ] as const
  )
    .filter(([, u]) => u)
    .map(([v, u]) => viewToGeneratedImage(u as string, v))

  return {
    projectId,
    sourceCanvasNodeId: asset.characterId, // no node in card UI; trace by card id
    name: asset.name,
    alias: '',
    background: '',
    description: asset.description ?? '',
    prompt: asset.fixedPrompt ?? '',
    referenceImages: main ? [main] : [],
    views: { single, fiveView, sixteenAngle: [] },
    statusVariants: [],
  }
}

/** WorldAsset (wide/establishing card) → RegisterCharacterInput */
export function worldAssetToRegisterInput(
  asset: WorldAsset,
  projectId: string,
): RegisterCharacterInput {
  const wide = asset.wideShot
  const single = wide ? [viewToGeneratedImage(wide, undefined)] : []

  return {
    projectId,
    sourceCanvasNodeId: asset.locationId,
    name: asset.name,
    alias: '',
    background: '',
    description: asset.visualDescription ?? '',
    prompt: asset.visualDescription ?? '',
    referenceImages: wide ? [wide] : [],
    views: { single, fiveView: [], sixteenAngle: [] },
    statusVariants: [],
  }
}

/** Register a card character into Asset Storage (id === characterId). */
export function registerCharacterCard(
  asset: CharacterAsset,
  projectId: string,
): string {
  return useAssetStorageStore
    .getState()
    .registerCharacter(
      asset.characterId,
      characterAssetToRegisterInput(asset, projectId),
    )
}

/** Register a card world/location into Asset Storage (id === locationId). */
export function registerWorldCard(
  asset: WorldAsset,
  projectId: string,
): string {
  return useAssetStorageStore
    .getState()
    .registerWorld(
      asset.locationId,
      worldAssetToRegisterInput(asset, projectId),
    )
}
