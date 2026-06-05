'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useInventoryStore } from '@/stores/inventory-store'
import { useProjectStore } from '@/stores/project-store'
import type { InventoryItem, InventoryKind } from '@/types/inventory'

const KIND_LABELS: Record<InventoryKind, string> = {
  character: 'Character',
  world: 'World',
  image: 'Image',
}

const SECTION_ORDER: InventoryKind[] = ['character', 'world', 'image']

const SECTION_TITLES: Record<InventoryKind, string> = {
  character: 'CHARACTERS',
  world: 'LOCATIONS',
  image: 'IMAGES',
}

export function InventoryGrid() {
  const workspaceId = useProjectStore((s) => s.workspaceId)
  const { items, loading, error, load, upload, remove } = useInventoryStore()

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (workspaceId) void load(workspaceId)
  }, [workspaceId, load])

  const groupedItems = SECTION_ORDER.reduce<Record<InventoryKind, InventoryItem[]>>(
    (acc, kind) => {
      acc[kind] = items.filter((item) => item.kind === kind)
      return acc
    },
    { character: [], world: [], image: [] },
  )

  const hasItems = items.length > 0

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !workspaceId) return
    // reset input so same file can be re-selected
    e.target.value = ''
    setUploading(true)
    await upload(workspaceId, 'image', file.name.replace(/\.[^.]+$/, ''), file)
    setUploading(false)
  }

  function triggerUpload() {
    fileInputRef.current?.click()
  }

  return (
    <ScrollArea className="min-h-0 flex-1 px-6 py-4">
      {/* Upload control — always visible at top */}
      <div className="mb-5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {loading ? 'Loading…' : `${items.length} item${items.length !== 1 ? 's' : ''}`}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={triggerUpload}
          disabled={uploading || !workspaceId}
          className="gap-1.5"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          {uploading ? 'Uploading…' : 'Upload Image'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Error notice */}
      {error && (
        <p className="mb-4 text-xs text-destructive">{error}</p>
      )}

      {/* Empty state */}
      {!loading && !hasItems && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No assets in your inventory yet.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={triggerUpload}
            disabled={!workspaceId}
            className="gap-1.5"
          >
            <Upload className="size-3.5" />
            Upload your first image
          </Button>
        </div>
      )}

      {/* Sections */}
      {SECTION_ORDER.map((kind, idx) => {
        const sectionItems = groupedItems[kind]
        if (sectionItems.length === 0) return null
        return (
          <div key={kind}>
            {idx > 0 && <Separator className="my-6" />}
            <section>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                {SECTION_TITLES[kind]} ({sectionItems.length})
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {sectionItems.map((item) => (
                  <div
                    key={item.id}
                    className="group relative rounded-lg border border-border p-2 transition-colors hover:border-primary/60 hover:bg-accent/40"
                  >
                    <ImagePlaceholder
                      label={item.name}
                      aspectRatio="square"
                      imageUrl={item.thumbnailUrl ?? item.imageUrl}
                    />
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className="truncate text-xs font-medium">
                        {item.name}
                      </span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {KIND_LABELS[item.kind]}
                      </Badge>
                    </div>
                    {/* Delete button — shown on hover */}
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => void remove(item.id)}
                      className="absolute right-1 top-1 hidden rounded-md bg-background/80 p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:flex group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )
      })}
    </ScrollArea>
  )
}
