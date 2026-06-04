'use client'

import '@xyflow/react/dist/style.css'

import { useCallback, useRef, useState, type MouseEvent } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
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
import { ArrowUpRight, Loader2, ImageIcon } from 'lucide-react'
import Link from 'next/link'

import { HandoffButton } from '@/components/layout/handoff-button'
import { cn } from '@/lib/utils'

import { useDirectorCanvasStore } from '@/stores/director-canvas-store'
import {
  isShotData,
  isSceneData,
  SNAP_GRID,
} from '@/types/director-canvas'
import { StoryboardGridView } from '@/features/director/canvas-views/StoryboardGridView'
import { useWriterDirectorSync } from '@/features/director/hooks/use-writer-director-sync'

import { SceneNode } from '@/features/director/canvas-nodes/SceneNode'
import { ShotNode } from '@/features/director/canvas-nodes/ShotNode'
import { VideoNode } from '@/features/director/canvas-nodes/VideoNode'
import { CategoryEdge } from '@/features/director/canvas-edges/CategoryEdge'
import { CreatorModal } from '@/features/director/canvas-popups/CreatorModal'
import { RelationModal } from '@/features/director/canvas-popups/RelationModal'
import { DeleteConfirmModal } from '@/features/director/canvas-popups/DeleteConfirmModal'
import { DirectorNodePopup } from '@/features/director/canvas-popups/DirectorNodePopup'

const nodeTypes = {
  scene: SceneNode,
  shot: ShotNode,
  video: VideoNode,
} as const

const edgeTypes = {
  parent: CategoryEdge,
  'relates-to': CategoryEdge,
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
      })
    },
    [nodes, deleteNode],
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
        onMove={(_, vp) => setViewport(vp)}
        snapToGrid
        snapGrid={SNAP_GRID}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView={nodes.length > 0}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background gap={16} size={1} className="opacity-30" />
        <Controls className="!bg-card !border !border-border" />
        <MiniMap
          className="!bg-card !border !border-border"
          pannable
          zoomable
        />
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

function PaletteBar() {
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)
  const setViewMode = useDirectorCanvasStore((s) => s.setViewMode)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const generateAllStoryboardImages = useDirectorCanvasStore(
    (s) => s.generateAllStoryboardImages,
  )

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
      </div>

      <Link
        href="/studio/director/legacy"
        className={cn(
          'flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground',
          'opacity-50 transition-opacity hover:opacity-100',
        )}
        title="결정 #12: 단계적 마이그레이션 — 검증 종료 후 제거"
      >
        <span>Legacy view</span>
        <ArrowUpRight className="size-3" />
      </Link>
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
