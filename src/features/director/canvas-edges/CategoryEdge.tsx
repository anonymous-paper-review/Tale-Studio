'use client'

import { memo } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import type {
  DirectorEdge,
  DirectorEdgeCategory,
} from '@/types/director'

const STYLE_BY_CATEGORY: Record<
  DirectorEdgeCategory,
  { strokeWidth: number; strokeDasharray?: string }
> = {
  parent: { strokeWidth: 2 },
  'relates-to': { strokeWidth: 1.5 },
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
}: EdgeProps<DirectorEdge>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const category = (data?.category ?? 'parent') as DirectorEdgeCategory
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
