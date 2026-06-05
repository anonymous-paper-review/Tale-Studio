'use client'

import { useCallback } from 'react'
import { cn } from '@/lib/utils'

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
    <div
      onPointerDown={onPointerDown}
      className={cn(
        'group relative shrink-0 bg-border transition-colors hover:bg-primary/40',
        axis === 'x' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
      )}
      title="드래그해서 크기 조절"
    >
      {/* 히트 영역 확장 (얇은 막대라도 잡기 쉽게) */}
      <span
        className={cn(
          'absolute',
          axis === 'x' ? '-inset-x-1 inset-y-0' : '-inset-y-1 inset-x-0',
        )}
      />
    </div>
  )
}
