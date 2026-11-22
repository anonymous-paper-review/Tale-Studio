// 씬 보기에서 [자동 정렬]을 누르면 그 씬의 샷 · 영상만 같은 간격으로 정리하고, 다른 씬 배치는 그대로 두며(넓어지면 통째로 옆으로 밀 뿐) 그 자리를 저장하는지 검사한다 (오너 D8 · 혼자 정한 것 h13, 2026-11-22)
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { arrangeSceneGroup, NODE_COLUMN_GAP, NODE_ROW_GAP } from '@/features/director/canvas-layout'
import { useDirectorCanvasStore } from '@/stores/director-store'
import type { DirectorNode } from '@/types/director'

const node = (id: string, data: Record<string, unknown>, x: number, y: number, size?: { width: number; height: number }): DirectorNode =>
  ({ id, type: data.kind as string, position: { x, y }, data: { label: id, ...data }, ...(size ? { measured: size } : {}) }) as unknown as DirectorNode
const scene = (id: string, x: number) => node(id, { kind: 'scene', writerSceneId: id }, x, 80)
const shot = (id: string, sceneId: string | null, x: number, y: number) =>
  node(id, { kind: 'shot', writerShotId: id, parentSceneNodeId: sceneId, characterAssetIds: [], worldAssetIds: [] }, x, y, { width: 280, height: 300 })
const take = (id: string, shotId: string, x: number, y: number) => node(id, { kind: 'video', parentShotNodeId: shotId }, x, y, { width: 240, height: 200 })
const prompt = (id: string, x: number, y: number) => node(id, { kind: 'prompt', text: '', targetShotNodeId: null }, x, y, { width: 240, height: 120 })

/** 씬 1(샷 a1 · a2 가 흩어져 있음) · 씬 2(샷 b1 · Take u1, 사람이 놓은 자리). */
function board(): DirectorNode[] {
  return [
    scene('S1', 400),
    shot('a1', 'S1', 760, 900),
    shot('a2', 'S1', 1000, 2400),
    take('t1', 'a1', 1500, 700),
    scene('S2', 1800),
    shot('b1', 'S2', 2160, 333),
    take('u1', 'b1', 2600, 777),
  ]
}

describe('씬 보기의 [자동 정렬]', () => {
  it('[자동 정렬]을 씬 보기에서 누르면 그 씬의 샷 · 영상만 그 씬 자리에서 같은 간격으로 놓고 다른 씬 카드는 그대로 둔다', () => {
    // 왜: 씬 보기에서는 보는 씬만 정리한다 — 안 보이는 씬에 사람이 손댄 배치를 지우지 않는다(혼자 정한 것 h13). 간격은 지금 [자동 정렬]과 같다(열 96 · 줄 56).
    const placed = arrangeSceneGroup(board(), 'S1')
    expect(placed.get('a1')).toEqual({ x: 760, y: 80 })
    expect(placed.get('t1')).toEqual({ x: 760 + 280 + NODE_COLUMN_GAP, y: 80 })
    expect(placed.get('a2')).toEqual({ x: 760, y: 80 + 300 + NODE_ROW_GAP })
    expect(placed.has('b1')).toBe(false)
    expect(placed.has('u1')).toBe(false)
  })

  it('정리한 씬 묶음이 넓어지면 그 오른쪽 씬 카드들을 넓어진 만큼 통째로 오른쪽으로 민다', () => {
    // 왜: 넓어진 묶음이 다음 씬 자리에 겹치면 새 카드 자리를 셀 때 엉킨다 — 다른 씬은 배치는 그대로 두고 자리만 옆으로 민다.
    const nodes = board().map((n) => (n.id === 't1' ? { ...n, position: { x: 900, y: 700 } } : n))
    const placed = arrangeSceneGroup(nodes, 'S1')
    const oldRight = Math.max(1000 + 280, 900 + 240)
    const newRight = 760 + 280 + NODE_COLUMN_GAP + 240
    const pushed = newRight - oldRight
    expect(pushed).toBeGreaterThan(0)
    expect(placed.get('b1')).toEqual({ x: 2160 + pushed, y: 333 })
    expect(placed.get('u1')).toEqual({ x: 2600 + pushed, y: 777 })
  })

  it('씬 보기의 [자동 정렬]도 씬 밖 카드(프롬프트 노드 등)는 옮기지 않고 피해서 놓는다', () => {
    // 왜: 씬 밖 카드는 어느 씬에서나 보이고 [자동 정렬]이 옮기지 않는다(지금 규칙, 검토 C 2번) — 정리한 카드가 그 위에 겹치지 않는다.
    const nodes = [...board(), prompt('p1', 700, 60)]
    const placed = arrangeSceneGroup(nodes, 'S1')
    expect(placed.has('p1')).toBe(false)
    expect(placed.get('a1')!.x).toBeGreaterThanOrEqual(700 + 240 + NODE_COLUMN_GAP)
  })

  it('샷이 없는 씬은 정리할 것이 없다', () => {
    // 왜: 빈 씬에서 눌러도 다른 씬 카드를 건드리지 않는다.
    expect(arrangeSceneGroup([...board(), scene('S3', 3000)], 'S3').size).toBe(0)
  })
})

describe('씬 보기의 [자동 정렬] 저장', () => {
  beforeEach(() => {
    useDirectorCanvasStore.getState().setProjectId('scene-arrange-test')
    useDirectorCanvasStore.setState({ nodes: board(), edges: [], historyPast: [], historyFuture: [] })
  })

  it('씬을 정해 [자동 정렬]을 요청하면 그 씬만 정리해 그 자리를 저장하고 되돌리기 기록을 남긴다', () => {
    // 왜: 단추로 한 정리는 되돌릴 수 있어야 한다(지금 규칙). 옮긴 카드(정리한 씬 + 민 카드)만 저장한다.
    const persist = vi.fn()
    useDirectorCanvasStore.setState({ persistNodePosition: persist })
    const expected = arrangeSceneGroup(useDirectorCanvasStore.getState().nodes, 'S1')
    useDirectorCanvasStore.getState().requestArrange({ sceneNodeId: 'S1' })
    expect(useDirectorCanvasStore.getState().arrangeSceneNodeId).toBe('S1')
    useDirectorCanvasStore.getState().relayoutCanvas()
    const after = useDirectorCanvasStore.getState()
    for (const [id, at] of expected) expect(after.nodes.find((n) => n.id === id)!.position).toEqual(at)
    expect(after.nodes.find((n) => n.id === 'b1')!.position).toEqual({ x: 2160, y: 333 })
    expect(persist.mock.calls.map(([id]) => id).sort()).toEqual([...expected.keys()].sort())
    expect(after.historyPast.length).toBe(1)
    expect(after.arrangeSceneNodeId).toBeNull()
    expect(after.arrangePending).toBe(false)
  })

  it('처음 들어갔을 때의 정렬을 기다리는 중에 [자동 정렬]을 눌러도 그 정렬은 모든 씬을 정리한다', () => {
    // 왜: 처음 정렬(11/16)은 모든 씬의 넉넉한 간격을 한 번에 줄인다 — 막 들어와 단추를 눌러 한 씬만 정리되면 다른 씬은 먼 간격으로 남는다.
    useDirectorCanvasStore.getState().requestArrange({ firstEntry: true })
    useDirectorCanvasStore.getState().requestArrange({ sceneNodeId: 'S1' })
    expect(useDirectorCanvasStore.getState().arrangeSceneNodeId).toBeNull()
  })

  it('정렬을 기다리는 중에 다른 프로젝트로 가면 고른 씬 정렬도 하지 않는다', () => {
    // 왜: 지금 규칙(정렬을 기다리다 프로젝트를 바꾸면 그 정렬은 없다)을 씬 정렬에도 지킨다.
    useDirectorCanvasStore.getState().requestArrange({ sceneNodeId: 'S1' })
    useDirectorCanvasStore.getState().setProjectId('scene-arrange-other')
    expect(useDirectorCanvasStore.getState()).toMatchObject({ arrangePending: false, arrangeSceneNodeId: null })
  })
})
