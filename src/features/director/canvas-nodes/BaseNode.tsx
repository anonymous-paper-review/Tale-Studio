'use client'

import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Copy, Edit, GitBranch, Maximize2, MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { nodeFrameBorder } from '@/features/director/canvas-meta'
import { useT } from '@/lib/i18n'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { editActionForKind } from '@/features/director/canvas-interaction'
import { prettyNodeLabel } from '@/features/director/node-label'
import { useLocaleStore } from '@/stores/locale-store'


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
  /** 기다리는 카드가 노드를 덮는 동안: 머리 · 제목 줄에 Tab 이 들어가지 않게 inert(검토 A C1). 구멍(핸들)은 그대로 둔다. */
  inert?: boolean
  /** 샷 상태 테두리(시안 R 416:4941, 오너 2026-11-14) — 오래됨 · 골라 둠이 아닐 때만 보인다. */
  stateFrame?: string | null
  /** 상태 고르기에 안 맞는 노드 — 숨기지 않고 흐리게(선 · 자리가 흔들리지 않게). */
  dimmed?: boolean
  /** 고른 샷(시안 D2 · R "몸통 = 고르기, 흰 테두리") — 상태 색보다 앞선다. */
  picked?: boolean
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
  inert = false,
  stateFrame = null,
  dimmed = false,
  picked = false,
}: BaseNodeProps) {
  const t = useT()
  // 남은 원래 id(take_v1 · sh_02_07)를 이름으로 바꿀 때도 화면 언어(오너 2026-11-14 답 7).
  const locale = useLocaleStore((s) => s.locale)
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  const selectNode = useDirectorCanvasStore((s) => s.selectNode)
  const openShotDetail = useDirectorCanvasStore((s) => s.openShotDetail)
  const openDeleteConfirm = useDirectorCanvasStore((s) => s.openDeleteConfirm)

  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const handleEdit = (e: React.MouseEvent) => {
    stop(e)
    // theme별 분기: scene=모달, shot/video=샷 상세(prose openShotDetail — 노드형은 왼쪽 패널, 샷은 이미지 탭 · Take 는 영상 탭,
    //   리드 S4-2 8), 에셋=좌측 상세 패널 선택 (노드 뷰 격리)
    if (editActionForKind(theme) === 'popup') openPopup(id)
    else if (theme === 'shot' || theme === 'video') openShotDetail(id, theme === 'video' ? 'video' : 'image')
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
        picked && !strongStale
          ? 'border-foreground'
          : stateFrame && !strongStale && !selected ? stateFrame : nodeFrameBorder({ strongStale, selected }),
        dimmed && 'opacity-30',
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
      <div className="flex h-4 items-center gap-1.5 text-[11px] font-medium text-subtle-foreground" inert={inert}>
        <span className={cn('size-1.5 shrink-0 rounded-full', selected ? 'bg-stage' : 'bg-subtle-foreground')} />
        <span>{t(LABEL_BY_THEME[theme])}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {/* ⤢ 상세(시안 D1 노드형 "⤢ 상세 ···") — 몸통을 누르면 고르기라, 상세는 이 단추로 연다. */}
          {(theme === 'shot' || theme === 'video') && (
            <button
              type="button"
              onClick={handleEdit}
              onDoubleClick={stop}
              aria-label={t('Open details')}
              className="nodrag inline-flex h-5 items-center gap-1 rounded-[6px] px-1.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Maximize2 className="size-2.5" />
              {t('Details')}
            </button>
          )}
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
      <div className="mt-2 flex min-w-0 items-center gap-1.5" inert={inert}>
        <div className="min-w-0 truncate text-[14px] font-semibold leading-tight text-foreground">{prettyNodeLabel(title, locale) || '(untitled)'}</div>
        {tag}
      </div>
      {children}
    </div>
  )
}

export const BaseNode = memo(BaseNodeImpl)
