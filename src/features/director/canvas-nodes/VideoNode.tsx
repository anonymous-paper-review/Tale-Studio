'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Play, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { BaseNode } from './BaseNode'
import { useDirectorCanvasStore } from '@/stores/director-canvas-store'
import { isVideoData, type DirectorNode } from '@/types/director-canvas'
import { cn } from '@/lib/utils'

function VideoNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const setVideoFinal = useDirectorCanvasStore((s) => s.setVideoFinal)

  if (!isVideoData(data)) return null

  const overrideKeys = Object.keys(data.override) as (keyof typeof data.override)[]

  const isStrongStale = data.stale

  const handleFinalToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setVideoFinal(id, !data.final)
  }

  return (
    <BaseNode
      id={id}
      theme="video"
      title={data.label}
      selected={selected}
      width={240}
      stale={data.stale}
      strongStale={isStrongStale}
      headerExtra={
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleFinalToggle}
          aria-label={data.final ? 'Unmark Final' : 'Mark Final'}
        >
          <Star
            className={cn(
              'size-3.5',
              data.final
                ? 'fill-warning text-warning'
                : 'text-muted-foreground',
            )}
          />
        </Button>
      }
    >
      {/* 썸네일 / 상태 */}
      <div className="relative mt-1 flex h-24 w-full items-center justify-center overflow-hidden rounded-sm border border-border/40 bg-muted/40">
        {data.status === 'failed' ? (
          <span className="px-2 text-center text-[10px] text-destructive">
            {data.errorMessage ?? '실패'}
          </span>
        ) : data.thumbnailUrl ? (
          <div className="relative h-full w-full">
            <GeneratedImage
              src={data.thumbnailUrl}
              alt={data.label}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 hover:bg-black/30">
              <Play className="size-6 text-white" />
            </div>
          </div>
        ) : data.videoUrl ? (
          <Play className="size-6 text-muted-foreground" />
        ) : (
          <span className="text-[10px] text-muted-foreground">대기 중</span>
        )}

        <GeneratingOverlay
          active={data.status === 'generating'}
          label="영상 생성 중"
        />
      </div>

      {/* override indicator */}
      {overrideKeys.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {overrideKeys.map((k) => (
            <span
              key={k}
              className="rounded-sm border border-warning/50 bg-warning/10 px-1 text-[9px] uppercase text-warning"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono">{data.status}</span>
        {data.final && (
          <span className="font-mono text-warning">★ FINAL</span>
        )}
      </div>
    </BaseNode>
  )
}

export const VideoNode = memo(VideoNodeImpl)
