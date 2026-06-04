'use client'

import { Lock } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore } from '@/stores/artist-store'

interface InventoryGridProps {
  onSelect: (kind: 'character' | 'location', id: string) => void
}

export function InventoryGrid({ onSelect }: InventoryGridProps) {
  const { characterAssets, worldAssets } = useArtistStore()

  return (
    <ScrollArea className="flex-1 px-6 py-4">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          CHARACTERS ({characterAssets.length})
        </h3>
        {characterAssets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No characters yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {characterAssets.map((c) => (
              <button
                key={c.characterId}
                type="button"
                onClick={() => onSelect('character', c.characterId)}
                className="group relative rounded-lg border border-border p-2 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
              >
                <ImagePlaceholder
                  label={c.name}
                  aspectRatio="square"
                  imageUrl={c.views.front}
                />
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-medium">
                    {c.name}
                  </span>
                  {c.locked && (
                    <Lock className="size-3 text-muted-foreground" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-6" />

      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          LOCATIONS ({worldAssets.length})
        </h3>
        {worldAssets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No locations yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {worldAssets.map((w) => (
              <button
                key={w.locationId}
                type="button"
                onClick={() => onSelect('location', w.locationId)}
                className="group rounded-lg border border-border p-2 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
              >
                <ImagePlaceholder
                  label={w.name}
                  aspectRatio="video"
                  imageUrl={w.wideShot}
                />
                <div className="mt-2 truncate text-xs font-medium">
                  {w.name}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </ScrollArea>
  )
}
