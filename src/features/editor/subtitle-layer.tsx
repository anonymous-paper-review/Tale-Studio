'use client'

// 자막 오버레이 (약속 K, 2026-09-04) — 미리보기의 영상·타이틀 카드 위에 그 클립의 자막 한 덩어리. 누르면 바로 고치고,
//   끌거나 방향키로 옮긴다(옮긴 자리는 저장). 흰 글자에 검은 테두리. 자리·줄바꿈은 src/lib/editor/subtitle.ts 와 같다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import { Textarea } from '@/components/ui/textarea'
import {
  SUBTITLE_LINE_HEIGHT,
  SUBTITLE_MAX_WIDTH_RATIO,
  SUBTITLE_STROKE_RATIO,
  clamp01,
  nudgeSubtitle,
  subtitleFont,
  subtitleFontPx,
  type ShotSubtitle,
} from '@/lib/editor/subtitle'
import { layoutTitleText } from '@/lib/editor/title-card'
import { useT } from '@/lib/i18n'

let measureCanvas: HTMLCanvasElement | null = null
function measureWith(font: string): (s: string) => number {
  if (typeof document === 'undefined') return (s) => s.length * 10
  measureCanvas ??= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return (s) => s.length * 10
  ctx.font = font
  return (s) => ctx.measureText(s).width
}

export function SubtitleLayer({
  subtitle,
  onChange,
  onBeforeChange,
}: {
  subtitle: ShotSubtitle
  onChange: (patch: Partial<ShotSubtitle>) => void
  /** 끌기·편집 직전 한 번 — 되돌리기 스냅샷용. */
  onBeforeChange: () => void
}) {
  const t = useT()
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 640, h: 360 })
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const el = boxRef.current?.parentElement
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fontPx = subtitleFontPx(size.h)
  const lines = useMemo(
    () => layoutTitleText(subtitle.text ?? '', SUBTITLE_MAX_WIDTH_RATIO * size.w, measureWith(subtitleFont(size.h))),
    [subtitle.text, size.w, size.h],
  )

  const startDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0 || editing) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const origin = { x: subtitle.x, y: subtitle.y }
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && (Math.abs(ev.clientX - startX) > 2 || Math.abs(ev.clientY - startY) > 2)) {
        moved = true
        onBeforeChange()
      }
      if (!moved) return
      onChange({
        x: clamp01(origin.x + (ev.clientX - startX) / size.w, origin.x),
        y: clamp01(origin.y + (ev.clientY - startY) / size.h, origin.y),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (editing) return
    const next = nudgeSubtitle(subtitle, e.key, e.shiftKey)
    if (!next) return
    e.preventDefault()
    e.stopPropagation()
    onBeforeChange()
    onChange({ x: next.x, y: next.y })
  }

  const empty = lines.length === 0
  return (
    <div
      ref={boxRef}
      data-testid="subtitle-layer"
      tabIndex={0}
      role="textbox"
      aria-label={t('Subtitle')}
      className="absolute z-10 max-w-[90%] -translate-x-1/2 -translate-y-1/2 cursor-move select-none text-center text-white outline-none focus-visible:ring-1 focus-visible:ring-primary"
      style={{
        left: `${subtitle.x * 100}%`,
        top: `${subtitle.y * 100}%`,
        font: subtitleFont(size.h),
        lineHeight: `${fontPx * SUBTITLE_LINE_HEIGHT}px`,
        WebkitTextStroke: `${Math.max(1, fontPx * SUBTITLE_STROKE_RATIO)}px #000`,
        paintOrder: 'stroke fill',
      }}
      onPointerDown={startDrag}
      onClick={(e) => {
        e.stopPropagation()
        if (!editing) {
          onBeforeChange()
          setEditing(true)
        }
      }}
      onKeyDown={onKeyDown}
    >
      {editing ? (
        <Textarea
          autoFocus
          value={subtitle.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={() => setEditing(false)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              setEditing(false)
            }
          }}
          placeholder={t('Subtitle')}
          className="min-w-[240px] resize-none border-white/30 bg-black/60 text-center text-white placeholder:text-white/40"
          style={{ font: subtitleFont(size.h), lineHeight: `${fontPx * SUBTITLE_LINE_HEIGHT}px`, WebkitTextStroke: '0' }}
        />
      ) : empty ? (
        <span className="text-white/35" style={{ WebkitTextStroke: '0' }}>{t('Click to add a subtitle')}</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre">
            {line || ' '}
          </div>
        ))
      )}
    </div>
  )
}
