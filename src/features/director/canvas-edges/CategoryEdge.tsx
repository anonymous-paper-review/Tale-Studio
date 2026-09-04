'use client'

import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { X } from 'lucide-react'
import type {
  DirectorEdge,
  DirectorEdgeCategory,
} from '@/types/director'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useT } from '@/lib/i18n'

/** 약속 F1(2026-09-04): 사람이 지울 수 있는 선 — 계층(parent)·previz 파생(chain)·프롬프트 선은 제외. */
const DELETABLE_CATEGORIES: ReadonlySet<DirectorEdgeCategory> = new Set<DirectorEdgeCategory>([
  'references',
  'image',
  'frame',
  'video-chain',
  'relates-to',
])

const STYLE_BY_CATEGORY: Record<
  DirectorEdgeCategory,
  { strokeWidth: number; strokeDasharray?: string }
> = {
  parent: { strokeWidth: 2 },
  'relates-to': { strokeWidth: 1.5 },
  references: { strokeWidth: 1.5, strokeDasharray: '4 4' }, // Asset→Shot, 점선
  prompt: { strokeWidth: 1.5, strokeDasharray: '2 3' }, // Prompt→Shot T 입력
  image: { strokeWidth: 1.5, strokeDasharray: '3 3' }, // Image→Shot reference input
  frame: { strokeWidth: 1.5, strokeDasharray: '2 3' }, // Video frame 입력
  'video-chain': { strokeWidth: 2, strokeDasharray: '6 3' }, // Video last-frame → Video START
  chain: { strokeWidth: 2 }, // previz 체인(파생) — parent 와 동일한 실선 계층 표현
}

function CategoryEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<DirectorEdge>) {
  const t = useT()
  const deleteEdge = useDirectorCanvasStore((s) => s.deleteEdge)
  const [edgePath, labelX, labelY] = getBezierPath({
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
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke,
          strokeWidth: style.strokeWidth,
          strokeDasharray: style.strokeDasharray,
        }}
      />
      {/* 약속 F1·F4: 고른 선 가운데의 X — 확인창 없이 지우고 Ctrl+Z 로 되돌린다(Delete 키와 같은 경로). */}
      {selected && DELETABLE_CATEGORIES.has(category) && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label={t('Delete connection')}
            title={t('Delete connection')}
            onClick={(event) => {
              event.stopPropagation()
              deleteEdge(id)
            }}
            className="nodrag nopan pointer-events-auto absolute flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <X className="size-3" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const CategoryEdge = memo(CategoryEdgeImpl)
