// Director 노드 보기가 고른 씬의 카드만 그리고(인물 · 배경 열은 그 씬 것을 그 씬 옆에), 다른 씬과 이어진 선은 꼬리표로 남기며, 스토어의 카드 · 잇기는 건드리지 않는지 검사한다 (오너 D8 2026-11-22)
import { describe, expect, it } from 'vitest'

import {
  linkCardName,
  orderedScenes,
  preferredSceneKey,
  promptNodePlace,
  sceneAfterHistoryStep,
  sceneButtonItems,
  sceneCanvas,
  sceneKeyOf,
  shotStatesIn,
  viewportShowsAnyCard,
} from '@/features/director/scene-view'
import { switchDirectorScene } from '@/features/director/hooks/use-scene-view'
import { useCurrentSceneStore } from '@/stores/current-scene-store'
import { ASSET_ROW_GAP, ASSET_TO_SHOT_GAP } from '@/features/director/canvas-layout'
import { ASSET_CARD_HEIGHT, ASSET_CARD_WIDTH } from '@/features/director/asset-column'
import { boardNodeNames } from '@/features/director/node-label'
import { translate } from '@/lib/i18n/translate'
import { useDirectorCanvasStore } from '@/stores/director-store'
import type { DirectorEdge, DirectorNode } from '@/types/director'

const node = (id: string, data: Record<string, unknown>, x = 0, y = 0): DirectorNode =>
  ({ id, type: data.kind as string, position: { x, y }, data: { label: id, ...data } }) as unknown as DirectorNode
const scene = (id: string, writerSceneId: string | null, x = 0, extra: Record<string, unknown> = {}) =>
  node(id, { kind: 'scene', label: writerSceneId ?? id, writerSceneId, location: '', timeOfDay: '', mood: '', description: '', ...extra }, x, 80)
const shot = (id: string, sceneId: string | null, writerShotId: string | null, x: number, y: number, refs: { characters?: string[]; worlds?: string[] } = {}) =>
  node(id, { kind: 'shot', label: writerShotId ?? 'New Shot', writerShotId, parentSceneNodeId: sceneId, characterAssetIds: refs.characters ?? [], worldAssetIds: refs.worlds ?? [] }, x, y)
const take = (id: string, shotId: string | null, x: number, y: number, extra: Record<string, unknown> = {}) =>
  node(id, { kind: 'video', parentShotNodeId: shotId, videoChainInputId: null, videoChainFrameUrl: null, ...extra }, x, y)
const asset = (kind: 'character' | 'world', assetId: string, extra: Record<string, unknown> = {}) =>
  node(`dn_asset_${kind}_${assetId}`, { kind: 'asset', assetKind: kind, assetId, label: assetId, ...extra }, 80, kind === 'character' ? 80 : 400)
const prompt = (id: string, targetShotNodeId: string | null) => node(id, { kind: 'prompt', text: '', targetShotNodeId }, 40, 40)
const edge = (id: string, source: string, target: string, category: string, targetHandle: string | null = null): DirectorEdge =>
  ({ id, source, target, targetHandle, sourceHandle: 'right', data: { category, relationText: '' } }) as unknown as DirectorEdge

const MANIFEST = { scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_02' }] }
const WRITER_SHOTS = [
  { shotId: 'sh_01_01', sceneId: 'sc_01' },
  { shotId: 'sh_01_02', sceneId: 'sc_01' },
  { shotId: 'sh_02_01', sceneId: 'sc_02' },
  { shotId: 'sh_02_02', sceneId: 'sc_02' },
]
const names = boardNodeNames(MANIFEST, WRITER_SHOTS, 'ko')

/** 씬 둘: 씬 1(샷 a1 · a2, a1 의 Take t1) · 씬 2(샷 b1 · b2, b1 의 Take u1 은 t1 에서 이어짐). 인물 민준은 씬 1, 배경 골목은 씬 2 가 쓴다. */
function board() {
  const nodes = [
    scene('S2', 'sc_02', 1800, { location: 'alley' }),
    scene('S1', 'sc_01', 400, { location: 'kitchen' }),
    shot('a1', 'S1', 'sh_01_01', 760, 80, { characters: ['minjun'] }),
    shot('a2', 'S1', 'sh_01_02', 760, 640),
    take('t1', 'a1', 1136, 80),
    shot('b1', 'S2', 'sh_02_01', 2160, 120, { worlds: ['alley'] }),
    shot('b2', 'S2', 'sh_02_02', 2160, 700),
    take('u1', 'b1', 2536, 120, { videoChainInputId: 't1' }),
    asset('character', 'minjun'),
    asset('world', 'alley'),
  ]
  const edges = [
    edge('e-parent-a1', 'S1', 'a1', 'parent'),
    edge('e-take-t1', 'a1', 't1', 'parent'),
    edge('e-take-u1', 'b1', 'u1', 'parent'),
    edge('e-ref-minjun', 'dn_asset_character_minjun', 'a1', 'references'),
    edge('e-ref-alley', 'dn_asset_world_alley', 'b1', 'references'),
    edge('e-chain', 't1', 'u1', 'video-chain', 'video-chain'),
  ]
  return { nodes, edges }
}
const ids = (list: readonly { id: string }[]) => list.map((n) => n.id).sort()

describe('씬 순서와 씬 열쇠', () => {
  it('씬은 보드 순서대로 늘어놓고, 씬 열쇠는 Writer 씬 id 이며 Director 에서 만든 씬은 노드 id 다', () => {
    // 왜: 씬 단추는 보드 순서(오너 D8 · 11/02 "전체 번호로 통일"). 지금 보는 씬 기억은 기기와 상관없는 Writer 씬 id 로 한다 — 캔버스 노드 id 는 기기마다 다르다.
    const { nodes } = board()
    const own = scene('S9', null, 3000)
    expect(orderedScenes([...nodes, own], names).map((entry) => entry.key)).toEqual(['sc_01', 'sc_02', 'S9'])
    expect(sceneKeyOf(own)).toBe('S9')
  })

  it('씬 단추는 보드 이름이고, 마우스를 올리면 장소 · 샷 수가, ⌘/Ctrl+클릭하면 채팅 고르기 목록과 같은 "실사 씬 N" 이 들어간다', () => {
    // 왜: 단추는 짧게("씬 2"), 자세한 것은 마우스를 올리면(혼자 정한 것). 멘션 이름은 Director 채팅 고르기 목록(global-chat)과 같은 이름이어야 입력칸에서 알아본다(혼자 정한 것 h20).
    const { nodes } = board()
    const t = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
    const items = sceneButtonItems(orderedScenes(nodes, names), nodes, names, { t, locationName: (slug) => (slug === 'alley' ? '골목' : slug === 'kitchen' ? '부엌' : slug) })
    expect(items.map((item) => item.label)).toEqual(['씬 1', '씬 2'])
    expect(items[1]).toMatchObject({ key: 'sc_02', title: '씬 2 · 골목 · 샷 2개', mentionLabel: '실사 씬 2' })
  })
})

describe('씬별 캔버스', () => {
  it('씬을 고르면 그 씬의 샷 · Take · 그 샷에 이은 프롬프트만 캔버스에 보이고 다른 씬 카드는 그리지 않는다', () => {
    // 왜: 오너 D8 "scene 별로 누르면 로딩되게" — 다른 씬 카드와 그 그림은 아예 그리지 않는다.
    const { nodes, edges } = board()
    const view = sceneCanvas([...nodes, prompt('p1', 'b2')], edges, 'S2')
    expect(ids(view.nodes.filter((n) => n.data.kind !== 'asset'))).toEqual(['b1', 'b2', 'p1', 'u1'])
    expect(view.shotIds.sort()).toEqual(['b1', 'b2'])
  })

  it('씬 밖 카드(Director 에서 만든 이미지 노드 · 샷 없는 영상 · 아무 샷에도 안 이은 프롬프트)는 어느 씬에서나 보인다', () => {
    // 왜: 씬에 속하지 않는 카드는 만들자마자 사라지면 안 된다 — 어느 씬을 보든 그 자리에 보인다(혼자 정한 것 h8).
    const { nodes, edges } = board()
    const free = [shot('f1', null, null, 300, 900), take('f2', null, 600, 900, { standaloneVideoKey: 'standalone:x' }), prompt('f3', null)]
    for (const sceneId of ['S1', 'S2']) {
      const view = sceneCanvas([...nodes, ...free], edges, sceneId)
      expect(ids(view.nodes)).toEqual(expect.arrayContaining(['f1', 'f2', 'f3']))
      expect(view.shotIds).toContain('f1')
    }
  })

  it('인물 · 배경 열에는 그 씬 샷이 쓰는 것만, 그 씬 샷 열 왼쪽에 인물 먼저 · 배경 다음으로 보인다(저장된 자리는 그대로)', () => {
    // 왜: 지금 에셋 열은 프로젝트에 하나라 첫 씬 왼쪽 먼 곳에 있다 — 씬 2 를 보면 인물 · 배경이 화면 밖이다(혼자 정한 것 h6). 에셋 카드는 손으로 못 옮기고 자리를 DB 에 저장하지 않아 그릴 때만 놓는다.
    const { nodes, edges } = board()
    const both = nodes.map((n) => (n.id === 'b1' ? shot('b1', 'S2', 'sh_02_01', 2160, 120, { characters: ['minjun'], worlds: ['alley'] }) : n))
    const view = sceneCanvas(both, edges, 'S2')
    const column = view.nodes.filter((n) => n.data.kind === 'asset')
    const x = 2160 - ASSET_TO_SHOT_GAP - ASSET_CARD_WIDTH
    expect(column.map((n) => [n.id, n.position])).toEqual([
      ['dn_asset_character_minjun', { x, y: 120 }],
      ['dn_asset_world_alley', { x, y: 120 + ASSET_CARD_HEIGHT + ASSET_ROW_GAP }],
    ])
    expect(sceneCanvas(nodes, edges, 'S1').nodes.filter((n) => n.data.kind === 'asset').map((n) => n.id)).toEqual(['dn_asset_character_minjun'])
    expect(nodes.find((n) => n.id === 'dn_asset_world_alley')!.position).toEqual({ x: 80, y: 400 })
  })

  it('[안 쓴 에셋]을 켜면 이 씬이 안 쓰는 등록 인물 · 배경도 그 열에 "안 씀"으로 보인다', () => {
    // 왜: 단추 설명이 이미 "이 씬이 참조하지 않는 등록 에셋"이다(page.tsx Unused assets) — 씬 보기에서는 이 씬 기준으로 센다(혼자 정한 것 h7).
    const { nodes, edges } = board()
    const view = sceneCanvas(nodes, edges, 'S1', { showUnusedAssets: true })
    const byId = new Map(view.nodes.map((n) => [n.id, n]))
    expect((byId.get('dn_asset_character_minjun')!.data as { unused?: boolean }).unused).toBeFalsy()
    expect((byId.get('dn_asset_world_alley')!.data as { unused?: boolean }).unused).toBe(true)
  })

  it('다른 씬 카드와 이어진 선은 그리지 않고, 이 씬 카드에 어느 씬 어느 카드와 이어졌는지 꼬리표를 남긴다', () => {
    // 왜: 끝이 안 보이는 선은 끊긴 것으로 보인다 — 선 대신 "씬 1 · 샷 1" 꼬리표로 남기고, 누르면 그 씬으로 간다(혼자 정한 것 h9).
    const { nodes, edges } = board()
    const two = sceneCanvas(nodes, edges, 'S2')
    expect(two.edges.map((e) => e.id)).not.toContain('e-chain')
    expect(two.links).toEqual([{ nodeId: 'u1', side: 'in', handle: 'video-chain', otherNodeId: 't1', otherSceneId: 'S1', category: 'video-chain' }])
    const one = sceneCanvas(nodes, edges, 'S1')
    expect(one.links).toEqual([{ nodeId: 't1', side: 'out', handle: 'right', otherNodeId: 'u1', otherSceneId: 'S2', category: 'video-chain' }])
    expect(one.edges.map((e) => e.id).sort()).toEqual(['e-ref-minjun', 'e-take-t1'])
  })

  it('꼬리표 글은 이어진 카드의 전체 이름("씬 1 · 샷 1")이고, Take 는 그 샷의 이름이다', () => {
    // 왜: 다른 씬에 있는 카드라 씬 이름까지 붙여야 어디로 가는지 안다(보드와 같은 전체 번호, 오너 11/02).
    const { nodes } = board()
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(linkCardName(byId.get('a1'), byId, names)).toBe('씬 1 · 샷 1')
    expect(linkCardName(byId.get('t1'), byId, names)).toBe('씬 1 · 샷 1')
  })

  it('씬을 골라 보여도 스토어의 카드 · 잇기는 그대로이고, 씬을 넘는 영상 잇기도 지워지지 않는다', () => {
    // 왜: 앞 영상 카드가 스토어에 없으면 잇기를 지우는 규칙(rebuildVideoChainEdges)이 있어, 거르기는 화면에서만 한다 — 스토어에서 거르면 씬을 넘는 잇기가 지워져 DB 에도 쓰인다(1단계 보고 2-2).
    const { nodes, edges } = board()
    const before = JSON.stringify({ nodes, edges })
    sceneCanvas(nodes, edges, 'S2')
    expect(JSON.stringify({ nodes, edges })).toBe(before)
    useDirectorCanvasStore.setState({ projectId: 'scene-view-test', nodes, edges })
    useDirectorCanvasStore.getState().rebuildVideoChainEdges()
    const store = useDirectorCanvasStore.getState()
    expect((store.nodes.find((n) => n.id === 'u1')!.data as { videoChainInputId: string | null }).videoChainInputId).toBe('t1')
    expect(store.edges.some((e) => e.data?.category === 'video-chain' && e.source === 't1' && e.target === 'u1')).toBe(true)
  })

  it('씬이 하나도 없으면 지금처럼 모든 카드가 보인다', () => {
    // 왜: Writer 씬이 아직 없고 Director 에서 만든 카드만 있는 캔버스도 비지 않는다.
    const free = [shot('f1', null, null, 300, 900), prompt('f3', null)]
    expect(ids(sceneCanvas(free, [], null).nodes)).toEqual(['f1', 'f3'])
  })
})

describe('되돌리기와 씬', () => {
  it('되돌리기 · 다시 하기로 다른 씬 카드가 바뀌면 그 씬으로 간다', () => {
    // 왜: 씬 1 을 보며 되돌리기를 눌렀는데 씬 2 카드가 바뀌면, 보이지 않는 곳이 바뀌어 고장으로 보인다(혼자 정한 것 h15).
    const { nodes, edges } = board()
    const moved = nodes.map((n) => (n.id === 'b2' ? { ...n, position: { x: 2160, y: 900 } } : n))
    expect(sceneAfterHistoryStep({ nodes, edges }, { nodes: moved, edges }, 'S1')).toBe('S2')
    const unwired = edges.filter((e) => e.id !== 'e-chain')
    expect(sceneAfterHistoryStep({ nodes, edges }, { nodes, edges: unwired }, 'S1')).toBeNull()
    expect(sceneAfterHistoryStep({ nodes, edges: unwired }, { nodes, edges }, 'S3')).toBeNull()
  })

  it('되돌리기 · 다시 하기로 지금 씬 카드가 바뀌었거나 여러 씬이 함께 바뀌면 씬을 바꾸지 않는다', () => {
    // 왜: 지금 씬의 바뀜이 보이면 그대로 두고, 어느 씬으로 갈지 하나로 정할 수 없으면 움직이지 않는다.
    const { nodes, edges } = board()
    const both = nodes.map((n) => (n.id === 'b2' || n.id === 'a2' ? { ...n, position: { x: n.position.x + 10, y: n.position.y } } : n))
    expect(sceneAfterHistoryStep({ nodes, edges }, { nodes: both, edges }, 'S2')).toBeNull()
    expect(sceneAfterHistoryStep({ nodes, edges }, { nodes: both, edges }, 'S9')).toBeNull()
  })
})

describe('처음 여는 씬', () => {
  it('처음 여는 프로젝트에 만드는 중인 샷이 있으면 보드 순서로 먼저 나오는 그 샷의 씬을 먼저 보인다', () => {
    // 왜: 9/8 오너 판정 "처음 열 때 만들고 있는 게 있으면 결과가 보이는 화면으로"를 씬으로 옮긴다(혼자 정한 것 h2).
    const { nodes } = board()
    expect(preferredSceneKey(nodes, names, ['sh_02_02', 'sh_02_01'])).toBe('sc_02')
    expect(preferredSceneKey(nodes, names, ['sh_02_02', 'sh_01_02'])).toBe('sc_01')
    expect(preferredSceneKey(nodes, names, [])).toBeNull()
    expect(preferredSceneKey(nodes, names, ['sh_99_01'])).toBeNull()
  })
})

describe('씬을 바꿀 때', () => {
  it('씬을 바꾸면 지금 보는 씬 기억에 쓰고 고른 샷은 풀리며 상태 고르기는 남는다', () => {
    // 왜: 다른 씬의 고름이 숨은 채 남으면 단추가 말없이 그 샷을 센다(11/14 상태 고르기와 같은 까닭, 혼자 정한 것 h11). 상태 고르기는 씬을 넘어 같은 상태를 보려고 남긴다.
    useCurrentSceneStore.setState({ sceneByProject: {} })
    useDirectorCanvasStore.setState({ projectId: 'scene-switch-test', pickedShotIds: ['a1', 'a2'], statusFilter: 'image_done' })
    switchDirectorScene('scene-switch-test', 'sc_02')
    expect(useCurrentSceneStore.getState().sceneByProject['scene-switch-test']).toBe('sc_02')
    expect(useDirectorCanvasStore.getState()).toMatchObject({ pickedShotIds: [], statusFilter: 'image_done' })
  })

  it('상태 고르기 숫자 · [전체 고르기] · 툴바 노드 수는 지금 씬(과 씬 밖 카드)의 샷만 센다', () => {
    // 왜: 보이는 것과 숫자가 같아야 한다 — 씬 2 를 보는데 "전체 14"가 보이면 안 보이는 샷을 센 것이다(혼자 정한 것 h12).
    const states = new Map([['a1', 'image_needed'], ['b1', 'image_done'], ['b2', 'video_done'], ['f1', 'image_needed']] as const)
    expect([...shotStatesIn(states, ['b1', 'b2', 'f1']).keys()]).toEqual(['b1', 'b2', 'f1'])
  })

  it('다시 들어왔을 때 기억한 화면에 이 씬 카드가 하나도 없으면 그 화면을 쓰지 않는다', () => {
    // 왜: Camera 에서 다른 씬을 보다 오면(같은 기억을 쓴다) Director 가 저장해 둔 화면은 옛 씬 자리를 본다 — 빈 판 대신 그 씬 첫 샷으로 맞춘다.
    const { nodes, edges } = board()
    const cards = sceneCanvas(nodes, edges, 'S2').nodes
    const pane = { width: 1200, height: 800 }
    expect(viewportShowsAnyCard({ x: -2000, y: 0, zoom: 1 }, pane, cards)).toBe(true)
    expect(viewportShowsAnyCard({ x: 0, y: 0, zoom: 1 }, pane, cards)).toBe(false)
  })

  it('씬 보기에서 [프롬프트 노드]는 지금 화면 왼쪽 위에 생기고, 더 누르면 조금씩 아래에 생긴다', () => {
    // 왜: 예전 자리(판 맨 왼쪽 x 80)는 뒤 씬을 볼 때 화면 밖이다 — 만들자마자 보이게(혼자 정한 것 h17).
    expect(promptNodePlace({ x: -1600, y: -40, zoom: 0.5 }, 0)).toEqual({ x: (80 + 1600) / 0.5, y: (120 + 40) / 0.5 })
    expect(promptNodePlace({ x: -1600, y: -40, zoom: 0.5 }, 2)).toEqual({ x: (80 + 1600) / 0.5, y: (120 + 40) / 0.5 + 2 * 60 })
  })
})
