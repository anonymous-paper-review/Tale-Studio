'use client'

// 턴어라운드 시트 확대경 (#d2 2026-08-03 → #sheet-magnifier 2026-08-11).
//
// 옛 동작: hover 하면 미리 정해둔 리전(컨셉 → 디테일 → 스케치 → 표정)을 1.6초마다 자동 순환.
// 바뀐 이유(오너 피드백 2026-08-11): 보고 싶은 곳은 사람이 정하는데 화면이 제멋대로 옮겨 다녔다.
//   순환을 걷어내고 **마우스가 가리키는 곳을 그 자리에서 확대**한다 — 커서 아래 지점이 커서
//   아래에 그대로 머무는 확대경 방식이라, 시트 어디든 원하는 만큼 훑어볼 수 있다.
//
// 좌표 정합(#d1-fix2 2026-08-03 유지): 생성 시트는 정확한 16:9 가 아니라(실측 1088×608 = 1.7895)
//   object-cover 에 맡기면 브라우저의 암묵 크롭이 프랙션 좌표를 어긋나게 한다. naturalWidth/Height
//   로 시트 비율을 읽어 요소 박스를 그 비율 그대로 잡고 object-fill 로 매핑한다(WYSIWYG).

import { useState, type CSSProperties } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SheetRegion {
  x0: number
  y0: number
  x1: number
  y1: number
}

const FULL_SHEET: SheetRegion = { x0: 0, y0: 0, x1: 1, y1: 1 }
const CONTAINER_AR = 16 / 9
/** 확대 배율 — 시트 한 칸(컨셉/디테일 박스)이 화면을 채우는 정도. 옛 리전 순환과 같은 체감. */
const ZOOM = 3

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

/**
 * 커서 위치(컨테이너 내 프랙션)를 중심으로 한 확대 창.
 * 창의 종횡비를 컨테이너와 맞춘다 — 안 맞추면 짧은 축이 남아 배율이 의도보다 커진다.
 * 가장자리에서는 창을 시트 안으로 밀어 넣는다(빈 여백 대신 끝을 보여준다).
 */
function cursorRegion(fx: number, fy: number, sheetAr: number | null): SheetRegion {
  const w = 1 / ZOOM
  const h = Math.min(1, (w * (sheetAr ?? CONTAINER_AR)) / CONTAINER_AR)
  const x0 = Math.min(Math.max(fx - w / 2, 0), 1 - w)
  const y0 = Math.min(Math.max(fy - h / 2, 0), 1 - h)
  return { x0, y0, x1: x0 + w, y1: y0 + h }
}

export function TurnaroundRegionCycle({ url, alt }: { url: string; alt: string }) {
  const [cursor, setCursor] = useState<{ fx: number; fy: number } | null>(null)
  const [sheetAr, setSheetAr] = useState<number | null>(null)

  const region = cursor ? cursorRegion(cursor.fx, cursor.fy, sheetAr) : FULL_SHEET

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-md bg-muted"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        setCursor({
          fx: (e.clientX - rect.left) / rect.width,
          fy: (e.clientY - rect.top) / rect.height,
        })
      }}
      onMouseLeave={() => setCursor(null)}
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
        // 커서를 따라가는 연출이라 트랜지션은 짧게 — 길면 손보다 늦게 도착해 끌려다니는 느낌이 난다.
        //   진입/이탈의 확대·복귀도 이 값으로 부드러워진다.
        className="absolute max-w-none object-fill transition-[width,height,transform] duration-150 ease-out motion-reduce:transition-none"
        style={regionStyle(region, sheetAr)}
      />
      {/* 확대 중 표시 — 옛 리전 라벨 자리. 지금 보고 있는 것이 원본이 아니라 확대라는 신호. */}
      <span
        className={cn(
          'pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 font-mono text-[9px] tracking-wide text-muted-foreground backdrop-blur-sm transition-opacity',
          cursor ? 'opacity-100' : 'opacity-0',
        )}
      >
        <Search className="size-2.5" />
        {ZOOM}×
      </span>
    </div>
  )
}
