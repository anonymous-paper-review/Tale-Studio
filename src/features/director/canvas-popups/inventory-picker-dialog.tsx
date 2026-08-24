'use client'

import { ImageIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInventory } from '@/lib/inventory-library'
import { useProjectStore } from '@/stores/project-store'
import type { InventoryItem } from '@/types/inventory'
import { useT } from '@/lib/i18n'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (item: InventoryItem) => void
}

export function InventoryPickerDialog({ open, onOpenChange, onPick }: Props) {
  const t = useT()
  const workspaceId = useProjectStore((s) => s.workspaceId)
  // 닫혀 있으면 null 로 꺼 둔다(옛 useEffect 의 open 가드와 같은 자리). 5분 안에
  // 다시 열면 캐시가 즉답해 로딩 표시 없이 뜬다 — 옛 코드는 열 때마다 재요청했다.
  const { data: items = [], isLoading: loading } = useInventory(open ? workspaceId : null)

  const handlePick = (item: InventoryItem) => {
    onPick(item)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Choose from inventory')}</DialogTitle>
        </DialogHeader>

        {loading && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('Loading…')}
          </p>
        )}

        {!loading && items.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('Inventory is empty.')}
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
