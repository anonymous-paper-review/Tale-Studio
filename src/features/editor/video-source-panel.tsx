'use client'

import { PanelLeftClose, PanelLeftOpen, Film } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Shot, VideoClip } from '@/types'
import { cn } from '@/lib/utils'

interface VideoSourcePanelProps {
  open: boolean
  onToggle: () => void
  shots: Shot[]
  videoClips: VideoClip[]
  selectedShotId: string | null
  onSelect: (shotId: string) => void
}

/**
 * Video Source 패널 (프리미어2 좌상단 카드 그리드형 소스 관리).
 * - 생성된 비디오 클립을 썸네일 카드 그리드로 표시
 * - 토글로 접기 (collapsed 시 얇은 막대 + 펼치기 버튼만)
 * - 카드 → 타임라인 드래그-투-애드 (붙여넣기). 클릭은 프리뷰 선택.
 * 기존 shot-timeline.tsx 카드뷰 로직을 이주.
 */
export function VideoSourcePanel({
  open,
  onToggle,
  shots,
  videoClips,
  selectedShotId,
  onSelect,
}: VideoSourcePanelProps) {
  if (!open) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center border-r border-border bg-card py-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onToggle}
          title="Video Source 패널 펼치기"
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        <div className="mt-2 flex flex-1 items-center">
          <span className="rotate-180 text-[10px] font-medium tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
            VIDEO SOURCE
          </span>
        </div>
      </div>
    )
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Film className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Video Source</span>
          <Badge variant="secondary" className="h-4 px-1 text-[9px] tabular-nums">
            {videoClips.length}
          </Badge>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={onToggle}
          title="패널 접기"
        >
          <PanelLeftClose className="size-3.5" />
        </Button>
      </div>

      {/* Card grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-2 gap-2 p-2">
          {shots.map((shot) => {
            const clip = videoClips.find((c) => c.shotId === shot.shotId)
            const isSelected = selectedShotId === shot.shotId

            return (
              <div
                key={shot.shotId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy'
                  e.dataTransfer.setData('application/x-shot-id', shot.shotId)
                }}
                onClick={() => onSelect(shot.shotId)}
                title={shot.actionDescription}
                className={cn(
                  'group flex cursor-grab flex-col rounded-md border p-1.5 transition-all active:cursor-grabbing',
                  isSelected
                    ? 'border-primary bg-accent'
                    : 'border-border hover:bg-accent/50',
                )}
              >
                {/* Thumbnail */}
                <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-muted text-[9px] text-muted-foreground">
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
                <p className="mt-1 truncate text-[9px] leading-tight">
                  {shot.actionDescription}
                </p>
                <div className="mt-0.5 flex items-center gap-1">
                  <Badge variant="secondary" className="h-3.5 px-1 font-mono text-[8px]">
                    {shot.durationSeconds}s
                  </Badge>
                  {clip && (
                    <Badge
                      variant={clip.status === 'completed' ? 'default' : 'secondary'}
                      className="h-3.5 px-1 text-[8px]"
                    >
                      {clip.status}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}

          {shots.length === 0 && (
            <p className="col-span-2 py-8 text-center text-[10px] text-muted-foreground">
              생성된 클립이 없습니다
            </p>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
