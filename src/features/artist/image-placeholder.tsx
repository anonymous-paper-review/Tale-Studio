'use client'

import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'

interface ImagePlaceholderProps {
  label: string
  aspectRatio?: 'square' | 'video'
  imageUrl?: string | null
  /** 생성 중이면 border-beam + 경과시간 오버레이 표시 (이미지 유무와 무관) */
  generating?: boolean
  /** 생성 시작 시각(epoch ms) — 주면 탭 전환(remount)에도 경과시간 타이머가 안 리셋된다 */
  generatingStartedAt?: number
  className?: string
}

export function ImagePlaceholder({
  label,
  aspectRatio = 'square',
  imageUrl,
  generating = false,
  generatingStartedAt,
  className,
}: ImagePlaceholderProps) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/50 transition-colors',
        aspectRatio === 'square' ? 'aspect-square' : 'aspect-video',
        className,
      )}
    >
      {imageUrl ? (
        <GeneratedImage
          src={imageUrl}
          alt={label}
          className="h-full w-full rounded-lg object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <ImageIcon className="size-5" />
          <span className="text-xs">{label}</span>
        </div>
      )}

      <GeneratingOverlay
        active={generating}
        label="생성 중"
        startedAt={generatingStartedAt}
      />
    </div>
  )
}
