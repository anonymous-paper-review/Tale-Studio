'use client'

import { useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

/**
 * 섹션 경계 드래그 핸들. axis='x' → 가로 너비 조절(세로 막대), axis='y' → 세로 높이 조절(가로 막대).
 * 드래그 시작 시 getValue()로 기준값을 잡고, 이동량(px)을 더해 onChange로 보고한다.
 */
export function ResizeHandle({
  axis,
  getValue,
  onChange,
  onStart,
}: {
  axis: 'x' | 'y'
  getValue: () => number
  onChange: (value: number) => void
  onStart?: () => void
}) {
  const t = useT()
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      onStart?.()
      const startPos = axis === 'x' ? e.clientX : e.clientY
      const base = getValue()
      const move = (ev: PointerEvent) => {
        const cur = axis === 'x' ? ev.clientX : ev.clientY
        onChange(base + (cur - startPos))
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        document.body.style.userSelect = ''
      }
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [axis, getValue, onChange, onStart],
  )

  return (
    // v3 ED1(2026-11-03): 판 사이 틈(가로 12 · 세로 18)이 손잡이 — 평소엔 보이지 않고, 마우스를 올리면 가운데 짧은 선.
    <div
      onPointerDown={onPointerDown}
      className={cn(
        'group relative shrink-0',
        axis === 'x' ? 'w-3 cursor-col-resize' : 'h-[18px] cursor-row-resize',
      )}
      title={t('Drag to resize')}
    >
      <span
        className={cn(
          'absolute rounded-full bg-border-strong opacity-0 transition-opacity group-hover:opacity-100',
          axis === 'x' ? 'inset-y-8 left-1/2 w-0.5 -translate-x-1/2' : 'inset-x-16 top-1/2 h-0.5 -translate-y-1/2',
        )}
      />
    </div>
  )
}
