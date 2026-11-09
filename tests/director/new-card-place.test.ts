// 자동 정렬 뒤 새로 만드는 테이크 · 샷은 다른 카드와 겹치지 않는 자리에 놓인다 (검토 C 1번, 리드 2026-11-10)
import { beforeEach, describe, expect, it } from 'vitest'
import { nextScenePosition, nextShotPosition, useDirectorCanvasStore } from '@/stores/director-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { UNMEASURED_NODE_SIZE } from '@/features/director/canvas-layout'
import type { DirectorNode } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
const SHOT = { width: 280, height: 290 }
const TAKE = { width: 240, height: 210 }

type Box = { id: string; x: number; y: number; w: number; h: number }
const CARD_KINDS = new Set(['asset', 'shot', 'video', 'prompt'])
function box(node: DirectorNode): Box {
  const size = node.measured?.width && node.measured?.height
    ? node.measured
    : UNMEASURED_NODE_SIZE[node.data.kind as keyof typeof UNMEASURED_NODE_SIZE]
  return { id: node.id, x: node.position.x, y: node.position.y, w: size!.width!, h: size!.height! }
}
const find = (id: string) => api().nodes.find((n) => n.id === id)!
const bottom = (b: Box) => b.y + b.h
function overlapping(): string[] {
  const cards = api().nodes.filter((n) => CARD_KINDS.has(n.data.kind)).map(box)
  const out: string[] = []
  for (const [i, a] of cards.entries()) {
    for (const b of cards.slice(i + 1)) {
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`${a.id} · ${b.id}`)
    }
  }
  return out
}
function measure(ids: string[], size: { width: number; height: number }) {
  useDirectorCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => (ids.includes(n.id) ? { ...n, measured: size } : n)) }))
}

let S1: string, A: string, B: string, A1: string, S2: string, D: string, D1: string
beforeEach(() => {
  api().reset()
  useAssetStorageStore.getState().reset()
  useProjectFormatStore.setState({ format: 'horizontal_16:9' })
  api().setProjectId('place-project')
  S1 = api().addSceneNode({ x: 380, y: 80 }, 'S1')
  A = api().addShotNode(S1, { x: 740, y: 80 }, 'ShotA')
  B = api().addShotNode(S1, { x: 740, y: 640 }, 'ShotB')
  A1 = api().addVideoTake(A)!
  S2 = api().addSceneNode({ x: 2160, y: 80 }, 'S2')
  D = api().addShotNode(S2, { x: 2520, y: 80 }, 'ShotD')
  D1 = api().addVideoTake(D)!
  measure([A, B, D], SHOT)
  measure([A1, D1], TAKE)
  useDirectorCanvasStore.setState({ persistNodePosition: () => {} })
  api().relayoutCanvas()
})

describe('혼자 정한 것', () => {
  // 왜: 검토 C 1번. 정렬한 판에서 [영상 다시 만들기]로 생긴 테이크가 예전 넓은 간격(샷 x + 720)에 놓여 옆 씬의 샷 위에 겹쳤다.
  it('자동 정렬 뒤 다시 만든 테이크는 그 샷의 테이크 열에서 아래로 이어 놓아 다른 카드와 겹치지 않는다', () => {
    const take = api().addVideoTake(A)!

    expect(find(take).position.x).toBe(find(A1).position.x)
    expect(find(take).position.y).toBe(bottom(box(find(A1))) + 56)
    expect(overlapping()).toEqual([])
  })

  // 왜: 검토 C 1번. 테이크가 없던 샷의 첫 테이크도 예전 간격에 놓여 다음 씬의 테이크와 겹쳤다. 시안처럼 샷 오른쪽 96(그 씬의 테이크 열)에 둔다.
  it('자동 정렬 뒤 테이크가 없던 샷의 첫 테이크는 그 씬의 테이크 열(샷 오른쪽 96)에 놓아 다른 카드와 겹치지 않는다', () => {
    const take = api().addVideoTake(B)!

    expect(find(take).position.x).toBe(find(B).position.x + 280 + 96)
    expect(find(take).position.x).toBe(find(A1).position.x)
    expect(find(take).position.y).toBe(find(B).position.y)
    expect(overlapping()).toEqual([])
  })

  // 왜: 검토 C 1번. 새 샷이 씬 y + 순번×560 에 놓여 정렬로 촘촘해진 셋째 샷 위에 겹쳤다. 그 씬 샷 열의 맨 아래 줄(샷과 그 테이크) 밑에 둔다.
  it('자동 정렬 뒤 새로 만든 샷은 그 씬 샷 열의 맨 아래 줄 밑에 놓아 다른 카드와 겹치지 않는다', () => {
    const at = nextShotPosition(api(), S1)
    const shot = api().addShotNode(S1, at, 'ShotC')

    expect(at.x).toBe(find(A).position.x)
    expect(at.y).toBe(bottom(box(find(B))) + 56)
    expect(find(shot).position).toEqual(at)
    expect(overlapping()).toEqual([])
  })

  // 왜: 정한 자리에 다른 카드(사람이 둔 프롬프트 노드 등)가 있으면 그 카드 밑으로 내려 겹치지 않게 한다(리드 2026-11-10 "안 겹칠 때까지 아래로").
  it('새 테이크 · 샷 자리가 다른 카드와 겹치면 안 겹칠 때까지 아래로 내린다', () => {
    const under = bottom(box(find(A1))) + 56
    const prompt = api().addPromptNode({ x: find(A1).position.x, y: under })
    measure([prompt], { width: 240, height: 150 })

    const take = api().addVideoTake(A)!

    expect(find(take).position.y).toBe(under + 150 + 56)
    expect(overlapping()).toEqual([])
  })

  // 왜: 정상 경로 고정. 새 씬 묶음의 기본 자리(씬 묶음 폭)는 그대로다(리드 2026-11-10 "씬 묶음 폭은 그대로").
  it('새 씬 묶음의 기본 자리는 예전 묶음 폭 그대로다', () => {
    const right = Math.max(...api().nodes.filter((n) => n.data.kind === 'scene').map((n) => n.position.x))

    expect(nextScenePosition(api()).x - right).toBe(1780)
    expect(find(S2).data.kind).toBe('scene')
  })
})

describe('혼자 정한 것 · 테이크 없는 씬', () => {
  let E: string, F: string
  beforeEach(() => {
    api().reset()
    api().setProjectId('place-project-empty')
    const s1 = api().addSceneNode({ x: 380, y: 80 }, 'S1')
    E = api().addShotNode(s1, { x: 740, y: 80 }, 'ShotE')
    const s2 = api().addSceneNode({ x: 2160, y: 80 }, 'S2')
    F = api().addShotNode(s2, { x: 2520, y: 80 }, 'ShotF')
    const f1 = api().addVideoTake(F)!
    measure([E, F], SHOT)
    measure([f1], TAKE)
    useDirectorCanvasStore.setState({ persistNodePosition: () => {} })
    api().relayoutCanvas()
  })

  // 왜: 검토 C 브라우저 확인(개발 DB 77dfa43c). 테이크가 하나도 없는 씬은 정렬하면 다음 씬 샷 열이 샷 오른쪽 160 에 붙어,
  //   그 씬에서 처음 만든 테이크가 옆 씬 샷과 겹쳐 그 열 맨 아래(약 2,900 아래)로 밀렸다. 영상 열 자리를 비워 두면 샷 바로 오른쪽에 놓인다.
  it('테이크가 없는 씬도 자동 정렬은 영상 열 자리를 비워 두어, 처음 만든 테이크가 샷 바로 오른쪽에 놓인다', () => {
    expect(find(F).position.x - (find(E).position.x + 280)).toBe(96 + 240 + 160)

    const take = api().addVideoTake(E)!

    expect(find(take).position).toEqual({ x: find(E).position.x + 280 + 96, y: find(E).position.y })
    expect(overlapping()).toEqual([])
  })
})
