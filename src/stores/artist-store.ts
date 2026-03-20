import { create } from 'zustand'
import type { SceneManifest, CharacterAsset, WorldAsset } from '@/types'
import { buildCharacterPrompt, buildWorldPrompt } from '@/lib/prompts'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'

export type ImageProvider = 'gemini' | 'tailscale'

async function generateImage(
  prompt: string,
  aspectRatio: '1:1' | '16:9' = '1:1',
  provider: ImageProvider = 'gemini',
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
): Promise<void> {
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
    }
  } catch (err) {
    console.error(`[artist-store] persistImage failed for ${entityId}/${field}:`, err)
  }
}

interface ArtistState {
  sceneManifest: SceneManifest | null
  characterAssets: CharacterAsset[]
  worldAssets: WorldAsset[]
  selectedCharacterId: string | null
  generatingCharacterId: string | null
  generatingLocationId: string | null
  selectedBoostPreset: string | null
  imageProvider: ImageProvider
  error: string | null

  loadData: () => void
  loadMockData: () => void
  selectCharacter: (id: string) => void
  lockCharacter: (id: string) => void
  unlockCharacter: (id: string) => void
  generateSheet: (id: string) => void
  generateWorldAsset: (locationId: string) => void
  selectBoostPreset: (preset: string) => void
  setImageProvider: (provider: ImageProvider) => void
  reset: () => void
}

export const useArtistStore = create<ArtistState>((set, get) => ({
  sceneManifest: null,
  characterAssets: [],
  worldAssets: [],
  selectedCharacterId: null,
  generatingCharacterId: null,
  generatingLocationId: null,
  selectedBoostPreset: null,
  imageProvider: 'gemini' as ImageProvider,
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
              act: s.act as 'intro' | 'dev' | 'turn' | 'conclusion',
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
            },
            locked: c.locked ?? false,
          }))
          const worldAssets: WorldAsset[] = (dbLocs ?? []).map((l) => ({
            locationId: l.location_id,
            name: l.name,
            sceneId: l.scene_id ?? '',
            wideShot: l.wide_shot ?? null,
            establishingShot: l.establishing_shot ?? null,
          }))

          set({
            sceneManifest: manifest,
            characterAssets,
            worldAssets,
            selectedCharacterId: characterAssets[0]?.characterId ?? null,
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
          views: { front: null, side: null, back: null },
          locked: false,
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
        }
      })

      set({
        sceneManifest: writerManifest,
        characterAssets,
        worldAssets,
        selectedCharacterId: characterAssets[0]?.characterId ?? null,
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
    })
  },

  selectCharacter: (id) => set({ selectedCharacterId: id }),

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

  generateSheet: async (id) => {
    const { sceneManifest, imageProvider } = get()
    const character = sceneManifest?.characters.find(
      (c) => c.characterId === id,
    )
    if (!character) return

    set({ generatingCharacterId: id, error: null })

    try {
      const [front, side, back] = await Promise.all(
        (['front', 'side', 'back'] as const).map((view) =>
          generateImage(buildCharacterPrompt(character.fixedPrompt, view), '1:1', imageProvider),
        ),
      )

      set((state) => ({
        generatingCharacterId: null,
        characterAssets: state.characterAssets.map((a) =>
          a.characterId === id
            ? { ...a, views: { front, side, back } }
            : a,
        ),
      }))

      // Fire-and-forget: persist to Storage + DB
      const pid = useProjectStore.getState().projectId
      if (pid) {
        persistImage(pid, 'character', id, 'view_front', front)
        persistImage(pid, 'character', id, 'view_side', side)
        persistImage(pid, 'character', id, 'view_back', back)
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

      const [wideShot, establishingShot] = await Promise.all([
        generateImage(`${basePrompt}, wide shot, panoramic`, '16:9', imageProvider),
        generateImage(`${basePrompt}, establishing shot, aerial view`, '16:9', imageProvider),
      ])

      set((state) => ({
        generatingLocationId: null,
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId
            ? { ...w, wideShot, establishingShot }
            : w,
        ),
      }))

      // Fire-and-forget: persist to Storage + DB
      const pid = useProjectStore.getState().projectId
      if (pid) {
        persistImage(pid, 'location', locationId, 'wide_shot', wideShot)
        persistImage(pid, 'location', locationId, 'establishing_shot', establishingShot)
      }
    } catch (err) {
      set({
        generatingLocationId: null,
        error:
          err instanceof Error ? err.message : 'World generation failed',
      })
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
      generatingCharacterId: null,
      generatingLocationId: null,
      selectedBoostPreset: null,
      imageProvider: 'gemini' as ImageProvider,
      error: null,
    }),
}))
