'use client'

// Director 스토리보드 축척 알약(시안 D1 406:3717 "− 100% + ⤢", 리드 11/14 화면 확인 3) — 노드형 축척 알약과 같은 생김새 · 같은 자리.
//   축척 단계 · 열 수는 Writer 와 같이 쓰는 generating-frame.tsx 그대로(1~6, 기본 4 = 한 줄 3장). Writer 러프 보드는 밀대를 그대로 쓴다.
//   약속: tests/director/storyboard-zoom-pill.test.ts
import type { Dispatch, SetStateAction } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'

import {
  STORYBOARD_ZOOM_DEFAULT,
  STORYBOARD_ZOOM_MAX,
  STORYBOARD_ZOOM_MIN,
  storyboardColumns,
} from '@/components/generating-frame'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** 기본 크기(한 줄 3장)를 100% 로 본 카드 크기. 한 줄 2장 150% · 1장 300% · 4장 75%. */
export function storyboardZoomPercent(zoomLevel: number): number {
  return Math.round((storyboardColumns(STORYBOARD_ZOOM_DEFAULT) / storyboardColumns(zoomLevel)) * 100)
}

/** − 는 한 단계 작게(열 늘리기), + 는 한 단계 크게(열 줄이기), ⤢ 는 기본 크기로. */
export function storyboardZoomStep(zoomLevel: number, action: 'out' | 'in' | 'reset'): number {
  if (action === 'reset') return STORYBOARD_ZOOM_DEFAULT
  const next = action === 'out' ? zoomLevel - 1 : zoomLevel + 1
  return Math.min(STORYBOARD_ZOOM_MAX, Math.max(STORYBOARD_ZOOM_MIN, next))
}

export function StoryboardZoomPill({
  zoomLevel,
  onZoomLevelChange,
  className,
}: {
  zoomLevel: number
  onZoomLevelChange: Dispatch<SetStateAction<number>>
  className?: string
}) {
  const t = useT()
  const button =
    'flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground disabled:pointer-events-none disabled:opacity-40'
  return (
    <div
      className={cn('flex h-[37px] items-center gap-0.5 rounded-full bg-background px-1.5 shadow-node', className)}
      role="group"
      aria-label={t('Storyboard zoom')}
    >
      <button
        type="button"
        className={button}
        onClick={() => onZoomLevelChange((level) => storyboardZoomStep(level, 'out'))}
        disabled={zoomLevel <= STORYBOARD_ZOOM_MIN}
        title={t('Zoom out (more columns)')}
        aria-label={t('Zoom out (more columns)')}
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-11 text-center font-num text-meta font-medium tabular-nums text-muted-foreground">
        {storyboardZoomPercent(zoomLevel)}%
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onZoomLevelChange((level) => storyboardZoomStep(level, 'in'))}
        disabled={zoomLevel >= STORYBOARD_ZOOM_MAX}
        title={t('Zoom in (fewer columns)')}
        aria-label={t('Zoom in (fewer columns)')}
      >
        <Plus className="size-3.5" />
      </button>
      <button
        type="button"
        className={button}
        onClick={() => onZoomLevelChange(storyboardZoomStep(zoomLevel, 'reset'))}
        title={t('Back to the default size')}
        aria-label={t('Back to the default size')}
      >
        <Maximize2 className="size-3.5" />
      </button>
    </div>
  )
}
