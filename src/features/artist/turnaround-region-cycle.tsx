'use client'

// 턴어라운드 시트 리전 순환 (#d2 2026-08-03) — 시트를 잘라 팬/줌으로 옮겨 다니는 연출.
//
// 기본은 전체 시트 정지. hover 하면 Character Concept → Detail Point(3칸 한 번에) →
//   Sketch Style → Face Expression Guide(앞 3칸) 순으로 확대 이동하고, 벗어나면 전체로 복귀.
//   RoughFrameCycle 과 같은 UX 원칙 — 전 카드 동시 재생은 정보 과다, hover 중에만 움직인다.
//
// 좌표 정합(#d1-fix2 2026-08-03): 리전 좌표는 실제 생성 시트 실측 프랙션(데모 프로젝트 시트
//   2장에서 박스 위치 확인 — 프롬프트가 템플릿 레이아웃을 고정하므로 시트 간 안정적).
//   치우침의 진범은 종횡비였다: 생성 시트는 정확한 16:9 가 아니라(실측 1088×608 = 1.7895)
//   object-cover 가 그 차이를 좌우 중앙 크롭으로 흡수하며 콘텐츠가 한쪽으로 밀렸다.
//   → naturalWidth/Height 를 로드 시 읽어 시트 비율 그대로의 박스를 계산하고 object-fill 로
//   왜곡·암묵 크롭 없이 매핑한다(WYSIWYG). 리전이 컨테이너 비율과 다르면 초과 축을 중앙에서
//   대칭으로 잘라 경계 노출을 최소화한다.

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

/** hover 순환 순서 (사용자 지정 2026-08-03): 컨셉 → 디테일 3칸 → 스케치 → 표정 3칸.
 *  좌표는 실제 생성 시트 실측 — 왼쪽 열 박스 x 0.006..0.304 공통(사용자 확인대로 한 번에 정렬). */
const CYCLE_REGIONS: readonly SheetRegion[] = [
  { label: 'Character concept', x0: 0.006, y0: 0.0615, x1: 0.304, y1: 0.3595 },
  { label: 'Detail points', x0: 0.006, y0: 0.4085, x1: 0.304, y1: 0.7065 },
  { label: 'Sketch style', x0: 0.006, y0: 0.6965, x1: 0.304, y1: 0.9945 },
  { label: 'Face expression guide', x0: 0.538, y0: 0.739, x1: 0.801, y1: 1.0 },
]

const REGION_HOLD_MS = 1600 // 팬(700ms) + 정지 — 읽을 시간을 준다
const CONTAINER_AR = 16 / 9

/**
 * 리전이 컨테이너를 cover 하도록 시트 이미지를 확대·이동.
 * sheetAr(시트 실제 종횡비)를 반영해 요소 박스를 시트 비율 그대로 잡는다 — object-fill 이라
 * 브라우저의 암묵 크롭이 없고, 프랙션 좌표가 두 축 모두 정확히 매핑된다.
 */
function regionStyle(r: SheetRegion, sheetAr: number | null): CSSProperties {
  const ratio = (sheetAr ?? CONTAINER_AR) / CONTAINER_AR // >1 = 시트가 컨테이너보다 넓다
  // 컨테이너 대비 렌더 폭/높이 배수 — 두 축 모두 리전을 덮는 최소 확대(왜곡 없음).
  const wFrac = Math.max(1 / (r.x1 - r.x0), ratio / (r.y1 - r.y0))
  const hFrac = wFrac / ratio
  const cx = (r.x0 + r.x1) / 2
  const cy = (r.y0 + r.y1) / 2
  return {
    width: `${wFrac * 100}%`,
    height: `${hFrac * 100}%`,
    left: '50%',
    top: '50%',
    transform: `translate(-${cx * 100}%, -${cy * 100}%)`,
  }
}

export function TurnaroundRegionCycle({ url, alt }: { url: string; alt: string }) {
  const [hovering, setHovering] = useState(false)
  const [idx, setIdx] = useState(0) // CYCLE_REGIONS 인덱스 (hover 중에만 의미)
  const [sheetAr, setSheetAr] = useState<number | null>(null)

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
        onLoad={(e) => {
          const el = e.currentTarget
          if (el.naturalWidth && el.naturalHeight) setSheetAr(el.naturalWidth / el.naturalHeight)
        }}
        className="absolute max-w-none object-fill transition-[width,height,transform] duration-700 ease-in-out motion-reduce:transition-none"
        style={regionStyle(region, sheetAr)}
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
