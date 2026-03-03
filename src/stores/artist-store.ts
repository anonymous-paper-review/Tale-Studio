import { create } from 'zustand'
import type { SceneManifest, CharacterAsset, WorldAsset } from '@/types'

interface ArtistState {
  sceneManifest: SceneManifest | null
  characterAssets: CharacterAsset[]
  worldAssets: WorldAsset[]
  selectedCharacterId: string | null

  loadMockData: () => void
  selectCharacter: (id: string) => void
  lockCharacter: (id: string) => void
  unlockCharacter: (id: string) => void
}

export const useArtistStore = create<ArtistState>((set) => ({
  sceneManifest: null,
  characterAssets: [],
  worldAssets: [],
  selectedCharacterId: null,

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
}))
