// [자동 정렬]은 옮기지 않는 카드를 피하고, 카드 크기를 지금 화면에서 잰 값 · 예전 값 · 넉넉한 값으로 알맞게 센다 (검토 C 2 · 3번, 리드 2026-11-10)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARRANGE_WAIT_FRAMES,
  arrangeDirectorCanvas,
  arrangeOnceCardsRendered,
  generousCardSize,
  UNMEASURED_NODE_SIZE,
} from '@/features/director/canvas-layout'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import type { DirectorNode } from '@/types/director'

function node(id: string, data: Record<string, unknown>, size?: { width: number; height: number }, at = { x: 0, y: 0 }): DirectorNode {
  return { id, type: String(data.kind), position: at, data, ...(size ? { measured: size } : {}) } as unknown as DirectorNode
}
const scene = (id: string) => node(id, { kind: 'scene', label: id })
const shot = (id: string, height = 290, y = 0) => node(id, { kind: 'shot', label: id, parentSceneNodeId: 'S' }, { width: 280, height }, { x: 0, y })
const prompt = (id: string, at: { x: number; y: number }) => node(id, { kind: 'prompt', label: id }, { width: 240, height: 160 }, at)
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
/** 화면 다시 그리기(프레임)를 손으로 한 번씩 돌린다. */
function frames() {
  let next = 1
  const due = new Map<number, () => void>()
  return {
    requestFrame: (callback: () => void) => {
      due.set(next, callback)
      return next++
    },
    cancelFrame: (handle: number) => {
      due.delete(handle)
    },
    run: () => {
      const now = [...due.values()]
      due.clear()
      for (const callback of now) callback()
    },
  }
}

describe('혼자 정한 것', () => {
  // 왜: 검토 C 2번. 에셋이 없는 캔버스에서 정렬하면 첫 샷 열이 (80, 80)으로 와, 툴바 [프롬프트 노드]의 기본 자리(80, 120 …)와 겹쳤다.
  it('에셋 없는 캔버스에서 정렬해도 옮기지 않는 카드(프롬프트 노드 등)와 겹치지 않게 그 오른쪽에 놓는다', () => {
    const p = prompt('P', { x: 80, y: 120 })
    const placed = arrangeDirectorCanvas([scene('S'), shot('A'), p])
    const a = placed.get('A')!

    expect(a.x).toBeGreaterThanOrEqual(80 + 240 + 96)
    expect(overlaps({ x: a.x, y: a.y, w: 280, h: 290 }, { x: 80, y: 120, w: 240, h: 160 })).toBe(false)
  })

  // 왜: 정상 경로 고정. 옮기지 않는 카드가 정렬할 자리에서 멀리 있으면 정렬은 지금처럼 왼쪽 위에서 시작한다.
  it('옮기지 않는 카드가 정렬할 자리와 떨어져 있으면 정렬은 지금처럼 왼쪽 위에서 시작한다', () => {
    const placed = arrangeDirectorCanvas([scene('S'), shot('A'), prompt('P', { x: 5000, y: 5000 })])

    expect(placed.get('A')).toEqual({ x: 80, y: 80 })
  })

  // 왜: [자동 정렬]은 누르는 순간 화면에 그린 카드의 지금 크기(DOM)를 받아 센다. 예전에 잰 크기가 남아 있어도 지금 크기가 맞다.
  it('자동 정렬은 화면에 그려진 카드를 지금 잰 크기로 센다', () => {
    const fresh = new Map([['A', { width: 280, height: 500 }], ['B', { width: 280, height: 290 }]])
    const placed = arrangeDirectorCanvas([scene('S'), shot('A', 290, 0), shot('B', 290, 1)], { fresh })

    expect(placed.get('B')!.y - placed.get('A')!.y).toBe(500 + 56)
  })

  // 왜: 검토 C 3번. 화면 밖이라 그리지 않은 카드는 예전에 잰 크기가 남아 있어, 그 뒤 커졌어도(실패 표시 · 참조 그림) 작게 셌다.
  it('화면 밖 카드는 예전에 잰 크기와 넉넉한 크기 중 큰 값으로 센다', () => {
    const fresh = new Map([['B', { width: 280, height: 290 }]])
    const small = arrangeDirectorCanvas([scene('S'), shot('A', 290, 0), shot('B', 290, 1)], { fresh })
    const big = arrangeDirectorCanvas([scene('S'), shot('A', 800, 0), shot('B', 290, 1)], { fresh })

    expect(small.get('B')!.y - small.get('A')!.y).toBe(UNMEASURED_NODE_SIZE.shot.height + 56)
    expect(big.get('B')!.y - big.get('A')!.y).toBe(800 + 56)
  })

  // 왜: 검토 C 3번. 예전 넉넉한 샷 높이(420)는 세로 그림 · 참조 그림 줄 · 실패 표시 + 러프가 다 있는 샷(약 672)보다 작았다.
  //   세로 · 정사각 포맷은 그 최대치로, 가로 포맷은 가로 최대치(약 476)로 센다.
  it('크기를 모르는 샷은 세로 그림 · 참조 · 실패 표시가 다 있어도 들어갈 만큼 넉넉하게 센다', () => {
    expect(generousCardSize('shot', true).height).toBeGreaterThanOrEqual(672)
    expect(generousCardSize('shot', false).height).toBeGreaterThanOrEqual(476)
    expect(UNMEASURED_NODE_SIZE.shot.height).toBe(generousCardSize('shot', false).height)
  })
})

describe('혼자 정한 것 · 잴 때까지 기다리기', () => {
  // 왜: 검토 C 3번. 화면 밖 카드는 그려져 있지 않아 지금 크기를 모르고, 넉넉한 크기로 세면 보고 있는 곳(확대 정도)에 따라 정렬 간격이 달라진다.
  //   [자동 정렬]을 누르면 캔버스가 화면 밖 카드까지 잠깐 그리고, 다 그려진 다음 그 크기로 한 번 정렬한다.
  it('자동 정렬은 화면 밖 카드까지 다 그려 크기를 잰 다음에 정렬한다', () => {
    const frame = frames()
    const rendered = new Set(['A'])
    const arrange = vi.fn()
    arrangeOnceCardsRendered({ cardIds: () => ['A', 'B'], renderedIds: () => rendered, arrange, ...frame })

    frame.run()
    expect(arrange).not.toHaveBeenCalled()
    rendered.add('B')
    frame.run()
    expect(arrange).toHaveBeenCalledTimes(1)
    frame.run()
    expect(arrange).toHaveBeenCalledTimes(1)
  })

  // 왜: 캔버스가 어떤 카드를 끝내 그리지 못해도 [자동 정렬]이 멈춰 있으면 안 된다. 못 잰 카드는 예전 크기와 넉넉한 크기 중 큰 값으로 센다.
  it('카드가 끝내 다 그려지지 않아도 잠깐(열 프레임) 뒤에는 정렬한다', () => {
    const frame = frames()
    const arrange = vi.fn()
    arrangeOnceCardsRendered({ cardIds: () => ['A', 'B'], renderedIds: () => new Set(['A']), arrange, ...frame })

    for (let i = 1; i < ARRANGE_WAIT_FRAMES; i++) frame.run()
    expect(arrange).not.toHaveBeenCalled()
    frame.run()
    expect(arrange).toHaveBeenCalledTimes(1)
    expect(ARRANGE_WAIT_FRAMES).toBe(10)
  })

  // 왜: 기다리는 동안 캔버스가 사라지면(Storyboard 보기로 바꿈) 사라진 화면의 크기로 정렬하지 않는다. 정렬은 캔버스가 다시 열릴 때 한다.
  it('정렬을 기다리는 중에 캔버스가 닫히면 그 캔버스는 정렬하지 않는다', () => {
    const frame = frames()
    const arrange = vi.fn()
    const stop = arrangeOnceCardsRendered({ cardIds: () => ['A'], renderedIds: () => new Set(), arrange, ...frame })

    frame.run()
    stop()
    for (let i = 0; i < ARRANGE_WAIT_FRAMES * 2; i++) frame.run()
    expect(arrange).not.toHaveBeenCalled()
  })
})

describe('혼자 정한 것 · 정렬 부탁', () => {
  const api = () => useDirectorCanvasStore.getState()
  beforeEach(() => {
    api().reset()
    useAssetStorageStore.getState().reset()
    api().setProjectId('arrange-project')
    useDirectorCanvasStore.setState({ persistNodePosition: () => {} })
  })

  // 왜: 완성 프로젝트는 카드가 많아 늘 다 그리면 느려서 캔버스는 보이는 카드만 그린다. [자동 정렬]을 누른 동안만 모든 카드를 그려
  //   크기를 재고, 정렬이 끝나면 다시 보이는 카드만 그린다.
  it('[자동 정렬]을 누르면 정렬할 때까지 캔버스가 화면 밖 카드도 그리고, 정렬하면 다시 보이는 카드만 그린다', () => {
    expect(api().arrangePending).toBe(false)
    api().requestArrange()
    expect(api().arrangePending).toBe(true)
    api().relayoutCanvas()
    expect(api().arrangePending).toBe(false)
  })

  // 왜: [자동 정렬]을 누르자마자 다른 프로젝트로 가면, 기다리던 정렬이 새 프로젝트의 카드를 옮겨 저장하면 안 된다.
  it('정렬을 기다리는 중에 다른 프로젝트로 가면 그 정렬은 하지 않는다', () => {
    api().requestArrange()
    api().setProjectId('arrange-other-project')
    expect(api().arrangePending).toBe(false)

    api().requestArrange()
    api().reset()
    expect(api().arrangePending).toBe(false)
  })
})
