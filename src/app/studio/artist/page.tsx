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
} from '@xyflow/react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useCanvasStore, type NodeKind } from '@/stores/canvas-store'
import { ActorNode } from '@/features/artist/nodes/ActorNode'
import { WorldNode } from '@/features/artist/nodes/WorldNode'
import { StatusNode } from '@/features/artist/nodes/StatusNode'
import { CategoryEdge } from '@/features/artist/edges/CategoryEdge'
import { NodePopup } from '@/features/artist/popups/NodePopup'
import { RelationModal } from '@/features/artist/popups/RelationModal'
import { BranchOptionModal } from '@/features/artist/popups/BranchOptionModal'
import { DeleteConfirmModal } from '@/features/artist/popups/DeleteConfirmModal'

const nodeTypes = {
  actor: ActorNode,
  world: WorldNode,
  status: StatusNode,
} as const

const edgeTypes = {
  parent: CategoryEdge,
  'in-world': CategoryEdge,
  references: CategoryEdge,
} as const

const SNAP_GRID: [number, number] = [16, 16]

function CanvasInner() {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const addNode = useCanvasStore((s) => s.addNode)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const deleteEdge = useCanvasStore((s) => s.deleteEdge)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const openPopup = useCanvasStore((s) => s.openPopup)

  const { screenToFlowPosition } = useReactFlow()

  const [creatorOpen, setCreatorOpen] = useState(false)
  const [creatorPosition, setCreatorPosition] = useState<{
    x: number
    y: number
  } | null>(null)

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, nodes)
      useCanvasStore.setState({ nodes: next as typeof nodes })
      changes.forEach((c) => {
        if (c.type === 'remove') deleteNode(c.id)
      })
    },
    [nodes, deleteNode],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const next = applyEdgeChanges(changes, edges)
      useCanvasStore.setState({ edges: next as typeof edges })
      changes.forEach((c) => {
        if (c.type === 'remove') deleteEdge(c.id)
      })
    },
    [edges, deleteEdge],
  )

  const openRelationModal = useCanvasStore((s) => s.openRelationModal)
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

      // Drop on empty → Branch Status node at drop position
      const native = event as unknown as { clientX?: number; clientY?: number }
      const position = screenToFlowPosition({
        x: native.clientX ?? 0,
        y: native.clientY ?? 0,
      })
      const newId = useCanvasStore.getState().branchStatus(sourceId)
      if (newId) {
        useCanvasStore.setState((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === newId ? { ...n, position } : n,
          ),
        }))
      }
    },
    [screenToFlowPosition],
  )

  const onPaneDoubleClick = useCallback(
    (event: MouseEvent) => {
      // Only fire on the pane background, not on nodes/handles/buttons
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

  const createNode = (kind: NodeKind) => {
    if (!creatorPosition) return
    addNode(kind, creatorPosition)
    setCreatorOpen(false)
    setCreatorPosition(null)
  }

  return (
    <>
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
          useCanvasStore.getState().selectNode(null)
          useCanvasStore.getState().selectEdge(null)
        }}
        onNodeDoubleClick={(_event, node) => {
          openPopup(node.id)
        }}
        onDoubleClick={onPaneDoubleClick}
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
            캔버스를 더블클릭해서 첫 노드를 만들어 보세요.
          </div>
        </div>
      )}

      <Dialog
        open={creatorOpen}
        onOpenChange={(open) => {
          setCreatorOpen(open)
          if (!open) setCreatorPosition(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 노드 만들기</DialogTitle>
            <DialogDescription>
              어떤 종류의 노드를 만들까요?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              onClick={() => createNode('actor')}
              className={cn(
                'group flex flex-col items-center gap-2 rounded-lg border border-chart-1/60 bg-card p-4 transition-colors hover:bg-accent',
              )}
            >
              <span className="h-3 w-3 rounded-full bg-chart-1" />
              <span className="text-sm font-medium">Actor</span>
              <span className="text-xs text-muted-foreground">캐릭터</span>
            </button>
            <button
              onClick={() => createNode('world')}
              className="group flex flex-col items-center gap-2 rounded-lg border border-chart-2/60 bg-card p-4 transition-colors hover:bg-accent"
            >
              <span className="h-3 w-3 rounded-full bg-chart-2" />
              <span className="text-sm font-medium">World</span>
              <span className="text-xs text-muted-foreground">장소/환경</span>
            </button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreatorOpen(false)}
              size="sm"
            >
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Popups / Modals */}
      <NodePopup />
      <RelationModal />
      <BranchOptionModal />
      <DeleteConfirmModal />
    </>
  )
}

export default function ConceptCanvasPage() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="relative flex-1">
          <ReactFlowProvider>
            <CanvasInner />
          </ReactFlowProvider>
        </div>

        <div className="flex h-9 items-center border-t border-border px-4 text-xs text-muted-foreground">
          <span className="opacity-50">Palette (coming soon)</span>
        </div>
      </div>

      <aside className="flex w-9 flex-col items-center border-l border-border bg-card">
        <span
          className="mt-4 text-xs text-muted-foreground opacity-50 [writing-mode:vertical-rl]"
          aria-label="Storage tab disabled"
        >
          Storage (coming soon)
        </span>
      </aside>
    </div>
  )
}
