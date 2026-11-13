'use client'

// 샷 상세의 시작 · 끝 그림 한 칸(디자이너 11/13 시안 D6 · D7) — 이미지 탭(크게)과 영상 탭의 이미지 고치기(작게)가 같이 쓴다.
//   1단계 다시 만들기는 지금처럼 시작 · 끝 함께다(오너 답 5번) — 고르기 표시는 둘 다 고른 채 잠가 둔다.
import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { ThumbImage } from '@/components/thumb-image'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { aspectRatioFromFormat, type ProjectFormat } from '@/types/project'

export function LockedFrame({ which, url, style, small = false }: {
  which: 'start' | 'end'
  url: string | null
  style: CSSProperties | null
  small?: boolean
}) {
  const t = useT()
  const name = t(which === 'start' ? 'Start image' : 'End image')
  return (
    <figure className={cn('relative shrink-0 overflow-hidden border-2 border-info bg-art-placeholder', small ? 'rounded-[10px]' : 'rounded-[14px]')} style={style ?? { aspectRatio: '16 / 9' }}>
      {url ? <ThumbImage src={url} alt={name} className="size-full object-cover" /> : null}
      <figcaption className={cn('absolute rounded-md bg-background/80 font-semibold', small ? 'left-1 top-1 px-1 text-[10px]' : 'left-2 top-2 px-2 py-0.5 text-micro')}>
        {t(which === 'start' ? 'Start' : 'End')}
      </figcaption>
      <span role="checkbox" aria-checked="true" aria-disabled="true" aria-label={name}
        className={cn('absolute flex items-center justify-center rounded-md bg-info text-info-foreground', small ? 'right-1 top-1 size-4' : 'right-2 top-2 size-6')}>
        <Check className={small ? 'size-3' : 'size-4'} />
      </span>
    </figure>
  )
}

/** 작은 그림 칸 크기 — 세로 · 정사각은 높이 96, 가로는 폭 128. */
export function smallFrameStyle(format: ProjectFormat | null): CSSProperties {
  const [w, h] = aspectRatioFromFormat(format ?? 'horizontal_16:9').split(':').map(Number)
  const ratio = w && h ? w / h : 16 / 9
  return { aspectRatio: `${w || 16} / ${h || 9}`, width: ratio > 1 ? 128 : Math.round(96 * ratio) }
}
