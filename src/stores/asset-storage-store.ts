import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  GeneratedImage,
  CharacterAsset,
  CharacterAppearance,
  CharacterViewKey,
  WorldAsset,
} from '@/types/asset'
import { createClient } from '@/lib/supabase/client'
import {
  candidateViewToViewKey,
  type CandidateImage,
  type CandidateView,
} from '@/lib/image-provenance'

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
  getCharacter: (id: string) => RegisteredCharacter | undefined
  getWorld: (id: string) => RegisteredWorld | undefined

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

      getCharacter: (id) => get().characters[id],
      getWorld: (id) => get().worlds[id],

      hydrateFromDb: async (projectId) => {
        if (!projectId) return
        try {
          const supabase = createClient()
          const [charsRes, locsRes, appearancesRes, candidatesRes] = await Promise.all([
            supabase
              .from('characters')
              .select(
                'character_id, name, entity_type, description, appearance',
              )
              .eq('project_id', projectId),
            supabase
              .from('locations')
              .select(
                'location_id, name, scene_id, wide_shot, visual_description',
              )
              .eq('project_id', projectId),
            supabase
              .from('character_appearances')
              .select('character_id, appearance_key, label, is_default, narrative_time, sheet_url, portrait_url, appearance, appearance_native')
              .eq('project_id', projectId)
              .order('is_default', { ascending: false }),
            supabase
              .from('character_image_candidates')
              .select('id, character_id, appearance_key, view, url, source_hash, appearance_hash, is_selected, generated_at')
              .eq('project_id', projectId),
          ])
          if (charsRes.error) throw charsRes.error
          if (locsRes.error) throw locsRes.error
          if (appearancesRes.error) throw appearancesRes.error
          if (candidatesRes.error) throw candidatesRes.error

          const candidatesByAppearance = new Map<
            string,
            Partial<Record<CharacterViewKey, CandidateImage[]>>
          >()
          for (const candidate of candidatesRes.data ?? []) {
            if (!candidate.appearance_key) continue
            const key = `${candidate.character_id}\u0000${candidate.appearance_key}`
            const views = candidatesByAppearance.get(key) ?? {}
            const view = candidateViewToViewKey(candidate.view as CandidateView)
            const list = views[view] ?? []
            list.push({
              id: candidate.id,
              url: candidate.url,
              sourceHash: candidate.source_hash ?? null,
              appearanceHash: candidate.appearance_hash ?? null,
              isSelected: candidate.is_selected ?? false,
              generatedAt: candidate.generated_at,
            })
            views[view] = list
            candidatesByAppearance.set(key, views)
          }
          for (const views of candidatesByAppearance.values()) {
            for (const candidates of Object.values(views)) {
              candidates?.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
            }
          }

          const appearancesByCharacter = new Map<string, CharacterAppearance[]>()
          for (const appearance of appearancesRes.data ?? []) {
            const list = appearancesByCharacter.get(appearance.character_id) ?? []
            list.push({
              appearanceKey: appearance.appearance_key,
              label: appearance.label,
              isDefault: appearance.is_default ?? false,
              narrativeTime: appearance.narrative_time,
              sheetUrl: appearance.sheet_url,
              portraitUrl: appearance.portrait_url,
              appearance: appearance.appearance,
              appearanceNative: appearance.appearance_native,
              viewCandidates:
                candidatesByAppearance.get(
                  `${appearance.character_id}\u0000${appearance.appearance_key}`,
                ) ?? {},
            })
            appearancesByCharacter.set(appearance.character_id, list)
          }

          // DB row → CharacterAsset/WorldAsset (artist-store.loadData와 동일 매핑)
          // → 카드 어댑터로 RegisteredCharacter/World 등록.
          for (const c of charsRes.data ?? []) {
            const asset: CharacterAsset = {
              characterId: c.character_id,
              name: c.name,
              appearances: appearancesByCharacter.get(c.character_id) ?? [],
              views: {
                main: null,
                back: null,
                sideLeft: null,
                sideRight: null,
              },
              entityType: c.entity_type === 'object' ? 'object' : 'person',
              description: c.description ?? '',
              fixedPrompt: c.appearance ?? '',
              viewCandidates: {},
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
  // 다운스트림 GeneratedImage.view='front' 계약은 유지하고, 권위는 기본 모습의 sheet_url이다.
  const defaults = asset.appearances.filter((appearance) => appearance.isDefault)
  if (asset.entityType === 'person' && defaults.length !== 1) {
    throw new Error(`Character ${asset.characterId} requires exactly one default appearance`)
  }
  const main = defaults[0]?.sheetUrl ?? null
  const single = main ? [viewToGeneratedImage(main, 'front')] : []

  return {
    projectId,
    sourceCanvasNodeId: asset.characterId, // no node in card UI; trace by card id
    name: asset.name,
    alias: '',
    background: '',
    description: asset.description ?? '',
    prompt: asset.fixedPrompt ?? '',
    referenceImages: main ? [main] : [],
    views: { single, fiveView: [], sixteenAngle: [] },
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
    description: asset.visualDescriptionNative ?? asset.visualDescription ?? '',
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
