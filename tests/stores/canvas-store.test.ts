import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useCanvasStore,
  countImagesInSubtree,
  getEffectivePrompt,
  serializeCanvasContext,
  REGISTRATION_IMAGE_THRESHOLD,
  type CanvasUpdate,
  type GeneratedImage,
} from '@/stores/canvas-store'

beforeEach(() => {
  useCanvasStore.getState().reset()
  vi.restoreAllMocks()
})

function api() {
  return useCanvasStore.getState()
}

function makeImage(extra: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: `i_${Math.random().toString(36).slice(2)}`,
    url: 'data:,',
    prompt: 'p',
    modelId: 'imagen',
    createdAt: Date.now(),
    ...extra,
  }
}

describe('canvas-store.addNode', () => {
  it('Actor 노드 추가 시 invariant 충족', () => {
    const id = api().addNode('actor', { x: 80, y: 80 }, 'Kai')
    const node = api().nodes.find((n) => n.id === id)!
    expect(node).toBeDefined()
    expect(node.type).toBe('actor')
    expect(node.data.kind).toBe('actor')
    expect(node.data.label).toBe('Kai')
    expect(node.data.outputMode).toBe('single')
    expect(node.data.modelId).toBe('imagen')
    expect(node.data.motherId).toBeNull()
    expect(node.data.registered).toBeNull()
    expect(node.data.generatedImages).toEqual([])
    expect(node.position).toEqual({ x: 80, y: 80 })
  })

  it('label 미지정 시 kind 기본 라벨', () => {
    const a = api().addNode('actor', { x: 0, y: 0 })
    const w = api().addNode('world', { x: 0, y: 0 })
    const s = api().addNode('status', { x: 0, y: 0 })
    const find = (id: string) => api().nodes.find((n) => n.id === id)!
    expect(find(a).data.label).toBe('New Actor')
    expect(find(w).data.label).toBe('New World')
    expect(find(s).data.label).toBe('New Status')
  })
})

describe('canvas-store.deleteNode (Status cascade)', () => {
  it('Status 자식 가진 마더 삭제 시 자식까지 cascade + 인시던트 엣지 정리', () => {
    const motherId = api().addNode('actor', { x: 0, y: 0 }, 'Mother')
    const childId = api().branchStatus(motherId)!
    expect(api().nodes).toHaveLength(2)
    expect(api().edges).toHaveLength(1)

    api().deleteNode(motherId)
    expect(api().nodes).toHaveLength(0)
    expect(api().edges).toHaveLength(0)
  })

  it('Status 자식 없는 노드는 자기만 삭제', () => {
    const a = api().addNode('actor', { x: 0, y: 0 })
    const b = api().addNode('actor', { x: 100, y: 0 })
    api().addEdge(a, b, { category: 'references', relationText: 'r' })

    api().deleteNode(a)
    expect(api().nodes).toHaveLength(1)
    expect(api().nodes[0].id).toBe(b)
    expect(api().edges).toHaveLength(0)
  })
})

describe('canvas-store.addEdge', () => {
  it('self-loop 거부', () => {
    const id = api().addNode('actor', { x: 0, y: 0 })
    const result = api().addEdge(id, id, {
      category: 'references',
      relationText: '',
    })
    expect(result).toBeNull()
    expect(api().edges).toHaveLength(0)
  })

  it('동일 source→target 중복 거부', () => {
    const a = api().addNode('actor', { x: 0, y: 0 })
    const b = api().addNode('actor', { x: 100, y: 0 })
    const e1 = api().addEdge(a, b, { category: 'references', relationText: '' })
    const e2 = api().addEdge(a, b, { category: 'parent', relationText: '' })
    expect(e1).not.toBeNull()
    expect(e2).toBeNull()
    expect(api().edges).toHaveLength(1)
  })

  it('카테고리별 type 필드 저장', () => {
    const a = api().addNode('actor', { x: 0, y: 0 })
    const b = api().addNode('actor', { x: 100, y: 0 })
    const c = api().addNode('world', { x: 200, y: 0 })
    api().addEdge(a, b, { category: 'parent', relationText: '' })
    api().addEdge(a, c, { category: 'in-world', relationText: 'lives' })
    expect(api().edges.find((e) => e.target === b)?.type).toBe('parent')
    expect(api().edges.find((e) => e.target === c)?.type).toBe('in-world')
  })
})

describe('canvas-store.setOutputMode', () => {
  it('single → five-view → sixteen-angle 전이 invariant', () => {
    const id = api().addNode('actor', { x: 0, y: 0 })
    const node = () => api().nodes.find((n) => n.id === id)!
    expect(node().data.outputMode).toBe('single')
    api().setOutputMode(id, 'five-view')
    expect(node().data.outputMode).toBe('five-view')
    api().setOutputMode(id, 'sixteen-angle')
    expect(node().data.outputMode).toBe('sixteen-angle')
  })
})

describe('canvas-store.registerCharacter (20장 임계값)', () => {
  it('이미지 < 20장이면 등록 실패', () => {
    const id = api().addNode('actor', { x: 0, y: 0 }, 'Kai')
    api().appendGeneratedImages(
      id,
      Array.from({ length: 19 }, () => makeImage()),
    )
    expect(countImagesInSubtree(api(), id)).toBe(19)

    const regId = api().registerCharacter(id, {
      name: 'Kai',
      alias: 'kai',
      background: 'bg',
      description: 'd',
    })
    expect(regId).toBeNull()
    expect(api().nodes.find((n) => n.id === id)?.data.registered).toBeNull()
  })

  it('이미지 = 임계값(20)이면 등록 성공', () => {
    const id = api().addNode('actor', { x: 0, y: 0 }, 'Kai')
    api().appendGeneratedImages(
      id,
      Array.from({ length: REGISTRATION_IMAGE_THRESHOLD }, () => makeImage()),
    )
    const regId = api().registerCharacter(id, {
      name: 'Kai',
      alias: 'kai',
      background: 'bg',
      description: 'd',
    })
    expect(regId).not.toBeNull()
    const reg = api().nodes.find((n) => n.id === id)?.data.registered
    expect(reg?.name).toBe('Kai')
    expect(reg?.alias).toBe('kai')
  })

  it('Status 자식 이미지도 임계값 카운트에 합산', () => {
    const motherId = api().addNode('actor', { x: 0, y: 0 })
    const childId = api().branchStatus(motherId)!
    api().appendGeneratedImages(
      motherId,
      Array.from({ length: 10 }, () => makeImage()),
    )
    api().appendGeneratedImages(
      childId,
      Array.from({ length: 10 }, () => makeImage()),
    )
    expect(countImagesInSubtree(api(), motherId)).toBe(20)
  })
})

describe('canvas-store.branchStatus', () => {
  it('Actor 마더에서 Status 자식 + motherId 링크 + parent 엣지', () => {
    const motherId = api().addNode('actor', { x: 100, y: 100 }, 'Kai')
    const childId = api().branchStatus(motherId)!
    const child = api().nodes.find((n) => n.id === childId)!
    expect(child.data.kind).toBe('status')
    expect(child.data.motherId).toBe(motherId)
    expect(child.data.label).toBe('Kai — variant')
    expect(api().edges).toHaveLength(1)
    expect(api().edges[0]).toMatchObject({
      source: motherId,
      target: childId,
      type: 'parent',
      sourceHandle: 'right',
      targetHandle: 'left',
    })
  })

  it('Status에서 다시 Branch는 거부 (MVP 제약)', () => {
    const motherId = api().addNode('actor', { x: 0, y: 0 })
    const childId = api().branchStatus(motherId)!
    const grand = api().branchStatus(childId)
    expect(grand).toBeNull()
  })
})

describe('getEffectivePrompt', () => {
  it('Status는 마더 prompt 체인 결합', () => {
    const motherId = api().addNode('actor', { x: 0, y: 0 }, 'Mother')
    api().updateNodeData(motherId, { prompt: 'base look' })
    const childId = api().branchStatus(motherId)!
    api().updateNodeData(childId, { prompt: 'wearing red coat' })

    const eff = getEffectivePrompt(api(), childId)
    expect(eff).toContain('base look')
    expect(eff).toContain('wearing red coat')
    expect(eff).toMatch(/\[변형\]/)
  })

  it('일반 Actor는 자체 prompt 그대로', () => {
    const id = api().addNode('actor', { x: 0, y: 0 })
    api().updateNodeData(id, { prompt: 'just this' })
    expect(getEffectivePrompt(api(), id)).toBe('just this')
  })
})

describe('canvas-store.applyUpdates (Agentic)', () => {
  beforeEach(() => {
    // fire-and-forget generate가 fetch 호출하므로 노드 환경 안전을 위해 mock
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('mocked', { status: 200 })),
    )
  })

  it('addNode + tempId → 후속 updateNode/connect에 tempId 매핑 적용', () => {
    const updates: CanvasUpdate[] = [
      { type: 'addNode', kind: 'actor', label: 'Kai', tempId: 'tmp_kai' },
      { type: 'addNode', kind: 'world', label: 'Lab', tempId: 'tmp_lab' },
      { type: 'updateNode', id: 'tmp_kai', patch: { prompt: 'tall' } },
      {
        type: 'connect',
        sourceId: 'tmp_kai',
        targetId: 'tmp_lab',
        category: 'in-world',
        relationText: 'works at',
      },
    ]
    const result = api().applyUpdates(updates)
    expect(result.applied).toBe(4)
    expect(result.skipped).toEqual([])
    expect(api().nodes).toHaveLength(2)
    expect(api().edges).toHaveLength(1)
    const kai = api().nodes.find((n) => n.data.label === 'Kai')!
    expect(kai.data.prompt).toBe('tall')
    expect(api().edges[0].data?.category).toBe('in-world')
  })

  it('unknown id 참조 시 skip + reason 기록', () => {
    const result = api().applyUpdates([
      { type: 'updateNode', id: 'n_ghost', patch: { label: 'X' } },
    ])
    expect(result.applied).toBe(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('unknown id')
  })

  it('requestDelete는 즉시 삭제 ❌ → deleteConfirmNodeId만 set', () => {
    const id = api().addNode('actor', { x: 0, y: 0 })
    const result = api().applyUpdates([{ type: 'requestDelete', id }])
    expect(result.applied).toBe(1)
    expect(api().nodes).toHaveLength(1) // 삭제 안 됨
    expect(api().deleteConfirmNodeId).toBe(id)
  })

  it('setOutputMode는 즉시 반영', () => {
    const id = api().addNode('actor', { x: 0, y: 0 })
    api().applyUpdates([{ type: 'setOutputMode', id, mode: 'five-view' }])
    expect(api().nodes[0].data.outputMode).toBe('five-view')
  })

  it('branchStatus + tempId 후속 액션 매핑', () => {
    const motherId = api().addNode('actor', { x: 0, y: 0 })
    const result = api().applyUpdates([
      {
        type: 'branchStatus',
        motherId,
        label: 'wounded',
        tempId: 'tmp_status',
      },
      { type: 'updateNode', id: 'tmp_status', patch: { prompt: 'bloody' } },
    ])
    expect(result.applied).toBe(2)
    const status = api().nodes.find((n) => n.data.kind === 'status')!
    expect(status.data.label).toBe('wounded')
    expect(status.data.prompt).toBe('bloody')
  })

  it('duplicate connect는 skip', () => {
    const a = api().addNode('actor', { x: 0, y: 0 })
    const b = api().addNode('actor', { x: 100, y: 0 })
    const result = api().applyUpdates([
      { type: 'connect', sourceId: a, targetId: b, category: 'references' },
      { type: 'connect', sourceId: a, targetId: b, category: 'parent' },
    ])
    expect(result.applied).toBe(1)
    expect(result.skipped).toHaveLength(1)
    expect(api().edges).toHaveLength(1)
  })
})

describe('serializeCanvasContext', () => {
  it('통계 + 노드/엣지 목록 + 선택 노드 풀 정보 포함', () => {
    const a = api().addNode('actor', { x: 0, y: 0 }, 'Kai')
    api().updateNodeData(a, { prompt: 'tall hero' })
    const w = api().addNode('world', { x: 200, y: 0 }, 'Lab')
    api().addEdge(a, w, { category: 'in-world', relationText: 'works at' })
    api().selectNode(a)

    const ctx = serializeCanvasContext(api())
    expect(ctx).toContain('노드 2개')
    expect(ctx).toContain('Actor 1')
    expect(ctx).toContain('World 1')
    expect(ctx).toContain('엣지 1개')
    expect(ctx).toContain('Kai')
    expect(ctx).toContain('Lab')
    expect(ctx).toContain('선택된 노드')
    expect(ctx).toContain('tall hero')
  })
})
