import { create } from 'zustand'
import type { InventoryItem, InventoryKind, SaveFromAssetInput } from '@/types/inventory'

// ============================================================================
// Types
// ============================================================================

interface InventoryState {
  items: InventoryItem[]
  loading: boolean
  error: string | null

  load: (workspaceId: string) => Promise<void>
  saveFromAsset: (input: SaveFromAssetInput) => Promise<InventoryItem | null>
  upload: (
    workspaceId: string,
    kind: InventoryKind,
    name: string,
    file: File,
  ) => Promise<InventoryItem | null>
  remove: (id: string) => Promise<void>
  reset: () => void
}

// ============================================================================
// Store — persist 미사용 (서버 source-of-truth, workspace 전환 stale 금지)
// workspaceId는 action 인자로 수신 (store 간 결합 금지)
// ============================================================================

export const useInventoryStore = create<InventoryState>()((set, get) => ({
  items: [],
  loading: false,
  error: null,

  load: async (workspaceId) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(
        '/api/inventory?workspaceId=' + encodeURIComponent(workspaceId),
      )
      const body = await res.json()
      if (!res.ok) {
        set({ error: body.error ?? 'Failed to load inventory', loading: false })
        return
      }
      set({ items: body.items ?? [], loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load inventory',
        loading: false,
      })
    }
  },

  saveFromAsset: async (input) => {
    set({ error: null })
    try {
      const res = await fetch('/api/inventory/save-from-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const body = await res.json()
      if (!res.ok) {
        set({ error: body.error ?? 'Failed to save asset' })
        return null
      }
      const item: InventoryItem = body.item
      set((s) => ({ items: [item, ...s.items] }))
      return item
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to save asset' })
      return null
    }
  },

  upload: async (workspaceId, kind, name, file) => {
    set({ error: null })
    try {
      const formData = new FormData()
      formData.append('workspaceId', workspaceId)
      formData.append('kind', kind)
      formData.append('name', name)
      formData.append('file', file)
      // Content-Type 헤더 수동 설정 금지 — 브라우저가 multipart boundary 자동 설정
      const res = await fetch('/api/inventory/upload', {
        method: 'POST',
        body: formData,
      })
      const body = await res.json()
      if (!res.ok) {
        set({ error: body.error ?? 'Failed to upload' })
        return null
      }
      const item: InventoryItem = body.item
      set((s) => ({ items: [item, ...s.items] }))
      return item
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to upload' })
      return null
    }
  },

  remove: async (id) => {
    // optimistic: 백업 후 즉시 제거, 실패 시 롤백
    const backup = get().items
    set((s) => ({ items: s.items.filter((i) => i.id !== id), error: null }))
    try {
      const res = await fetch(
        '/api/inventory?id=' + encodeURIComponent(id),
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        set({ items: backup, error: body.error ?? 'Failed to delete' })
      }
    } catch (err) {
      set({
        items: backup,
        error: err instanceof Error ? err.message : 'Failed to delete',
      })
    }
  },

  reset: () => set({ items: [], loading: false, error: null }),
}))
