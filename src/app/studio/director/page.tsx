'use client'

import '@xyflow/react/dist/style.css'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
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
  type XYPosition,
} from '@xyflow/react'
import { Loader2, ImageIcon, X, LayoutGrid, Boxes, Map as MapIcon, Lock, Unlock, Type } from 'lucide-react'

import { toast } from 'sonner'

import { HandoffButton } from '@/components/layout/handoff-button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { getDirectorGaps, summarizeGaps } from '@/lib/completeness'
import {
  usePresetStorageStore,
  type CameraLightPreset,
} from '@/stores/preset-storage-store'
import {
  isShotData,
  isSceneData,
  SNAP_GRID,
} from '@/types/director'
import { StoryboardGridView } from '@/features/director/canvas-views/StoryboardGridView'
import { useWriterDirectorSync } from '@/features/director/hooks/use-writer-director-sync'

import { SceneNode } from '@/features/director/canvas-nodes/SceneNode'
import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { AssetNode } from '@/features/director/canvas-nodes/AssetNode'
import { PromptNode } from '@/features/director/canvas-nodes/PromptNode'
import { CategoryEdge } from '@/features/director/canvas-edges/CategoryEdge'
import { CreatorModal } from '@/features/director/canvas-popups/CreatorModal'
import { RelationModal } from '@/features/director/canvas-popups/RelationModal'
import { DeleteConfirmModal } from '@/features/director/canvas-popups/DeleteConfirmModal'
import { DirectorNodePopup } from '@/features/director/canvas-popups/DirectorNodePopup'
import { DirectorDetailPanel } from '@/features/director/canvas-panels/DirectorDetailPanel'
import {
  doubleClickActionForKind,
  connectRouteForTargetHandle,
} from '@/features/director/canvas-interaction'

const nodeTypes = {
  scene: SceneNode,
  shot: ShotNode,
  video: VideoNode,
  asset: AssetNode,
  prompt: PromptNode,
} as const

// ────────────────────────────────────────────────────────────────────────────
// MiniMap 상태창 — 숨기기/켜기 토글 + 드래그 이동 + 잠금(위치 고정).
//   ReactFlow 자식이라 MiniMap이 viewport context를 받는다. 위치는 우/하단 offset(px).
function MiniMapPanel() {
  const [visible, setVisible] = useState(true)
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

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="absolute bottom-4 right-4 z-10 flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/50 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground hover-red-beam"
      >
        <MapIcon className="size-3.5" />
        미니맵
      </button>
    )
  }

  return (
    <div
      className="absolute z-10 overflow-hidden rounded-lg border border-border bg-card/50"
      style={{ right: pos.right, bottom: pos.bottom }}
    >
      {/* 크기 조절 핸들 — 좌상단 코너(앵커가 우하단). 드래그로 미니맵 크기 조절 */}
      <div
        onPointerDown={onResizePointerDown}
        title="크기 조절 (드래그)"
        className="absolute left-0 top-0 z-30 size-3.5 cursor-nwse-resize rounded-tl-lg transition-colors hover:bg-primary/30"
        style={{ touchAction: 'none' }}
      />
      <div
        onPointerDown={onHeaderPointerDown}
        className={cn(
          'flex h-6 items-center justify-between border-b border-border/60 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground',
          locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        )}
      >
        <span>미니맵</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setLocked((v) => !v)}
            title={locked ? '위치 잠금 해제' : '위치 잠금'}
            className="rounded p-0.5 hover:bg-accent hover:text-foreground hover-red-beam"
          >
            {locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            title="미니맵 숨기기"
            className="rounded p-0.5 hover:bg-accent hover:text-foreground hover-red-beam"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
      <div style={{ width: size.w, height: size.h }}>
        <MiniMap
          className="!static !m-0 !h-full !w-full !bg-transparent"
          pannable
          zoomable
        />
      </div>
    </div>
  )
}

const edgeTypes = {
  parent: CategoryEdge,
  'relates-to': CategoryEdge,
  references: CategoryEdge,
} as const

// ────────────────────────────────────────────────────────────────────────────

function CanvasInner() {
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const edges = useDirectorCanvasStore((s) => s.edges)
  const deleteNode = useDirectorCanvasStore((s) => s.deleteNode)
  const deleteEdge = useDirectorCanvasStore((s) => s.deleteEdge)
  const setViewport = useDirectorCanvasStore((s) => s.setViewport)
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  const openRelationModal = useDirectorCanvasStore((s) => s.openRelationModal)
  const wirePromptToShot = useDirectorCanvasStore((s) => s.wirePromptToShot)
  const addShotNode = useDirectorCanvasStore((s) => s.addShotNode)
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

  // undo/redo 키보드 — Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y 또는 Ctrl/Cmd+Shift+Z = redo.
  //   입력 필드(input/textarea)에서는 브라우저 텍스트 편집 undo를 우선해 무시.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // 누락 감지 넛지 (chat-proactive-copilot Phase 4): 캔버스가 안정되면(2s) 채워두면 좋을
  //   항목(샷의 캐릭터·배경 참조 누락 / 스토리보드 미생성)을 1회 informational 제안. 생성 트리거 X.
  const gapNudgeRef = useRef<string | null>(null)
  useEffect(() => {
    if (!directorProjectId || nodes.length === 0) return
    if (gapNudgeRef.current === directorProjectId) return
    const gaps = getDirectorGaps(nodes)
    if (gaps.length === 0) return
    const t = setTimeout(() => {
      gapNudgeRef.current = directorProjectId
      offerSuggestion({
        id: `director-gaps-${directorProjectId}`,
        stage: 'director',
        content: `채워두면 좋을 항목이 ${gaps.length}건 있어요:\n${summarizeGaps(gaps)}`,
        action: null,
      })
    }, 2000)
    return () => clearTimeout(t)
  }, [directorProjectId, nodes, offerSuggestion])

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
    // 최초 진입(#e9): 전체 fitView(정중앙)로 시작한 뒤 가장 왼쪽 Scene(Scene 1)으로
    //   수평 팬 애니메이션. 종료 뷰포트를 store에 저장해 재진입 복원 기준점으로 삼는다.
    void (async () => {
      await fitView()
      const scenes = useDirectorCanvasStore
        .getState()
        .nodes.filter((n) => n.data.kind === 'scene')
      if (scenes.length === 0) {
        useDirectorCanvasStore.setState({
          viewport: getViewport(),
          viewportInitialized: true,
        })
        return
      }
      const first = scenes.reduce((a, b) =>
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

  const [creatorOpen, setCreatorOpen] = useState(false)
  const [creatorPosition, setCreatorPosition] = useState<XYPosition | null>(
    null,
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, nodes)
      useDirectorCanvasStore.setState({ nodes: next as typeof nodes })
      changes.forEach((c) => {
        if (c.type === 'remove') deleteNode(c.id)
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
      const next = applyEdgeChanges(changes, edges)
      useDirectorCanvasStore.setState({ edges: next as typeof edges })
      changes.forEach((c) => {
        if (c.type === 'remove') deleteEdge(c.id)
      })
    },
    [edges, deleteEdge],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      // Prompt 노드 출력(right) → Shot T 입력(prompt) 연결이면 와이어링 + prompt 동기
      if (connectRouteForTargetHandle(params.targetHandle) === 'prompt-wire') {
        wirePromptToShot(params.source, params.target)
        return
      }
      openRelationModal(
        params.source,
        params.target,
        params.sourceHandle,
        params.targetHandle,
      )
    },
    [openRelationModal, wirePromptToShot],
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

      if (isSceneData(sourceNode.data)) {
        const newId = addShotNode(sourceId, position)
        if (newId) selectNode(newId)
      } else if (isShotData(sourceNode.data)) {
        const newId = addVideoTake(sourceId, position)
        if (newId) selectNode(newId)
      }
      // Video는 자식 없음 — 빈 공간 drop은 무시
    },
    [screenToFlowPosition, addShotNode, addVideoTake, selectNode],
  )

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
      setCreatorPosition(position)
      setCreatorOpen(true)
    },
    [screenToFlowPosition],
  )

  return (
    // B-D1 fix: wrapper div에 onDoubleClick 등록해 ReactFlow 내부 처리와 독립적으로 캡처
    <div
      className="relative h-full w-full"
      onDoubleClick={onPaneDoubleClick}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
        }}
        // 단일클릭 커스텀 액션(onNodeClick) 제거(#e2) — RF 기본 선택(하이라이트·툴바)만 유지
        onEdgeClick={(_event, edge) => selectEdge(edge.id)}
        onNodeDoubleClick={(_event, node) => {
          // Storyboard 뷰 더블클릭과 동일(#e2): scene/shot/video 모두 모달 열기
          const action = doubleClickActionForKind(node.data.kind)
          if (action === 'popup') openPopup(node.id)
        }}
        onNodeDragStart={() => commitHistory()}
        onMove={(_, vp) => setViewport(vp)}
        snapToGrid
        snapGrid={SNAP_GRID}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={['Backspace', 'Delete']}
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
        className="bg-background"
      >
        <Background gap={16} size={1} className="opacity-30" />
        <Controls className="!border !border-border" />
        <MiniMapPanel />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center text-sm text-muted-foreground">
            Writer에서 씬을 먼저 만들면 자동으로 들어와요.
            <div className="mt-1 text-xs opacity-70">
              또는 캔버스를 더블클릭해서 직접 Scene을 만들 수 있어요.
            </div>
          </div>
        </div>
      )}

      <CreatorModal
        open={creatorOpen}
        position={creatorPosition}
        onClose={() => {
          setCreatorOpen(false)
          setCreatorPosition(null)
        }}
      />
      <RelationModal />
      <DeleteConfirmModal />
      <DirectorNodePopup />
      <DirectorDetailPanel />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

const PRESET_DND_TYPE = 'application/preset-id'

function PresetCard({ preset }: { preset: CameraLightPreset }) {
  const deletePreset = usePresetStorageStore((s) => s.deletePreset)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(PRESET_DND_TYPE, preset.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      title="노드 위로 드래그해 카메라/조명/렌즈 셋업 적용"
      className={cn(
        'group flex h-7 shrink-0 cursor-grab items-center gap-1 rounded-md border border-border px-2',
        'bg-card text-xs text-foreground active:cursor-grabbing',
        'transition-colors duration-100 hover:bg-accent',
      )}
    >
      <span className="max-w-[10rem] truncate">{preset.name}</span>
      <button
        type="button"
        onClick={() => void deletePreset(preset.id)}
        aria-label="프리셋 삭제"
        className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 hover-red-beam"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

function PresetStrip() {
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const presets = usePresetStorageStore((s) => s.presets)
  const loadPresets = usePresetStorageStore((s) => s.loadPresets)

  useEffect(() => {
    if (projectId) void loadPresets(projectId)
  }, [projectId, loadPresets])

  if (presets.length === 0) return null

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        프리셋
      </span>
      {presets.map((p) => (
        <PresetCard key={p.id} preset={p} />
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function PaletteBar() {
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)
  const setViewMode = useDirectorCanvasStore((s) => s.setViewMode)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const generateAllStoryboardImages = useDirectorCanvasStore(
    (s) => s.generateAllStoryboardImages,
  )
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
  const isGenerating = shots.some(
    (n) =>
      isShotData(n.data) && n.data.storyboardImage?.status === 'generating',
  )

  // 상단 이동(#e1 2026-07-13): 하단 border-t 바 → 캔버스 위 border-b 바.
  //   Node/Storyboard 토글은 artist 탭(Characters/World/Inventory)과 동일한 TabsList 스타일.
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <div className="flex items-center gap-3">
        {/* Node / Storyboard 토글 */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'node' | 'storyboard')}>
          <TabsList>
            <TabsTrigger value="node">Node</TabsTrigger>
            <TabsTrigger value="storyboard">Storyboard</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 스토리보드 일괄 생성 */}
        <button
          type="button"
          title="러프 스토리보드를 실제 촬영 이미지 스토리보드로 한번에 생성할 수 있어요"
          onClick={() => {
            // #2: 이미 모두 생성됐으면 재생성 대신 알림.
            const shots = nodes.filter((n) => isShotData(n.data))
            const pending = shots.filter(
              (n) =>
                isShotData(n.data) &&
                n.data.storyboardImage?.status !== 'completed',
            )
            if (shots.length > 0 && pending.length === 0) {
              toast.info('이미 모든 스토리보드가 생성되어 있습니다.', {
                description: '개별 재생성은 샷을 더블클릭해서 진행하세요.',
              })
              return
            }
            void generateAllStoryboardImages()
          }}
          disabled={isGenerating || totalShots === 0}
          aria-busy={isGenerating}
          className={cn(
            'flex h-8 items-center gap-2 rounded-md border border-border px-3',
            'text-xs font-medium text-foreground',
            'transition-colors duration-100 hover:bg-accent',
            (isGenerating || totalShots === 0) &&
              'cursor-not-allowed opacity-50',
            isGenerating && 'opacity-70',
            'hover-red-beam',
          )}
        >
          {isGenerating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImageIcon className="size-4" />
          )}
          <span>스토리보드 생성</span>
          {totalShots > 0 && (
            <span className="font-mono tabular-nums text-muted-foreground">
              {completedShots}/{totalShots}
            </span>
          )}
        </button>

        <PresetStrip />
      </div>

      {/* 캔버스 전용 액션 3종 — Node 탭에서만 표시, 오른쪽 정렬(#e2 2026-07-13) */}
      {viewMode === 'node' && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* 미사용 에셋 불러오기 — 씬마다 그 씬이 참조 안 하는 등록 에셋도 좌측 컬럼에 표시(표시만) */}
          <button
            type="button"
            onClick={() => toggleUnusedAssets()}
            title="씬마다 해당 씬이 참조하지 않는 등록 에셋도 좌측 에셋 컬럼에 표시"
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors duration-100',
              showUnusedAssets
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              'hover-red-beam',
            )}
          >
            <Boxes className="size-4" />
            <span>{showUnusedAssets ? '미사용 에셋 숨기기' : '미사용 에셋 불러오기'}</span>
          </button>

          {/* 노드 자동 정렬 — asset·scene·shot·video를 다이어그램 레이아웃으로 재배치 (DB 반영) */}
          <button
            type="button"
            onClick={() => relayoutCanvas()}
            title="에셋·씬·샷·영상을 좌→우 레이아웃으로 정렬하고 간격을 확보 (DB 저장)"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground hover-red-beam"
          >
            <LayoutGrid className="size-4" />
            <span>자동 정렬</span>
          </button>

          {/* 프롬프트 노드 추가 — Higgsfield식 분리 프롬프트(우측 핸들을 Shot T 입력에 연결) */}
          <button
            type="button"
            onClick={() =>
              addPromptNode({ x: 80, y: 120 + promptCount * 180 })
            }
            title="분리된 프롬프트 노드를 추가합니다. 우측 핸들을 Shot의 T 입력에 연결하면 Shot 프롬프트가 동기됩니다."
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground hover-red-beam"
          >
            <Type className="size-4" />
            <span>프롬프트 노드</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export default function DirectorCanvasPage() {
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)
  const guideProjectId = useDirectorCanvasStore((s) => s.projectId)
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  // 프로젝트 init(resetChildStores)이 끝나기 전에 올린 제안은 reset()에 지워진다 —
  //   스테이지 동기 + init 완료 후에만 발화.
  const stageReady = useProjectStore(
    (s) => s.currentStage === 'director' && !s.initLoading,
  )

  // Writer Scene/Shot → Director 노드 자동 셋업 (프롬프트 + 에셋 바인딩, 스펙 §8)
  useWriterDirectorSync()

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
          ? '씬별 샷 이미지를 한눈에 보는 스토리보드예요.\n\n' +
            '· "이미지 생성 필요" 카드는 아직 러프 상태예요\n' +
            '· 카드의 "영상 생성"을 누르면 이미지부터 영상까지 이어서 만들어요\n' +
            '· 카드를 더블클릭하면 상세 편집이 열려요'
          : '여기는 The Set — 촬영장이에요. 씬 → 샷 → 영상이 노드로 이어져 있어요.\n\n' +
            '· 카드를 더블클릭하면 상세 편집이 열려요\n' +
            '· 샷 카드를 선택하면 위에 이미지 생성 버튼이 떠요\n' +
            '· 상단 "스토리보드 생성"으로 모든 샷을 한 번에 실사화할 수 있어요',
    })
  }, [guideProjectId, viewMode, stageReady, offerSuggestion])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 스테이지 헤더(#e1 2026-07-14) — 다른 탭(writer/artist)과 동일한 제목+설명 구조 */}
      <div className="shrink-0 border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">The Set</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          러프 스토리보드와 등장인물, 월드를 바탕으로 실제 이미지/영상으로 촬영을 시작하세요
        </p>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Center: top Palette bar(#e1 — 하단→상단 이동) + Canvas (Node/Storyboard) */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <PaletteBar />

          {/* min-h-0: flex-1이 내용 높이만큼 커져 PaletteBar(토글)를
              밀어내고 StoryboardGridView의 overflow-auto가 안 걸리던 문제 수정.
              이걸로 storyboard 그리드 스크롤 + Node/Storyboard 토글 항상 노출. */}
          <div className="relative min-h-0 flex-1">
            {viewMode === 'storyboard' ? (
              <StoryboardGridView />
            ) : (
              <ReactFlowProvider>
                <CanvasInner />
              </ReactFlowProvider>
            )}
          </div>

          {/* Storyboard 뷰에서도 더블클릭 편집 팝업이 동작하도록 viewMode 무관 마운트 */}
          {viewMode === 'storyboard' && <DirectorNodePopup />}
        </div>

        {/* 결정 #12 완료: D-3 NodePopup이 카메라/조명/렌즈 편집을 흡수.
            우측 Inspector aside 제거됨 (D-3 마일스톤, 2026-05-25) */}
      </div>

      <HandoffButton label="Head to Editor" targetStage="editor" />
    </div>
  )
}
