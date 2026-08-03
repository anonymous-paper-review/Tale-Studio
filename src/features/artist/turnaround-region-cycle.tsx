'use client'

// 턴어라운드 시트 리전 순환 (#d2 2026-08-03) — 시트를 잘라 팬/줌으로 옮겨 다니는 연출.
//
// 기본은 전체 시트 정지. hover 하면 Character Concept → Detail Point(3칸 한 번에) →
//   Sketch Style → Face Expression Guide(앞 3칸) 순으로 확대 이동하고, 벗어나면 전체로 복귀.
//   RoughFrameCycle 과 같은 UX 원칙 — 전 카드 동시 재생은 정보 과다, hover 중에만 움직인다.
// 리전 좌표는 public/character-template.png 실측 비율. 생성 프롬프트가 템플릿 레이아웃을
//   그대로 유지하라고 강제하므로(lib/artist/turnaround.ts) 상대 좌표가 안정적이다 —
//   lib/artist/portrait.ts 의 서버 크롭과 같은 전제. 템플릿을 교체하면 여기도 재실측할 것.

import { useEffect, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

interface SheetRegion {
  label: string
  x0: number
  y0: number
  x1: number
  y1: number
}

const FULL_SHEET: SheetRegion = { label: '', x0: 0, y0: 0, x1: 1, y1: 1 }

/** hover 순환 순서 (사용자 지정 2026-08-03): 컨셉 → 디테일 3칸 → 스케치 → 표정 3칸 */
const CYCLE_REGIONS: readonly SheetRegion[] = [
  { label: 'Character concept', x0: 0.01, y0: 0.016, x1: 0.312, y1: 0.412 },
  { label: 'Detail points', x0: 0.01, y0: 0.43, x1: 0.312, y1: 0.668 },
  { label: 'Sketch style', x0: 0.01, y0: 0.683, x1: 0.312, y1: 0.982 },
  { label: 'Face expression guide', x0: 0.556, y0: 0.788, x1: 0.842, y1: 0.988 },
]

const REGION_HOLD_MS = 1600 // 팬(700ms) + 정지 — 읽을 시간을 준다

/** 리전이 컨테이너를 cover 하도록 시트 이미지를 확대·이동. 컨테이너/시트 모두 16:9 전제. */
function regionStyle(r: SheetRegion): CSSProperties {
  const k = Math.max(1 / (r.x1 - r.x0), 1 / (r.y1 - r.y0))
  const cx = (r.x0 + r.x1) / 2
  const cy = (r.y0 + r.y1) / 2
  return {
    width: `${k * 100}%`,
    height: `${k * 100}%`,
    left: '50%',
    top: '50%',
    transform: `translate(-${cx * 100}%, -${cy * 100}%)`,
  }
}

export function TurnaroundRegionCycle({ url, alt }: { url: string; alt: string }) {
  const [hovering, setHovering] = useState(false)
  const [idx, setIdx] = useState(0) // CYCLE_REGIONS 인덱스 (hover 중에만 의미)

  useEffect(() => {
    if (!hovering) return
    const t = setInterval(() => setIdx((i) => (i + 1) % CYCLE_REGIONS.length), REGION_HOLD_MS)
    return () => clearInterval(t)
  }, [hovering])

  const region = hovering ? CYCLE_REGIONS[idx] : FULL_SHEET

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-md bg-muted"
      onMouseEnter={() => {
        setIdx(0) // 항상 컨셉부터
        setHovering(true)
      }}
      onMouseLeave={() => setHovering(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        draggable={false}
        className="absolute max-w-none object-cover transition-[width,height,transform] duration-700 ease-in-out motion-reduce:transition-none"
        style={regionStyle(region)}
      />
      {/* 현재 리전 라벨 — hover 중에만 (RoughFrameCycle 인디케이터와 동일 톤) */}
      <span
        className={cn(
          'pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-background/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground backdrop-blur-sm transition-opacity',
          hovering && region.label ? 'opacity-100' : 'opacity-0',
        )}
      >
        {region.label}
      </span>
    </div>
  )
}
