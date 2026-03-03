import { create } from 'zustand'
import type { SceneManifest, CharacterAsset, WorldAsset } from '@/types'
import { buildCharacterPrompt, buildWorldPrompt } from '@/lib/prompts'

async function generateImage(
  prompt: string,
  aspectRatio: '1:1' | '16:9' = '1:1',
): Promise<string> {
  const res = await fetch('/api/generate/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspectRatio }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const { url } = await res.json()
  return url as string
}

interface ArtistState {
  sceneManifest: SceneManifest | null
  characterAssets: CharacterAsset[]
  worldAssets: WorldAsset[]
  selectedCharacterId: string | null
  generatingCharacterId: string | null
  generatingLocationId: string | null
  selectedBoostPreset: string | null
  error: string | null

  loadMockData: () => void
  selectCharacter: (id: string) => void
  lockCharacter: (id: string) => void
  unlockCharacter: (id: string) => void
  generateSheet: (id: string) => void
  generateWorldAsset: (locationId: string) => void
  selectBoostPreset: (preset: string) => void
}

export const useArtistStore = create<ArtistState>((set, get) => ({
  sceneManifest: null,
  characterAssets: [],
  worldAssets: [],
  selectedCharacterId: null,
  generatingCharacterId: null,
  generatingLocationId: null,
  selectedBoostPreset: null,
  error: null,

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
    const { sceneManifest } = get()
    const character = sceneManifest?.characters.find(
      (c) => c.characterId === id,
    )
    if (!character) return

    set({ generatingCharacterId: id, error: null })

    try {
      const [front, side, back] = await Promise.all(
        (['front', 'side', 'back'] as const).map((view) =>
          generateImage(buildCharacterPrompt(character.fixedPrompt, view)),
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
    } catch (err) {
      set({
        generatingCharacterId: null,
        error:
          err instanceof Error ? err.message : 'Character generation failed',
      })
    }
  },

  generateWorldAsset: async (locationId) => {
    const { sceneManifest, selectedBoostPreset } = get()
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
        generateImage(`${basePrompt}, wide shot, panoramic`, '16:9'),
        generateImage(`${basePrompt}, establishing shot, aerial view`, '16:9'),
      ])

      set((state) => ({
        generatingLocationId: null,
        worldAssets: state.worldAssets.map((w) =>
          w.locationId === locationId
            ? { ...w, wideShot, establishingShot }
            : w,
        ),
      }))
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
}))
