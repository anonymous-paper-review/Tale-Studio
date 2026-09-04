'use client'

// 타이틀 카드 무대 (약속 J, 2026-09-04) — 미리보기 안의 검은 카드. 글자와 이미지를 끌어 자유 배치하고(오너 결정),
//   우클릭 메뉴로 겹치는 순서·이미지 넣기/빼기를 정한다. 배치는 비율(0..1)로 저장돼 내보내기(drawTitleCard)와 같은 자리에 찍힌다.
//   줄바꿈은 layoutTitleText 가 정한다 — 내보내기와 같은 글꼴을 오프스크린 캔버스로 재서 줄이 같다(약속 J8).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { Textarea } from '@/components/ui/textarea'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { TitleImagePicker } from '@/features/editor/title-image-picker'
import {
  TITLE_LINE_HEIGHT,
  clampLayer,
  imageRect,
  layoutTitleText,
  resolveTitleCardLayout,
  titleCardFont,
  titleFontPx,
  type TitleCardData,
  type TitleCardLayer,
} from '@/lib/editor/title-card'
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

export function TitleCardStage({
  card,
  editing,
  onStartEdit,
  onStopEdit,
  onChange,
  onBeforeChange,
}: {
  card: TitleCardData
  editing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onChange: (patch: Partial<TitleCardData>) => void
  /** 끌기·메뉴 조작 직전 한 번 — 되돌리기 스냅샷용. */
  onBeforeChange: () => void
}) {
  const t = useT()
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 640, h: 360 })
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    const el = boxRef.current
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

  const layout = resolveTitleCardLayout(card)
  const fontPx = titleFontPx(size.h)
  const lines = useMemo(
    () => layoutTitleText(card.text ?? '', layout.text.w * size.w, measureWith(titleCardFont(size.h))),
    [card.text, layout.text.w, size.w, size.h],
  )
  const img = card.imageUrl ? imageRect(layout.image, size.w, size.h, natural) : null

  // 끌기 — 포인터 기반(HTML5 DnD 아님). 이동량을 비율로 바꿔 저장한다.
  const startDrag = useCallback(
    (layer: 'text' | 'image') => (e: ReactPointerEvent) => {
      if (e.button !== 0 || editing) return
      e.preventDefault()
      e.stopPropagation()
      const origin = layer === 'text' ? layout.text : layout.image
      const startX = e.clientX
      const startY = e.clientY
      let moved = false
      const move = (ev: PointerEvent) => {
        const dx = (ev.clientX - startX) / size.w
        const dy = (ev.clientY - startY) / size.h
        if (!moved && (Math.abs(ev.clientX - startX) > 2 || Math.abs(ev.clientY - startY) > 2)) {
          moved = true
          onBeforeChange()
        }
        if (!moved) return
        const next: TitleCardLayer = clampLayer({ ...origin, x: origin.x + dx, y: origin.y + dy })
        onChange({ layout: { ...layout, [layer]: next } })
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [editing, layout, onBeforeChange, onChange, size.h, size.w],
  )

  const setOrder = (order: 'text-over-image' | 'image-over-text') => {
    onBeforeChange()
    onChange({ layout: { ...layout, order } })
  }
  const setImage = (url: string | null) => {
    onBeforeChange()
    onChange({ imageUrl: url })
  }

  const textLayer = (
    <div
      key="text"
      data-testid="title-text-layer"
      className="absolute cursor-move select-none text-center text-white"
      style={{
        left: `${layout.text.x * 100}%`,
        top: `${layout.text.y * 100}%`,
        width: `${layout.text.w * 100}%`,
        font: titleCardFont(size.h),
        lineHeight: `${fontPx * TITLE_LINE_HEIGHT}px`,
        zIndex: layout.order === 'text-over-image' ? 2 : 1,
      }}
      onPointerDown={startDrag('text')}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEdit()
      }}
    >
      {editing ? (
        <Textarea
          autoFocus
          value={card.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={onStopEdit}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              onStopEdit()
            }
          }}
          placeholder={t('Title text')}
          className="w-full resize-none border-white/30 bg-black/40 text-center font-semibold text-white placeholder:text-white/40"
          style={{ font: titleCardFont(size.h), lineHeight: `${fontPx * TITLE_LINE_HEIGHT}px` }}
        />
      ) : lines.length > 0 ? (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre">
            {line || ' '}
          </div>
        ))
      ) : (
        <div className="whitespace-pre text-white/40">{t('(Empty title) double-click to edit')}</div>
      )}
    </div>
  )
  const imageLayer = img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key="image"
      data-testid="title-image-layer"
      src={card.imageUrl ?? ''}
      alt=""
      draggable={false}
      onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
      className="absolute cursor-move select-none"
      style={{ left: img.x, top: img.y, width: img.w, height: img.h, zIndex: layout.order === 'image-over-text' ? 2 : 1 }}
      onPointerDown={startDrag('image')}
    />
  ) : null

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div ref={boxRef} className="relative aspect-video max-h-full w-full max-w-full overflow-hidden bg-black" data-testid="title-card-stage">
            {imageLayer}
            {textLayer}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem className="text-xs" onSelect={() => setPickerOpen(true)}>
            {card.imageUrl ? t('Replace image') : t('Put an image')}
          </ContextMenuItem>
          {card.imageUrl && (
            <ContextMenuItem className="text-xs" onSelect={() => setImage(null)}>
              {t('Remove image')}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem className="text-xs" disabled={layout.order === 'text-over-image'} onSelect={() => setOrder('text-over-image')}>
            {t('Text in front')}
          </ContextMenuItem>
          <ContextMenuItem className="text-xs" disabled={layout.order === 'image-over-text'} onSelect={() => setOrder('image-over-text')}>
            {t('Image in front')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-xs" onSelect={() => { onBeforeChange(); onChange({ layout: null }) }}>
            {t('Reset layout')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <TitleImagePicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={(url) => setImage(url)} />
    </>
  )
}
