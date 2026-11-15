// Director 에 처음 들어갔을 때 노드 보기는 [자동 정렬]과 같은 간격으로 놓이고, 사람이 놓은 자리는 건드리지 않는다 (오너 2026-11-16)
import { readFileSync } from 'node:fs'
import type { XYPosition } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { arrangeDirectorCanvas } from '@/features/director/canvas-layout'
import { firstEntryViewport, isUntouchedFirstLayout } from '@/features/director/first-entry-layout'
import { arrangeIfFirstEntry, rememberFirstPlacement } from '@/features/director/hooks/use-writer-director-sync'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { nextScenePosition, nextShotPosition, useDirectorCanvasStore } from '@/stores/director-store'
import type { DirectorNode } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
const SHOT_SIZE = { width: 280, height: 287 }
const PROJECT = 'first-entry-project'
/** DB 에 저장된 자리 · 영상 테이크가 없다는 답 / 있다는 답. */
const noSaved = Promise.resolve(false)
const hasSaved = Promise.resolve(true)

/** 동기화 훅이 처음 들어갈 때 하는 일: 씬 · 샷 카드를 처음 배치 함수 자리에 만들고, 만든 카드의 처음 자리를 기억한다. */
function enterFirstTime(shotsPerScene: number[]) {
  const placedAt = new Map<string, XYPosition>()
  const sceneIds: string[] = []
  const shotIds: string[] = []
  shotsPerScene.forEach((count, s) => {
    const writerSceneId = `sc_0${s + 1}`
    const sceneId = api().addSceneNode(nextScenePosition(api()), writerSceneId)
    api().updateNodeData<'scene'>(sceneId, { writerSceneId })
    rememberFirstPlacement(placedAt, sceneId)
    sceneIds.push(sceneId)
    for (let i = 0; i < count; i++) {
      const writerShotId = `sh_0${s + 1}_0${i + 1}`
      const shotId = api().addShotNode(sceneId, nextShotPosition(api(), sceneId), writerShotId)
      api().updateNodeData<'shot'>(shotId, { writerShotId })
      rememberFirstPlacement(placedAt, shotId)
      shotIds.push(shotId)
    }
  })
  return { placedAt, sceneIds, shotIds }
}

/** 화면이 카드를 그려 크기를 쟀다고 본다(진짜 샷 카드는 280x287 — 넉넉한 크기 480 보다 훨씬 작다). */
function measureShots(shotIds: string[]) {
  useDirectorCanvasStore.setState((s) => ({
    nodes: s.nodes.map((n) => (shotIds.includes(n.id) ? { ...n, measured: SHOT_SIZE } : n)),
  }))
}

const at = (id: string): XYPosition => api().nodes.find((n) => n.id === id)!.position

beforeEach(() => {
  api().reset()
  useAssetStorageStore.getState().reset()
  api().setProjectId(PROJECT)
})

describe('처음 들어갔을 때 놓는 자리', () => {
  // 왜: 오너 2026-11-16 "director탭 처음 들어갔을 때 node 뷰의 거리가 너무 먼데 auto-arrange가 아직 안 적용된 것 같아".
  //   처음엔 막 만든 카드를 넉넉한 크기(샷 480)로 세어 같은 열 샷 사이가 249, 씬 묶음 사이가 1780 이었다([자동 정렬] 뒤는 56 · 776).
  it('Director 에 처음 들어갔을 때 노드 보기는 [자동 정렬]과 같은 간격으로 놓인다', async () => {
    const { placedAt, shotIds } = enterFirstTime([2, 2])
    api().updateNodeData<'shot'>(shotIds[0]!, { characterAssetIds: ['char-1'] })
    useAssetStorageStore.getState().registerCharacter('char-1', {
      projectId: PROJECT, sourceCanvasNodeId: 'artist-char-1', name: '주인공', alias: '', background: '',
      description: '', prompt: '', referenceImages: [], views: { single: [], fiveView: [], sixteenAngle: [] }, statusVariants: [],
    })
    api().rebuildAssetNodes()
    measureShots(shotIds)
    const expected = arrangeDirectorCanvas(api().nodes)

    expect(await arrangeIfFirstEntry(placedAt, PROJECT, noSaved)).toBe(true)
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

  // 왜: 처음 놓은 자리를 저장하지 않으면 다른 기기에서 열 때마다 다시 놓여 자리가 달라 보인다. 단추와 같은 길(relayoutCanvas)이라 저장도 같다.
  it('처음 놓은 자리는 [자동 정렬]처럼 저장해 다시 열어도 그 자리다', async () => {
    const { placedAt, sceneIds, shotIds } = enterFirstTime([2])
    measureShots(shotIds)
    const persist = vi.fn()
    useDirectorCanvasStore.setState({ persistNodePosition: persist })

    await arrangeIfFirstEntry(placedAt, PROJECT, noSaved)
    api().relayoutCanvas()

    expect(persist.mock.calls.map(([id]) => id)).toEqual(expect.arrayContaining([...sceneIds, ...shotIds]))
  })

  // 왜: 처음 정렬은 동기화 셋업과 같은 시스템 변경이다(훅의 "sync 셋업은 undo 히스토리에서 제외"). 남기면 Ctrl+Z 가 카드를 첫 자리(먼 간격)로 되돌린다.
  //   [자동 정렬] 단추는 사람이 누른 것이라 지금처럼 기록에 남긴다.
  it('처음 놓는 정렬은 되돌리기 기록에 남기지 않고, [자동 정렬] 단추는 지금처럼 남긴다', async () => {
    const { placedAt, shotIds } = enterFirstTime([2])
    measureShots(shotIds)
    const before = api().historyPast.length

    await arrangeIfFirstEntry(placedAt, PROJECT, noSaved)
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
  // 왜: 저장된 자리(DB canvas_position)는 사람이 끌었거나 정렬한 것이다. 동기화가 그 자리를 불러오면 카드가 처음 놓인 자리에서 옮겨진다 — 덮으면 안 된다.
  it('저장된 자리가 들어와 카드가 처음 놓인 자리에서 옮겨졌으면 처음으로 보지 않고 그 자리 그대로 둔다', async () => {
    const { placedAt, shotIds } = enterFirstTime([2, 1])
    useDirectorCanvasStore.setState((s) => ({
      nodes: s.nodes.map((n) => (n.id === shotIds[1] ? { ...n, position: { x: 12, y: 34 } } : n)),
    }))

    expect(await arrangeIfFirstEntry(placedAt, PROJECT, noSaved)).toBe(false)
    expect(api().arrangePending).toBe(false)
    expect(at(shotIds[1]!)).toEqual({ x: 12, y: 34 })
  })

  // 왜: 영상 테이크가 있으면 이미 작업이 진행된 캔버스고, 테이크 자리는 만들 때 저장돼 있다. 다시 놓으면 저장된 자리를 새로 쓴다.
  it('영상 테이크가 이미 있으면 처음으로 보지 않는다', async () => {
    const { placedAt, shotIds } = enterFirstTime([2])
    api().addVideoTake(shotIds[0]!)

    expect(await arrangeIfFirstEntry(placedAt, PROJECT, noSaved)).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: 실제 화면에서 확인한 사고다(2026-11-16 개발 DB). 진입 때 DB 읽기가 둘 겹쳐 돌아 먼저 끝난 쪽은 저장된 자리를 카드에 못 싣고 버려진다.
  //   그 시점엔 카드가 아직 처음 자리 그대로라, 카드 자리만 보고 정렬하면 사람이 저장해 둔 자리가 덮였다. DB 에 저장된 자리가 있으면 카드 자리와 상관없이 처음이 아니다.
  it('DB 에 저장된 자리가 있으면 카드에는 아직 안 들어와 처음 자리 그대로여도 처음으로 보지 않는다', async () => {
    const { placedAt } = enterFirstTime([2, 2])

    expect(await arrangeIfFirstEntry(placedAt, PROJECT, hasSaved)).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: DB 를 읽는 동안(수백 ms) 사람이 카드를 끌었을 수 있다. 읽고 난 뒤에 카드를 다시 보고, 옮겨졌으면 그 자리를 지킨다.
  it('DB 를 읽는 사이에 카드가 옮겨졌으면 정렬하지 않는다', async () => {
    const { placedAt, shotIds } = enterFirstTime([2])
    let answer!: (saved: boolean) => void
    const slow = new Promise<boolean>((resolve) => { answer = resolve })

    const decided = arrangeIfFirstEntry(placedAt, PROJECT, slow)
    useDirectorCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === shotIds[0] ? { ...n, position: { x: 50, y: 60 } } : n)) }))
    answer(false)

    expect(await decided).toBe(false)
    expect(api().arrangePending).toBe(false)
    expect(at(shotIds[0]!)).toEqual({ x: 50, y: 60 })
  })

  // 왜: Writer 와 이어지지 않은 카드는 사람이 Director 에서 직접 만들고 놓은 것이다(그 자리는 DB 에 저장되지도 않는다).
  it('Director 에서 직접 만든 카드(Writer 와 이어지지 않은 샷 · 프롬프트 노드)가 있으면 처음으로 보지 않는다', async () => {
    const withPrompt = enterFirstTime([2])
    api().addPromptNode({ x: 5, y: 5 })
    expect(await arrangeIfFirstEntry(withPrompt.placedAt, PROJECT, noSaved)).toBe(false)

    api().reset()
    api().setProjectId(PROJECT)
    const withLocalShot = enterFirstTime([2])
    const localShot = api().addShotNode(withLocalShot.sceneIds[0]!, { x: 700, y: 900 }, 'New Shot')
    rememberFirstPlacement(withLocalShot.placedAt, localShot)
    expect(await arrangeIfFirstEntry(withLocalShot.placedAt, PROJECT, noSaved)).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: 이 브라우저에 이미 있던 카드(이전 진입에서 만들어 브라우저에 남은 카드)의 자리는 사람이 옮겼을 수 있고 DB 에 없을 수도 있다.
  //   이번 진입에서 새로 만든 카드만 있을 때만 처음이다.
  it('이번 진입에서 새로 만들지 않은 카드(브라우저에 남아 있던 카드)가 있으면 처음으로 보지 않는다', async () => {
    const cachedScene = api().addSceneNode({ x: 380, y: 80 }, 'sc_01')
    api().updateNodeData<'scene'>(cachedScene, { writerSceneId: 'sc_01' })
    const cachedShot = api().addShotNode(cachedScene, { x: 740, y: 80 }, 'sh_01_01')
    api().updateNodeData<'shot'>(cachedShot, { writerShotId: 'sh_01_01' })
    const placedAt = new Map<string, XYPosition>()
    const freshShot = api().addShotNode(cachedScene, nextShotPosition(api(), cachedScene), 'sh_01_02')
    api().updateNodeData<'shot'>(freshShot, { writerShotId: 'sh_01_02' })
    rememberFirstPlacement(placedAt, freshShot)

    expect(await arrangeIfFirstEntry(placedAt, PROJECT, noSaved)).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: 카드가 없으면 놓을 것이 없다. 빈 캔버스에서 정렬을 요청하면 쓸데없이 화면을 다시 맞춘다.
  it('카드가 하나도 없으면 정렬을 요청하지 않는다', async () => {
    expect(await arrangeIfFirstEntry(new Map(), PROJECT, noSaved)).toBe(false)
    expect(api().arrangePending).toBe(false)
  })

  // 왜: 처음 정렬은 카드를 다 그린 뒤 한 번 놓는다. 화면이 처음 자리를 모르면(데모 세션처럼 카드가 안 만들어진 경우) 기억하지 않는다.
  it('만들어지지 않은 카드는 처음 자리로 기억하지 않는다', () => {
    const placedAt = new Map<string, XYPosition>()

    rememberFirstPlacement(placedAt, '')
    rememberFirstPlacement(placedAt, 'no-such-node')

    expect(placedAt.size).toBe(0)
  })

  // 왜: 순수 판별 함수가 훅 밖에서도 같은 답을 낸다 — 파생 카드(에셋 열 · 체인)는 매번 다시 만드는 것이라 사람이 놓은 자리로 세지 않는다.
  it('에셋 열 같은 파생 카드가 섞여 있어도 Writer 카드만 처음 자리 그대로면 처음이다', () => {
    const { placedAt, shotIds } = enterFirstTime([2])
    api().updateNodeData<'shot'>(shotIds[0]!, { characterAssetIds: ['char-1'] })
    useAssetStorageStore.getState().registerCharacter('char-1', {
      projectId: PROJECT, sourceCanvasNodeId: 'artist-char-1', name: '주인공', alias: '', background: '',
      description: '', prompt: '', referenceImages: [], views: { single: [], fiveView: [], sixteenAngle: [] }, statusVariants: [],
    })
    api().rebuildAssetNodes()

    expect(api().nodes.some((n) => n.data.kind === 'asset')).toBe(true)
    expect(isUntouchedFirstLayout(api().nodes as DirectorNode[], placedAt)).toBe(true)
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
  // 왜: 판별 재료(처음 자리 · DB 에 저장된 자리)를 안 모으거나 정렬을 안 부르면 위 규칙이 있어도 화면에서는 아무 일도 안 일어난다.
  //   DB 읽기는 카드를 만들 때 시작해야 정렬을 기다리게 하지 않고, 카드를 안 만든 다시 열기에서는 읽지 않는다.
  it('동기화는 새로 만든 씬 · 샷의 처음 자리를 기억하며 DB 읽기를 시작해 두었다가, 에셋 열을 다시 만든 뒤 처음 정렬을 한 번 요청한다', () => {
    const hook = readFileSync('src/features/director/hooks/use-writer-director-sync.ts', 'utf8')
    // 씬 · 샷을 만든 바로 뒤에 기억한다(둘 다).
    expect(hook.match(/const id = dir\.add(?:Scene|Shot)Node\([^\n]*\)\n\s*noteCreated\(id\)/g)).toHaveLength(2)
    // 기억하는 함수가 처음 자리를 모으고 DB 읽기를 한 번만 시작한다(카드를 안 만들면 읽지 않는다).
    expect(hook).toMatch(/rememberFirstPlacement\(firstPlacement\.placedAt, nodeId\)\s*if \(firstPlacement\.placedAt\.size > 0\) firstPlacement\.savedLayout \?\?= projectHasSavedLayout\(entryProjectId\)/)
    const rebuild = hook.indexOf('useDirectorCanvasStore.getState().rebuildAssetNodes()')
    const request = hook.indexOf('await arrangeIfFirstEntry(firstPlacement.placedAt, entryProjectId, firstPlacement.savedLayout ?? undefined)')
    expect(rebuild).toBeGreaterThan(-1)
    expect(request).toBeGreaterThan(rebuild)
    expect(hook).toMatch(/if \(!firstPlacement\.requested\) \{\s*firstPlacement\.requested = true\s*await arrangeIfFirstEntry/)
  })
})
