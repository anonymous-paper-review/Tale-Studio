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
  className,
}: {
  active: boolean
  /** pill 라벨 (예: "이미지 생성 중", "영상 생성 중") */
  label?: string
  /** 경과시간 카운터 표시 여부 */
  showElapsed?: boolean
  className?: string
}) {
  // 타이머는 active 일 때만 마운트 → 마운트/언마운트로 경과시간 자동 리셋
  if (!active) return null
  return (
    <ActiveOverlay
      label={label}
      showElapsed={showElapsed}
      className={className}
    />
  )
}

function ActiveOverlay({
  label,
  showElapsed,
  className,
}: {
  label: string
  showElapsed: boolean
  className?: string
}) {
  const elapsed = useElapsedSeconds()

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-10', className)}
      aria-label={label}
      role="status"
    >
      {/* 회전하는 accent 테두리 빛 */}
      <span className="tale-beam absolute inset-0 rounded-[inherit]" aria-hidden />
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

/** 마운트 시점부터 흐른 초. Date.now()/setState 모두 effect/콜백 안에서만 호출. */
function useElapsedSeconds(): number {
  const [sec, setSec] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const t = setInterval(
      () => setSec(Math.floor((Date.now() - start) / 1000)),
      1000,
    )
    return () => clearInterval(t)
  }, [])

  return sec
}

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
