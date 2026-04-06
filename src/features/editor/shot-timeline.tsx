'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, GripVertical, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Shot, VideoClip } from '@/types'
import { cn } from '@/lib/utils'

interface ShotTimelineProps {
  orderedShotIds: string[]
  shots: Shot[]
  videoClips: VideoClip[]
  selectedShotId: string | null
  onSelect: (shotId: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onDelete: (shotId: string) => void
}

export function ShotTimeline({
  orderedShotIds,
  shots,
  videoClips,
  selectedShotId,
  onSelect,
  onReorder,
  onDelete,
}: ShotTimelineProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-shot-reorder', String(index))
    // Create a transparent drag image to prevent Chrome super-drag
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
      dragIndex !== null &&
      dragIndex !== toIndex &&
      dragIndex >= 0 &&
      toIndex >= 0 &&
      dragIndex < orderedShotIds.length &&
      toIndex < orderedShotIds.length
    ) {
      onReorder(dragIndex, toIndex)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div ref={containerRef} className="flex gap-2 overflow-x-auto px-2 py-3">
      {orderedShotIds.map((shotId, index) => {
        const shot = shots.find((s) => s.shotId === shotId)
        const clip = videoClips.find((c) => c.shotId === shotId)
        if (!shot) return null

        const isSelected = selectedShotId === shotId
        const isDragging = dragIndex === index
        const isOver = overIndex === index && dragIndex !== index

        return (
          <div
            key={shotId}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onDragLeave={() => setOverIndex(null)}
            onClick={() => onSelect(shotId)}
            className={cn(
              'group relative flex w-32 shrink-0 cursor-grab flex-col rounded-lg border p-2 transition-all active:cursor-grabbing',
              isSelected
                ? 'border-primary bg-accent'
                : 'border-border hover:bg-accent/50',
              isDragging && 'scale-95 opacity-40',
              isOver && 'border-primary border-2 bg-primary/10',
            )}
          >
            {/* Drag handle */}
            <div className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-50">
              <GripVertical className="size-3 text-muted-foreground" />
            </div>

            {/* Drop indicator */}
            {isOver && (
              <div className="absolute -left-1.5 top-0 h-full w-1 rounded-full bg-primary" />
            )}

            {/* Thumbnail area */}
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-muted text-[10px] text-muted-foreground">
              {clip?.url ? (
                <video
                  src={clip.url}
                  className="h-full w-full rounded object-cover"
                  muted
                  preload="metadata"
                />
              ) : shot.referenceImageUrl ? (
                <img
                  src={shot.referenceImageUrl}
                  alt={shot.shotType}
                  className="h-full w-full rounded object-cover"
                />
              ) : clip?.thumbnailUrl ? (
                <img
                  src={clip.thumbnailUrl}
                  alt={shot.shotType}
                  className="h-full w-full rounded object-cover"
                />
              ) : (
                shot.shotType
              )}
            </div>

            {/* Info */}
            <p className="mt-1 truncate text-[10px]">
              {shot.actionDescription}
            </p>
            <div className="mt-0.5 flex items-center gap-1">
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[8px]"
              >
                {shot.durationSeconds}s
              </Badge>
              {clip && (
                <Badge
                  variant={
                    clip.status === 'completed'
                      ? 'default'
                      : 'secondary'
                  }
                  className="h-4 px-1 text-[8px]"
                >
                  {clip.status}
                </Badge>
              )}
            </div>

            {/* Move & Delete buttons */}
            <div className="absolute -top-1 right-0 hidden items-center gap-0.5 group-hover:flex">
              {index > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 rounded-full bg-muted text-muted-foreground hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReorder(index, index - 1)
                  }}
                >
                  <ChevronLeft className="size-3" />
                </Button>
              )}
              {index < orderedShotIds.length - 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 rounded-full bg-muted text-muted-foreground hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReorder(index, index + 1)
                  }}
                >
                  <ChevronRight className="size-3" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-5 rounded-full bg-destructive/80 text-destructive-foreground hover:bg-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(shotId)
                }}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
