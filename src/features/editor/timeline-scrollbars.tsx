'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'

const BAR = 10 // 스크롤바 두께(px)
const MIN_THUMB = 28

/**
 * 타임라인 전용 커스텀 스크롤바 (가로/세로). 항상 표시.
 *  - 스크롤 가능: 토큰 색 thumb, 드래그로 스크롤.
 *  - 스크롤 불가: 트랙 가득 채운 비활성(연한) thumb (드래그 X).
 * targetRef = 네이티브 스크롤바를 숨긴 overflow-auto 컨테이너. 이 컴포넌트는 그 위에 오버레이.
 */
export function TimelineScrollbars({
  targetRef,
  revision,
}: {
  targetRef: RefObject<HTMLDivElement | null>
  revision: string | number
}) {
  const [m, setM] = useState({ sl: 0, st: 0, sw: 0, sh: 0, cw: 0, ch: 0 })

  const measure = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    setM({ sl: el.scrollLeft, st: el.scrollTop, sw: el.scrollWidth, sh: el.scrollHeight, cw: el.clientWidth, ch: el.clientHeight })
  }, [targetRef])

  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [targetRef, measure])

  // 콘텐츠 크기 변화(줌/트랙 추가 등) 반영
  useEffect(() => {
    measure()
  }, [revision, measure])

  const hCan = m.sw > m.cw + 1
  const vCan = m.sh > m.ch + 1
  const hTrack = Math.max(0, m.cw - BAR) // 우하단 코너 공간 확보
  const vTrack = Math.max(0, m.ch - BAR)

  const hThumbW = hCan ? Math.max(MIN_THUMB, (m.cw / m.sw) * hTrack) : hTrack
  const hThumbL = hCan && m.sw > m.cw ? (m.sl / (m.sw - m.cw)) * (hTrack - hThumbW) : 0
  const vThumbH = vCan ? Math.max(MIN_THUMB, (m.ch / m.sh) * vTrack) : vTrack
  const vThumbT = vCan && m.sh > m.ch ? (m.st / (m.sh - m.ch)) * (vTrack - vThumbH) : 0

  const dragH = useCallback(
    (e: React.PointerEvent) => {
      const el = targetRef.current
      if (!el || !(el.scrollWidth > el.clientWidth + 1)) return
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startSL = el.scrollLeft
      const denom = Math.max(0, el.clientWidth - BAR - hThumbW)
      const move = (ev: PointerEvent) => {
        if (denom <= 0) return
        el.scrollLeft = startSL + ((ev.clientX - startX) / denom) * (el.scrollWidth - el.clientWidth)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [targetRef, hThumbW],
  )

  const dragV = useCallback(
    (e: React.PointerEvent) => {
      const el = targetRef.current
      if (!el || !(el.scrollHeight > el.clientHeight + 1)) return
      e.preventDefault()
      e.stopPropagation()
      const startY = e.clientY
      const startST = el.scrollTop
      const denom = Math.max(0, el.clientHeight - BAR - vThumbH)
      const move = (ev: PointerEvent) => {
        if (denom <= 0) return
        el.scrollTop = startST + ((ev.clientY - startY) / denom) * (el.scrollHeight - el.clientHeight)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [targetRef, vThumbH],
  )

  return (
    <>
      {/* 가로 스크롤바 */}
      <div className="absolute bottom-0 left-0 z-40 bg-muted/30" style={{ height: BAR, width: hTrack }}>
        <div
          onPointerDown={dragH}
          className={cn(
            'absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-colors',
            hCan ? 'cursor-pointer bg-muted-foreground/40 hover:bg-muted-foreground/70' : 'bg-border/50',
          )}
          style={{ left: hThumbL, width: hThumbW }}
        />
      </div>
      {/* 세로 스크롤바 */}
      <div className="absolute right-0 top-0 z-40 bg-muted/30" style={{ width: BAR, height: vTrack }}>
        <div
          onPointerDown={dragV}
          className={cn(
            'absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full transition-colors',
            vCan ? 'cursor-pointer bg-muted-foreground/40 hover:bg-muted-foreground/70' : 'bg-border/50',
          )}
          style={{ top: vThumbT, height: vThumbH }}
        />
      </div>
    </>
  )
}
