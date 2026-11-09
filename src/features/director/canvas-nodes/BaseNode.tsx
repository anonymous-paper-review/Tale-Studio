'use client'

import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Copy, Edit, GitBranch, MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { nodeFrameBorder } from '@/features/director/canvas-meta'
import { useT } from '@/lib/i18n'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { editActionForKind } from '@/features/director/canvas-interaction'
import { prettyNodeLabel } from '@/features/director/node-label'


type Theme = 'scene' | 'shot' | 'video'

// 카드 종류 라벨(#ui-cleanup 2026-08-31): 생성 노드 기준 단순 명명 — 오너 피드백
//   "previz가 뭐임?": 파이프라인 내부 용어(previz/shot)를 카드 이름에서 전부 걷어냈다.
//   Shot 카드 = 이미지 생성 노드(Image), Video 카드 = 영상 생성 노드(Video).
//   v3 D1(2026-11-03): 종류마다 다른 테두리 색(초록 · 주황 · 빨강) 대신 회색 점 + 라벨 하나 — 고른 노드만 지금 단계 색.
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
  /** 제목 옆 작은 꼬리표(v3 D1 "Elias [인물]") */
  tag?: ReactNode
  /** 헤더 우측에 추가로 끼울 액션 (예: Video의 ★) */
  headerExtra?: ReactNode
  /** Branch 액션 활성 여부 (Scene/Shot만 true) */
  canBranch?: boolean
  /** 삭제 액션 노출 여부. upstream asset Image처럼 직접 삭제할 수 없는 노드는 false. */
  canDelete?: boolean
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
  tag,
  headerExtra,
  canBranch,
  canDelete = true,
  onBranch,
  stale,
  strongStale,
  beam,
}: BaseNodeProps) {
  const t = useT()
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
        // v3 D1(2026-11-03): 작업 바탕색 판 · 모서리 14 · 그림자 하나 · 안쪽 12. 고른 노드만 지금 단계 색 1.5px 테두리.
        'group relative rounded-[14px] border-[1.5px] bg-node-bg-default p-3 shadow-node transition-[border-color] duration-100',
        nodeFrameBorder({ strongStale, selected }),
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
          없어 제거. 우측=출력(항상 표시), 좌측=입력(parent 엣지의 targetHandle='left' 입구).
          v3 D1: 출력 구멍은 제목 줄 높이(위에서 28)의 10px 원 · 캔버스 바탕색 2px 테두리. */}
      <Handle
        type="source"
        position={Position.Right}
        title="Output"
        className="!z-20 !size-2.5 !rounded-full !border-2 !border-canvas-bg !bg-muted-foreground transition-transform hover:!scale-125"
        style={{ top: 28 }}
        id="right"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-0 !bg-muted-foreground opacity-0 group-hover:opacity-100"
        style={{ top: 28 }}
        id="left"
      />

      {/* 머리 — 점 · 종류 · ···(마우스를 올리거나 Tab 으로 옮겨 가면 편집 · 가지 · 복제 · 지우기).
          단추는 늘 그려 두어 Tab 으로 닿는다(검토 B B3). 가만히 있을 때는 폭 0 · 눌리지 않음 — 영상 노드의 ★ 가 ··· 바로 옆에 있다(검토 C).
          단추는 ★ · ··· 왼쪽에 선다 — 보이게 돼도 ★ · ··· 자리는 그대로라, 터치로 ··· 를 누르면 밑의 지우기가 아니라 노드가 눌린다. */}
      <div className="flex h-4 items-center gap-1.5 text-[11px] font-medium text-subtle-foreground">
        <span className={cn('size-1.5 shrink-0 rounded-full', selected ? 'bg-stage' : 'bg-subtle-foreground')} />
        <span>{t(LABEL_BY_THEME[theme])}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <div className="pointer-events-none flex w-0 items-center gap-0.5 overflow-hidden opacity-0 transition-opacity duration-100 group-hover:pointer-events-auto group-hover:w-auto group-hover:overflow-visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:w-auto group-focus-within:overflow-visible group-focus-within:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleEdit}
              aria-label={t('Edit node')}
            >
              <Edit className="size-3" />
            </Button>
            {canBranch && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleBranch}
                aria-label={t('Make a branch')}
              >
                <GitBranch className="size-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDuplicate}
              aria-label={t('Duplicate node')}
              disabled
            >
              <Copy className="size-3 opacity-30" />
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleDelete}
                aria-label={t('Delete node')}
                className="text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
          {headerExtra}
          <MoreHorizontal className="size-3.5" aria-hidden />
        </div>
      </div>

      {/* 제목 · 꼬리표 */}
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 truncate text-[14px] font-semibold leading-tight text-foreground">{prettyNodeLabel(title) || '(untitled)'}</div>
        {tag}
      </div>
      {children}
    </div>
  )
}

export const BaseNode = memo(BaseNodeImpl)
