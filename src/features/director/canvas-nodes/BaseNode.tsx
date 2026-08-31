'use client'

import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Copy, Edit, GitBranch, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { editActionForKind } from '@/features/director/canvas-interaction'
import { prettyNodeLabel } from '@/features/director/node-label'


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

// 카드 종류 라벨(#ui-cleanup 2026-08-31): 생성 노드 기준 단순 명명 — 오너 피드백
//   "previz가 뭐임?": 파이프라인 내부 용어(previz/shot)를 카드 이름에서 전부 걷어냈다.
//   Shot 카드 = 이미지 생성 노드(Image), Video 카드 = 영상 생성 노드(Video).
const LABEL_BY_THEME: Record<Theme, string> = {
  scene: 'Scene',
  shot: 'Image',
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

  return (
    <div
      className={cn(
        // #producer-tone 2026-08-31: 카드 톤을 Producer 화면과 맞춤 — 둔한 라운드,
        //   과한 링 대신 부드러운 선택 표시.
        'group relative rounded-xl bg-node-bg-default transition-[border-color,box-shadow] duration-100',
        'border',
        palette.border,
        selected
          ? cn('border-2 ring-2', palette.ring)
          : cn('hover:ring-2', palette.hoverRing),
        strongStale && 'border-2 border-destructive',
      )}
      style={width ? { width: `${width}px` } : undefined}
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

      {/* 핸들(#handle-simplify 2026-08-31 오너): 좌→우 흐름만 — top/bottom 입구는 쓰임이
          없어 제거. 우측=출력(항상 표시), 좌측=입력(parent 엣지의 targetHandle='left' 입구). */}
      <Handle
        type="source"
        position={Position.Right}
        title="Output"
        className={cn(
          '!h-3.5 !w-3.5 !rounded-full !border-2 !border-background transition-transform hover:!scale-125',
          palette.dot,
        )}
        id="right"
      />
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!h-2.5 !w-2.5 !border-0 opacity-0 group-hover:opacity-100',
          palette.dot,
        )}
        id="left"
      />

      {/* Header — #producer-tone: uppercase 대신 차분한 라벨. */}
      <div className="flex h-8 items-center justify-between border-b border-border/40 px-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
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
        <div className="text-sm font-semibold">{prettyNodeLabel(title) || '(untitled)'}</div>
        {children}
      </div>
    </div>
  )
}

export const BaseNode = memo(BaseNodeImpl)
