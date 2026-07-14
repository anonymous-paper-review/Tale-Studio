'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * 이미지/비디오 생성 중 카드·노드 표면에 얹는 "작업 중" 오버레이.
 * - border beam: 테두리를 도는 accent 빛 (loud spinner 대체, design-references §generation-in-progress)
 * - 경과시간 pill: pulse dot + mm:ss (UI가 생성 시작을 본 시점부터 — 정직한 indeterminate 신호)
 *
 * 호출 측은 `relative` + `overflow-hidden` + (선택) `rounded-*` 컨테이너 안에 둔다.
 * 빛은 부모 radius 를 그대로 따른다(`rounded-[inherit]`).
 */
export function GeneratingOverlay({
  active,
  label = '생성 중',
  showElapsed = true,
  startedAt,
  beamColor = 'primary',
  className,
}: {
  active: boolean
  /** pill 라벨 (예: "이미지 생성 중", "영상 생성 중") */
  label?: string
  /** 경과시간 카운터 표시 여부 */
  showElapsed?: boolean
  /** 생성 시작 시각(epoch ms). 주면 이 시점부터 경과를 센다 → 탭 전환(remount)에도 타이머 안 리셋.
   *  없으면(undefined) 기존처럼 mount 시점부터 센다. */
  startedAt?: number
  /** 테두리 빛 색(#e13): 이미지 생성=success(초록), 영상 생성=primary(빨강). */
  beamColor?: 'primary' | 'success'
  className?: string
}) {
  if (!active) return null
  return (
    <ActiveOverlay
      label={label}
      showElapsed={showElapsed}
      startedAt={startedAt}
      beamColor={beamColor}
      className={className}
    />
  )
}

function ActiveOverlay({
  label,
  showElapsed,
  startedAt,
  beamColor,
  className,
}: {
  label: string
  showElapsed: boolean
  startedAt?: number
  beamColor: 'primary' | 'success'
  className?: string
}) {
  const elapsed = useElapsedSeconds(startedAt)

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-10', className)}
      aria-label={label}
      role="status"
    >
      {/* 회전하는 accent 테두리 빛 */}
      <span
        className={cn(
          'tale-beam absolute inset-0 rounded-[inherit]',
          beamColor === 'success' && '[--beam-color:var(--success)]',
        )}
        aria-hidden
      />
      {/* 작업 중임을 알리는 옅은 scrim (glass blur 아님 — flat tint) */}
      <span
        className="absolute inset-0 rounded-[inherit] bg-background/20"
        aria-hidden
      />
      {/* 경과시간 pill */}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-2 py-0.5 text-[10px] font-medium text-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        <span>{label}</span>
        {showElapsed && (
          <span className="font-mono tabular-nums text-muted-foreground">
            {formatElapsed(elapsed)}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * 생성 완료된 이미지의 blur-up reveal.
 * placeholder → 선명 이미지로 fade + 디블러 (Runway "frame breathes").
 * next/image 미사용 — 외부 storage URL 직접 렌더라 plain img 유지.
 */
export function GeneratedImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={cn(
        'transition-[filter,opacity,transform] duration-500 ease-out',
        loaded
          ? 'blur-0 scale-100 opacity-100'
          : 'scale-[1.02] opacity-0 blur-md',
        className,
      )}
    />
  )
}

/** 흐른 초. startedAt 을 주면 그 시점부터(탭 전환 remount 에도 유지), 없으면 mount 시점부터.
 *  Date.now()/setState 모두 effect 안에서만 호출. */
function useElapsedSeconds(startedAt?: number): number {
  const [sec, setSec] = useState(0)

  useEffect(() => {
    const base = startedAt ?? Date.now()
    const tick = () => setSec(Math.max(0, Math.floor((Date.now() - base) / 1000)))
    tick() // 즉시 1회 — remount 직후에도 올바른 경과로 복원(0 으로 깜빡이지 않게)
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [startedAt])

  return sec
}

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
