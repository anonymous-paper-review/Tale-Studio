'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { Copy, Edit, GitBranch, Trash2, Loader2 } from 'lucide-react'
import {
  useCanvasStore,
  type NodeData,
  type OutputMode,
} from '@/stores/canvas-store'

type Theme = 'actor' | 'world' | 'status'

const THEME_CLASS: Record<
  Theme,
  { border: string; ring: string; dot: string; hoverRing: string }
> = {
  actor: {
    border: 'border-chart-1/80',
    ring: 'ring-chart-1/60',
    hoverRing: 'hover:ring-chart-1/60',
    dot: 'bg-chart-1',
  },
  world: {
    border: 'border-chart-2/80',
    ring: 'ring-chart-2/60',
    hoverRing: 'hover:ring-chart-2/60',
    dot: 'bg-chart-2',
  },
  status: {
    border: 'border-muted-foreground/60',
    ring: 'ring-muted-foreground/60',
    hoverRing: 'hover:ring-muted-foreground/60',
    dot: 'bg-muted-foreground',
  },
}

const WIDTH_BY_MODE: Record<OutputMode, string> = {
  single: 'w-[240px]',
  'five-view': 'w-[320px]',
  'sixteen-angle': 'w-[400px]',
}

const GRID_COLS_BY_MODE: Record<OutputMode, string> = {
  single: 'grid-cols-1',
  'five-view': 'grid-cols-5',
  'sixteen-angle': 'grid-cols-4',
}

type Props = {
  id: string
  data: NodeData
  selected?: boolean
  theme: Theme
}

function BaseNodeImpl({ id, data, selected, theme }: Props) {
  const palette = THEME_CLASS[theme]
  const isStrongStale = data.stale && theme === 'status'
  const openPopup = useCanvasStore((s) => s.openPopup)
  const openBranchModal = useCanvasStore((s) => s.openBranchModal)
  const openDeleteConfirm = useCanvasStore((s) => s.openDeleteConfirm)
  const duplicateNode = useCanvasStore((s) => s.duplicateNode)
  const isGenerating = useCanvasStore((s) => !!s.generatingNodeIds[id])

  const stopAndOpenPopup = (e: React.MouseEvent) => {
    e.stopPropagation()
    openPopup(id)
  }

  const stopAndBranch = (e: React.MouseEvent) => {
    e.stopPropagation()
    openBranchModal(id)
  }

  const stopAndDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation()
    duplicateNode(id)
  }

  const stopAndDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    openDeleteConfirm(id)
  }

  return (
    <div
      className={cn(
        'group relative rounded-lg bg-node-bg-default transition-[border-width] duration-100',
        'border',
        palette.border,
        WIDTH_BY_MODE[data.outputMode],
        selected
          ? cn('border-2 ring-4', palette.ring)
          : cn('hover:border-2 hover:ring-4', palette.hoverRing),
        isStrongStale && 'border-2 border-destructive',
      )}
    >
      {data.stale && (
        <div
          className={cn(
            'absolute -top-1 -left-1 h-2 w-2 rounded-full animate-pulse',
            isStrongStale ? 'bg-destructive' : 'bg-destructive/50',
          )}
          aria-label="stale"
        />
      )}

      <Handle
        type="source"
        position={Position.Top}
        className={cn(
          '!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100',
          palette.dot,
        )}
        id="top"
      />
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          '!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100',
          palette.dot,
        )}
        id="right"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100',
          palette.dot,
        )}
        id="bottom"
      />
      <Handle
        type="source"
        position={Position.Left}
        className={cn(
          '!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100',
          palette.dot,
        )}
        id="left"
      />

      {/* Header: kind label + actions */}
      <div className="flex h-7 items-center justify-between border-b border-border/60 px-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium tracking-wide uppercase text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', palette.dot)} />
          {theme === 'actor' ? 'Actor' : theme === 'world' ? 'World' : 'Status'}
          {data.registered && (
            <span className="ml-1 text-[10px] text-chart-4 normal-case">
              registered
            </span>
          )}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={stopAndOpenPopup}
            className="rounded p-0.5 hover:bg-accent"
            aria-label="Edit"
          >
            <Edit className="size-3" />
          </button>
          {data.kind !== 'status' && (
            <button
              onClick={stopAndBranch}
              className="rounded p-0.5 hover:bg-accent"
              aria-label="Branch"
            >
              <GitBranch className="size-3" />
            </button>
          )}
          <button
            onClick={stopAndDuplicate}
            className="rounded p-0.5 hover:bg-accent"
            aria-label="Duplicate"
          >
            <Copy className="size-3" />
          </button>
          <button
            onClick={stopAndDelete}
            className="rounded p-0.5 text-destructive hover:bg-accent"
            aria-label="Delete"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="text-sm font-medium">{data.label || '(untitled)'}</div>
        {data.prompt && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {data.prompt}
          </p>
        )}

        {data.generatedImages.length > 0 && (
          <div
            className={cn(
              'mt-2 grid gap-1',
              GRID_COLS_BY_MODE[data.outputMode],
            )}
          >
            {data.generatedImages.map((img) => (
              <div
                key={img.id}
                className="aspect-square overflow-hidden rounded-sm border border-border/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.view ?? `${img.angle ?? ''}°`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-mono">{data.outputMode}</span>
          {isGenerating ? (
            <span className="flex items-center gap-1 font-mono text-amber-600">
              <Loader2 className="size-2.5 animate-spin" />
              생성 중
            </span>
          ) : (
            <span className="font-mono">
              {data.generatedImages.length} img
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export const BaseNode = memo(BaseNodeImpl)
