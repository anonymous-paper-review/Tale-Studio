'use client'

import { useState } from 'react'
import { Clapperboard, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { SceneManifest } from '@/types'

interface SceneCardsProps {
  manifest: SceneManifest
  shotCounts: Record<string, number>
  onOpenScene: (sceneId: string) => void
  activeSceneId?: string | null
  onReorder?: (orderedIds: string[]) => void
}

export function SceneCards({
  manifest,
  shotCounts,
  onOpenScene,
  activeSceneId,
  onReorder,
}: SceneCardsProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-scene-reorder', String(index))
    // Transparent drag image to suppress browser ghost
    const ghost = document.createElement('div')
    ghost.style.width = '1px'
    ghost.style.height = '1px'
    ghost.style.opacity = '0'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    requestAnimationFrame(() => ghost.remove())
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIndex(index)
  }

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    if (
      onReorder &&
      dragIndex !== null &&
      dragIndex !== toIndex &&
      dragIndex >= 0 &&
      toIndex >= 0 &&
      dragIndex < manifest.scenes.length &&
      toIndex < manifest.scenes.length
    ) {
      const ids = manifest.scenes.map((s) => s.sceneId)
      const [moved] = ids.splice(dragIndex, 1)
      ids.splice(toIndex, 0, moved)
      onReorder(ids)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Scenes ({manifest.scenes.length})
      </div>
      {manifest.scenes.map((scene, idx) => {
        const isActive = activeSceneId === scene.sceneId
        const count = shotCounts[scene.sceneId] ?? 0
        const isDragging = dragIndex === idx
        const isOver = overIndex === idx && dragIndex !== idx
        return (
          <div
            key={scene.sceneId}
            draggable={Boolean(onReorder)}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            onDragLeave={() => setOverIndex(null)}
            className={cn(
              'group relative rounded-lg border transition-all',
              isActive
                ? 'border-primary bg-accent'
                : 'border-border hover:border-muted-foreground/40 hover:bg-accent/40',
              isDragging && 'scale-95 opacity-40',
              isOver && 'border-primary border-2 bg-primary/10',
              onReorder && 'cursor-grab active:cursor-grabbing',
            )}
          >
            {/* Drop indicator */}
            {isOver && (
              <div className="absolute -top-1 left-0 h-1 w-full rounded-full bg-primary" />
            )}

            <button
              type="button"
              onClick={() => onOpenScene(scene.sceneId)}
              className="w-full rounded-lg p-3 pl-7 text-left"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Scene {idx + 1}</span>
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Clapperboard className="size-3" />
                  {count}
                </Badge>
              </div>
              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                {scene.narrativeSummary || '—'}
              </p>
            </button>

            {/* Drag handle indicator */}
            {onReorder && (
              <div className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-50">
                <GripVertical className="size-3 text-muted-foreground" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
