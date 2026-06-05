'use client'

import { useEffect } from 'react'
import { ImageIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInventoryStore } from '@/stores/inventory-store'
import { useProjectStore } from '@/stores/project-store'
import type { InventoryItem } from '@/types/inventory'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (item: InventoryItem) => void
}

export function InventoryPickerDialog({ open, onOpenChange, onPick }: Props) {
  const workspaceId = useProjectStore((s) => s.workspaceId)
  const items = useInventoryStore((s) => s.items)
  const loading = useInventoryStore((s) => s.loading)
  const load = useInventoryStore((s) => s.load)

  useEffect(() => {
    if (open && workspaceId) {
      void load(workspaceId)
    }
  }, [open, workspaceId, load])

  const handlePick = (item: InventoryItem) => {
    onPick(item)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>인벤토리에서 선택</DialogTitle>
        </DialogHeader>

        {loading && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            불러오는 중…
          </p>
        )}

        {!loading && items.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            인벤토리가 비어 있습니다.
          </p>
        )}

        {!loading && items.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => {
              const thumb = item.thumbnailUrl ?? item.imageUrl
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePick(item)}
                  className="group relative overflow-hidden rounded-md border border-border p-1.5 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
                >
                  <div className="relative aspect-square overflow-hidden rounded">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted/50">
                        <ImageIcon className="size-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs font-medium">
                    {item.name}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
