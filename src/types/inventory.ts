export type InventoryKind = 'character' | 'world' | 'image'

export interface InventoryItem {
  id: string
  workspaceId: string
  kind: InventoryKind
  name: string
  imageUrl: string
  thumbnailUrl: string | null
  sourceProjectId: string | null
  sourceCharacterId: string | null
  createdAt: string
  updatedAt: string
}

export interface SaveFromAssetInput {
  workspaceId: string
  kind: InventoryKind
  name: string
  sourceImageUrl: string
  sourceProjectId?: string
  sourceCharacterId?: string
}
