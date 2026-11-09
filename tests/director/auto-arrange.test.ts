// Director 노드 보기의 [자동 정렬]은 11/5 시안(D1 · DG)의 간격으로 카드를 가깝게 놓고, 카드 크기가 달라도 겹치지 않는다 (오너 2026-11-10)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { arrangeDirectorCanvas, UNMEASURED_NODE_SIZE } from '@/features/director/canvas-layout'
import { nextScenePosition, useDirectorCanvasStore } from '@/stores/director-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import type { DirectorNode } from '@/types/director'

type Box = { x: number; y: number; w: number; h: number }

function node(id: string, data: Record<string, unknown>, size?: { width: number; height: number }, at = { x: 0, y: 0 }): DirectorNode {
  return { id, type: String(data.kind), position: at, data, ...(size ? { measured: size } : {}) } as unknown as DirectorNode
}
const scene = (id: string, y = 0, x = 0) => node(id, { kind: 'scene', label: id }, undefined, { x, y })
const shot = (id: string, sceneId: string | null, height = 300, y = 0) =>
  node(id, { kind: 'shot', label: id, parentSceneNodeId: sceneId }, { width: 280, height }, { x: 0, y })
const video = (id: string, shotId: string | null, height = 200, y = 0) =>
  node(id, { kind: 'video', label: id, parentShotNodeId: shotId }, { width: 240, height }, { x: 0, y })
const asset = (id: string, assetKind: 'character' | 'world', height = 220, y = 0) =>
  node(id, { kind: 'asset', assetKind, assetId: id, label: id }, { width: 240, height }, { x: 0, y })

function boxes(nodes: DirectorNode[]): Map<string, Box> {
  const placed = arrangeDirectorCanvas(nodes)
  const out = new Map<string, Box>()
  for (const n of nodes) {
    const p = placed.get(n.id)
    if (!p || n.data.kind === 'scene') continue
    const size = n.measured?.width && n.measured?.height ? n.measured : UNMEASURED_NODE_SIZE[n.data.kind as keyof typeof UNMEASURED_NODE_SIZE]
    out.set(n.id, { x: p.x, y: p.y, w: size!.width!, h: size!.height! })
  }
  return out
}
const right = (b: Box) => b.x + b.w
const bottom = (b: Box) => b.y + b.h
const overlaps = (a: Box, b: Box) => a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a)

describe('같이 정한 것', () => {
  // 왜: 오너 2026-11-10 "Node 뷰 카드들이 너무 먼데 아까 피그마 자료처럼 조금 가깝게(Auto-arrange)". 시안 D1 · DG 는 노드 열 사이가 96 이다.
  //   예전 [자동 정렬]은 샷과 영상 사이를 440 띄웠다.
  it('자동 정렬은 샷 열과 영상 열 사이를 시안처럼 96 띄운다', () => {
    const b = boxes([scene('S'), shot('A', 'S'), video('V', 'A')])

    expect(b.get('V')!.x - right(b.get('A')!)).toBe(96)
  })

  // 왜: 시안 DG 는 위아래 카드 사이가 56 이다(샷끼리 · 영상 테이크끼리). 예전엔 샷 줄 간격이 560 이라 카드 사이가 250 넘게 비었다.
  it('자동 정렬은 위아래 카드 사이를 시안처럼 56 띄운다', () => {
    const b = boxes([scene('S'), shot('A', 'S', 300, 0), shot('B', 'S', 300, 10), video('V1', 'B', 200, 0), video('V2', 'B', 200, 10)])

    expect(b.get('B')!.y - bottom(b.get('A')!)).toBe(56)
    expect(b.get('V2')!.y - bottom(b.get('V1')!)).toBe(56)
  })

  // 왜: 시안 D1 · DG 는 에셋(인물 · 배경) 열과 첫 샷 열 사이가 116, 에셋 카드끼리는 35 다. 샷 왼쪽의 입력 구멍 라벨 자리가 그 사이에 든다.
  it('자동 정렬은 에셋 열과 첫 샷 열 사이를 116, 에셋 카드끼리는 35 띄운다', () => {
    const b = boxes([scene('S'), shot('A', 'S'), asset('c1', 'character', 220), asset('w1', 'world', 180)])

    expect(b.get('A')!.x - right(b.get('c1')!)).toBe(116)
    expect(b.get('w1')!.y - bottom(b.get('c1')!)).toBe(35)
    expect(b.get('w1')!.x).toBe(b.get('c1')!.x)
  })
})

describe('혼자 정한 것', () => {
  // 왜: 그림 비율(가로 · 세로 · 정사각)마다 카드 높이가 다르고 테이크 수도 샷마다 다르다. 가까이 놓되 어떤 두 카드도 겹치면 안 된다(리드 2026-11-10 "겹침 0이 먼저").
  it('자동 정렬 뒤에는 카드 크기가 달라도 어떤 두 카드도 겹치지 않는다', () => {
    const nodes = [
      scene('S1', 0), scene('S2', 0, 10), scene('S3', 0, 20),
      shot('A', 'S1', 300), shot('B', 'S1', 420, 1), shot('C', 'S1', 300, 2),
      video('A1', 'A', 200), video('A2', 'A', 260, 1), video('A3', 'A', 200, 2),
      video('B1', 'B', 260),
      shot('D', 'S2', 420), video('D1', 'D', 260), video('D2', 'D', 260, 1),
      shot('E', 'S3', 300), shot('F', 'S3', 300, 1), video('F1', 'F', 200),
      asset('c1', 'character', 300), asset('c2', 'character', 220, 1), asset('w1', 'world', 180, 2),
    ]
    const placed = [...boxes(nodes).entries()]

    for (const [i, [idA, a]] of placed.entries()) {
      for (const [idB, b] of placed.slice(i + 1)) expect(overlaps(a, b), `${idA} · ${idB}`).toBe(false)
    }
  })

  // 왜: 한 샷에 테이크가 여럿 쌓이면 그 줄이 샷보다 길어진다. 다음 샷 줄을 그만큼 내려야 테이크가 아래 샷의 영상과 겹치지 않는다.
  it('한 샷의 영상 테이크가 샷보다 길게 쌓이면 다음 샷 줄을 그만큼 아래로 내린다', () => {
    const b = boxes([scene('S'), shot('A', 'S', 300, 0), video('A1', 'A', 200, 0), video('A2', 'A', 200, 1), shot('B', 'S', 300, 1)])

    expect(b.get('B')!.y - bottom(b.get('A2')!)).toBe(56)
  })

  // 왜: 시안에는 씬이 하나뿐이다. 씬이 여럿이면 지금처럼 씬 묶음을 왼쪽에서 오른쪽으로 두되, 묶음끼리는 열 간격(96)보다 조금 더(160) 띄워 씬이 갈려 보이게 한다.
  it('씬이 여럿이면 씬 묶음을 왼쪽에서 오른쪽으로 두고 묶음 사이를 160 띄운다', () => {
    const b = boxes([scene('S1', 0, 0), scene('S2', 0, 10), shot('A', 'S1'), video('A1', 'A'), shot('D', 'S2')])

    expect(b.get('D')!.x - right(b.get('A1')!)).toBe(160)
    expect(b.get('D')!.y).toBe(b.get('A')!.y)
  })

  // 왜: 화면 밖이라 아직 그려진 적 없는 카드는 크기를 모른다. 세로 그림의 큰 카드만큼 넉넉하게 셈해 나중에 그려져도 겹치지 않게 한다.
  it('크기를 아직 모르는 카드는 넉넉한 크기로 셈해 겹치지 않는다', () => {
    const unmeasured = (id: string, y: number) => node(id, { kind: 'shot', label: id, parentSceneNodeId: 'S' }, undefined, { x: 0, y })
    const placed = arrangeDirectorCanvas([scene('S'), unmeasured('A', 0), unmeasured('B', 1)])

    expect(placed.get('B')!.y - placed.get('A')!.y).toBe(UNMEASURED_NODE_SIZE.shot.height + 56)
    expect(UNMEASURED_NODE_SIZE.shot.height).toBeGreaterThanOrEqual(400)
  })

  // 왜: 샷 · 영상 카드 왼쪽에는 입력 구멍 라벨("프롬프트" · "이전 영상" 등)이 카드 밖으로 나와 있다. 그 자리를 다른 카드가 덮으면 라벨이 가려진다.
  it('자동 정렬 뒤 샷 · 영상 카드 왼쪽의 입력 구멍 라벨 자리(60)는 다른 카드가 차지하지 않는다', () => {
    const nodes = [
      scene('S1', 0), scene('S2', 0, 10),
      shot('A', 'S1', 300), video('A1', 'A'), video('A2', 'A', 200, 1),
      shot('D', 'S2', 420), video('D1', 'D', 260),
      asset('c1', 'character', 300), asset('w1', 'world', 180, 1),
    ]
    const placed = boxes(nodes)

    for (const [id, card] of placed) {
      if (id.startsWith('c') || id.startsWith('w')) continue
      const labels: Box = { x: card.x - 60, y: card.y, w: 60, h: card.h }
      for (const [other, b] of placed) if (other !== id) expect(overlaps(labels, b), `${id} 라벨 · ${other}`).toBe(false)
    }
  })

  // 왜: 정상 경로 고정. 사람이 따로 만든 프롬프트 노드 · 샷 없는 영상 · 씬 없는 샷은 지금처럼 [자동 정렬]이 옮기지 않는다.
  it('자동 정렬은 프롬프트 노드와 샷 없는 영상 · 씬 없는 샷은 옮기지 않는다', () => {
    const placed = arrangeDirectorCanvas([
      scene('S'), shot('A', 'S'),
      node('P', { kind: 'prompt', label: 'P' }, { width: 240, height: 120 }),
      video('free', null), shot('loose', null),
    ])

    expect(placed.has('P')).toBe(false)
    expect(placed.has('free')).toBe(false)
    expect(placed.has('loose')).toBe(false)
  })
})

describe('[자동 정렬] 단추와 처음 여는 배치', () => {
  const api = () => useDirectorCanvasStore.getState()
  beforeEach(() => {
    api().reset()
    useAssetStorageStore.getState().reset()
    api().setProjectId('arrange-project')
  })

  // 왜: 단추가 위 규칙을 그대로 쓴다. 샷 · 영상 · 씬 위치는 지금처럼 저장하고(다시 열어도 그 자리), 에셋 위치는 저장하지 않는다(DB 에 자리가 없다).
  it('[자동 정렬]을 누르면 씬의 샷 · 영상이 이 규칙대로 놓이고 그 위치를 저장한다', () => {
    const sceneId = api().addSceneNode({ x: 900, y: 700 }, 'S1')
    const a = api().addShotNode(sceneId, { x: 1500, y: 1500 }, 'Shot1')
    const b = api().addShotNode(sceneId, { x: 1500, y: 2900 }, 'Shot2')
    const v = api().addVideoTake(a)!
    const persist = vi.fn()
    useDirectorCanvasStore.setState((s) => ({
      persistNodePosition: persist,
      nodes: s.nodes.map((n) => [a, b].includes(n.id) ? { ...n, measured: { width: 280, height: 300 } } : n.id === v ? { ...n, measured: { width: 240, height: 200 } } : n),
    }))
    const expected = arrangeDirectorCanvas(api().nodes)

    api().relayoutCanvas()

    for (const id of [a, b, v]) expect(api().nodes.find((n) => n.id === id)!.position).toEqual(expected.get(id))
    expect(persist.mock.calls.map(([id]) => id)).toEqual(expect.arrayContaining([sceneId, a, b, v]))
  })

  // 왜: 씬 묶음 폭은 예전 그대로 둔다(리드 2026-11-10). 새 테이크는 시안처럼 샷 오른쪽 96 에 두고, 다른 카드(예전 간격으로 저장된 카드 포함)와
  //   겹치면 아래로 내린다(검토 C 1번). 예전 문장 "처음 열 때 영상 테이크 · 씬 묶음의 기본 자리는 예전 넉넉한 간격 그대로다"를 리드 지시로 고쳤다.
  it('처음 열 때 씬 묶음의 기본 간격은 예전 그대로이고 첫 테이크는 샷 오른쪽 96 에 놓는다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S1')
    const shotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Shot1')
    const videoId = api().addVideoTake(shotId)!

    expect(api().nodes.find((n) => n.id === videoId)!.position.x).toBe(360 + 280 + 96)
    expect(nextScenePosition(api()).x).toBe(1780)
  })

  // 왜: 처음 열 때 에셋 열도 시안처럼 첫 샷 열 왼쪽에 116 띄워 놓는다(예전엔 숨은 씬 노드 기준이라 420 떨어졌다).
  it('처음 열 때 에셋 열은 첫 샷 열 왼쪽에 116 띄워 놓는다', () => {
    const sceneId = api().addSceneNode({ x: 380, y: 80 }, 'S1')
    const shotId = api().addShotNode(sceneId, { x: 740, y: 80 }, 'Shot1')
    api().updateNodeData<'shot'>(shotId, { characterAssetIds: ['char-1'] })
    useAssetStorageStore.getState().registerCharacter('char-1', {
      projectId: 'arrange-project', sourceCanvasNodeId: 'artist-char-1', name: '주인공', alias: '', background: '',
      description: '', prompt: '', referenceImages: [], views: { single: [], fiveView: [], sixteenAngle: [] }, statusVariants: [],
    })

    api().rebuildAssetNodes()

    const card = api().nodes.find((n) => n.data.kind === 'asset')!
    expect(740 - (card.position.x + 240)).toBe(116)
  })
})
