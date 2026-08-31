'use client'

import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { useT } from '@/lib/i18n'

interface ImagePlaceholderProps {
  /** 이미지 alt 텍스트이자 빈 이미지 상태의 캡션(hideCaption 미지정 시 화면에 노출). */
  label: string
  aspectRatio?: 'square' | 'video'
  imageUrl?: string | null
  /** 생성 중이면 border-beam 오버레이 표시 (이미지 유무와 무관) */
  generating?: boolean
  className?: string
  /** #f8(2026-08-31 오너): 카드 얼굴이 과밀하다 — 빈 이미지 상태 캡션(뷰 이름·상태 텍스트)을
   *   카드 얼굴에서만 숨긴다. label 은 alt 텍스트로 여전히 쓰이므로 접근성은 유지된다.
   *   상세 다이얼로그는 hideCaption 을 쓰지 않아 라벨 표시를 그대로 유지한다. */
  hideCaption?: boolean
}

export function ImagePlaceholder({
  label,
  aspectRatio = 'square',
  imageUrl,
  generating = false,
  className,
  hideCaption = false,
}: ImagePlaceholderProps) {
  const t = useT()
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
          {!hideCaption && <span className="text-xs">{label}</span>}
        </div>
      )}

      <GeneratingOverlay
        active={generating}
        label={t('Generating')}
      />
    </div>
  )
}
