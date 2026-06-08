'use client'

import { memo, useEffect } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Play, Square, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { BaseNode } from './BaseNode'
import { useDirectorCanvasStore } from '@/stores/director-canvas-store'
import { isVideoData, type DirectorNode } from '@/types/director-canvas'
import { cn } from '@/lib/utils'

function VideoNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const setVideoFinal = useDirectorCanvasStore((s) => s.setVideoFinal)
  const playingNodeId = useDirectorCanvasStore((s) => s.playingNodeId)
  const setPlayingNode = useDirectorCanvasStore((s) => s.setPlayingNode)
  const ensureVideoThumbnail = useDirectorCanvasStore(
    (s) => s.ensureVideoThumbnail,
  )

  // effect 입력은 early-return 전에 안전 추출 (훅은 무조건 호출돼야 함).
  const vStatus = isVideoData(data) ? data.status : null
  const vVideoUrl = isVideoData(data) ? data.videoUrl : null
  const vThumb = isVideoData(data) ? data.thumbnailUrl : null

  // 완료됐지만 썸네일이 없는(하이드레이트된 기존) 영상 → 첫 프레임 lazy 캡처 1회.
  useEffect(() => {
    if (vStatus === 'completed' && vVideoUrl && !vThumb) {
      void ensureVideoThumbnail(id)
    }
  }, [id, vStatus, vVideoUrl, vThumb, ensureVideoThumbnail])

  if (!isVideoData(data)) return null

  const isPlaying = playingNodeId === id
  const overrideKeys = Object.keys(data.override) as (keyof typeof data.override)[]

  const isStrongStale = data.stale

  const handleFinalToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setVideoFinal(id, !data.final)
  }
  // single-play: 이 노드를 재생으로 지정 → 다른 노드는 playingNodeId 불일치로 <video> 언마운트(정지).
  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPlayingNode(id)
  }
  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPlayingNode(null)
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
      {/* 영상 재생 / 썸네일 / 상태 — single-play: playingNodeId===id 일 때만 <video> 마운트.
          nodrag·nopan: React Flow 가 영상/버튼 상호작용을 노드 드래그·팬으로 가로채지 않게. */}
      <div className="relative mt-1 flex h-24 w-full items-center justify-center overflow-hidden rounded-sm border border-border/40 bg-muted/40">
        {data.status === 'failed' ? (
          <span className="px-2 text-center text-[10px] text-destructive">
            {data.errorMessage ?? '실패'}
          </span>
        ) : isPlaying && data.videoUrl ? (
          <>
            <video
              src={data.videoUrl}
              autoPlay
              controls
              playsInline
              onEnded={() => setPlayingNode(null)}
              onClick={(e) => e.stopPropagation()}
              className="nodrag nopan h-full w-full bg-black object-contain"
            />
            <button
              type="button"
              onClick={handleStop}
              aria-label="정지"
              className="nodrag absolute right-1 top-1 z-10 rounded bg-black/60 p-0.5 text-white/90 transition-colors hover:bg-black/80"
            >
              <Square className="size-3" />
            </button>
          </>
        ) : data.thumbnailUrl ? (
          <button
            type="button"
            onClick={handlePlay}
            disabled={!data.videoUrl}
            aria-label="재생"
            className="nodrag group/play relative block h-full w-full"
          >
            <GeneratedImage
              src={data.thumbnailUrl}
              alt={data.label}
              className="h-full w-full object-cover"
            />
            {data.videoUrl && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover/play:opacity-100">
                <Play className="size-6 fill-white text-white" />
              </span>
            )}
          </button>
        ) : data.videoUrl ? (
          <button
            type="button"
            onClick={handlePlay}
            aria-label="재생"
            className="nodrag flex h-full w-full items-center justify-center transition-colors hover:bg-muted/60"
          >
            <Play className="size-6 fill-muted-foreground text-muted-foreground" />
          </button>
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
