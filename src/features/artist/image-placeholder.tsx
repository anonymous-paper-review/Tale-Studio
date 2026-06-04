'use client'

import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImagePlaceholderProps {
  label: string
  aspectRatio?: 'square' | 'video'
  imageUrl?: string | null
  className?: string
}

export function ImagePlaceholder({
  label,
  aspectRatio = 'square',
  imageUrl,
  className,
}: ImagePlaceholderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 transition-colors',
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
          <ImageIcon className="size-5" />
          <span className="text-xs">{label}</span>
        </div>
      )}
    </div>
  )
}
