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
  references: { strokeWidth: 1.5, strokeDasharray: '4 4' }, // Asset→Shot, 점선
  prompt: { strokeWidth: 1.5, strokeDasharray: '2 3' }, // Prompt→Shot T 입력
  chain: { strokeWidth: 2 }, // previz 체인(파생) — parent 와 동일한 실선 계층 표현
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
