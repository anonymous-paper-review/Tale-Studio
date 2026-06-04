'use client'

import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Copy, Edit, GitBranch, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-canvas-store'

type Theme = 'scene' | 'shot' | 'video'

const THEME_CLASS: Record<
  Theme,
  { border: string; ring: string; hoverRing: string; dot: string }
> = {
  scene: {
    border: 'border-chart-3/80',
    ring: 'ring-chart-3/60',
    hoverRing: 'hover:ring-chart-3/60',
    dot: 'bg-chart-3',
  },
  shot: {
    border: 'border-chart-4/80',
    ring: 'ring-chart-4/60',
    hoverRing: 'hover:ring-chart-4/60',
    dot: 'bg-chart-4',
  },
  video: {
    border: 'border-chart-5/80',
    ring: 'ring-chart-5/60',
    hoverRing: 'hover:ring-chart-5/60',
    dot: 'bg-chart-5',
  },
}

const LABEL_BY_THEME: Record<Theme, string> = {
  scene: 'Scene',
  shot: 'Shot',
  video: 'Video',
}

type BaseNodeProps = {
  id: string
  theme: Theme
  title: string
  selected?: boolean
  /** 박스 너비 (모드별 동적) */
  width?: number
  /** 박스 본문 children */
  children?: ReactNode
  /** 헤더 우측에 추가로 끼울 액션 (예: Video의 ★) */
  headerExtra?: ReactNode
  /** Branch 액션 활성 여부 (Scene/Shot만 true) */
  canBranch?: boolean
  /** Branch 클릭 시 호출 */
  onBranch?: () => void
  /** stale 표시 */
  stale?: boolean
  /** 강한 stale (border 강조) */
  strongStale?: boolean
}

function BaseNodeImpl({
  id,
  theme,
  title,
  selected,
  width,
  children,
  headerExtra,
  canBranch,
  onBranch,
  stale,
  strongStale,
}: BaseNodeProps) {
  const palette = THEME_CLASS[theme]
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  const openDeleteConfirm = useDirectorCanvasStore((s) => s.openDeleteConfirm)

  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const handleEdit = (e: React.MouseEvent) => {
    stop(e)
    openPopup(id)
  }
  const handleBranch = (e: React.MouseEvent) => {
    stop(e)
    onBranch?.()
  }
  const handleDuplicate = (e: React.MouseEvent) => {
    stop(e)
    // D-1에서는 복제 액션을 단순화: addVideoTake 또는 store의 별도 액션. 우선 비활성.
    // TODO(D-2): 노드 종류별 적절한 복제 동작 정의
  }
  const handleDelete = (e: React.MouseEvent) => {
    stop(e)
    openDeleteConfirm(id)
  }

  return (
    <div
      className={cn(
        'group relative rounded-lg bg-node-bg-default transition-[border-width] duration-100',
        'border',
        palette.border,
        selected
          ? cn('border-2 ring-4', palette.ring)
          : cn('hover:border-2 hover:ring-4', palette.hoverRing),
        strongStale && 'border-2 border-destructive',
      )}
      style={width ? { width: `${width}px` } : undefined}
    >
      {stale && (
        <div
          className={cn(
            'absolute -top-1 -left-1 h-2 w-2 animate-pulse rounded-full',
            strongStale ? 'bg-destructive' : 'bg-destructive/50',
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

      {/* Header */}
      <div className="flex h-7 items-center justify-between border-b border-border/60 px-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium uppercase tracking-wide text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', palette.dot)} />
          {LABEL_BY_THEME[theme]}
        </span>
        <div className="flex items-center gap-0.5">
          {headerExtra}
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleEdit}
              aria-label="Edit"
            >
              <Edit className="size-3" />
            </Button>
            {canBranch && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleBranch}
                aria-label="Branch"
              >
                <GitBranch className="size-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDuplicate}
              aria-label="Duplicate"
              disabled
            >
              <Copy className="size-3 opacity-30" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDelete}
              aria-label="Delete"
              className="text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="text-sm font-medium">{title || '(untitled)'}</div>
        {children}
      </div>
    </div>
  )
}

export const BaseNode = memo(BaseNodeImpl)
