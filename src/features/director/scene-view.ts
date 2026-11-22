// Director 노드 보기의 씬별 보기(오너 D8 2026-11-22 "scene 별로 누르면 로딩되게").
//   거르기는 화면에서만 한다 — 스토어 · DB 읽기는 프로젝트 통째 그대로다. 앞 영상 카드가 스토어에 없으면 잇기를 지우는 규칙
//   (director-store rebuildVideoChainEdges)이 있어, 스토어에서 씬으로 거르면 씬을 넘는 잇기가 지워지고 그 값이 DB 에도 쓰인다.
//   - 고른 씬의 샷 · Take · 그 샷에 이은 프롬프트를 그린다. 씬 밖 카드(Director 에서 만든 이미지 노드 · 샷 없는 영상 · 안 이은 프롬프트)는 어느 씬에서나.
//   - 인물 · 배경 열은 그 씬 샷이 쓰는 것만, 그 씬 샷 열 왼쪽에 그릴 때만 놓는다(에셋 카드는 끌 수 없고 자리를 DB 에 저장하지 않는다).
//   - 다른 씬 카드와 이어진 선은 그리지 않고 꼬리표(links)로 남긴다.
//   - 영상의 옛 끝(END) 칸 선은 그리지 않는다 — 구멍이 없다(오너 2026-11-22 밤). 저장된 배선은 스토어에 그대로.
//   약속: tests/director/scene-view.test.ts · tests/director/end-frame-retired.test.ts
import type { Viewport, XYPosition } from '@xyflow/react'
import type { SceneButtonItem } from '@/components/scene-buttons'
import { countText } from '@/lib/i18n/count-text'
import { ASSET_ROW_GAP, ASSET_TO_SHOT_GAP, generousCardSize } from '@/features/director/canvas-layout'
import { ASSET_CARD_HEIGHT, ASSET_CARD_WIDTH } from '@/features/director/asset-column'
import { HIDDEN_ON_CANVAS } from '@/features/director/canvas-meta'
import { directorFullLabel, directorNodeLabel, realMentionLabel, sortByBoard, type BoardNodeNames } from '@/features/director/node-label'
import {
  isAssetData,
  isPromptData,
  isSceneData,
  isShotData,
  isVideoData,
  SHOT_OFFSET_X,
  type DirectorEdge,
  type DirectorNode,
} from '@/types/director'

type Translate = (text: string, params?: Record<string, string | number>) => string

/** 씬 열쇠 — 지금 보는 씬 기억에 쓴다. Writer 씬이면 Writer 씬 id(기기와 상관없음), Director 에서 만든 씬은 노드 id. */
export function sceneKeyOf(scene: DirectorNode): string {
  return isSceneData(scene.data) && scene.data.writerSceneId ? scene.data.writerSceneId : scene.id
}

export interface SceneEntry {
  key: string
  nodeId: string
  node: DirectorNode
}

/** 캔버스의 씬 — 보드 순서(Writer 씬), 그 뒤에 Director 에서 만든 씬. */
export function orderedScenes(nodes: readonly DirectorNode[], names: BoardNodeNames | null | undefined): SceneEntry[] {
  return sortByBoard(nodes.filter((n) => isSceneData(n.data)), names).map((n) => ({ key: sceneKeyOf(n), nodeId: n.id, node: n }))
}

/**
 * 카드가 속한 씬 노드 id. null = 씬 밖 카드(어느 씬에서나 보인다). undefined = 씬별로 따지지 않는 카드(에셋 · 숨은 파생 카드).
 * 샷은 부모 씬, Take 는 그 샷의 씬, 프롬프트는 이은 샷의 씬.
 */
export function cardSceneOf(node: DirectorNode | undefined, byId: ReadonlyMap<string, DirectorNode>): string | null | undefined {
  if (!node) return undefined
  const data = node.data
  if (isSceneData(data)) return node.id
  if (isAssetData(data) || HIDDEN_ON_CANVAS.has(data.kind)) return undefined
  const sceneOfShot = (shotId: string | null | undefined): string | null => {
    const parent = shotId ? byId.get(shotId) : undefined
    if (!parent || !isShotData(parent.data) || !parent.data.parentSceneNodeId) return null
    const sceneNode = byId.get(parent.data.parentSceneNodeId)
    return sceneNode && isSceneData(sceneNode.data) ? sceneNode.id : null
  }
  if (isShotData(data)) return sceneOfShot(node.id)
  if (isVideoData(data)) return sceneOfShot(data.parentShotNodeId)
  if (isPromptData(data)) return sceneOfShot(data.targetShotNodeId)
  return null
}

/** 다른 씬 카드와 이어진 선의 꼬리표 — 이 씬 카드(nodeId) 쪽에 단다. side: in = 이 카드로 들어오는 선. */
export interface CrossSceneLink {
  nodeId: string
  side: 'in' | 'out'
  /** 이 카드 쪽 구멍(들어오면 targetHandle, 나가면 sourceHandle). */
  handle: string | null
  otherNodeId: string
  otherSceneId: string
  category: string
}

export interface SceneCanvas {
  /** 그릴 카드(에셋은 그릴 자리로 옮긴 사본). */
  nodes: DirectorNode[]
  /** 양 끝이 다 그려지는 선. */
  edges: DirectorEdge[]
  links: CrossSceneLink[]
  /** 캔버스에 보이는 샷(그 씬 샷 + 씬 밖 샷) — 툴바 숫자 · 고르기가 센다. */
  shotIds: string[]
}

/** 꼬리표를 달지 않는 선 — 씬 → 샷 · 샷 → Take(같은 씬) 계층과, 씬마다 그리는 에셋의 참조 선. */
const NO_LINK_CATEGORIES = new Set(['parent', 'references'])

/**
 * 고른 씬의 캔버스. sceneNodeId 가 null 이면(씬이 하나도 없다) 지금처럼 모든 카드.
 * showUnusedAssets: [안 쓴 에셋] — 이 씬이 안 쓰는 등록 인물 · 배경도 "안 씀"으로 열에 둔다.
 */
export function sceneCanvas(
  nodes: readonly DirectorNode[],
  edges: readonly DirectorEdge[],
  sceneNodeId: string | null,
  options: { showUnusedAssets?: boolean } = {},
): SceneCanvas {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const cards = nodes.filter((n) => !HIDDEN_ON_CANVAS.has(n.data.kind))
  const shown: DirectorNode[] = []
  const shownIds = new Set<string>()
  const show = (n: DirectorNode) => {
    shown.push(n)
    shownIds.add(n.id)
  }

  if (sceneNodeId === null) {
    for (const card of cards) show(card)
  } else {
    for (const card of cards) {
      if (isAssetData(card.data)) continue
      const owner = cardSceneOf(card, byId)
      if (owner === sceneNodeId || owner === null) show(card)
    }
    // 인물 · 배경 열 — 이 씬 샷이 쓰는 것(인물 먼저 · 배경 다음), [안 쓴 에셋]이면 나머지도 "안 씀"으로.
    const sceneShots = shown.filter((n) => isShotData(n.data) && cardSceneOf(n, byId) === sceneNodeId)
    const used = new Set<string>()
    for (const sh of sceneShots) {
      if (!isShotData(sh.data)) continue
      for (const id of sh.data.characterAssetIds) used.add(`character:${id}`)
      for (const id of sh.data.worldAssetIds) used.add(`world:${id}`)
    }
    const assets = cards
      .filter((n) => isAssetData(n.data))
      .filter((n) => isAssetData(n.data) && (options.showUnusedAssets || used.has(`${n.data.assetKind}:${n.data.assetId}`)))
      .sort((a, b) => assetRank(a) - assetRank(b) || a.position.y - b.position.y || a.position.x - b.position.x)
    const sceneNode = byId.get(sceneNodeId)
    const left = sceneShots.length > 0
      ? Math.min(...sceneShots.map((n) => n.position.x))
      : (sceneNode?.position.x ?? 0) + SHOT_OFFSET_X
    const x = left - ASSET_TO_SHOT_GAP - ASSET_CARD_WIDTH
    let y = sceneShots.length > 0 ? Math.min(...sceneShots.map((n) => n.position.y)) : (sceneNode?.position.y ?? 80)
    for (const card of assets) {
      if (!isAssetData(card.data)) continue
      const unused = !used.has(`${card.data.assetKind}:${card.data.assetId}`)
      show({ ...card, position: { x, y }, data: { ...card.data, unused: unused || undefined } } as DirectorNode)
      y += (card.measured?.height ?? ASSET_CARD_HEIGHT) + ASSET_ROW_GAP
    }
  }

  const visibleEdges: DirectorEdge[] = []
  const links: CrossSceneLink[] = []
  for (const e of edges) {
    // 옛 끝(END) 칸 선 — 닿을 구멍이 없어 그리면 React Flow 가 "구멍 없음" 경고를 찍는다(혼자 정한 것 h1). 꼬리표도 달지 않는다.
    if (e.data?.category === 'frame' && e.targetHandle === 'frame-end') continue
    const sourceShown = shownIds.has(e.source)
    const targetShown = shownIds.has(e.target)
    if (sourceShown && targetShown) {
      visibleEdges.push(e)
      continue
    }
    if (sourceShown === targetShown) continue
    const category = e.data?.category ?? ''
    if (NO_LINK_CATEGORIES.has(category)) continue
    const otherNodeId = sourceShown ? e.target : e.source
    const otherSceneId = cardSceneOf(byId.get(otherNodeId), byId)
    if (!otherSceneId) continue
    links.push(
      sourceShown
        ? { nodeId: e.source, side: 'out', handle: e.sourceHandle ?? null, otherNodeId, otherSceneId, category }
        : { nodeId: e.target, side: 'in', handle: e.targetHandle ?? null, otherNodeId, otherSceneId, category },
    )
  }

  return {
    nodes: shown,
    edges: visibleEdges,
    links,
    shotIds: shown.filter((n) => isShotData(n.data)).map((n) => n.id),
  }
}

const assetRank = (n: DirectorNode) => (isAssetData(n.data) && n.data.assetKind === 'world' ? 1 : 0)

/** 씬 단추 — 단추 글자는 보드 이름, 마우스를 올리면 "씬 2 · 장소 · 샷 4개", ⌘/Ctrl+클릭 이름은 Director 채팅 고르기 목록과 같은 "실사 씬 2". */
export function sceneButtonItems(
  scenes: readonly SceneEntry[],
  nodes: readonly DirectorNode[],
  names: BoardNodeNames,
  { t, locationName }: { t: Translate; locationName: (slug: string) => string },
): SceneButtonItem[] {
  return scenes.map(({ key, nodeId, node }) => {
    const label = isSceneData(node.data) ? directorNodeLabel(node.data, names) : nodeId
    const count = nodes.filter((n) => isShotData(n.data) && n.data.parentSceneNodeId === nodeId).length
    const location = isSceneData(node.data) && node.data.location ? locationName(node.data.location).trim() : ''
    return {
      key,
      label,
      title: [label, location, countText(t, count, '1 shot', '{count} shots', { count })].filter(Boolean).join(' · '),
      mentionLabel: realMentionLabel('scene', nodeId, label, names.locale),
    }
  })
}

/** 처음 여는 프로젝트에서 먼저 보여 줄 씬 — 만드는 중인 Writer 샷 중 보드 순서로 먼저 나오는 샷의 씬 열쇠. 없으면 null. */
export function preferredSceneKey(
  nodes: readonly DirectorNode[],
  names: BoardNodeNames | null | undefined,
  writerShotIds: readonly string[],
): string | null {
  if (writerShotIds.length === 0) return null
  const wanted = new Set(writerShotIds)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const shots = sortByBoard(nodes.filter((n) => isShotData(n.data) && !!n.data.writerShotId && wanted.has(n.data.writerShotId)), names)
  for (const sh of shots) {
    const sceneId = cardSceneOf(sh, byId)
    const sceneNode = sceneId ? byId.get(sceneId) : undefined
    if (sceneNode) return sceneKeyOf(sceneNode)
  }
  return null
}

interface CanvasSnapshot {
  nodes: readonly DirectorNode[]
  edges: readonly DirectorEdge[]
}

/**
 * 되돌리기 · 다시 하기 뒤에 갈 씬 — 바뀐 카드(자리 · 내용 · 생기고 없어짐)와 바뀐 선의 양 끝이 다른 씬 하나에만 있으면 그 씬 노드 id.
 * 지금 씬도 바뀌었거나, 여러 씬이 바뀌었거나, 씬 밖 카드만 바뀌었으면 null(움직이지 않는다).
 */
export function sceneAfterHistoryStep(before: CanvasSnapshot, after: CanvasSnapshot, currentSceneId: string | null): string | null {
  const beforeById = new Map(before.nodes.map((n) => [n.id, n]))
  const afterById = new Map(after.nodes.map((n) => [n.id, n]))
  const scenes = new Set<string>()
  const note = (id: string) => {
    const owner = afterById.has(id) ? cardSceneOf(afterById.get(id), afterById) : cardSceneOf(beforeById.get(id), beforeById)
    if (owner) scenes.add(owner)
  }
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const a = beforeById.get(id)
    const b = afterById.get(id)
    if (a && b && a.position.x === b.position.x && a.position.y === b.position.y && JSON.stringify(a.data) === JSON.stringify(b.data)) continue
    note(id)
  }
  const beforeEdges = new Map(before.edges.map((e) => [e.id, e]))
  const afterEdges = new Map(after.edges.map((e) => [e.id, e]))
  for (const [id, e] of beforeEdges) if (!afterEdges.has(id)) { note(e.source); note(e.target) }
  for (const [id, e] of afterEdges) if (!beforeEdges.has(id)) { note(e.source); note(e.target) }
  if (currentSceneId && scenes.has(currentSceneId)) return null
  return scenes.size === 1 ? [...scenes][0]! : null
}

/** 샷 상태 중 캔버스에 보이는 샷 것만(보이는 순서 그대로) — 상태 고르기 숫자 · [전체 고르기] · 툴바 숫자가 센다(혼자 정한 것 h12). */
export function shotStatesIn<S>(states: ReadonlyMap<string, S>, shotIds: readonly string[]): Map<string, S> {
  const out = new Map<string, S>()
  for (const id of shotIds) {
    const state = states.get(id)
    if (state !== undefined) out.set(id, state)
  }
  return out
}

/** 저장해 둔 화면에 이 카드들 중 하나라도 보이는가(카드 크기는 잰 값, 모르면 넉넉한 값). 에셋은 그릴 때 옮긴 자리를 본다. */
export function viewportShowsAnyCard(viewport: Viewport, pane: { width: number; height: number }, cards: readonly DirectorNode[]): boolean {
  return cards.some((card) => {
    const size = card.measured?.width && card.measured?.height ? { width: card.measured.width, height: card.measured.height } : generousCardSize(card.data.kind)
    const left = card.position.x * viewport.zoom + viewport.x
    const top = card.position.y * viewport.zoom + viewport.y
    return left < pane.width && left + size.width * viewport.zoom > 0 && top < pane.height && top + size.height * viewport.zoom > 0
  })
}

/** 씬 보기의 새 프롬프트 노드 자리 — 지금 화면 왼쪽 위(화면 80 · 120), 더 만들면 60 씩 아래(혼자 정한 것 h17). */
export function promptNodePlace(viewport: Viewport, index: number): XYPosition {
  return { x: (80 - viewport.x) / viewport.zoom, y: (120 - viewport.y) / viewport.zoom + index * 60 }
}

/** 꼬리표 글 — 이어진 카드의 전체 이름("씬 1 · 샷 2"). Take 는 그 샷의 이름(Director 는 Take 를 샷으로 부른다). 카드를 모르면 빈 글. */
export function linkCardName(
  card: DirectorNode | undefined,
  byId: ReadonlyMap<string, DirectorNode>,
  names: BoardNodeNames | null | undefined,
): string {
  if (!card) return ''
  if (isVideoData(card.data) && card.data.parentShotNodeId) {
    const parent = byId.get(card.data.parentShotNodeId)
    if (parent) return directorFullLabel(parent.data, names)
  }
  return directorFullLabel(card.data, names)
}

/** 만들기 확인 창 제목 앞에 지금 씬 이름(오너 E2 2026-11-22) — "씬 2 · 영상을 만들까요?". 씬이 없는 캔버스면 제목 그대로. */
export function sceneDialogTitle(sceneLabel: string | null | undefined, title: string): string {
  const name = sceneLabel?.trim()
  return name ? `${name} · ${title}` : title
}
