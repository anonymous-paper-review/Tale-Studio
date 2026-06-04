import { create } from 'zustand'
import type { SceneManifest, CharacterAsset, WorldAsset } from '@/types'
import {
  CHARACTER_VIEW_KEYS,
  CHARACTER_VIEW_COLUMNS,
  type CharacterViewKey,
} from '@/types/asset'
import { buildCharacterPrompt, buildWorldPrompt } from '@/lib/prompts'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'

export type ImageProvider = 'fal' | 'gemini' | 'tailscale'

export type ArtistUpdate =
  | {
      type: 'regenerateCharacter'
      characterId: string
      views?: CharacterViewKey[]
    }
  | { type: 'regenerateWorldAsset'; locationId: string }

// World 샷 (wide/establishing) — 캐릭터 뷰와 대칭 구조
export type WorldShotKey = 'wideShot' | 'establishingShot'

const WORLD_SHOT_SUFFIX: Record<WorldShotKey, string> = {
  wideShot: 'wide shot, panoramic',
  establishingShot: 'establishing shot, aerial view',
}
const WORLD_SHOT_COLUMN: Record<WorldShotKey, string> = {
  wideShot: 'wide_shot',
  establishingShot: 'establishing_shot',
}
export const WORLD_SHOT_LABELS: Record<WorldShotKey, string> = {
  wideShot: 'Wide Shot',
  establishingShot: 'Establishing',
}

function worldShotPrompt(
  visualDescription: string,
  timeOfDay: string,
  mood: string,
  boost: string | null,
  shot: WorldShotKey,
): string {
  return `${buildWorldPrompt(visualDescription, timeOfDay, mood, boost)}, ${WORLD_SHOT_SUFFIX[shot]}`
}

async function generateImage(
  prompt: string,
  aspectRatio: '1:1' | '16:9' = '1:1',
  provider: ImageProvider = 'fal',
): Promise<string> {
  const res = await fetch('/api/generate/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspectRatio, provider }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

async function persistImage(
  projectId: string,
  type: 'character' | 'location',
  entityId: string,
  field: string,
  blobUrl: string,
): Promise<string | null> {
  try {
    const r = await fetch(blobUrl)
    const blob = await r.blob()
    const form = new FormData()
    form.append('projectId', projectId)
    form.append('type', type)
    form.append('entityId', entityId)
    form.append('field', field)
    form.append('file', blob, `${entityId}_${field}.png`)
    const res = await fetch('/api/assets/upload-image', { method: 'POST', body: form })
    if (!res.ok) {
      console.error(`[artist-store] persistImage HTTP ${res.status} for ${entityId}/${field}`)
      return null
    }
    const { publicUrl } = await res.json()
    return publicUrl ?? null
  } catch (err) {
    console.error(`[artist-store] persistImage failed for ${entityId}/${field}:`, err)
    return null
  }
}

interface ArtistState {
  sceneManifest: SceneManifest | null
  characterAssets: CharacterAsset[]
  worldAssets: WorldAsset[]
  selectedCharacterId: string | null
  selectedLocationId: string | null
  generatingCharacterId: string | null
  generatingLocationId: string | null
  selectedBoostPreset: string | null
  imageProvider: ImageProvider
  error: string | null

  loadData: () => void
  loadMockData: () => void
  selectCharacter: (id: string) => void
  selectLocation: (id: string) => void
  lockCharacter: (id: string) => void
  unlockCharacter: (id: string) => void
  generateSheet: (
    id: string,
    views?: CharacterViewKey[],
    promptOverrides?: Partial<Record<CharacterViewKey, string>>,
  ) => Promise<void>
  generateWorldAsset: (locationId: string) => Promise<void>
  generateWorldShot: (
    locationId: string,
    shot: WorldShotKey,
    promptOverride?: string,
  ) => Promise<void>
  autoGenerateBaseImages: () => Promise<void>
  applyUpdates: (updates: ArtistUpdate[]) => Promise<void>
  selectBoostPreset: (preset: string) => void
  setImageProvider: (provider: ImageProvider) => void
  reset: () => void
}

export const useArtistStore = create<ArtistState>((set, get) => ({
  sceneManifest: null,
  characterAssets: [],
  worldAssets: [],
  selectedCharacterId: null,
  selectedLocationId: null,
  generatingCharacterId: null,
  generatingLocationId: null,
  selectedBoostPreset: null,
  imageProvider: 'fal' as ImageProvider,
  error: null,

  loadData: async () => {
    const projectId = useProjectStore.getState().projectId

    // Try loading from DB first
    if (projectId) {
      try {
        const supabase = createClient()
        const [
          { data: scenes },
          { data: dbChars },
          { data: dbLocs },
        ] = await Promise.all([
          supabase
            .from('scenes')
            .select('*')
            .eq('project_id', projectId)
            .order('sort_order'),
          supabase
            .from('characters')
            .select('*')
            .eq('project_id', projectId),
          supabase
            .from('locations')
            .select('*')
            .eq('project_id', projectId),
        ])

        if (dbChars?.length) {
          const manifest: SceneManifest = {
            scenes: (scenes ?? []).map((s) => ({
              sceneId: s.scene_id,
              narrativeSummary: s.narrative_summary ?? '',
              originalTextQuote: s.original_text_quote ?? '',
              location: s.location ?? '',
              timeOfDay: s.time_of_day ?? '',
              mood: s.mood ?? '',
              charactersPresent: s.characters_present ?? [],
              estimatedDurationSeconds: s.estimated_duration_seconds ?? 30,
            })),
            characters: dbChars.map((c) => ({
              characterId: c.character_id,
              name: c.name,
              role: c.role as 'protagonist' | 'antagonist' | 'supporting',
              description: c.description ?? '',
              fixedPrompt: c.fixed_prompt ?? '',
              referenceImages: [],
            })),
            locations: (dbLocs ?? []).map((l) => ({
              locationId: l.location_id,
              name: l.name,
              visualDescription: l.visual_description ?? '',
              timeOfDay: l.time_of_day ?? '',
              lightingDirection: l.lighting_direction ?? '',
            })),
          }
          const characterAssets: CharacterAsset[] = dbChars.map((c) => ({
            characterId: c.character_id,
            name: c.name,
            views: {
              front: c.view_front ?? null,
              side: c.view_side ?? null,
              back: c.view_back ?? null,
              threeQuarterLeft: c.view_three_quarter_left ?? null,
              threeQuarterRight: c.view_three_quarter_right ?? null,
            },
            locked: c.locked ?? false,
            description: c.description ?? '',
            fixedPrompt: c.fixed_prompt ?? '',
          }))
          const worldAssets: WorldAsset[] = (dbLocs ?? []).map((l) => ({
            locationId: l.location_id,
            name: l.name,
            sceneId: l.scene_id ?? '',
            wideShot: l.wide_shot ?? null,
            establishingShot: l.establishing_shot ?? null,
            visualDescription: l.visual_description ?? '',
          }))

          set({
            sceneManifest: manifest,
            characterAssets,
            worldAssets,
            selectedCharacterId: characterAssets[0]?.characterId ?? null,
            selectedLocationId: worldAssets[0]?.locationId ?? null,
          })
          return
        }
      } catch (err) {
        console.error('[artist-store] DB load failed, falling back:', err)
      }
    }

    // Fallback: load from writer store or mock data
    const writerManifest = useWriterStore.getState().sceneManifest
    if (writerManifest) {
      const characterAssets: CharacterAsset[] = writerManifest.characters.map(
        (c) => ({
          characterId: c.characterId,
          name: c.name,
          views: {
            front: null,
            side: null,
            back: null,
            threeQuarterLeft: null,
            threeQuarterRight: null,
          },
          locked: false,
          description: c.description ?? '',
          fixedPrompt: c.fixedPrompt ?? '',
        }),
      )
      const worldAssets: WorldAsset[] = writerManifest.locations.map((loc) => {
        const scene = writerManifest.scenes.find(
          (s) => s.location === loc.locationId,
        )
        return {
          locationId: loc.locationId,
          name: loc.name,
          sceneId: scene?.sceneId ?? '',
          wideShot: null,
          establishingShot: null,
          visualDescription: loc.visualDescription ?? '',
        }
      })

      set({
        sceneManifest: writerManifest,
        characterAssets,
        worldAssets,
        selectedCharacterId: characterAssets[0]?.characterId ?? null,
        selectedLocationId: worldAssets[0]?.locationId ?? null,
      })
      return
    }

    // No data available — keep empty state (don't show fake mock data)
  },

  loadMockData: async () => {
    const [
      { mockSceneManifest },
      { mockCharacterAssets },
      { mockWorldAssets },
    ] = await Promise.all([
      import('@/mocks/scene-manifest'),
      import('@/mocks/character-assets'),
      import('@/mocks/world-assets'),
    ])

    set({
      sceneManifest: mockSceneManifest,
      characterAssets: mockCharacterAssets,
      worldAssets: mockWorldAssets,
      selectedCharacterId: mockCharacterAssets[0]?.characterId ?? null,
      selectedLocationId: mockWorldAssets[0]?.locationId ?? null,
    })
  },

  selectCharacter: (id) => set({ selectedCharacterId: id }),

  selectLocation: (id) => set({ selectedLocationId: id }),

  lockCharacter: (id) =>
    set((state) => ({
      characterAssets: state.characterAssets.map((a) =>
        a.characterId === id ? { ...a, locked: true } : a,
      ),
    })),

  unlockCharacter: (id) =>
    set((state) => ({
      characterAssets: state.characterAssets.map((a) =>
        a.characterId === id ? { ...a, locked: false } : a,
      ),
    })),

  generateSheet: async (id, views, promptOverrides) => {
    const { sceneManifest, imageProvider } = get()
    const character = sceneManifest?.characters.find(
      (c) => c.characterId === id,
    )
    if (!character) return

    const viewList: CharacterViewKey[] =
      views && views.length > 0 ? views : CHARACTER_VIEW_KEYS

    set({ generatingCharacterId: id, error: null })

    try {
      const generated = await Promise.all(
        viewList.map((v) =>
          generateImage(
            // 뷰별 프롬프트 override(사용자 편집) 우선, 없으면 기본 빌드 프롬프트.
            promptOverrides?.[v] ?? buildCharacterPrompt(character.fixedPrompt, v),
            '1:1',
            imageProvider,
          ),
        ),
      )
      const blobByView: Partial<Record<CharacterViewKey, string>> = {}
      viewList.forEach((v, i) => {
        blobByView[v] = generated[i]
      })

      set((state) => ({
        generatingCharacterId: null,
        characterAssets: state.characterAssets.map((a) =>
          a.characterId === id
            ? { ...a, views: { ...a.views, ...blobByView } }
            : a,
        ),
      }))

      const pid = useProjectStore.getState().projectId
      if (pid) {
        const persisted = await Promise.all(
          viewList.map((v) =>
            persistImage(
              pid,
              'character',
              id,
              CHARACTER_VIEW_COLUMNS[v],
              blobByView[v]!,
            ),
          ),
        )
        const finalByView: Partial<Record<CharacterViewKey, string>> = {}
        viewList.forEach((v, i) => {
          finalByView[v] = persisted[i] ?? blobByView[v]!
        })
        set((state) => ({
          characterAssets: state.characterAssets.map((a) =>
            a.characterId === id
              ? { ...a, views: { ...a.views, ...finalByView } }
              : a,
          ),
        }))
      }
    } catch (err) {
      set({
        generatingCharacterId: null,
        error:
          err instanceof Error ? err.message : 'Character generation failed',
      })
    }
  },

  generateWorldAsset: async (locationId) => {
    const { sceneManifest, selectedBoostPreset, imageProvider } = get()
    const location = sceneManifest?.locations.find(
      (l) => l.locationId === locationId,
    )
    const scene = sceneManifest?.scenes.find((s) => s.location === locationId)
    if (!location || !scene) return

    set({ generatingLocationId: locationId, error: null })

    try {
      const basePrompt = buildWorldPrompt(
        location.visualDescription,
        location.timeOfDay,
        scene.mood,
        selectedBoostPreset,
      )

      const pid = useProjectStore.getState().projectId

      // Generate sequentially to avoid timeout
      // 1) Wide shot
      const wideShot = await generateImage(`${basePrompt}, wide shot, panoramic`, '16:9', imageProvider)
      set((state) => ({
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId ? { ...w, wideShot } : w,
        ),
      }))
      if (pid) {
        const wideUrl = await persistImage(pid, 'location', locationId, 'wide_shot', wideShot)
        if (wideUrl) {
          set((state) => ({
            worldAssets: state.worldAssets.map((w) =>
              w.locationId === locationId ? { ...w, wideShot: wideUrl } : w,
            ),
          }))
        }
      }

      // 2) Establishing shot
      const establishingShot = await generateImage(`${basePrompt}, establishing shot, aerial view`, '16:9', imageProvider)
      set((state) => ({
        generatingLocationId: null,
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId ? { ...w, establishingShot } : w,
        ),
      }))
      if (pid) {
        const estUrl = await persistImage(pid, 'location', locationId, 'establishing_shot', establishingShot)
        if (estUrl) {
          set((state) => ({
            worldAssets: state.worldAssets.map((w) =>
              w.locationId === locationId ? { ...w, establishingShot: estUrl } : w,
            ),
          }))
        }
      }
    } catch (err) {
      set({
        generatingLocationId: null,
        error:
          err instanceof Error ? err.message : 'World generation failed',
      })
    }
  },

  generateWorldShot: async (locationId, shot, promptOverride) => {
    const { sceneManifest, selectedBoostPreset, imageProvider } = get()
    const location = sceneManifest?.locations.find(
      (l) => l.locationId === locationId,
    )
    const scene = sceneManifest?.scenes.find((s) => s.location === locationId)
    if (!location || !scene) return

    set({ generatingLocationId: locationId, error: null })

    try {
      // 사용자 편집 프롬프트 우선, 없으면 기본 빌드 프롬프트.
      const prompt =
        promptOverride ??
        worldShotPrompt(
          location.visualDescription,
          location.timeOfDay,
          scene.mood,
          selectedBoostPreset,
          shot,
        )
      const img = await generateImage(prompt, '16:9', imageProvider)
      set((state) => ({
        generatingLocationId: null,
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId ? { ...w, [shot]: img } : w,
        ),
      }))

      const pid = useProjectStore.getState().projectId
      if (pid) {
        const url = await persistImage(
          pid,
          'location',
          locationId,
          WORLD_SHOT_COLUMN[shot],
          img,
        )
        if (url) {
          set((state) => ({
            worldAssets: state.worldAssets.map((w) =>
              w.locationId === locationId ? { ...w, [shot]: url } : w,
            ),
          }))
        }
      }
    } catch (err) {
      set({
        generatingLocationId: null,
        error:
          err instanceof Error ? err.message : 'World generation failed',
      })
    }
  },

  // Writer→Artist 첫 진입 시 "기본 필수" 이미지 1회 자동생성 (1회+캐시).
  // 가드 = 이미지가 없는(null) 것만 생성 → 생성물은 DB 영속(persistImage)되므로
  // 재진입 시 not-null이라 자동 skip(자연 캐시). decision #29.6(토큰 보호) 화해책.
  // 토큰 절약: 캐릭터는 전체 5뷰가 아니라 대표 뷰(front) 1장만.
  autoGenerateBaseImages: async () => {
    const { characterAssets, worldAssets } = get()

    for (const c of characterAssets) {
      // 동시/중복 트리거 방지: 진행 중이면 skip.
      if (get().generatingCharacterId) break
      if (c.views.front == null) {
        await get().generateSheet(c.characterId, ['front'])
      }
    }

    for (const w of worldAssets) {
      if (get().generatingLocationId) break
      if (w.wideShot == null) {
        await get().generateWorldAsset(w.locationId)
      }
    }
  },

  applyUpdates: async (updates) => {
    for (const u of updates) {
      if (u.type === 'regenerateCharacter') {
        await get().generateSheet(u.characterId, u.views)
      } else if (u.type === 'regenerateWorldAsset') {
        await get().generateWorldAsset(u.locationId)
      }
    }
  },

  selectBoostPreset: (preset) =>
    set((state) => ({
      selectedBoostPreset: state.selectedBoostPreset === preset ? null : preset,
    })),

  setImageProvider: (provider) => set({ imageProvider: provider }),

  reset: () =>
    set({
      sceneManifest: null,
      characterAssets: [],
      worldAssets: [],
      selectedCharacterId: null,
      selectedLocationId: null,
      generatingCharacterId: null,
      generatingLocationId: null,
      selectedBoostPreset: null,
      imageProvider: 'fal' as ImageProvider,
      error: null,
    }),
}))

/** World 샷의 기본 생성 프롬프트 (dialog 표시·편집 초기값용) */
export function worldShotDefaultPrompt(
  locationId: string,
  shot: WorldShotKey,
): string {
  const { sceneManifest, selectedBoostPreset } = useArtistStore.getState()
  const location = sceneManifest?.locations.find(
    (l) => l.locationId === locationId,
  )
  const scene = sceneManifest?.scenes.find((s) => s.location === locationId)
  if (!location || !scene) return ''
  return worldShotPrompt(
    location.visualDescription,
    location.timeOfDay,
    scene.mood,
    selectedBoostPreset,
    shot,
  )
}
