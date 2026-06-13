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
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnConnectStart,
  type OnConnectEnd,
  type XYPosition,
} from '@xyflow/react'
import { Loader2, ImageIcon, X, LayoutGrid, Boxes, Map as MapIcon, Lock, Unlock } from 'lucide-react'

import { toast } from 'sonner'

import { HandoffButton } from '@/components/layout/handoff-button'
import { cn } from '@/lib/utils'

import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
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
import { CategoryEdge } from '@/features/director/canvas-edges/CategoryEdge'
import { CreatorModal } from '@/features/director/canvas-popups/CreatorModal'
import { RelationModal } from '@/features/director/canvas-popups/RelationModal'
import { DeleteConfirmModal } from '@/features/director/canvas-popups/DeleteConfirmModal'
import { DirectorNodePopup } from '@/features/director/canvas-popups/DirectorNodePopup'

const nodeTypes = {
  scene: SceneNode,
  shot: ShotNode,
  video: VideoNode,
  asset: AssetNode,
} as const

// ────────────────────────────────────────────────────────────────────────────
// MiniMap 상태창 — 숨기기/켜기 토글 + 드래그 이동 + 잠금(위치 고정).
//   ReactFlow 자식이라 MiniMap이 viewport context를 받는다. 위치는 우/하단 offset(px).
function MiniMapPanel() {
  const [visible, setVisible] = useState(true)
  const [locked, setLocked] = useState(false)
  const [pos, setPos] = useState({ right: 16, bottom: 16 })
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

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="absolute bottom-4 right-4 z-10 flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/50 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
            className="rounded p-0.5 hover:bg-accent hover:text-foreground"
          >
            {locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            title="미니맵 숨기기"
            className="rounded p-0.5 hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
      <MiniMap className="!static !m-0 !bg-transparent" pannable zoomable />
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

  const { screenToFlowPosition } = useReactFlow()

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
      openRelationModal(
        params.source,
        params.target,
        params.sourceHandle,
        params.targetHandle,
      )
    },
    [openRelationModal],
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
        onNodeClick={(_event, node) => selectNode(node.id)}
        onEdgeClick={(_event, edge) => selectEdge(edge.id)}
        onNodeDoubleClick={(_event, node) => openPopup(node.id)}
        onNodeDragStart={() => commitHistory()}
        onMove={(_, vp) => setViewport(vp)}
        snapToGrid
        snapGrid={SNAP_GRID}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView={nodes.length > 0}
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
        className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
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

  const shots = nodes.filter((n) => isShotData(n.data))
  const totalShots = shots.length
  const completedShots = shots.filter(
    (n) => isShotData(n.data) && n.data.storyboardImage?.status === 'completed',
  ).length
  const isGenerating = shots.some(
    (n) =>
      isShotData(n.data) && n.data.storyboardImage?.status === 'generating',
  )

  return (
    <div className="flex h-11 items-center justify-between border-t border-border px-4">
      <div className="flex items-center gap-4">
        {/* Node / Storyboard 토글 */}
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(['node', 'storyboard'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors duration-100',
                viewMode === mode
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {mode === 'node' ? 'Node' : 'Storyboard'}
            </button>
          ))}
        </div>

        {/* 스토리보드 일괄 생성 */}
        <button
          type="button"
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

      {/* 미사용 에셋 불러오기 — 어떤 shot도 참조 안 하는 character/world를 좌상단에 표시 (표시만) */}
      <button
        type="button"
        onClick={() => toggleUnusedAssets()}
        title="어떤 샷도 참조하지 않는 에셋을 캔버스 좌상단에 표시"
        className={cn(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors duration-100',
          showUnusedAssets
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
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
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground"
      >
        <LayoutGrid className="size-4" />
        <span>자동 정렬</span>
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export default function DirectorCanvasPage() {
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)

  // Writer Scene/Shot → Director 노드 자동 셋업 (프롬프트 + 에셋 바인딩, 스펙 §8)
  useWriterDirectorSync()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Center: Canvas (Node/Storyboard) + bottom Palette bar */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* min-h-0: flex-1이 내용 높이만큼 커져 하단 PaletteBar(토글)를
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

          <PaletteBar />
        </div>

        {/* 결정 #12 완료: D-3 NodePopup이 카메라/조명/렌즈 편집을 흡수.
            우측 Inspector aside 제거됨 (D-3 마일스톤, 2026-05-25) */}
      </div>

      <HandoffButton label="Head to Editor" targetStage="editor" />
    </div>
  )
}
