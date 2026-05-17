import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Node, Edge, XYPosition } from '@xyflow/react'

// ============================================================================
// Types — see specs/data/canvas_data_model.md
// ============================================================================

export type NodeKind = 'actor' | 'world' | 'status'
export type OutputMode = 'single' | 'five-view' | 'sixteen-angle'
export type EdgeCategory = 'parent' | 'in-world' | 'references'
export type ModelId = 'imagen' | 'h100-self'

export type FiveViewKey = 'front' | 'left' | 'right' | 'back' | 'detail'

export type GeneratedImage = {
  id: string
  url: string
  prompt: string
  seed?: number
  angle?: number
  view?: FiveViewKey
  modelId: ModelId
  createdAt: number
}

export type ReferenceImage = {
  id: string
  url: string
  uploadedAt: number
}

export type Registration = {
  registeredId: string
  name: string
  alias: string
  background: string
  description: string
  registeredAt: number
}

export type NodeData = {
  kind: NodeKind
  label: string
  prompt: string
  referenceImages: ReferenceImage[]
  outputMode: OutputMode
  generatedImages: GeneratedImage[]
  modelId: ModelId
  stale: boolean
  motherId: string | null
  registered: Registration | null
  [key: string]: unknown // React Flow generic constraint
}

export type EdgeData = {
  category: EdgeCategory
  relationText: string
  [key: string]: unknown
}

export type CanvasNode = Node<NodeData, NodeKind>
export type CanvasEdge = Edge<EdgeData, EdgeCategory>

const newId = (prefix: 'n' | 'e' | 'i' | 'r') =>
  `${prefix}_${crypto.randomUUID()}`

type Variant = { prompt: string; view?: FiveViewKey; angle?: number }

function buildVariants(
  mode: OutputMode,
  basePrompt: string,
): Variant[] {
  if (mode === 'single') {
    return [{ prompt: basePrompt }]
  }
  if (mode === 'five-view') {
    const specs: { view: FiveViewKey; suffix: string }[] = [
      { view: 'front', suffix: ', front view, full body, centered, neutral pose' },
      { view: 'left', suffix: ', side profile from the left, full body, neutral pose' },
      { view: 'right', suffix: ', side profile from the right, full body, neutral pose' },
      { view: 'back', suffix: ', back view, full body, neutral pose' },
      { view: 'detail', suffix: ', close-up detail shot, face and upper body' },
    ]
    return specs.map((s) => ({
      prompt: `${basePrompt}${s.suffix}`,
      view: s.view,
    }))
  }
  // sixteen-angle: 0, 22.5, ..., 337.5 (16 evenly spaced rotations)
  return Array.from({ length: 16 }, (_, i) => {
    const angle = i * 22.5
    return {
      prompt: `${basePrompt}, camera angle: ${angle} degrees rotation around subject, full body, neutral pose, consistent lighting`,
      angle,
    }
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('blob → dataUrl 변환 실패'))
    reader.readAsDataURL(blob)
  })
}

function makeMockImage(opts: {
  prompt: string
  modelId: ModelId
  seed: number
  color: string
  label: string
  view?: FiveViewKey
  angle?: number
}): GeneratedImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="${opts.color}"/><text x="128" y="128" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="monospace" font-size="22">${opts.label}</text></svg>`
  return {
    id: newId('i'),
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    prompt: opts.prompt,
    seed: opts.seed,
    view: opts.view,
    angle: opts.angle,
    modelId: opts.modelId,
    createdAt: Date.now(),
  }
}

// ============================================================================
// Store
// ============================================================================

const REGISTRATION_IMAGE_THRESHOLD = 20
const BRANCH_OFFSET_X = 320 // node width + gap; snap-aware

type RegistrationInput = Omit<
  Registration,
  'registeredId' | 'registeredAt'
>

type RelationModalState = {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
} | null

interface CanvasState {
  // graph
  nodes: CanvasNode[]
  edges: CanvasEdge[]

  // UI state (not persisted across reloads — see partialize)
  selectedNodeId: string | null
  selectedEdgeId: string | null
  viewport: { x: number; y: number; zoom: number }

  // popup / modal state
  popupNodeId: string | null
  branchModalNodeId: string | null
  deleteConfirmNodeId: string | null
  relationModal: RelationModalState

  // generation state — which nodes are currently calling image API
  generatingNodeIds: Record<string, boolean>
  generationErrors: Record<string, string>

  // persistence meta
  projectId: string
  lastSavedAt: number

  // ---------- actions ----------
  setProjectId: (projectId: string) => void
  setViewport: (vp: { x: number; y: number; zoom: number }) => void

  // node lifecycle
  addNode: (kind: NodeKind, position: XYPosition, label?: string) => string
  updateNodeData: (id: string, patch: Partial<NodeData>) => void
  deleteNode: (id: string) => void
  duplicateNode: (id: string) => string | null
  branchStatus: (motherId: string) => string | null

  // edge lifecycle
  addEdge: (
    source: string,
    target: string,
    data: EdgeData,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => string | null
  updateEdge: (id: string, patch: Partial<EdgeData>) => void
  deleteEdge: (id: string) => void

  // output mode / images
  setOutputMode: (id: string, mode: OutputMode) => void
  appendGeneratedImages: (id: string, images: GeneratedImage[]) => void

  // propagation
  propagateStale: (rootId: string) => void
  clearStale: (id: string) => void

  // registration
  registerCharacter: (
    id: string,
    input: RegistrationInput,
  ) => string | null

  // selection
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void

  // popups / modals
  openPopup: (id: string) => void
  closePopup: () => void
  openBranchModal: (id: string) => void
  closeBranchModal: () => void
  openDeleteConfirm: (id: string) => void
  closeDeleteConfirm: () => void
  openRelationModal: (
    source: string,
    target: string,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => void
  closeRelationModal: () => void

  // mock image generation (P10-3) — for offline / fallback
  generateMockImages: (id: string) => void
  // real image generation — calls /api/generate/image (P10-6)
  generateImages: (id: string) => Promise<void>

  // agentic — P10-5
  applyUpdates: (updates: CanvasUpdate[]) => CanvasUpdateResult

  reset: () => void
}

// ============================================================================
// Agent Actions — see specs/data/canvas_data_model.md §6
// ============================================================================

export type CanvasUpdate =
  | {
      type: 'addNode'
      kind: NodeKind
      label?: string
      prompt?: string
      position?: { x: number; y: number }
      tempId?: string
    }
  | {
      type: 'updateNode'
      id: string
      patch: Partial<
        Pick<NodeData, 'label' | 'prompt' | 'modelId' | 'outputMode'>
      >
    }
  | {
      type: 'connect'
      sourceId: string
      targetId: string
      category: EdgeCategory
      relationText?: string
    }
  | { type: 'setOutputMode'; id: string; mode: OutputMode }
  | { type: 'generate'; id: string }
  | {
      type: 'branchStatus'
      motherId: string
      label?: string
      prompt?: string
      tempId?: string
    }
  | { type: 'duplicateNode'; id: string; tempId?: string }
  | { type: 'requestDelete'; id: string; reason?: string }
  | {
      type: 'requestRegister'
      id: string
      suggestedName?: string
      suggestedAlias?: string
      suggestedBackground?: string
      suggestedDescription?: string
    }
  | { type: 'selectNode'; id: string }

export type CanvasUpdateResult = {
  applied: number
  skipped: { update: CanvasUpdate; reason: string }[]
}

const initialNodes: CanvasNode[] = []
const initialEdges: CanvasEdge[] = []

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
      nodes: initialNodes,
      edges: initialEdges,
      selectedNodeId: null,
      selectedEdgeId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      popupNodeId: null,
      branchModalNodeId: null,
      deleteConfirmNodeId: null,
      relationModal: null,
      generatingNodeIds: {},
      generationErrors: {},
      projectId: 'default',
      lastSavedAt: Date.now(),

      setProjectId: (projectId) => set({ projectId }),

      setViewport: (vp) => set({ viewport: vp }),

      addNode: (kind, position, label) => {
        const id = newId('n')
        const node: CanvasNode = {
          id,
          type: kind,
          position,
          data: {
            kind,
            label:
              label ??
              (kind === 'actor'
                ? 'New Actor'
                : kind === 'world'
                  ? 'New World'
                  : 'New Status'),
            prompt: '',
            referenceImages: [],
            outputMode: 'single',
            generatedImages: [],
            modelId: 'imagen',
            stale: false,
            motherId: null,
            registered: null,
          },
        }
        set((s) => ({ nodes: [...s.nodes, node], lastSavedAt: Date.now() }))
        return id
      },

      updateNodeData: (id, patch) => {
        const prev = get().nodes.find((n) => n.id === id)
        if (!prev) return
        const promptChanged =
          'prompt' in patch && patch.prompt !== prev.data.prompt

        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
          ),
          lastSavedAt: Date.now(),
        }))

        if (promptChanged) {
          get().propagateStale(id)
        }
      },

      deleteNode: (id) => {
        const node = get().nodes.find((n) => n.id === id)
        if (!node) return

        // Find direct Status children (motherId === id) → cascade
        const statusChildrenIds = get()
          .nodes.filter((n) => n.data.motherId === id)
          .map((n) => n.id)

        // Find incident edges to remove
        const idsToRemove = new Set<string>([id, ...statusChildrenIds])

        set((s) => ({
          nodes: s.nodes.filter((n) => !idsToRemove.has(n.id)),
          edges: s.edges.filter(
            (e) => !idsToRemove.has(e.source) && !idsToRemove.has(e.target),
          ),
          selectedNodeId:
            s.selectedNodeId && idsToRemove.has(s.selectedNodeId)
              ? null
              : s.selectedNodeId,
          lastSavedAt: Date.now(),
        }))
      },

      duplicateNode: (id) => {
        const source = get().nodes.find((n) => n.id === id)
        if (!source) return null
        const newNodeId = newId('n')
        const dup: CanvasNode = {
          ...source,
          id: newNodeId,
          position: {
            x: source.position.x + BRANCH_OFFSET_X,
            y: source.position.y,
          },
          data: {
            ...source.data,
            label: `${source.data.label} (copy)`,
            generatedImages: [],
            stale: false,
            motherId: null, // independent child — no mother link
            registered: null,
          },
        }
        const parentEdge: CanvasEdge = {
          id: newId('e'),
          source: id,
          target: newNodeId,
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'parent',
          data: { category: 'parent', relationText: '' },
        }
        set((s) => ({
          nodes: [...s.nodes, dup],
          edges: [...s.edges, parentEdge],
          lastSavedAt: Date.now(),
        }))
        return newNodeId
      },

      branchStatus: (motherId) => {
        const mother = get().nodes.find((n) => n.id === motherId)
        if (!mother) return null
        if (mother.data.kind === 'status') {
          // Status cannot directly mother another status in MVP
          return null
        }
        const statusId = newId('n')
        const statusNode: CanvasNode = {
          id: statusId,
          type: 'status',
          position: {
            x: mother.position.x + BRANCH_OFFSET_X,
            y: mother.position.y + 80,
          },
          data: {
            kind: 'status',
            label: `${mother.data.label} — variant`,
            prompt: '',
            referenceImages: [],
            outputMode: mother.data.outputMode,
            generatedImages: [],
            modelId: mother.data.modelId,
            stale: false,
            motherId,
            registered: null,
          },
        }
        const parentEdge: CanvasEdge = {
          id: newId('e'),
          source: motherId,
          target: statusId,
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'parent',
          data: { category: 'parent', relationText: '' },
        }
        set((s) => ({
          nodes: [...s.nodes, statusNode],
          edges: [...s.edges, parentEdge],
          lastSavedAt: Date.now(),
        }))
        return statusId
      },

      addEdge: (source, target, data, sourceHandle, targetHandle) => {
        if (source === target) return null
        const exists = get().edges.find(
          (e) => e.source === source && e.target === target,
        )
        if (exists) return null
        const id = newId('e')
        const edge: CanvasEdge = {
          id,
          source,
          target,
          sourceHandle: sourceHandle ?? undefined,
          targetHandle: targetHandle ?? undefined,
          type: data.category,
          data,
        }
        set((s) => ({ edges: [...s.edges, edge], lastSavedAt: Date.now() }))
        return id
      },

      updateEdge: (id, patch) => {
        set((s) => ({
          edges: s.edges.map((e) =>
            e.id === id
              ? {
                  ...e,
                  data: { ...(e.data ?? {}), ...patch } as EdgeData,
                  type: (patch.category ?? e.type) as EdgeCategory,
                }
              : e,
          ),
          lastSavedAt: Date.now(),
        }))
      },

      deleteEdge: (id) => {
        set((s) => ({
          edges: s.edges.filter((e) => e.id !== id),
          selectedEdgeId:
            s.selectedEdgeId === id ? null : s.selectedEdgeId,
          lastSavedAt: Date.now(),
        }))
      },

      setOutputMode: (id, mode) => {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, outputMode: mode } } : n,
          ),
          lastSavedAt: Date.now(),
        }))
      },

      appendGeneratedImages: (id, images) => {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    generatedImages: [...n.data.generatedImages, ...images],
                  },
                }
              : n,
          ),
          lastSavedAt: Date.now(),
        }))
      },

      propagateStale: (rootId) => {
        // BFS through parent-category outgoing edges
        const { nodes, edges } = get()
        const childrenMap = new Map<string, string[]>()
        edges.forEach((e) => {
          if (e.data?.category === 'parent') {
            const arr = childrenMap.get(e.source) ?? []
            arr.push(e.target)
            childrenMap.set(e.source, arr)
          }
        })

        const queue = [...(childrenMap.get(rootId) ?? [])]
        const seen = new Set<string>()
        const toMark: string[] = []
        while (queue.length) {
          const cur = queue.shift()!
          if (seen.has(cur)) continue
          seen.add(cur)
          toMark.push(cur)
          const next = childrenMap.get(cur) ?? []
          queue.push(...next)
        }
        if (toMark.length === 0) return

        const markSet = new Set(toMark)
        set((s) => ({
          nodes: s.nodes.map((n) =>
            markSet.has(n.id) ? { ...n, data: { ...n.data, stale: true } } : n,
          ),
          lastSavedAt: Date.now(),
        }))

        // Status nodes: also recursively mark since their effective prompt depends on mother chain
        // (already covered by the BFS above)
        void nodes
      },

      clearStale: (id) => {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, stale: false } } : n,
          ),
          lastSavedAt: Date.now(),
        }))
      },

      registerCharacter: (id, input) => {
        const node = get().nodes.find((n) => n.id === id)
        if (!node) return null
        const totalImages = countImagesInSubtree(get(), id)
        if (totalImages < REGISTRATION_IMAGE_THRESHOLD) return null

        const registeredId = newId('r')
        const registration: Registration = {
          registeredId,
          ...input,
          registeredAt: Date.now(),
        }
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, registered: registration } }
              : n,
          ),
          lastSavedAt: Date.now(),
        }))
        return registeredId
      },

      selectNode: (id) =>
        set({ selectedNodeId: id, selectedEdgeId: id ? null : null }),
      selectEdge: (id) =>
        set({ selectedEdgeId: id, selectedNodeId: id ? null : null }),

      openPopup: (id) => set({ popupNodeId: id }),
      closePopup: () => set({ popupNodeId: null }),
      openBranchModal: (id) => set({ branchModalNodeId: id }),
      closeBranchModal: () => set({ branchModalNodeId: null }),
      openDeleteConfirm: (id) => set({ deleteConfirmNodeId: id }),
      closeDeleteConfirm: () => set({ deleteConfirmNodeId: null }),
      openRelationModal: (source, target, sourceHandle, targetHandle) =>
        set({
          relationModal: {
            source,
            target,
            sourceHandle: sourceHandle ?? null,
            targetHandle: targetHandle ?? null,
          },
        }),
      closeRelationModal: () => set({ relationModal: null }),

      generateMockImages: (id) => {
        const node = get().nodes.find((n) => n.id === id)
        if (!node) return
        const { kind, outputMode, modelId } = node.data
        const baseColor =
          kind === 'actor'
            ? '#b91c1c'
            : kind === 'world'
              ? '#1d4ed8'
              : '#6b7280'
        const effectivePrompt = getEffectivePrompt(get(), id)
        const baseSeed = Math.floor(Math.random() * 1_000_000)

        const images: GeneratedImage[] = []
        if (outputMode === 'single') {
          images.push(
            makeMockImage({
              prompt: effectivePrompt,
              modelId,
              seed: baseSeed,
              color: baseColor,
              label: 'single',
            }),
          )
        } else if (outputMode === 'five-view') {
          const views: FiveViewKey[] = [
            'front',
            'left',
            'right',
            'back',
            'detail',
          ]
          views.forEach((view, i) => {
            images.push(
              makeMockImage({
                prompt: effectivePrompt,
                modelId,
                seed: baseSeed,
                color: baseColor,
                view,
                label: view,
              }),
            )
            void i
          })
        } else {
          // sixteen-angle: 0, 22.5, 45, ..., 337.5
          for (let i = 0; i < 16; i++) {
            const angle = i * 22.5
            images.push(
              makeMockImage({
                prompt: effectivePrompt,
                modelId,
                seed: baseSeed,
                color: baseColor,
                angle,
                label: `${angle}°`,
              }),
            )
          }
        }
        get().appendGeneratedImages(id, images)
        get().clearStale(id)
      },

      generateImages: async (id) => {
        const state = get()
        const node = state.nodes.find((n) => n.id === id)
        if (!node) return

        // mark generating + clear prior error
        set((s) => ({
          generatingNodeIds: { ...s.generatingNodeIds, [id]: true },
          generationErrors: (() => {
            const next = { ...s.generationErrors }
            delete next[id]
            return next
          })(),
        }))

        try {
          const effectivePrompt = getEffectivePrompt(state, id)
          if (!effectivePrompt.trim()) {
            throw new Error('Prompt이 비어있습니다.')
          }
          const { kind, outputMode, modelId } = node.data
          const provider: 'gemini' | 'tailscale' =
            modelId === 'h100-self' ? 'tailscale' : 'gemini'
          const aspectRatio: '1:1' | '16:9' = kind === 'world' ? '16:9' : '1:1'
          const baseSeed = Math.floor(Math.random() * 1_000_000)

          const variants = buildVariants(outputMode, effectivePrompt)

          const settled = await Promise.allSettled(
            variants.map(async (v) => {
              const res = await fetch('/api/generate/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: v.prompt,
                  aspectRatio,
                  provider,
                }),
              })
              if (!res.ok) {
                const text = await res.text().catch(() => '')
                throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`)
              }
              const blob = await res.blob()
              const dataUrl = await blobToDataUrl(blob)
              const img: GeneratedImage = {
                id: newId('i'),
                url: dataUrl,
                prompt: v.prompt,
                seed: baseSeed,
                view: v.view,
                angle: v.angle,
                modelId,
                createdAt: Date.now(),
              }
              return img
            }),
          )

          const successful = settled
            .filter(
              (r): r is PromiseFulfilledResult<GeneratedImage> =>
                r.status === 'fulfilled',
            )
            .map((r) => r.value)
          const failures = settled.filter((r) => r.status === 'rejected')

          if (successful.length > 0) {
            get().appendGeneratedImages(id, successful)
            get().clearStale(id)
          }
          if (failures.length > 0) {
            const firstReason =
              (failures[0] as PromiseRejectedResult).reason instanceof Error
                ? (
                    (failures[0] as PromiseRejectedResult).reason as Error
                  ).message
                : String((failures[0] as PromiseRejectedResult).reason)
            set((s) => ({
              generationErrors: {
                ...s.generationErrors,
                [id]: `${failures.length}/${variants.length}장 실패: ${firstReason}`,
              },
            }))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          set((s) => ({
            generationErrors: { ...s.generationErrors, [id]: msg },
          }))
        } finally {
          set((s) => {
            const next = { ...s.generatingNodeIds }
            delete next[id]
            return { generatingNodeIds: next }
          })
        }
      },

      applyUpdates: (updates) => {
        const tempIdMap = new Map<string, string>()
        const resolveId = (id: string): string => tempIdMap.get(id) ?? id
        const result: CanvasUpdateResult = { applied: 0, skipped: [] }
        const api = get()

        for (const u of updates) {
          try {
            switch (u.type) {
              case 'addNode': {
                const defaultPos = nextDefaultPosition(get().nodes)
                const newId = api.addNode(
                  u.kind,
                  u.position ?? defaultPos,
                  u.label,
                )
                if (u.tempId) tempIdMap.set(u.tempId, newId)
                if (u.prompt !== undefined) {
                  api.updateNodeData(newId, { prompt: u.prompt })
                }
                result.applied += 1
                break
              }
              case 'updateNode': {
                const id = resolveId(u.id)
                if (!get().nodes.find((n) => n.id === id)) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                api.updateNodeData(id, u.patch)
                result.applied += 1
                break
              }
              case 'connect': {
                const s = resolveId(u.sourceId)
                const t = resolveId(u.targetId)
                if (
                  !get().nodes.find((n) => n.id === s) ||
                  !get().nodes.find((n) => n.id === t)
                ) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                const edgeId = api.addEdge(s, t, {
                  category: u.category,
                  relationText: u.relationText ?? '',
                })
                if (edgeId) result.applied += 1
                else result.skipped.push({ update: u, reason: 'duplicate or self' })
                break
              }
              case 'setOutputMode': {
                const id = resolveId(u.id)
                if (!get().nodes.find((n) => n.id === id)) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                api.setOutputMode(id, u.mode)
                result.applied += 1
                break
              }
              case 'generate': {
                const id = resolveId(u.id)
                if (!get().nodes.find((n) => n.id === id)) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                // fire-and-forget — UI shows loading via generatingNodeIds
                void api.generateImages(id)
                result.applied += 1
                break
              }
              case 'branchStatus': {
                const motherId = resolveId(u.motherId)
                const newId = api.branchStatus(motherId)
                if (!newId) {
                  result.skipped.push({
                    update: u,
                    reason: 'cannot branch from status or unknown mother',
                  })
                  break
                }
                if (u.tempId) tempIdMap.set(u.tempId, newId)
                if (u.label !== undefined || u.prompt !== undefined) {
                  api.updateNodeData(newId, {
                    ...(u.label !== undefined && { label: u.label }),
                    ...(u.prompt !== undefined && { prompt: u.prompt }),
                  })
                }
                result.applied += 1
                break
              }
              case 'duplicateNode': {
                const id = resolveId(u.id)
                const newId = api.duplicateNode(id)
                if (!newId) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                if (u.tempId) tempIdMap.set(u.tempId, newId)
                result.applied += 1
                break
              }
              case 'requestDelete': {
                const id = resolveId(u.id)
                if (!get().nodes.find((n) => n.id === id)) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                api.openDeleteConfirm(id)
                result.applied += 1
                break
              }
              case 'requestRegister': {
                const id = resolveId(u.id)
                if (!get().nodes.find((n) => n.id === id)) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                api.openPopup(id)
                result.applied += 1
                break
              }
              case 'selectNode': {
                const id = resolveId(u.id)
                if (!get().nodes.find((n) => n.id === id)) {
                  result.skipped.push({ update: u, reason: 'unknown id' })
                  break
                }
                api.selectNode(id)
                result.applied += 1
                break
              }
              default: {
                const _exhaustive: never = u
                result.skipped.push({
                  update: u,
                  reason: `unknown type: ${(_exhaustive as { type: string }).type}`,
                })
              }
            }
          } catch (err) {
            result.skipped.push({
              update: u,
              reason: err instanceof Error ? err.message : 'error',
            })
          }
        }
        return result
      },

      reset: () =>
        set({
          nodes: initialNodes,
          edges: initialEdges,
          selectedNodeId: null,
          selectedEdgeId: null,
          viewport: { x: 0, y: 0, zoom: 1 },
          popupNodeId: null,
          branchModalNodeId: null,
          deleteConfirmNodeId: null,
          relationModal: null,
          lastSavedAt: Date.now(),
        }),
    }),
    {
      name: 'tale-canvas-v1-default',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        nodes: s.nodes,
        edges: s.edges,
        viewport: s.viewport,
        projectId: s.projectId,
        lastSavedAt: s.lastSavedAt,
      }),
    },
  ),
)

// ============================================================================
// Selectors (pure helpers, not on store for tree-shake)
// ============================================================================

export function getNode(state: CanvasState, id: string): CanvasNode | undefined {
  return state.nodes.find((n) => n.id === id)
}

export function getOutgoingEdges(state: CanvasState, id: string): CanvasEdge[] {
  return state.edges.filter((e) => e.source === id)
}

export function getIncomingEdges(state: CanvasState, id: string): CanvasEdge[] {
  return state.edges.filter((e) => e.target === id)
}

/** parent-category outgoing edges 따라 후손 전체 (BFS) */
export function getDescendants(
  state: CanvasState,
  id: string,
): CanvasNode[] {
  const childrenMap = new Map<string, string[]>()
  state.edges.forEach((e) => {
    if (e.data?.category === 'parent') {
      const arr = childrenMap.get(e.source) ?? []
      arr.push(e.target)
      childrenMap.set(e.source, arr)
    }
  })
  const out: CanvasNode[] = []
  const seen = new Set<string>()
  const queue = [...(childrenMap.get(id) ?? [])]
  while (queue.length) {
    const cur = queue.shift()!
    if (seen.has(cur)) continue
    seen.add(cur)
    const node = state.nodes.find((n) => n.id === cur)
    if (node) out.push(node)
    queue.push(...(childrenMap.get(cur) ?? []))
  }
  return out
}

/** Status 노드의 마더 체인 (root까지) */
export function getMotherChain(
  state: CanvasState,
  id: string,
): CanvasNode[] {
  const chain: CanvasNode[] = []
  let current = state.nodes.find((n) => n.id === id)
  while (current?.data.motherId) {
    const mother = state.nodes.find((n) => n.id === current!.data.motherId)
    if (!mother) break
    chain.push(mother)
    current = mother
  }
  return chain
}

export function countImagesInSubtree(
  state: CanvasState,
  id: string,
): number {
  const root = state.nodes.find((n) => n.id === id)
  if (!root) return 0
  const subtree = [root, ...getDescendants(state, id)]
  return subtree.reduce((sum, n) => sum + n.data.generatedImages.length, 0)
}

export function canRegister(state: CanvasState, id: string): boolean {
  const node = state.nodes.find((n) => n.id === id)
  if (!node) return false
  if (node.data.registered) return false
  if (node.data.kind === 'status') return false
  return countImagesInSubtree(state, id) >= REGISTRATION_IMAGE_THRESHOLD
}

/** Status 노드는 마더 prompt + 자체 prompt 결합. 일반 노드는 자체 prompt 그대로. */
export function getEffectivePrompt(
  state: CanvasState,
  id: string,
): string {
  const node = state.nodes.find((n) => n.id === id)
  if (!node) return ''
  if (node.data.kind !== 'status' || !node.data.motherId) {
    return node.data.prompt
  }
  const motherEffective = getEffectivePrompt(state, node.data.motherId)
  return `${motherEffective}\n\n[변형] ${node.data.prompt}`
}

export { REGISTRATION_IMAGE_THRESHOLD }

// ============================================================================
// Helpers for agentic mode
// ============================================================================

function nextDefaultPosition(nodes: CanvasNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 80, y: 80 }
  const maxX = Math.max(...nodes.map((n) => n.position.x))
  const sameRow = nodes.filter((n) => n.position.x === maxX)
  const maxY = sameRow.length
    ? Math.max(...sameRow.map((n) => n.position.y))
    : 80
  return { x: maxX + BRANCH_OFFSET_X, y: maxY }
}

/**
 * Serialize current canvas state for LLM prompt context.
 * Format: see specs/data/canvas_data_model.md §6.5
 */
export function serializeCanvasContext(
  state: Pick<CanvasState, 'nodes' | 'edges' | 'selectedNodeId'>,
): string {
  const { nodes, edges, selectedNodeId } = state
  const actorCount = nodes.filter((n) => n.data.kind === 'actor').length
  const worldCount = nodes.filter((n) => n.data.kind === 'world').length
  const statusCount = nodes.filter((n) => n.data.kind === 'status').length
  const parentCount = edges.filter((e) => e.data?.category === 'parent').length
  const inWorldCount = edges.filter(
    (e) => e.data?.category === 'in-world',
  ).length
  const referencesCount = edges.filter(
    (e) => e.data?.category === 'references',
  ).length
  const totalImages = nodes.reduce(
    (sum, n) => sum + n.data.generatedImages.length,
    0,
  )

  const lines: string[] = []
  lines.push('## 캔버스 상태')
  lines.push('')
  lines.push('### 통계')
  lines.push(
    `- 노드 ${nodes.length}개 (Actor ${actorCount}, World ${worldCount}, Status ${statusCount})`,
  )
  lines.push(
    `- 엣지 ${edges.length}개 (parent ${parentCount}, in-world ${inWorldCount}, references ${referencesCount})`,
  )
  lines.push(
    `- 누적 이미지 ${totalImages}장 / 등록 임계 ${REGISTRATION_IMAGE_THRESHOLD}`,
  )
  lines.push('')

  if (nodes.length > 0) {
    lines.push('### 노드 목록')
    nodes.forEach((n) => {
      const promptSnippet =
        n.data.prompt.length > 80
          ? `${n.data.prompt.slice(0, 80)}…`
          : n.data.prompt
      const motherInfo =
        n.data.motherId !== null ? `, mother: ${n.data.motherId}` : ''
      const registeredInfo = n.data.registered
        ? `, registered as ${n.data.registered.name}`
        : ''
      lines.push(
        `- [${n.id}] ${n.data.kind} "${n.data.label}" (${n.data.outputMode}, ${n.data.generatedImages.length} imgs${motherInfo}${registeredInfo}): ${promptSnippet || '(빈 prompt)'}`,
      )
    })
    lines.push('')
  }

  if (edges.length > 0) {
    lines.push('### 엣지 목록')
    edges.forEach((e) => {
      const rt = e.data?.relationText
      const rtSuffix = rt ? ` ("${rt}")` : ''
      lines.push(
        `- ${e.source} -${e.data?.category ?? 'parent'}-> ${e.target}${rtSuffix}`,
      )
    })
    lines.push('')
  }

  if (selectedNodeId) {
    const sel = nodes.find((n) => n.id === selectedNodeId)
    if (sel) {
      lines.push('### 선택된 노드 (풀 정보)')
      lines.push(`- ID: ${sel.id}`)
      lines.push(`- 종류: ${sel.data.kind}`)
      lines.push(`- 라벨: ${sel.data.label}`)
      lines.push(`- 모델: ${sel.data.modelId}`)
      lines.push(`- 출력 모드: ${sel.data.outputMode}`)
      lines.push(`- Prompt (full): ${sel.data.prompt || '(빈)'}`)
      const effective = getEffectivePrompt(state as CanvasState, sel.id)
      if (effective !== sel.data.prompt) {
        lines.push(`- Effective prompt: ${effective}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}
