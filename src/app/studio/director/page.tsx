'use client'

import '@xyflow/react/dist/style.css'

import { useCallback, useEffect, useRef, useState, type MouseEvent, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  PanOnScrollMode,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useNodesInitialized,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnConnectStart,
  type OnConnectEnd,
} from '@xyflow/react'
import { Loader2, ImageIcon, ChevronDown, ChevronUp, LayoutGrid, Boxes, Map as MapIcon, Lock, Unlock, Type } from 'lucide-react'

import { toast } from 'sonner'
import { runRealBatch } from '@/lib/director/real-batch-client'
import {
  eligibleVideoBatchShotIds,
  runVideoBatch,
} from '@/lib/director/video-batch-client'
import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'
import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { AltArrowHint } from '@/components/alt-arrow-hint'
import { StageHelpBadge } from '@/components/stage-help-badge'

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
import {
  isShotData,
  SNAP_GRID,
} from '@/types/director'
import { StoryboardGridView } from '@/features/director/canvas-views/StoryboardGridView'
import { StoryboardZoomControls, useStoryboardZoom } from '@/components/generating-frame'
import { useWriterDirectorSync } from '@/features/director/hooks/use-writer-director-sync'
import { useQueueRehydrate } from '@/features/director/hooks/use-queue-rehydrate'

import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
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
        'absolute z-10 overflow-hidden rounded-lg border bg-card/50 transition-opacity',
        // 접힘: 헤더 바만 남기고 아주 투명하게(hover 시 또렷해져 다시 펼치기 유도).
        collapsed
          ? 'border-border/40 opacity-35 hover:opacity-100'
          : 'border-border opacity-100',
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
          'flex h-6 items-center justify-between gap-2 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground',
          !collapsed && 'border-b border-border/60',
          locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        )}
      >
        <span className="flex items-center gap-1">
          <MapIcon className="size-3" />
          {t('Minimap')}
        </span>
        <div className="flex items-center gap-0.5">
          {!collapsed && (
            <button
              type="button"
              onClick={() => setLocked((v) => !v)}
              title={locked ? t('Unlock position') : t('Lock position')}
              className="rounded p-0.5 hover:bg-accent hover:text-foreground hover-red-beam"
            >
              {locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? t('Expand minimap') : t('Collapse minimap')}
            className="rounded p-0.5 hover:bg-accent hover:text-foreground hover-red-beam"
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
        <div style={{ width: size.w, height: size.h }}>
          <MiniMap
            className="!static !m-0 !h-full !w-full !bg-transparent"
            pannable
            zoomable
          />
        </div>
      )}
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
  //   summarizeGaps() 자체 산출물은 범위 밖(@/lib/completeness)이라 그대로 통과, 감싸는
  //   문장만 번역한다.
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
      ledgerGaps: ledgerGapLabels(sceneLedgers, (id) => assetCharacters[id]?.name ?? id),
    }),
    [assetCharacters, sceneLedgers],
  )
  const gaps = getDirectorGaps(nodes, gapAssets)
  const gapNudgeContent =
    gaps.length > 0
      ? t('There are {count} things worth filling in:\n{summary}', {
          count: gaps.length,
          summary: summarizeGaps(gaps),
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
    offerSuggestion({
      id: `handoff:director:${directorProjectId}`,
      stage: 'director',
      content: t('{done} of {total} shots have video. Shall we move to Editor and start assembling?', {
        done: shotsWithVideo.size,
        total: shotCountForNudge,
      }),
      action: { kind: 'handoff', utterance: t(spec.utterance), label: t(spec.label) },
    })
  }, [directorProjectId, hasRenderedVideo, shotsWithVideo.size, shotCountForNudge, offerSuggestion, reachedStageForNudge, t])

  const {
    screenToFlowPosition,
    setViewport: applyViewport,
    getViewport,
    fitView,
  } = useReactFlow()
  const nodesInitialized = useNodesInitialized()

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
    nodes
      .filter(
        (n) =>
          n.data.kind === 'scene' ||
          n.data.kind === 'shotImage' ||
          n.data.kind === 'videoPlaceholder',
      )
      .map((n) => n.id),
  )
  const visibleNodes = nodes.filter((n) => !hiddenNodeIds.has(n.id))
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
        onNodeClick={(_event, node) => {
          const kind = node.data.kind
          if (kind === 'shot' || kind === 'video' || kind === 'asset') {
            selectNode(node.id)
          }
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
        onlyRenderVisibleElements
        className="bg-background"
      >
        <Background gap={16} size={1} className="opacity-30" />
        <Controls className="!border !border-border" />
        <MiniMapPanel />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center text-sm text-muted-foreground">
            {t('Scenes come in automatically once you create them in Writer.')}
            <div className="mt-1 text-xs opacity-70">
              {t('Or double-click the canvas to create a Scene directly.')}
            </div>
          </div>
        </div>
      )}

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

// Alt+←/→ 순환 뷰 시퀀스(#keyboard-only 2026-08-11) — Node → Storyboard(Previz) → Storyboard(Real).
const DIRECTOR_VIEW_CYCLE = ['node', 'previz', 'real'] as const
type DirectorViewStep = (typeof DIRECTOR_VIEW_CYCLE)[number]

function PaletteBar({
  storyboardZoom,
  onStoryboardZoomChange,
}: {
  storyboardZoom: number
  onStoryboardZoomChange: React.Dispatch<React.SetStateAction<number>>
}) {
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
  const videoBatchProgress = useDirectorCanvasStore((s) => s.videoBatchProgress)
  // 약속 D7(2026-09-04): 버튼 숫자는 핀과 같은 서버 배치에서 온다 — 배치가 도는 동안은 그 done/total, 아니면 화면 집계.
  const projectId = useProjectStore((s) => s.projectId)
  const generationBatches = useGenerationBatches(projectId ?? null)
  const realBatchRemaining = useDirectorCanvasStore((s) => s.realBatchRemaining)
  const storyboardBatch = withStoryboardBacklog(generationBatches, realBatchRemaining ?? 0).find((b) => b.lane === 'director-storyboard') ?? null
  const videoBatch = generationBatches.find((b) => b.lane === 'director-video') ?? null
  const relayoutCanvas = useDirectorCanvasStore((s) => s.relayoutCanvas)
  const showUnusedAssets = useDirectorCanvasStore((s) => s.showUnusedAssets)
  const toggleUnusedAssets = useDirectorCanvasStore((s) => s.toggleUnusedAssets)
  const addPromptNode = useDirectorCanvasStore((s) => s.addPromptNode)
  const promptCount = nodes.filter((n) => n.data.kind === 'prompt').length

  const shots = nodes.filter((n) => isShotData(n.data))
  const totalShots = shots.length
  const completedShots = shots.filter(
    (n) => isShotData(n.data) && n.data.storyboardImage?.status === 'completed',
  ).length
  // #c3: 전부 생성된 상태에서 '전체 재생성'을 누르면 확인을 거친다(과금이 크다).
  const [confirmRegenAll, setConfirmRegenAll] = useState(false)
  const isGenerating = shots.some(
    (n) =>
      isShotData(n.data) && n.data.storyboardImage?.status === 'generating',
  )
  const eligibleVideoCount = eligibleVideoBatchShotIds(nodes).length
  const [confirmVideoBatch, setConfirmVideoBatch] = useState(false)

  // 상단 이동(#e1 2026-07-13): 하단 border-t 바 → 캔버스 위 border-b 바.
  //   Node/Storyboard 토글은 artist 탭(Characters/World/Inventory)과 동일한 TabsList 스타일.
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <div className="flex items-center gap-3">
        {/* Node / Storyboard 토글 */}
        <AltArrowHint>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'node' | 'storyboard')}>
            <TabsList>
              <TabsTrigger value="node">{t('Node')}</TabsTrigger>
              <TabsTrigger value="storyboard">{t('Storyboard')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </AltArrowHint>

        {/* Previz | Real 미디어 토글(#previz-video) — Storyboard 뷰 전용, 상단바 상주(2026-07-22). */}
        {viewMode === 'storyboard' && (
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(['previz', 'real'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setStoryboardMediaMode(m)}
                aria-pressed={storyboardMediaMode === m}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  storyboardMediaMode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'previz' ? 'Previz' : 'Real'}
              </button>
            ))}
          </div>
        )}

        {/* 스토리보드 일괄 생성 */}
        <button
          type="button"
          title={
            isGenerating || realBatchBusy
              ? t('Generation in progress. You can start again when it finishes.')
              : t('Generate the rough storyboard into a real shooting-image storyboard in one go')
          }
          onClick={() => {
            // #2: 이미 모두 생성됐으면 재생성 대신 알림.
            const shots = nodes.filter((n) => isShotData(n.data))
            const pending = shots.filter(
              (n) =>
                isShotData(n.data) &&
                n.data.storyboardImage?.status !== 'completed',
            )
            // #c3 (2026-08-27 오너): "하나씩 하는 거 짜쳐서 전체 재생성 누르려는데 X표로 막힘".
            //   전부 생성된 상태에서 안내만 띄우고 끝나 전체 재생성 경로가 아예 없었다.
            //   과금이 큰 동작이라 바로 쏘지 않고 확인을 받는다.
            if (shots.length > 0 && pending.length === 0) {
              setConfirmRegenAll(true)
              return
            }
            // #real-grid: 샷별 단일 잡 루프(generateAllStoryboardImages) → 4샷 시트 일괄로 교체.
            //   미생성 샷만 채우는 멱등 경로 — 개별 재생성(고해상 단일 스트립)은 더블클릭 그대로.
            const pid = useDirectorCanvasStore.getState().projectId
            if (pid) void runRealBatch(pid)
          }}
          disabled={isGenerating || realBatchBusy || totalShots === 0}
          aria-busy={isGenerating || realBatchBusy}
          className={cn(
            'flex h-8 items-center gap-2 rounded-md border border-border px-3',
            'text-xs font-medium text-foreground',
            'transition-colors duration-100 hover:bg-accent',
            (isGenerating || realBatchBusy || totalShots === 0) &&
              'cursor-not-allowed opacity-50',
            (isGenerating || realBatchBusy) && 'opacity-70',
            'hover-red-beam',
          )}
        >
          {isGenerating || realBatchBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImageIcon className="size-4" />
          )}
          <span>{t('Generate storyboard')}</span>
          {storyboardBatch ? (
            <span className="font-mono tabular-nums text-muted-foreground">
              {storyboardBatch.done}/{storyboardBatch.total}
              {storyboardBatch.failed > 0 && (
                <span className="text-destructive"> · {t('{count} failed', { count: storyboardBatch.failed })}</span>
              )}
            </span>
          ) : totalShots > 0 ? (
            <span className="font-mono tabular-nums text-muted-foreground">
              {completedShots}/{totalShots}
            </span>
          ) : null}
        </button>

        {/* 명시적 전체 영상 생성 — 과금 동작은 확인 후에만 시작한다. */}
        <button
          type="button"
          title={t('Generate videos for every eligible shot')}
          onClick={() => {
            if (videoBatchBusy) return
            const eligible = eligibleVideoBatchShotIds(
              useDirectorCanvasStore.getState().nodes,
            )
            if (eligible.length === 0) {
              toast.info(t('No eligible shots for video generation.'))
              return
            }
            setConfirmVideoBatch(true)
          }}
          disabled={videoBatchBusy}
          aria-busy={videoBatchBusy}
          className={cn(
            'flex h-8 items-center gap-2 rounded-md border border-border px-3',
            'text-xs font-medium text-foreground',
            'transition-colors duration-100 hover:bg-accent',
            videoBatchBusy && 'cursor-not-allowed opacity-70',
            'hover-red-beam',
          )}
        >
          {videoBatchBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImageIcon className="size-4" />
          )}
          <span>{t('Generate videos')}</span>
          {videoBatch ? (
            <>
              <span className="font-mono tabular-nums text-muted-foreground">
                {videoBatch.done}/{videoBatch.total}
              </span>
              {videoBatch.failed > 0 && (
                <span className="text-destructive">
                  {t('{count} failed', { count: videoBatch.failed })}
                </span>
              )}
            </>
          ) : !videoBatchBusy && eligibleVideoCount > 0 ? (
            <span className="font-mono tabular-nums text-muted-foreground">
              {t('{count} available', { count: eligibleVideoCount })}
            </span>
          ) : null}
          {videoBatchBusy && videoBatchProgress && !videoBatch && (
            <>
              <span className="font-mono tabular-nums text-muted-foreground">
                {videoBatchProgress.done}/{videoBatchProgress.total}
              </span>
              {videoBatchProgress.failed > 0 && (
                <span className="text-destructive">
                  {t('{count} failed', { count: videoBatchProgress.failed })}
                </span>
              )}
              <span
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={videoBatchProgress.total}
                aria-valuenow={videoBatchProgress.done}
                className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full bg-primary transition-[width]"
                  style={{
                    width:
                      videoBatchProgress.total > 0
                        ? `${(videoBatchProgress.done / videoBatchProgress.total) * 100}%`
                        : '0%',
                  }}
                />
              </span>
            </>
          )}
        </button>

      </div>

      {/* 축척 — Storyboard 뷰 전용, 우측 정렬(#e-zoom-merge 2026-08-20 오너 지시: 뷰 내부의
          전용 바에 혼자 있던 것을 이 바로 합류). Ctrl+wheel 단축은 보드가 그대로 처리한다. */}
      {viewMode === 'storyboard' && (
        <div className="ml-auto flex shrink-0 items-center">
          <StoryboardZoomControls
            zoomLevel={storyboardZoom}
            onZoomLevelChange={onStoryboardZoomChange}
          />
        </div>
      )}

      {/* 캔버스 전용 액션 3종 — Node 탭에서만 표시, 오른쪽 정렬(#e2 2026-07-13) */}
      {viewMode === 'node' && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* 미사용 에셋 불러오기 — 씬마다 그 씬이 참조 안 하는 등록 에셋도 좌측 컬럼에 표시(표시만) */}
          <button
            type="button"
            onClick={() => toggleUnusedAssets()}
            title={t('Show registered assets that this scene does not reference in the left asset column too')}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors duration-100',
              showUnusedAssets
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              'hover-red-beam',
            )}
          >
            <Boxes className="size-4" />
            <span>{showUnusedAssets ? t('Hide unused assets') : t('Load unused assets')}</span>
          </button>

          {/* 노드 자동 정렬 — asset·scene·shot·video를 다이어그램 레이아웃으로 재배치 (DB 반영) */}
          <button
            type="button"
            onClick={() => relayoutCanvas()}
            title={t('Arrange assets, scenes, shots, and videos in a left-to-right layout with spacing (saved to DB)')}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground hover-red-beam"
          >
            <LayoutGrid className="size-4" />
            <span>{t('Auto-arrange')}</span>
          </button>

          {/* 프롬프트 노드 추가 — Higgsfield식 분리 프롬프트(우측 핸들을 Shot T 입력에 연결) */}
          <button
            type="button"
            onClick={() =>
              addPromptNode({ x: 80, y: 120 + promptCount * 180 })
            }
            title={t('Adds a standalone prompt node. Connect its right handle to a Shot\'s T input to sync the Shot prompt.')}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground hover-red-beam"
          >
            <Type className="size-4" />
            <span>{t('Prompt node')}</span>
          </button>
        </div>
      )}

      {/* #c3: 전체 재생성 확인 — 이미 만든 걸 전부 갈아엎으므로 과금·교체를 명시하고 받는다. */}
      <RegenerateConfirmDialog
        open={confirmRegenAll}
        onOpenChange={setConfirmRegenAll}
        title={t('Regenerate every storyboard image?')}
        description={t('Redraws the shooting image for all {count} shots.', { count: totalShots })}
        impact={[
          t('Costs money for every shot: {count} images.', { count: totalShots }),
          t('Replaces the existing shooting images with the new results.'),
        ]}
        confirmLabel={t('Regenerate all')}
        onConfirm={() => {
          setConfirmRegenAll(false)
          const pid = useDirectorCanvasStore.getState().projectId
          if (pid) void runRealBatch(pid, { force: true })
        }}
      />
      <RegenerateConfirmDialog
        open={confirmVideoBatch}
        onOpenChange={setConfirmVideoBatch}
        title={t('Generate videos for eligible shots?')}
        description={t('Generate videos for {count} eligible shots.', {
          count: eligibleVideoCount,
        })}
        impact={[
          t('Costs money for every generated video: {count} videos.', {
            count: eligibleVideoCount,
          }),
          t('Only shots without a completed video or active generation will be included.'),
        ]}
        confirmLabel={t('Generate videos')}
        busy={videoBatchBusy}
        onConfirm={() => {
          setConfirmVideoBatch(false)
          const pid = useDirectorCanvasStore.getState().projectId
          if (pid) void runVideoBatch(pid)
        }}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export default function DirectorCanvasPage() {
  const t = useT()
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)
  // 스토리보드 축척 — PaletteBar(컨트롤)와 StoryboardGridView(그리드·단축키)가 공유(#e-zoom-merge)
  const [storyboardZoom, setStoryboardZoom] = useStoryboardZoom('director:storyboard:zoomLevel')
  const guideProjectId = useDirectorCanvasStore((s) => s.projectId)
  // Node↔Storyboard 전환 슬라이드(#e2 2026-08-03) — 두 뷰는 조건 렌더(원래 remount)라
  //   mount 애니메이션이 곧 전환 연출. 방향은 토글 순서(Node 왼쪽·Storyboard 오른쪽).
  const [prevViewMode, setPrevViewMode] = useState(viewMode)
  const [viewSlide, setViewSlide] = useState<'forward' | 'back' | 'none'>('none')
  if (viewMode !== prevViewMode) {
    setViewSlide(viewMode === 'storyboard' ? 'forward' : 'back')
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
                '· A card marked "Image generation needed" is still in rough stage\n' +
                '· Press "Generate video" on a card to go from image to video in one go\n' +
                '· Double-click a card to open detailed editing',
            )
          : t(
              'This is The Set, where scenes → shots → videos connect as nodes.\n\n' +
                '· Double-click a card to open detailed editing\n' +
                '· Select a shot card and an image-generation button appears above it\n' +
                '· Use "Generate storyboard" at the top to turn every shot into a real image at once',
            ),
    })
  }, [guideProjectId, viewMode, stageReady, offerSuggestion, t])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 스테이지 헤더(#e1 2026-07-14) — 다른 탭(writer/artist)과 동일 구조.
          설명문은 "?" 뱃지 호버로 이관(2026-08-06). */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">The Set</h1>
        <StageHelpBadge
          text={t(
            'Start shooting real images/videos based on the rough storyboard, characters, and world.',
          )}
        />
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Center: top Palette bar(#e1 — 하단→상단 이동) + Canvas (Node/Storyboard) */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <PaletteBar
            storyboardZoom={storyboardZoom}
            onStoryboardZoomChange={setStoryboardZoom}
          />

          {/* min-h-0: flex-1이 내용 높이만큼 커져 PaletteBar(토글)를
              밀어내고 StoryboardGridView의 overflow-auto가 안 걸리던 문제 수정.
              이걸로 storyboard 그리드 스크롤 + Node/Storyboard 토글 항상 노출. */}
          <div className="relative min-h-0 flex-1">
            {/* key=viewMode: 전환 시 래퍼 remount 로 슬라이드 재생(#e2) — 뷰 자체도 원래 조건
                렌더로 remount 되던 구조라 추가 비용 없음. */}
            <div key={viewMode} className={cn('flex h-full min-h-0 flex-col', viewSlideClass)}>
              {viewMode === 'storyboard' ? (
                <StoryboardGridView
                  zoomLevel={storyboardZoom}
                  onZoomLevelChange={setStoryboardZoom}
                />
              ) : (
                <ReactFlowProvider>
                  <CanvasInner />
                </ReactFlowProvider>
              )}
            </div>
          </div>

          {/* Storyboard 뷰에서도 더블클릭 편집 팝업이 동작하도록 viewMode 무관 마운트 */}
          {viewMode === 'storyboard' && <DirectorNodePopup />}
        </div>

        {/* 결정 #12 완료: D-3 NodePopup이 카메라/조명/렌즈 편집을 흡수.
            우측 Inspector aside 제거됨 (D-3 마일스톤, 2026-05-25) */}
      </div>

    </div>
  )
}
