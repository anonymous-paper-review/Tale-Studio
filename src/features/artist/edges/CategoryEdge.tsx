'use client'

import { memo } from 'react'
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import type { CanvasEdge, EdgeCategory } from '@/stores/canvas-store'

const STYLE_BY_CATEGORY: Record<
  EdgeCategory,
  { strokeWidth: number; strokeDasharray?: string }
> = {
  parent: { strokeWidth: 2 },
  'in-world': { strokeWidth: 1.5 },
  references: { strokeWidth: 1.5, strokeDasharray: '6 4' },
}

function CategoryEdgeImpl({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<CanvasEdge>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const category = (data?.category ?? 'parent') as EdgeCategory
  const style = STYLE_BY_CATEGORY[category]
  const stroke = selected ? 'var(--edge-selected)' : 'var(--edge-default)'

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.strokeDasharray,
      }}
    />
  )
}

export const CategoryEdge = memo(CategoryEdgeImpl)
