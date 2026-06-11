import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GeneratedImage, CharacterAsset, WorldAsset } from '@/types/asset'
import { createClient } from '@/lib/supabase/client'

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

  /**
   * DB(characters/locations)에서 직접 등록 — Artist 카드를 거치지 않은 진입(Director 직행,
   * 타브라우저/기기, localStorage 비움)에서도 캐릭터·월드 이미지가 채워지게 한다.
   * 카드→등록 어댑터와 동일한 매핑(id === characterId/locationId)을 DB row 소스로 재사용.
   * 멱등 — registerCharacter/registerWorld가 key 기준 덮어쓰기라 재호출해도 안전.
   */
  hydrateFromDb: (projectId: string) => Promise<void>

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

      hydrateFromDb: async (projectId) => {
        if (!projectId) return
        try {
          const supabase = createClient()
          const [charsRes, locsRes] = await Promise.all([
            supabase
              .from('characters')
              .select(
                'character_id, name, view_main, view_back, view_side_left, view_side_right, locked, description, appearance',
              )
              .eq('project_id', projectId),
            supabase
              .from('locations')
              .select(
                'location_id, name, scene_id, wide_shot, establishing_shot, visual_description',
              )
              .eq('project_id', projectId),
          ])
          if (charsRes.error) throw charsRes.error
          if (locsRes.error) throw locsRes.error

          // DB row → CharacterAsset/WorldAsset (artist-store.loadData와 동일 매핑)
          // → 카드 어댑터로 RegisteredCharacter/World 등록.
          for (const c of charsRes.data ?? []) {
            const asset: CharacterAsset = {
              characterId: c.character_id,
              name: c.name,
              views: {
                main: c.view_main ?? null,
                back: c.view_back ?? null,
                sideLeft: c.view_side_left ?? null,
                sideRight: c.view_side_right ?? null,
              },
              locked: c.locked ?? false,
              description: c.description ?? '',
              fixedPrompt: c.appearance ?? '',
            }
            get().registerCharacter(
              c.character_id,
              characterAssetToRegisterInput(asset, projectId),
            )
          }
          for (const l of locsRes.data ?? []) {
            const asset: WorldAsset = {
              locationId: l.location_id,
              name: l.name,
              sceneId: l.scene_id ?? '',
              wideShot: l.wide_shot ?? null,
              establishingShot: l.establishing_shot ?? null,
              visualDescription: l.visual_description ?? '',
            }
            get().registerWorld(
              l.location_id,
              worldAssetToRegisterInput(asset, projectId),
            )
          }
        } catch (err) {
          console.error('[asset-storage-store] hydrateFromDb failed:', err)
        }
      },

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
// assets registered from a card resolve in director-store's
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
