'use client'

import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Copy, Edit, GitBranch, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { usePresetStorageStore } from '@/stores/preset-storage-store'
import { isShotData, isVideoData } from '@/types/director'
import { editActionForKind } from '@/features/director/canvas-interaction'
import { prettyNodeLabel } from '@/features/director/node-label'

const PRESET_DND_TYPE = 'application/preset-id'

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

// shot/video 카드 종류 라벨(#e5 2026-07-13): 산출물 기준 명명 — CSS uppercase 표기.
//   #previz-chain: Shot 카드는 목각(previz) 이미지 담당 — 실사는 별도 SHOT IMAGE 파생 노드.
const LABEL_BY_THEME: Record<Theme, string> = {
  scene: 'Scene',
  shot: 'Previz shot image',
  video: 'Shot video',
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
  /** 생성 중 테두리 회전 빛(#e5): 'success'=이미지(초록) / 'primary'=영상(빨강). null=없음 */
  beam?: 'success' | 'primary' | null
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
  beam,
}: BaseNodeProps) {
  const palette = THEME_CLASS[theme]
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  const selectNode = useDirectorCanvasStore((s) => s.selectNode)
  const openDeleteConfirm = useDirectorCanvasStore((s) => s.openDeleteConfirm)

  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const handleEdit = (e: React.MouseEvent) => {
    stop(e)
    // theme별 분기: scene=모달, shot/video=좌측 상세 패널 선택 (노드 뷰 격리)
    if (editActionForKind(theme) === 'popup') openPopup(id)
    else selectNode(id)
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

  // 프리셋 카드 drop → camera/lighting/cameraPreset 전체 덮어쓰기 (prompt/참고이미지 유지, 내부 #16)
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(PRESET_DND_TYPE)) {
      e.preventDefault()
    }
  }
  const handleDrop = (e: React.DragEvent) => {
    const presetId = e.dataTransfer.getData(PRESET_DND_TYPE)
    if (!presetId) return
    e.preventDefault()
    e.stopPropagation()
    const preset = usePresetStorageStore
      .getState()
      .presets.find((p) => p.id === presetId)
    if (!preset) return
    const node = useDirectorCanvasStore.getState().nodes.find((n) => n.id === id)
    if (!node) return
    const patch = {
      camera: preset.camera,
      lighting: preset.lighting,
      cameraPreset: preset.cameraPreset,
    }
    // updateNodeData가 Shot config 변경 시 자식 Video stale 전파를 자체 수행 (store §updateNodeData)
    if (isShotData(node.data)) {
      useDirectorCanvasStore.getState().updateNodeData<'shot'>(id, patch)
    } else if (isVideoData(node.data)) {
      useDirectorCanvasStore.getState().applyVideoOverride(id, patch)
    }
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
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 생성 중 — 테두리를 도는 색 빛(#e5). 이미지=초록(success), 영상=빨강(primary). */}
      {beam && (
        <span
          className={cn(
            'tale-beam pointer-events-none absolute inset-0 z-10 rounded-[inherit]',
            beam === 'success' && '[--beam-color:var(--success)]',
          )}
          aria-hidden
        />
      )}

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
              className="hover-red-beam"
            >
              <Edit className="size-3" />
            </Button>
            {canBranch && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleBranch}
                aria-label="Branch"
                className="hover-red-beam"
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
              className="hover-red-beam"
            >
              <Copy className="size-3 opacity-30" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDelete}
              aria-label="Delete"
              className="text-destructive hover-red-beam"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="text-sm font-medium">{prettyNodeLabel(title) || '(untitled)'}</div>
        {children}
      </div>
    </div>
  )
}

export const BaseNode = memo(BaseNodeImpl)
