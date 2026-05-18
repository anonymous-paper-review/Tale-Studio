import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GeneratedImage } from '@/stores/canvas-store'

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
