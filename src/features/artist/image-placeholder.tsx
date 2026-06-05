'use client'

import { ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImagePlaceholderProps {
  label: string
  aspectRatio?: 'square' | 'video'
  imageUrl?: string | null
  /** 생성 중이면 스피너 오버레이 표시 (이미지 유무와 무관) */
  generating?: boolean
  className?: string
}

export function ImagePlaceholder({
  label,
  aspectRatio = 'square',
  imageUrl,
  generating = false,
  className,
}: ImagePlaceholderProps) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 transition-colors',
        aspectRatio === 'square' ? 'aspect-square' : 'aspect-video',
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={label}
          className="h-full w-full rounded-lg object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          {generating ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImageIcon className="size-5" />
          )}
          <span className="text-xs">{label}</span>
        </div>
      )}

      {/* 이미지가 이미 있는데 재생성 중일 때 — 위에 스피너 오버레이 */}
      {generating && imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
          <Loader2 className="size-5 animate-spin text-foreground" />
        </div>
      )}
    </div>
  )
}
