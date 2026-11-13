'use client'

import '@xyflow/react/dist/style.css'

import { useCallback, useEffect, useRef, useState, type MouseEvent, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Panel,
  ConnectionMode,
  PanOnScrollMode,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useNodesInitialized,
  useStore,
  useStoreApi,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnConnectStart,
  type OnConnectEnd,
  type ReactFlowState,
} from '@xyflow/react'
import { Loader2,
  Square, ChevronDown, ChevronUp, LayoutGrid, Boxes, Lock, Unlock, Plus, Minus, Maximize2, Play, ImageIcon } from 'lucide-react'

import { toast } from 'sonner'
import { cancelRealBatchResume, runRealBatch } from '@/lib/director/real-batch-client'
import {
  runVideoBatch,
  restoreVideoBatch,
} from '@/lib/director/video-batch-client'
import { videoBatchShotSettings } from '@/lib/director/video-batch-take'
import { DEFAULT_VIDEO_MODEL } from '@/lib/video-models'
import {
  chainMissed,
  chainStep,
  effectivePickedIds,
  imageButtonMode,
  imageWorkBlock,
  imageWorkShotIds,
  makingLabel,
  nextPickAll,
  primaryWorkAction,
  videoWorkBlock,
  videoWorkShotIds,
  workBlockLine,
  workEstimateText,
  workScopeStates,
} from '@/lib/director/toolbar-work'
import { LumiAvatar } from '@/components/lumi/lumi'
import { STAGE_PERSONA } from '@/lib/lumi'
import { describeVideoBatchPlan, planVideoBatch, videoBatchTakeCosts } from '@/lib/director/video-batch-plan'
import { refetchTakeBalance, useTakeBalance } from '@/lib/billing/use-take-balance'
import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'
import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { AltArrowHint } from '@/components/alt-arrow-hint'
import { StageHelpBadge } from '@/components/stage-help-badge'
import { NextStepButton } from '@/components/handoff/next-step-button'
import { TopBarActions } from '@/components/layout/studio-top-bar'
import { useHoldChatClosed } from '@/hooks/use-hold-chat-closed'
import { LumiChatPill } from '@/features/director/lumi-chat-pill'
import { PickAllBar, ShotStatusFilterMenu } from '@/features/director/shot-status'
import { StoryboardZoomPill } from '@/features/director/storyboard-zoom-pill'
import { useDirectorShotStates } from '@/features/director/hooks/use-shot-states'
import { countStatusFilters, dimmedByStatusFilter, directorHasFinishedVideo, matchesStatusFilter } from '@/lib/director/shot-state'
import { HIDDEN_ON_CANVAS, directorCanvasMeta, storyboardCanvasMeta } from '@/features/director/canvas-meta'
import { separateAssetCards } from '@/features/director/asset-column'
import { arrangeOnceCardsRendered, renderedCardSizes } from '@/features/director/canvas-layout'

import { handoffFrom } from '@/lib/handoff-intent'
import { shouldOfferHandoffNudge } from '@/lib/handoff-nudge'

// Editor 핸드오프를 권하는 최소 진행률(#d10 2026-08-27). 1개만 만들어도 권하던 것을 막는다.
//   전부(1.0)를 요구하지 않는 이유: 마지막 한두 샷을 남겨두고 편집을 시작하는 흐름도 정상이다.
const EDITOR_NUDGE_MIN_RATIO = 0.8
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { isVideoData } from '@/types/director'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useGenerationBatches } from '@/lib/generation-queue'
import { withStoryboardBacklog } from '@/lib/generation-batches'
import { getDirectorGaps, ledgerGapLabels, summarizeGaps } from '@/lib/completeness'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { useLocaleStore } from '@/stores/locale-store'
import {
  isShotData,
  SNAP_GRID,
} from '@/types/director'
import { StoryboardGridView } from '@/features/director/canvas-views/StoryboardGridView'
import { useStoryboardZoom } from '@/components/generating-frame'
import { countText } from '@/lib/i18n/count-text'
import { useWriterDirectorSync } from '@/features/director/hooks/use-writer-director-sync'
import { useQueueRehydrate } from '@/features/director/hooks/use-queue-rehydrate'

import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { offerEditorHandoff } from '@/features/director/editor-handoff-nudge'
import { AssetNode } from '@/features/director/canvas-nodes/AssetNode'
import { PromptNode } from '@/features/director/canvas-nodes/PromptNode'
import { CategoryEdge } from '@/features/director/canvas-edges/CategoryEdge'
import {
  CanvasContextMenu,
  type CanvasMenuState,
} from '@/features/director/canvas-popups/CanvasContextMenu'
import {
  copyImageUrlToClipboard,
  nodePrimaryImageUrl,
} from '@/features/director/clipboard-image'
import { RelationModal } from '@/features/director/canvas-popups/RelationModal'
import { DeleteConfirmModal } from '@/features/director/canvas-popups/DeleteConfirmModal'
import { DirectorNodePopup } from '@/features/director/canvas-popups/DirectorNodePopup'
import { DirectorDetailPanel } from '@/features/director/canvas-panels/DirectorDetailPanel'
import {
  doubleClickActionForKind,
  connectRouteForTargetHandle,
} from '@/features/director/canvas-interaction'
import { useT } from '@/lib/i18n'

// #scene-hide/#node-merge(2026-08-31 대공사): scene 노드는 캔버스에서 숨기고(데이터는
// Writer 동기화·스토리보드 뷰가 계속 소비), 파생 shotImage/videoPlaceholder 카드는 제거.
const nodeTypes = {
  shot: ShotNode,
  video: VideoNode,
  asset: AssetNode,
  prompt: PromptNode,
} as const

// ────────────────────────────────────────────────────────────────────────────
// MiniMap 상태창 — 접기/펼치기 토글 + 드래그 이동 + 잠금(위치 고정).
//   ReactFlow 자식이라 MiniMap이 viewport context를 받는다. 위치는 우/하단 offset(px).
//   (#d2 2026-07-18) 옛 "숨기기(X)→별도 재열기 버튼"은 재열기 버튼을 못 찾는 문제가 있어,
//   X 대신 접기 토글로 바꾼다: 접으면 헤더 바만 남고 아주 투명해져(hover 시 또렷) 항상 다시 펼 수 있다.
function MiniMapPanel() {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const [locked, setLocked] = useState(false)
  const [pos, setPos] = useState({ right: 16, bottom: 16 })
  const [size, setSize] = useState({ w: 200, h: 150 })
  const dragRef = useRef<{
    sx: number
    sy: number
    br: number
    bo: number
  } | null>(null)

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (locked) return
    e.stopPropagation()
    dragRef.current = { sx: e.clientX, sy: e.clientY, br: pos.right, bo: pos.bottom }
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      // 우/하단 기준이라 마우스 이동의 반대 방향으로 offset 증가
      setPos({
        right: Math.max(0, d.br - (ev.clientX - d.sx)),
        bottom: Math.max(0, d.bo - (ev.clientY - d.sy)),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dragRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // 크기 조절 — 패널 앵커가 우하단이라 좌상단 코너를 끌면 좌·상으로 커진다.
  const resizeRef = useRef<{
    sx: number
    sy: number
    sw: number
    sh: number
  } | null>(null)

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    resizeRef.current = { sx: e.clientX, sy: e.clientY, sw: size.w, sh: size.h }
    const move = (ev: PointerEvent) => {
      const d = resizeRef.current
      if (!d) return
      setSize({
        w: Math.min(560, Math.max(140, d.sw - (ev.clientX - d.sx))),
        h: Math.min(420, Math.max(100, d.sh - (ev.clientY - d.sy))),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      resizeRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className={cn(
        // v3 D1 미니맵(2026-11-03): 작업 바탕색 판 · 모서리 14 · 그림자 하나.
        'absolute z-10 overflow-hidden rounded-[14px] bg-background shadow-node transition-opacity',
        // 접힘: 헤더 바만 남기고 아주 투명하게(hover 시 또렷해져 다시 펼치기 유도).
        collapsed ? 'opacity-35 hover:opacity-100' : 'opacity-100',
      )}
      style={{ right: pos.right, bottom: pos.bottom }}
    >
      {/* 크기 조절 핸들 — 좌상단 코너(앵커가 우하단). 펼친 상태에서만 노출 */}
      {!collapsed && (
        <div
          onPointerDown={onResizePointerDown}
          title={t('Resize (drag)')}
          className="absolute left-0 top-0 z-30 size-3.5 cursor-nwse-resize rounded-tl-lg transition-colors hover:bg-primary/30"
          style={{ touchAction: 'none' }}
        />
      )}
      <div
        onPointerDown={onHeaderPointerDown}
        className={cn(
          'flex h-8 items-center justify-between gap-2 px-3 text-[11px] font-medium text-subtle-foreground',
          locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        )}
      >
        <span>{t('Minimap')}</span>
        <div className="flex items-center gap-0.5">
          {!collapsed && (
            <button
              type="button"
              onClick={() => setLocked((v) => !v)}
              title={locked ? t('Unlock position') : t('Lock position')}
              className="rounded-md p-1 transition-colors hover:bg-accent hover:text-foreground"
            >
              {locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? t('Expand minimap') : t('Collapse minimap')}
            className="rounded-md p-1 transition-colors hover:bg-accent hover:text-foreground"
          >
            {collapsed ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="px-2 pb-2" style={{ width: size.w, height: size.h }}>
          {/* 노드는 흰 35%, 고른 노드는 지금 단계 색, 보이는 자리는 흰 30% 테두리(D1). 색은 globals.css v3p2-set 토큰. */}
          <MiniMap
            className="!static !m-0 !h-full !w-full !bg-transparent"
            bgColor="transparent"
            nodeColor={(node) => (node.selected ? 'var(--stage)' : 'var(--minimap-node)')}
            nodeBorderRadius={3}
            maskColor="var(--minimap-mask)"
            maskStrokeColor="var(--minimap-viewport)"
            maskStrokeWidth={1}
            pannable
            zoomable
          />
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 확대 · 축소 알약(v3 D1 "− 100% + ⤢", 2026-11-03) — xyflow 기본 세로 단추 묶음을 대신한다.
//   기본 묶음에 있던 편집 잠금(노드 끌기 · 잇기 · 고르기 끄기)도 그대로 둔다(시안에는 없다).
const zoomPillSelector = (s: ReactFlowState) => ({
  zoom: s.transform[2],
  minReached: s.transform[2] <= s.minZoom,
  maxReached: s.transform[2] >= s.maxZoom,
  interactive: s.nodesDraggable || s.nodesConnectable || s.elementsSelectable,
})

function CanvasZoomPill() {
  const t = useT()
  const store = useStoreApi()
  const { zoom, minReached, maxReached, interactive } = useStore(zoomPillSelector, (a, b) =>
    a.zoom === b.zoom && a.minReached === b.minReached && a.maxReached === b.maxReached && a.interactive === b.interactive,
  )
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const button =
    'flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground disabled:pointer-events-none disabled:opacity-40'
  return (
    <Panel position="bottom-left" className="!m-4">
      <div className="flex h-[37px] items-center gap-0.5 rounded-full bg-background px-1.5 shadow-node" role="group" aria-label={t('Canvas zoom')}>
        <button type="button" className={button} onClick={() => void zoomOut()} disabled={minReached} title={t('Zoom out canvas')} aria-label={t('Zoom out canvas')}>
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-11 text-center font-num text-meta font-medium tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <button type="button" className={button} onClick={() => void zoomIn()} disabled={maxReached} title={t('Zoom in canvas')} aria-label={t('Zoom in canvas')}>
          <Plus className="size-3.5" />
        </button>
        <button type="button" className={button} onClick={() => void fitView()} title={t('Fit the canvas to the screen')} aria-label={t('Fit the canvas to the screen')}>
          <Maximize2 className="size-3.5" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => store.setState({ nodesDraggable: !interactive, nodesConnectable: !interactive, elementsSelectable: !interactive })}
          title={interactive ? t('Lock canvas editing') : t('Unlock canvas editing')}
          aria-label={interactive ? t('Lock canvas editing') : t('Unlock canvas editing')}
          aria-pressed={!interactive}
        >
          {interactive ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
        </button>
      </div>
    </Panel>
  )
}

// 상태를 골랐는데 그 상태 샷이 하나도 없으면 캔버스 위에 한 줄(시안 없음, 리드 검토 c ④c) — 노드형은 다른 상태를 흐리게만 둬서
//   모두 흐린 캔버스만 보이면 고장으로 보인다.
function NodeStatusEmptyNote() {
  const t = useT()
  const statusFilter = useDirectorCanvasStore((s) => s.statusFilter)
  const shotStates = useDirectorShotStates()
  if (statusFilter === 'all' || shotStates.size === 0) return null
  if ([...shotStates.values()].some((state) => matchesStatusFilter(state, statusFilter))) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
      <span className="rounded-full bg-background px-3.5 py-1.5 text-label text-muted-foreground shadow-node">
        {t('No shots in this status')}
      </span>
    </div>
  )
}

const edgeTypes = {
  parent: CategoryEdge,
  'relates-to': CategoryEdge,
  references: CategoryEdge,
  prompt: CategoryEdge,
  image: CategoryEdge,
  frame: CategoryEdge,
  'video-chain': CategoryEdge,
  // 파생 previz 체인 — 등록 누락 시 React Flow가 fallback 경고를 렌더마다 찍는다(#011).
  chain: CategoryEdge,
} as const

// ────────────────────────────────────────────────────────────────────────────

function CanvasInner() {
  const t = useT()
  // 몸통 = 고르기 — 상태 고르기로 흐려진 노드는 고르지 않는다(아래 onNodeClick).
  const shotStates = useDirectorShotStates()
  const statusFilter = useDirectorCanvasStore((s) => s.statusFilter)
  // 채울 것 넛지의 목록 줄도 감싸는 문장(t)과 같은 화면 언어로 — 스토어 값(문자열)이라 memo deps 에 넣어도 안정적이다.
  const locale = useLocaleStore((s) => s.locale)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const edges = useDirectorCanvasStore((s) => s.edges)
  const deleteNode = useDirectorCanvasStore((s) => s.deleteNode)
  const deleteEdge = useDirectorCanvasStore((s) => s.deleteEdge)
  const setViewport = useDirectorCanvasStore((s) => s.setViewport)
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  const openRelationModal = useDirectorCanvasStore((s) => s.openRelationModal)
  const wirePromptToShot = useDirectorCanvasStore((s) => s.wirePromptToShot)
  const wireImageToShot = useDirectorCanvasStore((s) => s.wireImageToShot)
  const wireFrameToVideo = useDirectorCanvasStore((s) => s.wireFrameToVideo)
  const wireVideoChainToVideo = useDirectorCanvasStore(
    (s) => s.wireVideoChainToVideo,
  )
  const addVideoTake = useDirectorCanvasStore((s) => s.addVideoTake)
  const selectNode = useDirectorCanvasStore((s) => s.selectNode)
  const togglePickedShot = useDirectorCanvasStore((s) => s.togglePickedShot)
  const selectEdge = useDirectorCanvasStore((s) => s.selectEdge)
  const persistNodePosition = useDirectorCanvasStore(
    (s) => s.persistNodePosition,
  )
  const commitHistory = useDirectorCanvasStore((s) => s.commitHistory)
  const undo = useDirectorCanvasStore((s) => s.undo)
  const redo = useDirectorCanvasStore((s) => s.redo)
  const directorProjectId = useDirectorCanvasStore((s) => s.projectId)
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)

  // 키보드 — Ctrl/Cmd+Z=undo, Ctrl/Cmd+Y·Shift+Z=redo, Del/Backspace=선택 노드 삭제 확인(#e3).
  //   입력 필드(input/textarea/contentEditable)에서는 브라우저 기본 편집을 우선해 무시.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      // 삭제: Del/Backspace → 선택 노드가 있으면 확인 모달(버튼 삭제와 동일 경로). RF 내장
      //   deleteKeyCode 는 비활성화(null)라 여기서만 삭제가 시작된다 → 항상 확인을 거친다.
      //   선택 기준은 RF 선택(node.selected) — 캔버스 클릭 선택이 여기 반영된다(store.selectedNodeId는
      //   상세 패널용 별개 상태라 캔버스 클릭으로는 안 채워진다).
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const st = useDirectorCanvasStore.getState()
        if (st.deleteConfirmInfo) return
        const target = st.nodes.find((n) => n.selected) ?? null
        if (target) {
          e.preventDefault()
          st.openDeleteConfirm(target.id)
          return
        }
        // 약속 F1·F4(2026-09-04): 고른 선은 확인창 없이 지운다(Ctrl+Z 로 되돌림). 선 위의 X 와 같은 경로.
        const selectedEdgeIds = st.edges.filter((edge) => edge.selected).map((edge) => edge.id)
        const edgeIds = selectedEdgeIds.length ? selectedEdgeIds : st.selectedEdgeId ? [st.selectedEdgeId] : []
        if (edgeIds.length) {
          e.preventDefault()
          for (const edgeId of edgeIds) st.deleteEdge(edgeId)
        }
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      } else if (k === 'c') {
        // Cmd/Ctrl+C = 선택 노드의 대표 이미지 복사(#node-copy-image).
        //   페이지 텍스트를 드래그해 복사하는 중이면 브라우저 기본 동작이 우선.
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed) return
        const st = useDirectorCanvasStore.getState()
        const target = st.nodes.find((n) => n.selected)
        if (!target) return
        const url = nodePrimaryImageUrl(st.nodes, target.id)
        if (!url) return
        e.preventDefault()
        void copyImageUrlToClipboard(url)
          .then(() => toast.success(t('Image copied to clipboard.')))
          .catch(() => toast.error(t('Failed to copy image.')))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, t])

  // 누락 감지 넛지 (chat-proactive-copilot Phase 4): 캔버스가 안정되면(2s) 채워두면 좋을
  //   항목(샷의 캐릭터·배경 참조 누락 / 스토리보드 미생성)을 1회 informational 제안. 생성 트리거 X.
  const gapNudgeRef = useRef<string | null>(null)
  // gaps/content 는 렌더 본문에서 미리 계산 — effect 안에서 t() 를 직접 부르면 t 가 매 렌더
  //   새 참조라 deps 에 넣을 때 2000ms 디바운스가 렌더마다 리셋된다(#i18n-s5-batch4).
  //   목록 줄(@/lib/completeness)도 감싸는 문장과 같은 화면 언어로 쓴다(2026-11-10 오너 "영어 언어에서 한국어 나오는거 수정").
  // #ref-gate: 시트 없는 인물까지 잡으려면 에셋 store 의 이미지 유무가 필요하다(순수 함수엔 조회자로 넘긴다).
  const assetCharacters = useAssetStorageStore((st) => st.characters)
  // #ledger: 상태 변화(누움→섬 등)를 보여주는 샷이 없는 항목 — 무대 장부(scenes.stage.ledger)에서.
  const sceneLedgers = useDirectorCanvasStore((st) => st.sceneLedgers)
  const gapAssets = useMemo(
    () => ({
      hasCharacterImage: (id: string) => {
        const c = assetCharacters[id]
        return !!c && ((c.referenceImages?.length ?? 0) > 0 || (c.views?.single?.length ?? 0) > 0)
      },
      characterName: (id: string) => assetCharacters[id]?.name ?? id,
      ledgerGaps: ledgerGapLabels(sceneLedgers, (id) => assetCharacters[id]?.name ?? id, locale),
    }),
    [assetCharacters, sceneLedgers, locale],
  )
  const gaps = getDirectorGaps(nodes, gapAssets, locale)
  const gapNudgeContent =
    gaps.length > 0
      ? t('There are {count} things worth filling in:\n{summary}', {
          count: gaps.length,
          summary: summarizeGaps(gaps, 3, locale),
        })
      : null
  useEffect(() => {
    if (!directorProjectId || nodes.length === 0) return
    if (gapNudgeRef.current === directorProjectId) return
    if (!gapNudgeContent) return
    const timer = setTimeout(() => {
      gapNudgeRef.current = directorProjectId
      offerSuggestion({
        id: `director-gaps-${directorProjectId}`,
        stage: 'director',
        content: gapNudgeContent,
        action: null,
      })
    }, 2000)
    return () => clearTimeout(timer)
  }, [directorProjectId, nodes, offerSuggestion, gapNudgeContent])

  // Editor 핸드오프(#handoff-to-chat 2026-07-31) — 탭 하단 'Head to Editor' 버튼을 걷어내고
  //   채팅 제안으로 옮겼다. 옛 버튼은 게이트 없이 항상 활성이었으므로 여기서도 막지 않는다.
  //   다만 *버튼*은 편집할 영상이 하나라도 생겼을 때만 띄운다 — 빈 캔버스에서 권하면 의미가 없다.
  //   (채팅에 직접 "Editor로 넘겨줘"라고 쓰면 이 조건과 무관하게 언제든 넘어간다.)
  const editorNudgeRef = useRef<string | null>(null)
  // #d10 (2026-08-27 오너): "다 안 했는데 Editor로 넘어가라고 함". 예전엔 영상이 하나만 있어도
  //   "영상이 완성됐다"며 권했다 — 샷 14개 중 1개를 만든 사람에게도 떴다는 뜻이다.
  //   샷 대비 영상 진행률로 판정한다. 전부는 아니어도 대다수가 끝났을 때만 권한다.
  const shotsWithVideo = new Set(
    nodes
      .filter((n) => isVideoData(n.data) && !!n.data.videoUrl)
      .map((n) => (isVideoData(n.data) ? n.data.parentShotNodeId : null))
      .filter((v): v is string => !!v),
  )
  const shotCountForNudge = nodes.filter((n) => isShotData(n.data)).length
  const videoReadyRatio = shotCountForNudge > 0 ? shotsWithVideo.size / shotCountForNudge : 0
  const hasRenderedVideo = shotCountForNudge > 0 && videoReadyRatio >= EDITOR_NUDGE_MIN_RATIO
  // 이미 수락된 핸드오프는 다시 권하지 않는다(#handoff-once) — 진실은 DB 의 reachedStage.
  const reachedStageForNudge = useProjectStore((s) => s.reachedStage)
  useEffect(() => {
    if (!directorProjectId || !hasRenderedVideo) return
    if (!shouldOfferHandoffNudge('director', reachedStageForNudge)) return
    if (editorNudgeRef.current === directorProjectId) return
    editorNudgeRef.current = directorProjectId
    const spec = handoffFrom('director')
    if (!spec) return
    // 첫 진입 안내가 제안 자리를 잡고 있어도 단추가 뜨게(2026-11-09): editor-handoff-nudge.ts.
    offerEditorHandoff(directorProjectId, {
      id: `handoff:director:${directorProjectId}`,
      stage: 'director',
      content: t('{done} of {total} shots have video. Shall we move to Editor and start assembling?', {
        done: shotsWithVideo.size,
        total: shotCountForNudge,
      }),
      action: { kind: 'handoff', utterance: t(spec.utterance), label: t(spec.label) },
    })
  }, [directorProjectId, hasRenderedVideo, shotsWithVideo.size, shotCountForNudge, reachedStageForNudge, t])

  const {
    screenToFlowPosition,
    setViewport: applyViewport,
    getViewport,
    fitView,
  } = useReactFlow()
  const nodesInitialized = useNodesInitialized()

  // [자동 정렬](검토 C 3번, 2026-11-10): 누른 동안만 화면 밖 카드까지 그려 지금 크기를 재고, 다 그려지면 정렬한다.
  //   정렬이 기다림 표시를 끄면 다시 보이는 카드만 그린다(아래 onlyRenderVisibleElements).
  const arrangePending = useDirectorCanvasStore((s) => s.arrangePending)
  useEffect(() => {
    if (!arrangePending) return
    return arrangeOnceCardsRendered({
      cardIds: () => useDirectorCanvasStore.getState().nodes.filter((n) => !HIDDEN_ON_CANVAS.has(n.data.kind)).map((n) => n.id),
      renderedIds: renderedCardSizes,
      arrange: () => useDirectorCanvasStore.getState().relayoutCanvas(),
    })
  }, [arrangePending])

  // Node 뷰 재진입 시 마지막 뷰포트 복원 (#e 2026-07-14).
  //   CanvasInner는 Node↔Storyboard 토글·스테이지 이동마다 remount된다. 예전엔 매 mount마다
  //   fitView가 돌아 위치가 초기화됐다. 이제 최초 진입(viewportInitialized=false)만 fitView하고,
  //   이후엔 store에 유지된 viewport(onMove로 갱신, 싱글턴+persist)를 복원한다.
  //   fitView 타이밍은 useNodesInitialized로 노드 측정 완료를 기다린다.
  const initialViewportRef = useRef(
    useDirectorCanvasStore.getState().viewport,
  )
  const didInitViewportRef = useRef(false)
  useEffect(() => {
    if (didInitViewportRef.current || !nodesInitialized) return
    didInitViewportRef.current = true
    const st = useDirectorCanvasStore.getState()
    if (st.viewportInitialized) {
      void applyViewport(st.viewport)
      return
    }
    // 최초 진입(#e9→#scene-hide): 전체 fitView 후 가장 왼쪽 이미지 노드로 수평 팬 애니메이션.
    //   (씬 노드는 캔버스에서 숨겨져 기준이 될 수 없다 — 2026-08-31 대공사.)
    void (async () => {
      await fitView()
      const shots = useDirectorCanvasStore
        .getState()
        .nodes.filter((n) => n.data.kind === 'shot')
      if (shots.length === 0) {
        useDirectorCanvasStore.setState({
          viewport: getViewport(),
          viewportInitialized: true,
        })
        return
      }
      const first = shots.reduce((a, b) =>
        a.position.x <= b.position.x ? a : b,
      )
      const pane = document.querySelector('.react-flow')
      const w = pane?.clientWidth ?? 1200
      const h = pane?.clientHeight ?? 800
      const zoom = 0.75
      const target = {
        x: w / 2 - (first.position.x + 130) * zoom,
        y: h / 3 - (first.position.y + 60) * zoom,
        zoom,
      }
      await applyViewport(target, { duration: 900 })
      useDirectorCanvasStore.setState({
        viewport: target,
        viewportInitialized: true,
      })
    })()
  }, [nodesInitialized, applyViewport, getViewport, fitView])

  // 우클릭 메뉴(#context-menu 2026-08-31) — 좌클릭=선택 · 더블클릭=편집과 구분되는 세 번째 축.
  const [contextMenu, setContextMenu] = useState<CanvasMenuState | null>(null)

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(
        changes.filter((change) => change.type !== 'remove'),
        nodes,
      )
      useDirectorCanvasStore.setState({ nodes: next as typeof nodes })
      changes.forEach((c) => {
        if (c.type === 'remove') {
          void deleteNode(c.id).catch((error) => {
            console.error('[director/delete-node]', error)
          })
        }
        // Step 2: drag end 시점에만 canvas_position을 DB로 write-back (매 프레임 X)
        else if (c.type === 'position' && c.dragging === false) {
          persistNodePosition(c.id)
        }
      })
    },
    [nodes, deleteNode, persistNodePosition],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Let the store observe removed frame/image edges before React Flow applies
      // the edge list change so it can clear the corresponding source ID.
      const removals = changes.filter((change) => change.type === 'remove')
      removals.forEach((change) => deleteEdge(change.id))
      const currentEdges = useDirectorCanvasStore.getState().edges
      const nonRemovalChanges = changes.filter((change) => change.type !== 'remove')
      const next = applyEdgeChanges(nonRemovalChanges, currentEdges)
      useDirectorCanvasStore.setState({ edges: next as typeof edges })
    },
    [deleteEdge],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      if (params.targetHandle === 'video-chain') {
        void wireVideoChainToVideo(
          params.source,
          params.target,
          params.targetHandle,
        ).then((connected) => {
          if (!connected) toast.error(t('Video chain connection failed.'))
        }).catch(() => {
          toast.error(t('Video chain connection failed.'))
        })
        return
      }
      const route = connectRouteForTargetHandle(params.targetHandle)
      // Prompt 노드 출력(right) → Shot T 입력(prompt) 연결이면 와이어링 + prompt 동기
      if (route === 'prompt-wire') {
        wirePromptToShot(params.source, params.target)
        return
      }
      if (route === 'image-wire') {
        if (params.targetHandle === 'image-reference') {
          wireImageToShot(params.source, params.target, params.targetHandle)
        }
        return
      }
      if (route === 'frame-wire') {
        const targetHandle = params.targetHandle
        if (
          targetHandle === 'frame-start' ||
          targetHandle === 'frame-end' ||
          targetHandle === 'frame-ref'
        ) {
          wireFrameToVideo(params.source, params.target, targetHandle)
        }
        return
      }
      openRelationModal(
        params.source,
        params.target,
        params.sourceHandle,
        params.targetHandle,
      )
    },
    [
      openRelationModal,
      wirePromptToShot,
      wireImageToShot,
      wireFrameToVideo,
      wireVideoChainToVideo,
      t,
    ],
  )

  const dragFromRef = useRef<string | null>(null)
  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    dragFromRef.current = params.nodeId ?? null
  }, [])

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const sourceId = dragFromRef.current
      dragFromRef.current = null
      if (!sourceId) return

      const target = event.target as HTMLElement | null
      const isHandleOrNode =
        target?.closest('.react-flow__handle') ||
        target?.closest('.react-flow__node')
      if (isHandleOrNode) return

      // 빈 공간 drop → 부모 종류에 따라 자동 자식 생성
      const native = event as unknown as { clientX?: number; clientY?: number }
      const position = screenToFlowPosition({
        x: native.clientX ?? 0,
        y: native.clientY ?? 0,
      })

      const sourceNode = useDirectorCanvasStore
        .getState()
        .nodes.find((n) => n.id === sourceId)
      if (!sourceNode) return

      if (isShotData(sourceNode.data)) {
        const newId = addVideoTake(sourceId, position)
        if (newId) selectNode(newId)
      }
      // Video는 자식 없음 — 빈 공간 drop은 무시
    },
    [screenToFlowPosition, addVideoTake, selectNode],
  )

  // 빈 캔버스 더블클릭 = 이미지 노드 생성(#scene-hide 2026-08-31) — 옛 Scene/Shot 선택 모달은
  //   씬 노드 제거와 함께 폐기. 생성 종류는 우클릭 메뉴가 담당한다.
  const onPaneDoubleClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const isPane =
        target?.classList.contains('react-flow__pane') ||
        target?.classList.contains('react-flow__background') ||
        target?.closest('.react-flow__pane') !== null
      const isInsideNode = target?.closest('.react-flow__node') !== null
      if (!isPane || isInsideNode) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const newId = useDirectorCanvasStore.getState().addShotNode(null, position)
      if (newId) selectNode(newId)
    },
    [screenToFlowPosition, selectNode],
  )

  // #scene-hide: 씬 노드와 씬 관련 엣지는 캔버스에 안 그린다 (데이터는 유지 —
  //   Writer 동기화·스토리보드 뷰·챗 명령이 계속 쓴다). 구 persist의 파생 카드 쟔재도 함께 거른다.
  const hiddenNodeIds = new Set(
    nodes.filter((n) => HIDDEN_ON_CANVAS.has(n.data.kind)).map((n) => n.id),
  )
  // 오너 QA 2026-11-03 3번: 인물 · 배경 카드가 위아래로 겹치면 그릴 때만 아래로 내린다(저장된 자리는 그대로).
  const visibleNodes = useMemo(
    () => separateAssetCards(nodes.filter((n) => !HIDDEN_ON_CANVAS.has(n.data.kind))),
    [nodes],
  )
  const visibleEdges = edges.filter(
    (e) => !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target),
  )

  return (
    // B-D1 fix: wrapper div에 onDoubleClick 등록해 ReactFlow 내부 처리와 독립적으로 캐처
    <div
      className="relative h-full w-full"
      onDoubleClick={onPaneDoubleClick}
    >
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={() => {
          selectNode(null)
          selectEdge(null)
          setContextMenu(null)
        }}
        // 우클릭(#context-menu): 노드=편집/복사/삭제 메뉴, 빈 캔버스=노드 생성 메뉴.
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          setContextMenu({
            type: 'node',
            nodeId: node.id,
            x: event.clientX,
            y: event.clientY,
          })
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          const native = event as unknown as { clientX: number; clientY: number }
          setContextMenu({
            type: 'pane',
            x: native.clientX,
            y: native.clientY,
            flowPosition: screenToFlowPosition({
              x: native.clientX,
              y: native.clientY,
            }),
          })
        }}
        // 클릭=선택+좌측 패널(#panel-unify 2026-08-31) — 패널은 캔버스 조작을 안 막는다.
        // 몸통 = 고르기(시안 D2 · R, 오너 2026-11-14) — 이미지 · 영상 노드는 그 샷을 고르고 다시 누르면 푼다. 상세는 ⤢.
        //   에셋 노드는 지금처럼 왼쪽 패널.
        onNodeClick={(_event, node) => {
          const data = node.data
          if (isShotData(data) || isVideoData(data)) {
            const shotId = isShotData(data) ? node.id : data.parentShotNodeId
            if (!shotId) return
            // 상태 고르기로 흐려진 노드는 고르지 않는다 — 골라도 단추가 세지 않는다(리드 검토 a 낮음 5b).
            if (dimmedByStatusFilter(shotStates.get(shotId), statusFilter)) return
            togglePickedShot(shotId)
            return
          }
          if (data.kind === 'asset') selectNode(node.id)
        }}
        onEdgeClick={(_event, edge) => selectEdge(edge.id)}
        onNodeDoubleClick={(_event, node) => {
          const action = doubleClickActionForKind(node.data.kind)
          if (action === 'popup') {
            openPopup(node.id)
            return
          }
          if (action === 'select') selectNode(node.id)
        }}
        onNodeDragStart={() => commitHistory()}
        onMove={(_, vp) => setViewport(vp)}
        snapToGrid
        snapGrid={SNAP_GRID}
        // 더 넓게 축소 가능하게(#e2 2026-07-15) — RF 기본 minZoom 0.5는 넓은 그래프에서
        //   fitView가 잘리는 원인이기도 했다.
        minZoom={0.1}
        connectionMode={ConnectionMode.Loose}
        // 내장 삭제 비활성화(#e3) — Del/Backspace 는 위 keydown 핸들러가 확인 모달로 라우팅한다.
        deleteKeyCode={null}
        // fitView/복원은 위 useEffect가 useNodesInitialized 타이밍에 제어(#e). defaultViewport로
        //   remount 시 첫 페인트를 마지막 위치에서 시작해 깜빡임을 줄인다.
        defaultViewport={initialViewportRef.current}
        zoomOnDoubleClick={false}
        // 스크롤 = 상하/좌우 화면 이동(패닝), Ctrl+스크롤 = 확대/축소.
        //   panOnScroll 모드에서 xyflow는 ctrl/meta 누른 스크롤을 줌으로 처리한다.
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        zoomActivationKeyCode="Control"
        proOptions={{ hideAttribution: true }}
        // 큰 그래프(완성 프로젝트)에서 오프스크린 노드까지 전부 마운트하면 풀해상도
        //   스토리보드 <img> 수십 장이 한 번에 렌더돼 초기 진입이 느리다 → 보이는 노드만 렌더.
        //   [자동 정렬]을 기다리는 동안만 전부 그려 크기를 잰다(검토 C 3번).
        onlyRenderVisibleElements={!arrangePending}
        // v3 D1(2026-11-03): 캔버스는 노드보다 한 단 어두운 바탕(--canvas-bg) 위 옅은 점.
        className="bg-canvas-bg"
      >
        <Background gap={20} size={1.2} color="var(--canvas-dot)" className="opacity-10" />
        <CanvasZoomPill />
        <MiniMapPanel />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center text-label text-muted-foreground">
            {t('Scenes come in automatically once you create them in Writer.')}
            <div className="mt-1 text-meta text-subtle-foreground">
              {t('Or double-click the canvas to create a Scene directly.')}
            </div>
          </div>
        </div>
      )}

      <NodeStatusEmptyNote />

      <CanvasContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
      />
      <RelationModal />
      <DeleteConfirmModal />
      <DirectorNodePopup />
      <DirectorDetailPanel />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────

// v3 D1 툴바 알약(2026-11-03) — 작업 바탕색 · 끝까지 둥근 모서리 · 그림자 하나 · 13px.
const TOOLBAR_PILL =
  'flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-background px-3.5 text-[13px] font-medium text-foreground shadow-node transition-colors duration-100 hover:bg-card'

// Alt+←/→ 순환 뷰 시퀀스(#keyboard-only 2026-08-11) — Node → Storyboard(Previz) → Storyboard(Real).
const DIRECTOR_VIEW_CYCLE = ['node', 'previz', 'real'] as const
type DirectorViewStep = (typeof DIRECTOR_VIEW_CYCLE)[number]

function PaletteBar() {
  const t = useT()
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)
  const setViewMode = useDirectorCanvasStore((s) => s.setViewMode)
  const storyboardMediaMode = useDirectorCanvasStore((s) => s.storyboardMediaMode)
  const setStoryboardMediaMode = useDirectorCanvasStore((s) => s.setStoryboardMediaMode)
  // 두 상태(viewMode, mediaMode)를 하나의 걸음으로 합쳐 순환한다.
  const viewStep: DirectorViewStep =
    viewMode === 'node' ? 'node' : storyboardMediaMode === 'real' ? 'real' : 'previz'
  useAltArrowCycle(DIRECTOR_VIEW_CYCLE, viewStep, (next) => {
    if (next === 'node') {
      setViewMode('node')
      return
    }
    setViewMode('storyboard')
    setStoryboardMediaMode(next)
  })
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  // #real-grid: 일괄 생성은 4샷 시트 러너(runRealBatch)로 통합 — 진행 플래그는 스토어 공유.
  const realBatchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)
  const videoBatchBusy = useDirectorCanvasStore((s) => s.videoBatchBusy)
  const videoBatchCancelled = useDirectorCanvasStore((s) => s.videoBatchCancelled)
  const realBatchCancelled = useDirectorCanvasStore((s) => s.realBatchCancelled)
  const videoBatchProgress = useDirectorCanvasStore((s) => s.videoBatchProgress)
  // 약속 D7(2026-09-04): 진행 숫자는 핀과 같은 서버 배치에서 온다 — 배치가 도는 동안은 그 done/total.
  const projectId = useProjectStore((s) => s.projectId)
  const generationBatches = useGenerationBatches(projectId ?? null)
  const realBatchRemaining = useDirectorCanvasStore((s) => s.realBatchRemaining)
  const storyboardBatch = withStoryboardBacklog(generationBatches, realBatchRemaining ?? 0).find((b) => b.lane === 'director-storyboard') ?? null
  const videoBatch = generationBatches.find((b) => b.lane === 'director-video') ?? null
  const requestArrange = useDirectorCanvasStore((s) => s.requestArrange)
  const showUnusedAssets = useDirectorCanvasStore((s) => s.showUnusedAssets)
  const toggleUnusedAssets = useDirectorCanvasStore((s) => s.toggleUnusedAssets)
  const addPromptNode = useDirectorCanvasStore((s) => s.addPromptNode)
  const promptCount = nodes.filter((n) => n.data.kind === 'prompt').length

  // 샷 상태 · 남은 일(시안 R 416:4941 · D1, 오너 2026-11-14) — 단추 숫자 · 가장 밝은 단추 · 예상 칸이 같은 판정을 쓴다.
  const shotStates = useDirectorShotStates()
  const statusCounts = countStatusFilters(shotStates.values())
  const statusFilter = useDirectorCanvasStore((s) => s.statusFilter)
  const setStatusFilter = useDirectorCanvasStore((s) => s.setStatusFilter)
  // 고른 샷(시안 D2 406:4588) — 상태 고르기로 보이는 샷 안의 고름만 센다. 고른 샷이 있으면 단추 · 예상이 그 샷 기준.
  const pickedShotIds = useDirectorCanvasStore((s) => s.pickedShotIds)
  const setPickedShots = useDirectorCanvasStore((s) => s.setPickedShots)
  const clearPickedShots = useDirectorCanvasStore((s) => s.clearPickedShots)
  const visibleShotIds = [...shotStates.entries()].filter(([, state]) => matchesStatusFilter(state, statusFilter)).map(([id]) => id)
  const picked = effectivePickedIds(pickedShotIds, visibleShotIds)
  // 상태를 골랐으면 단추 · 예상도 보이는 샷만 센다(리드 11/14 답 1).
  const workStates = workScopeStates(shotStates, statusFilter)
  // [이미지 만들기 · N]: 이미지 없는 샷. 고른 샷이 모두 이미지가 있으면 [이미지 다시 만들기 · N](8/27 오너 "전체 재생성" 길).
  const imageMode = imageButtonMode(workStates, picked)
  const imageWork = imageMode.mode === 'make' ? imageMode.shotIds : []
  const videoWork = videoWorkShotIds(workStates, picked)
  const stateList = [...shotStates.values()]
  const makingImages = stateList.filter((s) => s === 'image_generating').length
  const makingVideos = stateList.filter((s) => s === 'video_generating').length
  const making = makingImages + makingVideos > 0 || realBatchBusy || videoBatchBusy
  // [다음: Editor로] · 사이드바 Editor · 채팅 넘김은 같은 조건 — 완성 영상이 하나라도 있으면 켜진다(시안 R, 결정 페이지 추천, 리드 검토 a 낮음 7).
  const canHandOff = directorHasFinishedVideo(nodes)
  // 꺼진 단추와 까닭(결정 페이지 "꺼진 단추 아래 이유 한 줄", 리드 검토 a 보통 1 · 낮음 4) — 일괄이 도는 동안은 눌러도 새 판이 서지 않으니 끈다.
  const imageBlock = imageWorkBlock(workStates, picked, realBatchBusy, statusFilter !== 'all')
  const videoBlock = videoWorkBlock(workStates, picked, videoBatchBusy, statusFilter !== 'all')
  const blockLine = workBlockLine(imageBlock, videoBlock, t)
  // 넘기기 크림은 보드 전체에 만들 것이 없을 때만 — 상태 고르기 · 고른 샷으로 좁혀 보일 때 크림이 넘기기로 튀지 않게.
  const boardWorkLeft = imageWorkShotIds(shotStates, null).length + videoWorkShotIds(shotStates, null).length
  const primary = primaryWorkAction({
    imageCount: imageBlock === null ? imageWork.length : 0,
    videoCount: videoBlock === null ? videoWork.length : 0,
    // 만드는 중에는 넘기기를 크림으로 칠하지 않는다 — 지금 할 일은 기다림이다(단추는 켜진 채 보조).
    canHandOff: canHandOff && !making && boardWorkLeft === 0,
  })
  // 약속 E1·E2(2026-09-04): 확인창에 만들 영상 수·필요한 Take·가진 Take — 채팅 승인 카드와 같은 계산(video-batch-plan).
  //   오너 답 11: Take 는 지금 계산 그대로(모델 · 해상도마다, 1080p 두 배) 예상 칸 · 확인창에.
  const takeState = useTakeBalance()
  const videoPlan = planVideoBatch(videoBatchTakeCosts(nodes, videoWork), takeState.balance, takeState.mode)
  const modelOf = (id: string) => videoBatchShotSettings(nodes, id)?.model ?? DEFAULT_VIDEO_MODEL
  const videoModels = videoWork.map(modelOf)
  // "영상까지 이어서"(시안 D4 · R, 오너 답 6): 켜면 이미지 단추가 "이미지+영상 만들기", 이미지를 만든 샷은 이 화면이 영상을 이어 보낸다.
  const chainVideoAfterImage = useDirectorCanvasStore((s) => s.chainVideoAfterImage)
  const setChainVideoAfterImage = useDirectorCanvasStore((s) => s.setChainVideoAfterImage)
  const chainWaitingShotIds = useDirectorCanvasStore((s) => s.chainWaitingShotIds)
  const setChainWaitingShots = useDirectorCanvasStore((s) => s.setChainWaitingShots)
  const chainOn = chainVideoAfterImage && imageMode.mode === 'make' && imageWork.length > 0
  const chainPlan = planVideoBatch(videoBatchTakeCosts(nodes, chainOn ? imageWork : []), takeState.balance, takeState.mode)
  const estimate = workEstimateText({
    images: primary === 'image' ? imageWork.length : primary !== 'video' && imageMode.mode === 'remake' ? imageMode.shotIds.length : 0,
    videoModels: primary === 'video' ? videoModels : primary === 'image' && chainOn ? imageWork.map(modelOf) : [],
    videoTakes: primary === 'image' && chainOn ? chainPlan.requiredTakes : videoPlan.requiredTakes,
    takesShown: takeState.mode !== 'off',
    making,
    chain: primary === 'image' && chainOn,
  }, t)
  const [confirmVideoBatch, setConfirmVideoBatch] = useState(false)
  const [confirmRemake, setConfirmRemake] = useState(false)
  const [confirmChain, setConfirmChain] = useState(false)
  // D1 "The Set" 노드 9 · 샷 4"(노드형) · "씬 2 · 샷 4 · 12초"(스토리보드형).
  const canvasMeta = viewMode === 'storyboard' ? storyboardCanvasMeta(nodes, t) : directorCanvasMeta(nodes, t)

  // Writer 샷은 4샷 한 장 일괄로, Director 에서 손으로 더한 샷(Writer 샷 없음)은 한 장씩.
  const writerShotIdOf = (id: string): string | null => {
    const node = nodes.find((n) => n.id === id)
    return node && isShotData(node.data) ? node.data.writerShotId : null
  }
  // [이미지 만들기 · N]: 빈 샷은 일괄(빈칸만), 실패한 샷 · 손으로 더한 샷은 한 장씩 다시. Take 는 쓰지 않아 확인 없이 바로(Takes 0).
  const runImages = () => {
    if (imageMode.mode === 'remake') {
      setConfirmRemake(true)
      return
    }
    // 영상까지 이어서면 Take 를 쓰니 영상 확인 창부터(약속 E).
    if (chainOn) {
      refetchTakeBalance()
      setConfirmChain(true)
      return
    }
    startImages()
  }
  const startImages = () => {
    const pid = useDirectorCanvasStore.getState().projectId
    if (!pid || imageWork.length === 0) return
    const store = useDirectorCanvasStore.getState()
    const batch: string[] = []
    for (const id of imageWork) {
      const writerShotId = writerShotIdOf(id)
      if (shotStates.get(id) === 'image_failed' || !writerShotId) void store.generateStoryboardImage(id).catch(() => {})
      else batch.push(writerShotId)
    }
    // 고르지 않았어도 화면이 센 목록을 그대로 싣는다 — 서버가 따로 고르지 않게(리드 검토 a 낮음 6).
    if (batch.length > 0) void runRealBatch(pid, { shotIds: batch })
  }
  // [이미지 다시 만들기 · N] 확인 뒤: 고른 샷만 다시(일괄 force + 고른 샷).
  const remakePicked = () => {
    setConfirmRemake(false)
    const pid = useDirectorCanvasStore.getState().projectId
    if (!pid || imageMode.mode !== 'remake') return
    const store = useDirectorCanvasStore.getState()
    const batch: string[] = []
    for (const id of imageMode.shotIds) {
      const writerShotId = writerShotIdOf(id)
      if (writerShotId) batch.push(writerShotId)
      else void store.generateStoryboardImage(id).catch(() => {})
    }
    if (batch.length > 0) void runRealBatch(pid, { force: true, shotIds: batch })
  }
  // [영상 만들기 · N]: Take 를 쓰니 지금처럼 확인창을 거친다(약속 E).
  const runVideos = () => {
    if (videoWork.length === 0) return
    refetchTakeBalance()
    setConfirmVideoBatch(true)
  }
  // [모두 멈추기](시안 D3 · D4, 오너 답 7) — 아직 보내지 않은 것만 멈춘다: 이미지 일괄은 다음 장을 보내지 않고,
  //   영상 묶음은 지금 만들고 있는 영상까지만 마친다(#batch-resume 2026-09-09 오너 결정 ①).
  const stopping = (!realBatchBusy || realBatchCancelled) && (!videoBatchBusy || videoBatchCancelled)
  const stopAll = async () => {
    const run = useDirectorCanvasStore.getState()
    // 걸어 둔 다시 돌기(러프 · 시트를 기다린 샷)도 거둔다 — 멈춘 뒤 저절로 다시 돌지 않게(리드 검토 a 보통 5).
    cancelRealBatchResume(run.projectId)
    // 이어 보내기 기다림도 비운다 — 이미 보낸 이미지가 끝나도 영상은 시작하지 않는다(오너 답 7, 리드 검토 a 보통 6).
    run.setChainWaitingShots([])
    if (realBatchBusy && !realBatchCancelled) run.cancelRealBatch()
    if (!videoBatchBusy || videoBatchCancelled) {
      if (realBatchBusy) toast.info(t('Stop after the images being made now finish.'))
      return
    }
    const stillCurrent = () => {
      const current = useDirectorCanvasStore.getState()
      return current.projectId === run.projectId && current.videoBatchRunId === run.videoBatchRunId
    }
    try {
      await run.cancelVideoBatch()
      if (stillCurrent()) toast.info(t('Stop after current videos finish.'))
    } catch (error) {
      console.error('[video-batches] cancel failed:', error)
      if (stillCurrent()) toast.error(t('Please try again in a moment.'))
    }
  }
  // 이어 보내기 지켜보기(오너 답 6 — 이 화면이 한다): 이미지가 끝난 샷은 영상을 시작하고, 그림이 없게 된 샷은 기다림에서 뺀다.
  //   러프 · 시트를 기다려 일괄이 다시 돌기를 기다리는 샷은 놓지 않는다(리드 검토 a 낮음 9).
  const realBatchResumeShotIds = useDirectorCanvasStore((s) => s.realBatchResumeShotIds)
  const resumeWaitingNodeIds = new Set(
    nodes.flatMap((n) => (isShotData(n.data) && n.data.writerShotId && realBatchResumeShotIds.includes(n.data.writerShotId) ? [n.id] : [])),
  )
  const chainKey = chainWaitingShotIds
    .map((id) => `${id}:${shotStates.get(id) ?? '-'}:${resumeWaitingNodeIds.has(id) ? 'r' : ''}`)
    .join('|')
  useEffect(() => {
    if (chainWaitingShotIds.length === 0) return
    const step = chainStep(chainWaitingShotIds, shotStates, realBatchBusy, resumeWaitingNodeIds, videoBatchBusy)
    if (step.start.length === 0 && step.drop.length === 0) return
    setChainWaitingShots(step.keep)
    const missed = chainMissed(step.drop, shotStates)
    if (missed.length > 0) {
      toast.info(countText(t, missed.length, "1 video didn't start because its image wasn't made.", "{count} videos didn't start because their images weren't made.", { count: missed.length }))
    }
    // 이미지가 끝난 샷은 서버 영상 묶음으로 — 사람당 동시 한도를 넘는 샷도 묶음이 차례로 낸다(리드 검토 a 보통 3).
    const pid = useDirectorCanvasStore.getState().projectId
    if (pid && step.start.length > 0) void runVideoBatch(pid, { shotIds: step.start })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chainKey 가 기다리는 샷과 그 상태를 함께 담는다
  }, [chainKey, realBatchBusy, videoBatchBusy])
  const progressDone = (storyboardBatch?.done ?? 0) + (videoBatch?.done ?? (videoBatchProgress?.done ?? 0))
  const progressTotal = (storyboardBatch?.total ?? 0) + (videoBatch?.total ?? (videoBatchProgress?.total ?? 0))
  // 영어는 수가 1이면 단수(리드 11/14 답 2).
  const progressLabel =
    makingImages > 0 && makingVideos > 0
      ? makingLabel(makingImages, makingVideos, t)
      : makingVideos > 0 || videoBatchBusy
        ? makingVideos > 1 ? t('Making {count} videos', { count: makingVideos }) : t('Making 1 video')
        : makingImages > 1 ? t('Making {count} images', { count: makingImages }) : t('Making 1 image')

  // v3 D1 → 1110 확정(시안 406:3717 · 406:4051): 위쪽 2줄.
  //   1줄: 보기 · 제목 · 예상 … 상태 고르기 · Lumi / 2줄: 진행 … 이미지 만들기 · 영상 만들기.
  //   가장 밝은(크림) 단추는 지금 할 일 하나(시안 R) — 만들 게 없는 단추는 꺼진다.
  return (
    // 좁아지면(작은 화면 · Lumi 패널이 화면을 밀어냄) 예상 → 진행 막대 → 스위치 글자 순으로 줄이고 단추는 끝까지 남긴다(결정 페이지 추천) — 툴바 폭 기준.
    <div className="@container flex shrink-0 flex-col gap-3 px-4 pb-3 pt-4">
      {/* 다음 단계 단추(2026-10-01 오너 — 각 단계 오른쪽 위) — v3 위 막대 오른쪽 자리. 툴바와 같은 판정으로 켜짐 · 크림을 정한다. */}
      <TopBarActions>
        <NextStepButton
          blocked={!canHandOff}
          blockedReason={t('A finished video lets you move on.')}
          emphasis={primary === 'editor' ? 'primary' : 'secondary'}
        />
      </TopBarActions>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* Node / Storyboard 토글 */}
          <AltArrowHint>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'node' | 'storyboard')}>
              <TabsList className="h-9 rounded-full bg-background p-1 shadow-node">
                <TabsTrigger value="storyboard" className="rounded-full px-3.5 text-[13px]">{t('Storyboard')}</TabsTrigger>
                <TabsTrigger value="node" className="rounded-full px-3.5 text-[13px]">{t('Node')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </AltArrowHint>

          {/* 러프 | 실사 미디어 토글(#previz-video) — Storyboard 뷰 전용, 상단바 상주(2026-07-22). */}
          {viewMode === 'storyboard' && (
            <div className="flex h-9 items-center gap-0.5 rounded-full bg-background p-1 shadow-node">
              {(['previz', 'real'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setStoryboardMediaMode(m)}
                  aria-pressed={storyboardMediaMode === m}
                  className={cn(
                    'h-full rounded-full px-3 text-[13px] transition-colors',
                    storyboardMediaMode === m
                      ? 'bg-accent font-semibold text-foreground'
                      : 'font-medium text-subtle-foreground hover:text-foreground',
                  )}
                >
                  {m === 'previz' ? t('Rough') : t('Real')}
                </button>
              ))}
            </div>
          )}

          {/* 제목(#e1 2026-07-14 스테이지 헤더 → v3 툴바 안) — 설명문은 "?" 뱃지 호버(2026-08-06). */}
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="shrink-0 text-[15px] font-bold text-foreground">{t('The Set')}</h1>
            <StageHelpBadge
              text={t(
                'Start shooting real images/videos based on the rough storyboard, characters, and world.',
              )}
            />
            {canvasMeta && (
              <span className="truncate font-num text-meta font-medium text-subtle-foreground">{canvasMeta}</span>
            )}
          </div>

          {/* 예상 칸(시안 D1 "이미지 4장 · 약 2분 · Takes 안 써요") — 시작 전 예상만, 만드는 중에는 남은 시간을 쓰지 않는다(8/26). */}
          {estimate && (
            <span
              data-testid="director-estimate"
              className="hidden truncate rounded-full bg-background px-3 py-1 text-[12.5px] font-medium text-muted-foreground shadow-node @6xl:inline"
            >
              {estimate}
            </span>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* 캔버스 전용 액션 3종 — Node 탭에서만 표시(#e2 2026-07-13) */}
          {viewMode === 'node' && (
            <>
              {/* 안 쓴 에셋(시안 D1 노드형) — 씬마다 그 씬이 참조 안 하는 등록 에셋도 좌측 컬럼에 표시(표시만). 켜짐은 눌린 모양. */}
              <button
                type="button"
                onClick={() => toggleUnusedAssets()}
                aria-pressed={showUnusedAssets}
                title={t('Show registered assets that this scene does not reference in the left asset column too')}
                className={cn(TOOLBAR_PILL, showUnusedAssets && 'bg-stage/18 ring-[1.5px] ring-inset ring-stage hover:bg-stage/25')}
              >
                <Boxes className="size-3.5" />
                <span>{t('Unused assets')}</span>
              </button>

              {/* 노드 자동 정렬 — asset·scene·shot·video를 다이어그램 레이아웃으로 재배치 (DB 반영) */}
              <button
                type="button"
                onClick={() => requestArrange()}
                title={t('Arrange assets, scenes, shots, and videos in a left-to-right layout with spacing (saved to DB)')}
                className={TOOLBAR_PILL}
              >
                <LayoutGrid className="size-3.5" />
                <span>{t('Auto-arrange')}</span>
              </button>

              {/* 프롬프트 노드 추가 — Higgsfield식 분리 프롬프트(우측 핸들을 Shot T 입력에 연결) */}
              <button
                type="button"
                onClick={() =>
                  addPromptNode({ x: 80, y: 120 + promptCount * 180 })
                }
                title={t('Adds a standalone prompt node. Connect its right handle to a Shot\'s T input to sync the Shot prompt.')}
                className={TOOLBAR_PILL}
              >
                <Plus className="size-3.5" />
                <span>{t('Prompt node')}</span>
              </button>
            </>
          )}

          {/* 상태 고르기(시안 D1 "전체 4 ▾") — 고르면 그 상태 샷만 보인다. */}
          <ShotStatusFilterMenu counts={statusCounts} value={statusFilter} onChange={setStatusFilter} />

          {/* 채팅이 닫혀 있으면 여는 곳(v3 D1 Lumi 알약) — Director 는 채팅을 닫은 채 시작한다. */}
          <LumiChatPill />
        </div>
      </div>

      {/* 2줄(시안 D1 · D3 · D4): 왼쪽 진행(체크 옆) … 오른쪽 만들기 단추. */}
      <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-background px-4 py-2 shadow-node">
        <div className="flex min-w-0 items-center gap-3">
          <PickAllBar
            total={visibleShotIds.length}
            picked={picked.size}
            onToggleAll={() => setPickedShots(nextPickAll(visibleShotIds, [...picked]))}
            onClear={clearPickedShots}
          />
          {making && <span aria-hidden className="h-5 w-px shrink-0 bg-border" />}
          {making && (
            <div className="flex min-w-0 items-center gap-2.5" aria-live="polite">
              <LumiAvatar persona={STAGE_PERSONA.director} state="loading" size={22} />
              <span className="truncate text-[13px] font-medium text-foreground">{progressLabel}</span>
              {progressTotal > 0 && (
                <span
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progressTotal}
                  aria-valuenow={progressDone}
                  aria-label={t('Finished {done} of {total}', { done: progressDone, total: progressTotal })}
                  className="hidden h-1 w-40 shrink-0 overflow-hidden rounded-full bg-progress-track @5xl:block"
                >
                  <span
                    className={cn('block h-full transition-[width]', makingVideos > 0 || videoBatchBusy ? 'bg-state-video' : 'bg-stage-director')}
                    style={{ width: `${(progressDone / progressTotal) * 100}%` }}
                  />
                </span>
              )}
              {/* 끝난 수 / 전체 — 핀과 같은 서버 배치(약속 D7). 남은 시간 · % 는 쓰지 않는다(오너 8/26). */}
              {storyboardBatch && (
                <span className="shrink-0 font-num text-[12px] tabular-nums text-muted-foreground">
                  {t('Image')} {storyboardBatch.done}/{storyboardBatch.total}
                  {storyboardBatch.failed > 0 && (
                    <span className="text-destructive"> · {t('{count} failed', { count: storyboardBatch.failed })}</span>
                  )}
                </span>
              )}
              {videoBatch && (
                <span className="shrink-0 font-num text-[12px] tabular-nums text-muted-foreground">
                  {t('Video')} {videoBatch.done}/{videoBatch.total}
                  {videoBatch.failed > 0 && (
                    <span className="text-destructive"> · {t('{count} failed', { count: videoBatch.failed })}</span>
                  )}
                </span>
              )}
              {(realBatchBusy || videoBatchBusy) && (
                <button
                  type="button"
                  onClick={() => void stopAll()}
                  disabled={stopping}
                  className={cn(TOOLBAR_PILL, 'h-8 px-3 disabled:cursor-not-allowed disabled:opacity-60')}
                >
                  {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3 fill-current" />}
                  <span>{stopping ? t('Stopping') : t('Stop all')}</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {/* 영상까지 이어서(시안 D1 · D4 · R) — 켜면 이미지 단추가 "이미지+영상 만들기". 만드는 중에는 바꿀 수 없다. */}
          <button
            type="button"
            role="switch"
            aria-checked={chainVideoAfterImage}
            aria-label={t('Also make videos')}
            onClick={() => setChainVideoAfterImage(!chainVideoAfterImage)}
            disabled={(imageMode.mode !== 'make' || imageWork.length === 0) && chainWaitingShotIds.length === 0}
            className="flex shrink-0 items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              aria-hidden
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                chainVideoAfterImage ? 'bg-info' : 'bg-card',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-foreground transition-[left]',
                  chainVideoAfterImage ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </span>
            <span className="hidden whitespace-nowrap @4xl:inline">{t('Also make videos')}</span>
          </button>
          {/* 고른 샷이 있으면 단추가 그 샷에만(시안 D2 "고른 샷에"). */}
          {picked.size > 0 && <span className="text-[12.5px] font-semibold text-info">{t('On picked shots')}</span>}
          {/* 단추 셋은 늘 같은 자리(시안 R) — 만들 게 없거나 일괄이 도는 중이면 꺼지고, 까닭은 단추 아래 한 줄로 보인다. */}
          <button
            type="button"
            onClick={runImages}
            disabled={imageBlock !== null}
            aria-describedby={imageBlock !== null ? 'director-work-block' : undefined}
            className={workButtonClass(primary === 'image')}
          >
            <ImageIcon className="size-3.5" />
            <span>{imageMode.mode === 'remake' ? t('Make images again') : chainVideoAfterImage ? t('Make images + videos') : t('Make images')}</span>
            <span aria-hidden className="opacity-60">·</span>
            <span className="font-num tabular-nums">{imageMode.shotIds.length}</span>
          </button>
          <button
            type="button"
            onClick={runVideos}
            disabled={videoBlock !== null}
            aria-describedby={videoBlock !== null ? 'director-work-block' : undefined}
            className={workButtonClass(primary === 'video')}
          >
            <Play className="size-3.5 fill-current" />
            <span>{t('Make videos')}</span>
            <span aria-hidden className="opacity-60">·</span>
            <span className="font-num tabular-nums">{videoWork.length}</span>
          </button>
        </div>
          {/* 꺼진 단추 아래 이유 한 줄(결정 페이지 추천) — 마우스를 올리지 않아도 · 키보드 · 터치로도 보인다. */}
          {blockLine && (
            <p id="director-work-block" className="text-[11.5px] leading-tight text-muted-foreground">
              {blockLine}
            </p>
          )}
        </div>
      </div>

      <RegenerateConfirmDialog
        open={confirmChain}
        onOpenChange={setConfirmChain}
        title={t('Make images, then their videos?')}
        description={countText(t, imageWork.length, 'Makes 1 image, and its video starts by itself when the image is done.', 'Makes {count} images, and each video starts by itself when its image is done.', { count: imageWork.length })}
        impact={[
          t('Costs money for every generated video: {count} videos.', { count: chainPlan.total }),
          ...describeVideoBatchPlan(chainPlan, t),
          t("If you close this screen, the videos won't start."),
        ]}
        confirmLabel={t('Make images + videos')}
        onConfirm={() => {
          setConfirmChain(false)
          // Take 가 없으면 영상은 못 만들어도 이미지는 만든다 — 이미지는 Take 를 쓰지 않는다(리드 검토 a 낮음 9).
          if (chainPlan.runCount === 0) {
            toast.warning(t('No videos can be made until you add Takes.'))
            startImages()
            return
          }
          setChainWaitingShots([...chainWaitingShotIds, ...imageWork.slice(0, chainPlan.runCount)])
          startImages()
          toast.info(t("If you close this screen, the videos won't start."))
        }}
      />
      <RegenerateConfirmDialog
        open={confirmRemake}
        onOpenChange={setConfirmRemake}
        title={countText(t, imageMode.shotIds.length, 'Make 1 image again?', 'Make {count} images again?', { count: imageMode.shotIds.length })}
        description={countText(t, imageMode.shotIds.length, 'Remakes the image for the 1 picked shot. No Takes are used.', 'Remakes the image for the {count} picked shots. No Takes are used.', { count: imageMode.shotIds.length })}
        impact={[t('Replaces the current images in the picked shots.')]}
        confirmLabel={t('Make again')}
        onConfirm={remakePicked}
      />
      <RegenerateConfirmDialog
        open={confirmVideoBatch}
        onOpenChange={setConfirmVideoBatch}
        title={t('Generate videos for eligible shots?')}
        description={t('Generate videos for {count} eligible shots.', {
          count: videoPlan.total,
        })}
        impact={[
          t('Costs money for every generated video: {count} videos.', {
            count: videoPlan.runCount,
          }),
          ...describeVideoBatchPlan(videoPlan, t),
          t('Only shots without a completed video or active generation will be included.'),
        ]}
        confirmLabel={t('Generate videos')}
        busy={videoBatchBusy}
        onConfirm={() => {
          setConfirmVideoBatch(false)
          if (videoPlan.runCount === 0) {
            toast.warning(t('No videos can be made until you add Takes.'))
            return
          }
          const pid = useDirectorCanvasStore.getState().projectId
          if (pid) void runVideoBatch(pid, { limit: videoPlan.runCount, shotIds: videoWork })
        }}
      />
    </div>
  )
}

/** 만들기 단추 — 지금 할 일이면 크림(메인 하나), 아니면 보조. 만들 게 없으면 꺼짐(design.md §2.7). */
function workButtonClass(primary: boolean): string {
  return cn(
    'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50',
    primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card text-foreground hover:bg-accent',
  )
}

// ────────────────────────────────────────────────────────────────────────────

export default function DirectorCanvasPage() {
  // v3 D1(2026-11-03): Director 는 채팅을 닫은 채 시작하고 툴바의 Lumi 알약으로 연다 — 떠나면 들어오기 전 모습으로 돌아간다(오너 2026-11-03 확인).
  useHoldChatClosed('director')
  // 고름은 한때 쓰는 것(시안 D2, 혼자 정한 것 d) — Esc 로 풀고, 화면을 떠나면 풀린다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      useDirectorCanvasStore.getState().clearPickedShots()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      useDirectorCanvasStore.getState().clearPickedShots()
      // 화면을 떠나면 "영상까지 이어서"를 끄고 기다림을 비운다 — "이 화면을 닫으면 영상은 시작되지 않아요"(리드 검토 a S5 보통 4).
      useDirectorCanvasStore.getState().setChainVideoAfterImage(false)
    }
  }, [])
  const handoffProjectId = useProjectStore((s) => s.projectId)
  // 라우터 요청이 아닌 실제 Director 화면의 mount가 이동 완료를 확인한다.
  useEffect(() => {
    if (handoffProjectId) useGlobalChatStore.getState().confirmDirectorHandoff(handoffProjectId, '/studio/director')
  }, [handoffProjectId])
  const t = useT()
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)
  // 스토리보드 축척 — PaletteBar(컨트롤)와 StoryboardGridView(그리드·단축키)가 공유(#e-zoom-merge)
  const [storyboardZoom, setStoryboardZoom] = useStoryboardZoom('director:storyboard:zoomLevel')
  const guideProjectId = useDirectorCanvasStore((s) => s.projectId)
  // Node↔Storyboard 전환 슬라이드(#e2 2026-08-03) — 두 뷰는 조건 렌더(원래 remount)라
  //   mount 애니메이션이 곧 전환 연출. 방향은 토글 순서(시안 D1: Storyboard 왼쪽·Node 오른쪽, 리드 11/14).
  const [prevViewMode, setPrevViewMode] = useState(viewMode)
  const [viewSlide, setViewSlide] = useState<'forward' | 'back' | 'none'>('none')
  if (viewMode !== prevViewMode) {
    setViewSlide(viewMode === 'node' ? 'forward' : 'back')
    setPrevViewMode(viewMode)
  }
  const viewSlideClass =
    viewSlide === 'forward'
      ? 'animate-in fade-in-25 slide-in-from-right-6 duration-500 ease-out motion-reduce:animate-none'
      : viewSlide === 'back'
        ? 'animate-in fade-in-25 slide-in-from-left-6 duration-500 ease-out motion-reduce:animate-none'
        : undefined
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  // 프로젝트 init(resetChildStores)이 끝나기 전에 올린 제안은 reset()에 지워진다 —
  //   스테이지 동기 + init 완료 후에만 발화.
  const stageReady = useProjectStore(
    (s) => s.currentStage === 'director' && !s.initLoading,
  )

  // Writer Scene/Shot → Director 노드 자동 셋업 (프롬프트 + 에셋 바인딩, 스펙 §8)
  useWriterDirectorSync()

  // 큐 축소 → 재수화(#live-refresh) — Node/Storyboard 어느 뷰든 생성 완료가 즉시 보인다.
  useQueueRehydrate(guideProjectId && guideProjectId !== 'default' ? guideProjectId : null)

  useEffect(() => {
    if (!stageReady || !guideProjectId || guideProjectId === 'default') return
    const restore = () => {
      if (document.hidden) return
      void restoreVideoBatch(guideProjectId).catch((error) => {
        console.error('[video-batches] restore failed:', error)
      })
    }
    restore()
    document.addEventListener('visibilitychange', restore)
    return () => document.removeEventListener('visibilitychange', restore)
  }, [guideProjectId, stageReady])

  // SHOT VIDEO 재생 상태(#video-pause 2026-08-12) — playingNodeId 가 스토어에 남아 탭을
  //   떠났다 오면 <video autoPlay> 가 재마운트되며 저절로 재생됐다. 떠날 때(unmount)와
  //   브라우저 탭이 가려질 때(visibilitychange) 재생 지정을 내린다 — 돌아오면 썸네일 정지 상태.
  const setPlayingNodeForPause = useDirectorCanvasStore((s) => s.setPlayingNode)
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) setPlayingNodeForPause(null)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      setPlayingNodeForPause(null)
    }
  }, [setPlayingNodeForPause])

  // 진입 자동 실사 생성 제거 (#c5 2026-08-27 오너 지시). 예전엔 Director 로 넘어오는 것만으로
  //   i2i 실사 일괄이 발사돼 사용자가 previz 를 손볼 틈이 없었고, 원치 않는 과금이 먼저 났다.
  //   실사 생성 경로는 이제 셋 다 사람의 명시적 행동이다:
  //     1) 상단 'Generate storyboard' 버튼 — 전체 일괄
  //     2) 카드/노드의 개별 생성 버튼 — 샷 하나
  //     3) 채팅 지시 — 위 둘과 같은 경로로 들어온다
  // 첫 진입 사용법 안내(#e3) — Node/Storyboard 탭 각각 프로젝트당 1회(localStorage 가드).
  //   제안 슬롯은 선점형: 갭 넛지가 점유 중이면 내리고 안내를 올리고, 그 외 제안이면 양보.
  useEffect(() => {
    if (!guideProjectId || guideProjectId === 'default' || !stageReady) return
    const key = viewMode === 'storyboard' ? 'storyboardGuide' : 'nodeGuide'
    const guardKey = `director:${key}:${guideProjectId}`
    try {
      if (localStorage.getItem(guardKey)) return
    } catch {
      return
    }
    const chat = useGlobalChatStore.getState()
    if (chat.suggestion) {
      if (chat.suggestion.id.startsWith('director-gaps-')) chat.dismissSuggestion()
      else return
    }
    try {
      localStorage.setItem(guardKey, '1')
    } catch {}
    offerSuggestion({
      id: `director-${key}:${guideProjectId}`,
      stage: 'director',
      dismissible: false,
      action: null,
      content:
        viewMode === 'storyboard'
          ? t(
              'This is the storyboard. See every shot image per scene at a glance.\n\n' +
                '· Click cards to pick shots, and the buttons at the top work on the picked shots\n' +
                '· "Make images" turns the rough shots into real images, then "Make videos"\n' +
                '· Press ⤢ Details on a card to open its details',
            )
          : t(
              'This is The Set, where scenes → shots → videos connect as nodes.\n\n' +
                '· Click a node to pick its shot, and press ⤢ Details to open its details\n' +
                '· "Make images" at the top turns the rough shots into real images at once\n' +
                '· When images are ready, "Make videos" makes the videos',
            ),
    })
  }, [guideProjectId, viewMode, stageReady, offerSuggestion, t])

  return (
    // v3 D1(2026-11-03): 위 막대 아래 캔버스 판 하나(모서리 16 · --canvas-bg) — 아래 8px 띄움, 오른쪽 8px 는 스튜디오 틀 여백(SHELL_INSET)이 준다.
    //   제목 "The Set" · 도움말은 판 안 툴바 왼쪽으로, [다음: Editor로]는 위 막대 오른쪽으로 옮겼다.
    <div className="flex flex-1 flex-col overflow-hidden pb-2">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-canvas-bg">
        {/* Center: top Palette bar(#e1 — 하단→상단 이동) + Canvas (Node/Storyboard) */}
        <PaletteBar />

        {/* min-h-0: flex-1이 내용 높이만큼 커져 PaletteBar(토글)를
            밀어내고 StoryboardGridView의 overflow-auto가 안 걸리던 문제 수정.
            이걸로 storyboard 그리드 스크롤 + Node/Storyboard 토글 항상 노출. */}
        <div className="relative min-h-0 flex-1">
          {/* key=viewMode: 전환 시 래퍼 remount 로 슬라이드 재생(#e2) — 뷰 자체도 원래 조건
              렌더로 remount 되던 구조라 추가 비용 없음. */}
          <div key={viewMode} className={cn('flex h-full min-h-0 flex-col', viewSlideClass)}>
            {viewMode === 'storyboard' ? (
              <>
                <div className="min-h-0 flex-1">
                  <StoryboardGridView
                    zoomLevel={storyboardZoom}
                    onZoomLevelChange={setStoryboardZoom}
                  />
                </div>
                {/* 축척은 시안 D1 처럼 판 왼쪽 아래 "− 100% + ⤢" 알약(노드형 축척과 같은 생김새). 카드가 스크롤돼 들어가지 않는
                    아래 띠에 둬 어느 카드도 덮지 않는다(리드 11/14). Ctrl+wheel 단축은 보드가 그대로 처리한다. */}
                <div className="flex shrink-0 items-center px-4 pb-4 pt-2">
                  <StoryboardZoomPill zoomLevel={storyboardZoom} onZoomLevelChange={setStoryboardZoom} />
                </div>
              </>
            ) : (
              <ReactFlowProvider>
                <CanvasInner />
              </ReactFlowProvider>
            )}
          </div>
        </div>

        {/* Storyboard 뷰에서도 더블클릭 편집 팝업이 동작하도록 viewMode 무관 마운트 */}
        {viewMode === 'storyboard' && <DirectorNodePopup />}

        {/* 결정 #12 완료: D-3 NodePopup이 카메라/조명/렌즈 편집을 흡수.
            우측 Inspector aside 제거됨 (D-3 마일스톤, 2026-05-25) */}
      </div>

    </div>
  )
}
