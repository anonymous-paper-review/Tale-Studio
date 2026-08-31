'use client'

// 캔버스 우클릭 메뉴(#context-menu 2026-08-31) — 인터랙션 구분의 한 축.
//   좌클릭 = 선택(RF 기본) · 더블클릭 = 편집 모달 · 우클릭 = 이 메뉴.
// 노드 위: 편집 / 이미지 복사 / 이미지 다운로드 / 삭제.
// 빈 캔버스: Scene / 독립 이미지 노드 / Prompt 노드 생성 (Higgsfield 의 빈 생성 노드 대응).
//   영상 노드는 부모 Shot(프롬프트·설정의 진실) 없이는 생성 계약이 없어 메뉴에 없다 —
//   이미지 노드에서 Branch 로 만든다.

import { useEffect, useRef } from 'react'
import type { XYPosition } from '@xyflow/react'
import {
  Clapperboard,
  Copy,
  Download,
  Edit,
  Film,
  Trash2,
  Type,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import {
  chainParentShotNodeId,
  nodeContextMenuItems,
} from '@/features/director/canvas-interaction'
import {
  copyImageUrlToClipboard,
  downloadImageUrl,
  nodePrimaryImageUrl,
} from '@/features/director/clipboard-image'
import { prettyNodeLabel } from '@/features/director/node-label'
import { useT } from '@/lib/i18n'

export type CanvasMenuState =
  | { type: 'node'; nodeId: string; x: number; y: number }
  | { type: 'pane'; x: number; y: number; flowPosition: XYPosition }

type Props = {
  state: CanvasMenuState | null
  onClose: () => void
}

function MenuButton({
  icon,
  label,
  destructive,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs',
        'transition-colors hover:bg-accent',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export function CanvasContextMenu({ state, onClose }: Props) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  const openDeleteConfirm = useDirectorCanvasStore((s) => s.openDeleteConfirm)
  const addSceneNode = useDirectorCanvasStore((s) => s.addSceneNode)
  const addShotNode = useDirectorCanvasStore((s) => s.addShotNode)
  const addPromptNode = useDirectorCanvasStore((s) => s.addPromptNode)
  const selectNode = useDirectorCanvasStore((s) => s.selectNode)

  // 바깥 클릭·Esc 로 닫기 — mousedown 캡처라 메뉴 안 클릭은 stopPropagation 불필요
  useEffect(() => {
    if (!state) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [state, onClose])

  if (!state) return null

  const menuBody = (() => {
    if (state.type === 'pane') {
      return (
        <>
          <MenuButton
            icon={<Film className="size-3.5 text-chart-3" />}
            label={t('Add Scene')}
            onClick={() => {
              const id = addSceneNode(state.flowPosition)
              if (id) selectNode(id)
              onClose()
            }}
          />
          <MenuButton
            icon={<Clapperboard className="size-3.5 text-chart-4" />}
            label={t('Add image node')}
            onClick={() => {
              // Higgsfield 식 빈 생성 노드 — Scene 없이 독립 생성(부모 엣지 없음).
              const id = addShotNode(null, state.flowPosition)
              if (id) selectNode(id)
              onClose()
            }}
          />
          <MenuButton
            icon={<Type className="size-3.5 text-muted-foreground" />}
            label={t('Add prompt node')}
            onClick={() => {
              const id = addPromptNode(state.flowPosition)
              if (id) selectNode(id)
              onClose()
            }}
          />
        </>
      )
    }

    const nodes = useDirectorCanvasStore.getState().nodes
    const node = nodes.find((n) => n.id === state.nodeId)
    if (!node) return null
    const imageUrl = nodePrimaryImageUrl(nodes, state.nodeId)
    const items = nodeContextMenuItems(node.data.kind, !!imageUrl)
    if (items.length === 0) return null
    const filenameBase =
      prettyNodeLabel(node.data.label).replace(/[^\w가-힣-]+/g, '_') || 'image' // i18n-ok: 파일명 정제용 한글 문자 범위

    return (
      <>
        {items.includes('edit') && (
          <MenuButton
            icon={<Edit className="size-3.5" />}
            label={t('Edit')}
            onClick={() => {
              // 파생 카드는 진실이 부모 Shot 에 있어 부모 모달로 위임(더블클릭과 동일).
              const parentShotId = chainParentShotNodeId(node.data)
              openPopup(parentShotId ?? state.nodeId)
              onClose()
            }}
          />
        )}
        {items.includes('copy-image') && imageUrl && (
          <MenuButton
            icon={<Copy className="size-3.5" />}
            label={t('Copy image')}
            onClick={() => {
              onClose()
              void copyImageUrlToClipboard(imageUrl)
                .then(() => toast.success(t('Image copied to clipboard.')))
                .catch(() => toast.error(t('Failed to copy image.')))
            }}
          />
        )}
        {items.includes('download-image') && imageUrl && (
          <MenuButton
            icon={<Download className="size-3.5" />}
            label={t('Download image')}
            onClick={() => {
              onClose()
              void downloadImageUrl(imageUrl, `${filenameBase}.png`).catch(() =>
                toast.error(t('Failed to download image.')),
              )
            }}
          />
        )}
        {items.includes('delete') && (
          <MenuButton
            icon={<Trash2 className="size-3.5" />}
            label={t('Delete')}
            destructive
            onClick={() => {
              openDeleteConfirm(state.nodeId)
              onClose()
            }}
          />
        )}
      </>
    )
  })()

  if (!menuBody) return null

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-44 rounded-md border border-border bg-popover p-1 shadow-md"
      style={{ left: state.x, top: state.y }}
    >
      {menuBody}
    </div>
  )
}
