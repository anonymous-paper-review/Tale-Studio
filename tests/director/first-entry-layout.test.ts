// Director 에 처음 들어갔을 때(DB 에 저장된 자리가 없을 때) 노드 보기는 [자동 정렬]과 같은 간격으로 놓이고, 사람이 놓은 자리는 건드리지 않는다 (오너 2026-11-16)
import { readFileSync } from 'node:fs'
import type { XYPosition } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { arrangeDirectorCanvas } from '@/features/director/canvas-layout'
import { cardsUnmovedSince, firstEntryViewport, isAutoPlacedCandidate, snapshotCardPositions } from '@/features/director/first-entry-layout'
import { arrangeIfFirstEntry, type FirstEntryCheck } from '@/features/director/hooks/use-writer-director-sync'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { nextScenePosition, nextShotPosition, useDirectorCanvasStore } from '@/stores/director-store'
import type { DirectorNode } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
const SHOT_SIZE = { width: 280, height: 287 }
const PROJECT = 'first-entry-project'

/**
 * 카드를 처음 배치 함수 자리에 놓는다 — 동기화가 카드를 새로 만들 때와, 브라우저 저장본이 옛 카드를 되살려 놓았을 때가 같은 모양이다
 * (둘 다 Writer 에서 온 씬 · 샷 카드가 옛 간격 자리에 있다).
 */
function createCards(shotsPerScene: number[]) {
  const sceneIds: string[] = []
  const shotIds: string[] = []
  shotsPerScene.forEach((count, s) => {
    const writerSceneId = `sc_0${s + 1}`
    const sceneId = api().addSceneNode(nextScenePosition(api()), writerSceneId)
    api().updateNodeData<'scene'>(sceneId, { writerSceneId })
    sceneIds.push(sceneId)
    for (let i = 0; i < count; i++) {
      const writerShotId = `sh_0${s + 1}_0${i + 1}`
      const shotId = api().addShotNode(sceneId, nextShotPosition(api(), sceneId), writerShotId)
      api().updateNodeData<'shot'>(shotId, { writerShotId })
      shotIds.push(shotId)
    }
  })
  return { sceneIds, shotIds }
}

/** DB 가 "저장된 자리 · 영상 테이크가 있다/없다"고 답한 점검(카드 자리는 지금 그대로 찍어 둔다). */
const checkWith = (saved: boolean): FirstEntryCheck => ({ saved: Promise.resolve(saved), snapshot: snapshotCardPositions(api().nodes) })

/** 화면이 카드를 그려 크기를 쟀다고 본다(진짜 샷 카드는 280x287 — 넉넉한 크기 480 보다 훨씬 작다). */
function measureShots(shotIds: string[]) {
  useDirectorCanvasStore.setState((s) => ({
    nodes: s.nodes.map((n) => (shotIds.includes(n.id) ? { ...n, measured: SHOT_SIZE } : n)),
  }))
}

const moveCard = (id: string, position: XYPosition) =>
  useDirectorCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)) }))

const at = (id: string): XYPosition => api().nodes.find((n) => n.id === id)!.position

const registerCharacter = () =>
  useAssetStorageStore.getState().registerCharacter('char-1', {
    projectId: PROJECT, sourceCanvasNodeId: 'artist-char-1', name: '주인공', alias: '', background: '',
    description: '', prompt: '', referenceImages: [], views: { single: [], fiveView: [], sixteenAngle: [] }, statusVariants: [],
  })

/** 진짜 저장 함수(끌기를 마치고 0.5초 뒤 DB 에 쓰도록 예약한다). 저장 예약 시험에서만 쓴다. */
const realPersistNodePosition = useDirectorCanvasStore.getState().persistNodePosition

beforeEach(() => {
  api().reset()
  useAssetStorageStore.getState().reset()
  api().setProjectId(PROJECT)
  // 정렬이 카드 자리를 저장하려고 남긴 0.5초 예약이 다음 시험의 "아직 저장 안 된 끌기" 점검에 걸리지 않게, 저장은 기본으로 막아 둔다.
  useDirectorCanvasStore.setState({ persistNodePosition: vi.fn() })
})

describe('처음 들어갔을 때 놓는 자리', () => {
  // 왜: 오너 2026-11-16 "director탭 처음 들어갔을 때 node 뷰의 거리가 너무 먼데 auto-arrange가 아직 안 적용된 것 같아".
  //   처음엔 막 만든 카드를 넉넉한 크기(샷 480)로 세어 같은 열 샷 사이가 249, 씬 묶음 사이가 1780 이었다([자동 정렬] 뒤는 56 · 776).
  it('Director 에 처음 들어갔을 때 노드 보기는 [자동 정렬]과 같은 간격으로 놓인다', async () => {
    const { shotIds } = createCards([2, 2])
    api().updateNodeData<'shot'>(shotIds[0]!, { characterAssetIds: ['char-1'] })
    registerCharacter()
    api().rebuildAssetNodes()
    measureShots(shotIds)
    const expected = arrangeDirectorCanvas(api().nodes)

    expect(await arrangeIfFirstEntry(PROJECT, checkWith(false))).toBe(true)
    expect(api().arrangePending).toBe(true)
    api().relayoutCanvas()

    // [자동 정렬]을 같은 카드에 누른 것과 같은 자리
    for (const node of api().nodes) {
      const place = expected.get(node.id)
      if (place) expect(node.position).toEqual(place)
    }
    // 간격으로 읽으면: 같은 열 샷 사이 56 · 씬 묶음 사이 776(샷 280 + 열 96 + 영상 열 240 + 묶음 160) · 에셋 열과 첫 샷 열 사이 116
    const [a, b, c] = shotIds as [string, string, string]
    expect(at(b).y - (at(a).y + SHOT_SIZE.height)).toBe(56)
    expect(at(c).x - at(a).x).toBe(776)
    const card = api().nodes.find((n) => n.data.kind === 'asset')!
    expect(at(a).x - (card.position.x + 240)).toBe(116)
  })

  // 왜: 리드 2026-11-16 — 오너가 지금 보는 프로젝트는 이미 한 번 열어 본 것이라 브라우저에 옛 간격 자리가 남아 있다. 새 프로젝트만 고치면 오너가 고쳐진 것을 못 본다.
  //   "처음"은 DB 기준이다: 저장된 자리가 하나도 없으면 사람이 자리를 놓은 적이 없다(끌면 바로 저장된다).
  it('브라우저에 옛 간격 자리가 남아 있어도 DB 에 저장된 자리가 하나도 없으면 한 번 정렬하고 저장한다', async () => {
    const { sceneIds, shotIds } = createCards([2, 1])
    measureShots(shotIds)
    const persist = vi.fn()
    useDirectorCanvasStore.setState({ persistNodePosition: persist })
    // 옛 자리: 같은 열 샷 사이 249(= 536 - 287), 씬 묶음 사이 1780
    expect(at(shotIds[1]!).y - (at(shotIds[0]!).y + SHOT_SIZE.height)).toBe(249)
    expect(at(shotIds[2]!).x - at(shotIds[0]!).x).toBe(1780)

    expect(await arrangeIfFirstEntry(PROJECT, checkWith(false))).toBe(true)
    api().relayoutCanvas()

    expect(at(shotIds[1]!).y - (at(shotIds[0]!).y + SHOT_SIZE.height)).toBe(56)
    expect(at(shotIds[2]!).x - at(shotIds[0]!).x).toBe(776)
    expect(persist.mock.calls.map(([id]) => id)).toEqual(expect.arrayContaining([...sceneIds, ...shotIds]))
  })

  // 왜: 처음 놓은 자리를 저장하지 않으면 다른 기기에서 열 때마다 다시 놓여 자리가 달라 보인다. 단추와 같은 길(relayoutCanvas)이라 저장도 같다.
  it('처음 놓은 자리는 [자동 정렬]처럼 저장해 다시 열어도 그 자리다', async () => {
    const { sceneIds, shotIds } = createCards([2])
    measureShots(shotIds)
    const persist = vi.fn()
    useDirectorCanvasStore.setState({ persistNodePosition: persist })

    await arrangeIfFirstEntry(PROJECT, checkWith(false))
    api().relayoutCanvas()

    expect(persist.mock.calls.map(([id]) => id)).toEqual(expect.arrayContaining([...sceneIds, ...shotIds]))
  })

  // 왜: 처음 정렬은 동기화 셋업과 같은 시스템 변경이다(훅의 "sync 셋업은 undo 히스토리에서 제외"). 남기면 Ctrl+Z 가 카드를 첫 자리(먼 간격)로 되돌린다.
  //   [자동 정렬] 단추는 사람이 누른 것이라 지금처럼 기록에 남긴다.
  it('처음 놓는 정렬은 되돌리기 기록에 남기지 않고, [자동 정렬] 단추는 지금처럼 남긴다', async () => {
    const { shotIds } = createCards([2])
    measureShots(shotIds)
    const before = api().historyPast.length

    await arrangeIfFirstEntry(PROJECT, checkWith(false))
    api().relayoutCanvas()
    expect(api().historyPast.length).toBe(before)
    expect(api().arrangeFirstEntry).toBe(false)
    expect(api().arrangePending).toBe(false)

    api().requestArrange()
    expect(api().arrangeFirstEntry).toBe(false)
    api().relayoutCanvas()
    expect(api().historyPast.length).toBe(before + 1)
  })
})

describe('처음으로 보는 때와 안 보는 때', () => {
  // 왜: 저장된 자리(DB canvas_position)는 사람이 끌었거나 정렬한 것이다. 실제 화면에서 확인한 사고다(2026-11-16 개발 DB): 진입 때 DB 읽기가 둘 겹쳐 돌아
  //   먼저 끝난 쪽은 저장된 자리를 카드에 못 싣고 버려진다 — 그 시점엔 카드가 아직 옛 자리라 카드 자리만 보고 정렬하면 사람이 저장해 둔 자리가 덮였다.
  //   그래서 DB 에 저장된 자리가 있으면 카드가 어디에 있든(저장된 자리가 이미 들어왔든 아직 안 들어왔든) 그대로 둔다.
  it('DB 에 사람이 저장한 자리가 하나라도 있으면 카드가 어디에 있든 그대로 둔다', async () => {
    const { shotIds } = createCards([2, 1])
    measureShots(shotIds)
    // 아직 안 들어온 경우: 카드는 옛 자리 그대로
    const oldSpots = shotIds.map((id) => ({ ...at(id) }))

    expect(await arrangeIfFirstEntry(PROJECT, checkWith(true))).toBe(false)
    expect(api().arrangePending).toBe(false)
    expect(shotIds.map((id) => at(id))).toEqual(oldSpots)

    // 이미 들어온 경우: 저장된 샷 자리가 카드에 실려 있다
    moveCard(shotIds[1]!, { x: 12, y: 34 })
    expect(await arrangeIfFirstEntry(PROJECT, checkWith(true))).toBe(false)
    expect(api().arrangePending).toBe(false)
    expect(at(shotIds[1]!)).toEqual({ x: 12, y: 34 })
  })

  // 왜: DB 를 읽는 동안(수백 ms) 사람이 카드를 끌었을 수 있다. 읽고 난 뒤에 카드를 다시 보고, 옮겨졌으면 그 자리를 지킨다.
  it('DB 를 읽는 사이에 카드가 옮겨졌으면 정렬하지 않는다', async () => {
    const { shotIds } = createCards([2])
    measureShots(shotIds)
    let answer!: (saved: boolean) => void
    const slow: FirstEntryCheck = { saved: new Promise<boolean>((resolve) => { answer = resolve }), snapshot: snapshotCardPositions(api().nodes) }

    const decided = arrangeIfFirstEntry(PROJECT, slow)
    moveCard(shotIds[0]!, { x: 50, y: 60 })
    answer(false)

    expect(await decided).toBe(false)
    expect(api().arrangePending).toBe(false)
    expect(at(shotIds[0]!)).toEqual({ x: 50, y: 60 })
  })

  // 왜: DB 를 읽는 사이에 카드가 새로 생겼으면(다른 화면에서 샷을 더함) 점검한 카드와 다른 캔버스다 — 다시 점검하지 않고는 놓지 않는다.
  it('DB 를 읽는 사이에 카드가 새로 생겼으면 정렬하지 않는다', async () => {
    const { sceneIds, shotIds } = createCards([2])
    measureShots(shotIds)
    let answer!: (saved: boolean) => void
    const slow: FirstEntryCheck = { saved: new Promise<boolean>((resolve) => { answer = resolve }), snapshot: snapshotCardPositions(api().nodes) }

    const decided = arrangeIfFirstEntry(PROJECT, slow)
    const extra = api().addShotNode(sceneIds[0]!, { x: 700, y: 900 }, 'sh_01_09')
    api().updateNodeData<'shot'>(extra, { writerShotId: 'sh_01_09' })
    answer(false)

    expect(await decided).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: 끌고 나서 0.5초 동안은 자리가 아직 DB 에 안 갔다(저장은 끌기를 멈춘 0.5초 뒤). 그 사이 DB 를 읽으면 "저장된 자리 없음"으로 보여 방금 끈 자리를 덮는다.
  it('아직 DB 에 저장되지 않은 끌기가 남아 있으면 정렬하지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const { shotIds } = createCards([2])
      measureShots(shotIds)
      realPersistNodePosition(shotIds[0]!) // 끌기를 막 마침 — 0.5초 뒤 저장 예정

      expect(await arrangeIfFirstEntry(PROJECT, checkWith(false))).toBe(false)
      expect(api().arrangePending).toBe(false)
    } finally {
      // 예약된 저장을 흘려보낸다(다음 시험에 남기지 않는다). 카드를 비워 두면 저장 시도 없이 끝난다.
      useDirectorCanvasStore.setState({ nodes: [] })
      await vi.advanceTimersByTimeAsync(600)
      vi.useRealTimers()
    }
  })

  // 왜: 영상 테이크가 있으면 이미 작업이 진행된 캔버스고, 테이크 자리는 만들 때 저장돼 있다. 다시 놓으면 저장된 자리를 새로 쓴다.
  it('영상 테이크가 이미 있으면 처음으로 보지 않는다', async () => {
    const { shotIds } = createCards([2])
    api().addVideoTake(shotIds[0]!)

    expect(await arrangeIfFirstEntry(PROJECT)).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: Writer 와 이어지지 않은 카드는 사람이 Director 에서 직접 만들고 놓은 것이다(그 자리는 DB 에 저장되지도 않는다).
  it('Director 에서 직접 만든 카드(Writer 와 이어지지 않은 샷 · 프롬프트 노드)가 있으면 처음으로 보지 않는다', async () => {
    createCards([2])
    api().addPromptNode({ x: 5, y: 5 })
    expect(await arrangeIfFirstEntry(PROJECT)).toBe(false)

    api().reset()
    api().setProjectId(PROJECT)
    const { sceneIds } = createCards([2])
    api().addShotNode(sceneIds[0]!, { x: 700, y: 900 }, 'New Shot')
    expect(await arrangeIfFirstEntry(PROJECT)).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: 카드가 없으면 놓을 것이 없다. 빈 캔버스에서 정렬을 요청하면 쓸데없이 화면을 다시 맞춘다.
  it('카드가 하나도 없으면 정렬을 요청하지 않는다', async () => {
    expect(await arrangeIfFirstEntry(PROJECT)).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: 순수 판별 함수가 훅 밖에서도 같은 답을 낸다 — 파생 카드(에셋 열 · 체인)는 매번 다시 만드는 것이라 사람이 놓은 자리로 세지 않는다.
  it('에셋 열 같은 파생 카드가 섞여 있어도 Writer 카드만 있으면 처음 놓인 캔버스 후보다', () => {
    const { shotIds } = createCards([2])
    api().updateNodeData<'shot'>(shotIds[0]!, { characterAssetIds: ['char-1'] })
    registerCharacter()
    api().rebuildAssetNodes()

    expect(api().nodes.some((n) => n.data.kind === 'asset')).toBe(true)
    expect(isAutoPlacedCandidate(api().nodes as DirectorNode[])).toBe(true)
  })

  // 왜: 점검한 때의 카드 자리를 찍어 두고, 지금 카드가 그대로인지 본다 — 끌기 · 새 카드를 가르는 재료다.
  it('점검한 뒤 카드가 옮겨지거나 새로 생기면 그대로가 아니다', () => {
    const { sceneIds, shotIds } = createCards([2])
    const snapshot = snapshotCardPositions(api().nodes)
    expect(cardsUnmovedSince(api().nodes, snapshot)).toBe(true)

    moveCard(shotIds[0]!, { x: 1, y: 2 })
    expect(cardsUnmovedSince(api().nodes, snapshot)).toBe(false)

    moveCard(shotIds[0]!, snapshot.get(shotIds[0]!)!)
    expect(cardsUnmovedSince(api().nodes, snapshot)).toBe(true)

    api().addShotNode(sceneIds[0]!, { x: 700, y: 900 }, 'sh_01_09')
    expect(cardsUnmovedSince(api().nodes, snapshot)).toBe(false)
  })
})

describe('처음 놓은 뒤 첫 화면', () => {
  // 왜: 첫 화면은 가장 왼쪽 샷을 가운데에 두는 0.75 배다. 지금 코드에 박혀 있던 값을 함수로 빼며 그대로 못 박는다.
  it('첫 화면은 가장 왼쪽 샷을 가운데에 두고 0.75 배로 보여 준다', () => {
    const left = { id: 'l', data: { kind: 'shot' }, position: { x: 436, y: 80 } } as unknown as DirectorNode
    const right = { id: 'r', data: { kind: 'shot' }, position: { x: 1212, y: 80 } } as unknown as DirectorNode
    const asset = { id: 'a', data: { kind: 'asset' }, position: { x: 80, y: 80 } } as unknown as DirectorNode

    expect(firstEntryViewport([right, asset, left], { width: 1000, height: 600 })).toEqual({
      x: 500 - (436 + 130) * 0.75,
      y: 200 - (80 + 60) * 0.75,
      zoom: 0.75,
    })
  })

  // 왜: 샷이 아직 없는 캔버스에는 가운데에 둘 샷이 없다. 화면을 옮기지 않고 지금 화면 그대로 둔다(옛 첫 화면 효과가 하던 일과 같다).
  it('샷이 없으면 맞출 자리가 없다', () => {
    expect(firstEntryViewport([], { width: 1000, height: 600 })).toBeNull()
  })

  // 왜: 처음 정렬이 카드를 왼쪽으로 당기는데 화면이 그대로면 채팅을 열었을 때 에셋 열이 왼쪽 밖으로 잘린다(약 55px).
  //   화면 맞추기는 움직이는 중인 첫 화면을 끊어야 하므로 움직임이 있는 짧은 맞추기(duration 250)로 한다 — 0 이면 끊지 못해 옛 자리로 되돌아간다.
  it('화면은 처음 정렬이 끝나면 새 자리 기준으로 첫 화면을 다시 맞춘다', () => {
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toMatch(/const firstEntry = (?:useDirectorCanvasStore\.getState\(\)|store)\.arrangeFirstEntry/)
    expect(page).toMatch(/firstEntryViewport\(useDirectorCanvasStore\.getState\(\)\.nodes,/)
    expect(page).toMatch(/applyViewport\(target, \{ duration: 250 \}\)/)
    // 정렬 뒤에 맞춘다: 정렬(relayoutCanvas)이 먼저, 화면 맞추기가 나중.
    const arrangeBlock = page.slice(page.indexOf('arrange: () => {'), page.indexOf('arrange: () => {') + 600)
    expect(arrangeBlock.indexOf('relayoutCanvas()')).toBeGreaterThan(-1)
    expect(arrangeBlock.indexOf('reframeFirstShot()')).toBeGreaterThan(arrangeBlock.indexOf('relayoutCanvas()'))
  })
})

describe('동기화 훅 배선', () => {
  // 왜: 점검(DB 에 저장된 자리 · 영상 테이크)을 안 시작하거나 정렬을 안 부르면 위 규칙이 있어도 화면에서는 아무 일도 안 일어난다.
  //   점검은 카드가 갖춰진 직후 시작해야(Pass 2.5 의 DB 읽기와 함께 돈다) 정렬을 기다리게 하지 않는다.
  it('동기화는 카드가 갖춰지면 DB 점검을 시작해 두었다가, 에셋 열을 다시 만든 뒤 처음 정렬을 한 번 요청한다', () => {
    const hook = readFileSync('src/features/director/hooks/use-writer-director-sync.ts', 'utf8')
    const start = hook.indexOf('firstEntry.check = startFirstEntryCheck(entryProjectId)')
    const hydrate = hook.indexOf('await hydrateVideoTakes(projectId)')
    const rebuild = hook.indexOf('useDirectorCanvasStore.getState().rebuildAssetNodes()')
    const request = hook.indexOf('await arrangeIfFirstEntry(entryProjectId, firstEntry.check)')
    expect(start).toBeGreaterThan(-1)
    expect(start).toBeLessThan(hydrate)
    expect(request).toBeGreaterThan(rebuild)
    expect(hook).toMatch(/if \(firstEntry\.check === undefined\) firstEntry\.check = startFirstEntryCheck\(entryProjectId\)/)
    expect(hook).toMatch(/if \(!firstEntry\.requested\) \{\s*firstEntry\.requested = true\s*await arrangeIfFirstEntry/)
  })
})
