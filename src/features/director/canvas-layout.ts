// Director 노드 보기 [자동 정렬]의 배치 규칙(오너 2026-11-10 "피그마 자료처럼 조금 가깝게"): 11/5 시안 D1 · DG 에서 잰 간격으로 놓는다.
//   왼쪽에 에셋 한 열(인물 위 · 배경 아래), 그 오른쪽에 씬마다 [샷 열 | 영상 열] 묶음을 왼쪽에서 오른쪽으로 둔다(테이크 없는 씬도 영상 열 자리를 둔다).
//   카드 크기는 화면이 지금 잰 크기로 센다([자동 정렬]은 누른 동안 화면 밖 카드까지 그려 잰다 · page.tsx). 그래도 못 잰 화면 밖 카드는
//   예전에 잰 크기와 넉넉한 크기 중 큰 값, 잰 적 없으면 넉넉한 크기(검토 C 3번): 그림 비율 · 테이크 수가 달라도 겹치지 않는다.
//   씬 없는 샷 · 샷 없는 영상 · 프롬프트 노드는 옮기지 않고, 그 카드들을 피해 놓는다(검토 C 2번).
//   새로 만드는 테이크 · 샷의 자리도 같은 간격 · 크기 셈으로 정하고 다른 카드와 겹치면 아래로 내린다(검토 C 1번).
//   약속: tests/director/auto-arrange.test.ts · arrange-sizes.test.ts · new-card-place.test.ts
import type { XYPosition } from '@xyflow/react'
import {
  isAssetData,
  isSceneData,
  isShotData,
  isVideoData,
  SHOT_OFFSET_X,
  VIDEO_OFFSET_X,
  type DirectorNode,
} from '@/types/director'

/** 노드 열 사이(샷 열 → 영상 열). 시안 D1 · DG 96. 입력 구멍 라벨(카드 왼쪽 약 50)이 이 안에 든다. */
export const NODE_COLUMN_GAP = 96
/** 위아래 카드 사이(샷 줄끼리 · 테이크끼리). 시안 DG 56. */
export const NODE_ROW_GAP = 56
/** 에셋 카드 사이. 시안 D1 · DG 35. */
export const ASSET_ROW_GAP = 35
/** 에셋 열 → 첫 샷 열. 시안 D1 · DG 116. */
export const ASSET_TO_SHOT_GAP = 116
/** 씬 묶음 사이. 시안에는 씬이 하나뿐이라 없다. 열 간격보다 조금 넓게 두어 씬이 갈려 보이게 한다. */
export const SCENE_GROUP_GAP = 160
/** 정렬한 캔버스의 왼쪽 위. */
const ORIGIN: XYPosition = { x: 80, y: 80 }
/** 샷 · 영상 카드 왼쪽에 나와 있는 입력 구멍 라벨 자리. 옮기지 않는 카드가 이 안에 들어오면 라벨이 가려진다. */
const PORT_LABEL_SPACE = 60

export interface Size { width: number; height: number }
type CardKind = 'asset' | 'shot' | 'video' | 'prompt'

/**
 * 크기를 모르는 카드의 셈 크기(가로 · 시네마 · 포맷 모름). 카드에 붙을 수 있는 것을 다 붙인 최대치다:
 *   샷 = 프롬프트 두 줄 + 그림 16:9 + 실패 표시(그림 크기) + 참조 그림 줄 + 꼬리(약 476) · 영상 = 그림 + 바꾼 설정 줄 + 완성 배지 +
 *   경고 · 오류 줄(약 260) · 에셋 = 그림 16:9 + 모델 + 오류 두 줄(약 256).
 */
export const UNMEASURED_NODE_SIZE = {
  asset: { width: 240, height: 260 },
  shot: { width: 280, height: 480 },
  video: { width: 240, height: 260 },
  prompt: { width: 240, height: 240 },
} as const satisfies Record<CardKind, Size>

/** 세로 · 정사각 포맷의 셈 크기: 그림 틀이 높아진다(샷 그림 · 실패 표시 각 240, 영상 그림 150). 샷 최대치 약 672. */
const TALL_UNMEASURED_NODE_SIZE = {
  asset: { width: 240, height: 260 },
  shot: { width: 280, height: 680 },
  video: { width: 240, height: 330 },
  prompt: { width: 240, height: 240 },
} as const satisfies Record<CardKind, Size>

const CARD_KINDS = new Set<string>(['asset', 'shot', 'video', 'prompt'])

/** 크기를 모르는 카드의 넉넉한 크기. tall = 세로 · 정사각 포맷. */
export function generousCardSize(kind: string, tall = false): Size {
  const table = tall ? TALL_UNMEASURED_NODE_SIZE : UNMEASURED_NODE_SIZE
  return CARD_KINDS.has(kind) ? table[kind as CardKind] : table.asset
}

export interface CardSizing {
  /** 지금 화면에 그린 카드의 크기(DOM). 주면 여기 없는 카드는 화면 밖으로 본다. */
  fresh?: ReadonlyMap<string, Size> | null
  /** 지금 화면에 그린 카드 id. fresh 가 없을 때 화면 밖을 가린다. 모르면(서버 · 시험) 잰 크기를 그대로 쓴다. */
  rendered?: ReadonlySet<string> | null
  /** 세로 · 정사각 포맷. */
  tall?: boolean
}

/** 카드 하나의 셈 크기. 지금 잰 크기 > 화면 안의 잰 크기 > 화면 밖이면 잰 크기와 넉넉한 크기 중 큰 값 > 넉넉한 크기. */
export function cardSize(node: DirectorNode, sizing: CardSizing = {}): Size {
  const fresh = sizing.fresh?.get(node.id)
  if (fresh) return fresh
  const generous = generousCardSize(node.data.kind, sizing.tall)
  const measured = node.measured
  if (!measured?.width || !measured?.height) return generous
  const offScreen = sizing.fresh ? true : sizing.rendered ? !sizing.rendered.has(node.id) : false
  return offScreen
    ? { width: Math.max(measured.width, generous.width), height: Math.max(measured.height, generous.height) }
    : { width: measured.width, height: measured.height }
}

/** 지금 놓인 순서(위 → 왼쪽). 정렬해도 사람이 보던 차례를 지킨다. */
const byPlace = (a: DirectorNode, b: DirectorNode) => a.position.y - b.position.y || a.position.x - b.position.x
const assetRank = (node: DirectorNode) => (isAssetData(node.data) && node.data.assetKind === 'world' ? 1 : 0)

interface Box { x: number; y: number; w: number; h: number }
const boxAt = (at: XYPosition, size: Size): Box => ({ x: at.x, y: at.y, w: size.width, h: size.height })
const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** 옮길 카드마다 새 왼쪽 위 자리. 씬(화면에 안 보이는 묶음 기준점)은 새 샷이 그 샷 열에 붙도록 샷 열 왼쪽 SHOT_OFFSET_X 에 둔다. */
export function arrangeDirectorCanvas(nodes: readonly DirectorNode[], sizing: CardSizing = {}): Map<string, XYPosition> {
  const placed = new Map<string, XYPosition>()
  const sizeOf = (node: DirectorNode) => cardSize(node, sizing)

  // 1) 에셋 한 열: 인물 먼저, 배경 다음. 같은 종류는 지금 순서대로.
  const assets = nodes.filter((node) => isAssetData(node.data)).sort((a, b) => assetRank(a) - assetRank(b) || byPlace(a, b))
  let assetY = ORIGIN.y
  let assetColumnWidth = 0
  for (const asset of assets) {
    const size = sizeOf(asset)
    placed.set(asset.id, { x: ORIGIN.x, y: assetY })
    assetY += size.height + ASSET_ROW_GAP
    assetColumnWidth = Math.max(assetColumnWidth, size.width)
  }

  // 2) 씬 묶음: 왼쪽에서 오른쪽으로. 묶음 안은 샷 줄을 위에서 아래로, 테이크는 샷 오른쪽 열에 쌓는다.
  //    테이크가 없는 씬도 영상 열 자리는 비워 둔다: 안 비우면 다음 씬 샷 열이 붙어, 처음 만든 테이크가 그 열과 겹쳐 맨 아래로 밀린다.
  let groupX = assets.length > 0 ? ORIGIN.x + assetColumnWidth + ASSET_TO_SHOT_GAP : ORIGIN.x
  for (const scene of nodes.filter((node) => isSceneData(node.data)).sort(byPlace)) {
    const shots = nodes.filter((node) => isShotData(node.data) && node.data.parentSceneNodeId === scene.id).sort(byPlace)
    const videosOf = (shotId: string) =>
      nodes.filter((node) => isVideoData(node.data) && node.data.parentShotNodeId === shotId).sort(byPlace)
    const shotColumnWidth = Math.max(UNMEASURED_NODE_SIZE.shot.width, ...shots.map((shot) => sizeOf(shot).width))
    const videoX = groupX + shotColumnWidth + NODE_COLUMN_GAP
    let videoColumnWidth: number = UNMEASURED_NODE_SIZE.video.width
    let rowY = ORIGIN.y
    placed.set(scene.id, { x: groupX - SHOT_OFFSET_X, y: ORIGIN.y })
    for (const shot of shots) {
      placed.set(shot.id, { x: groupX, y: rowY })
      let takeY = rowY
      for (const video of videosOf(shot.id)) {
        const size = sizeOf(video)
        placed.set(video.id, { x: videoX, y: takeY })
        takeY += size.height + NODE_ROW_GAP
        videoColumnWidth = Math.max(videoColumnWidth, size.width)
      }
      const takesBottom = takeY > rowY ? takeY - NODE_ROW_GAP : rowY
      rowY = Math.max(rowY + sizeOf(shot).height, takesBottom) + NODE_ROW_GAP
    }
    groupX = videoX + videoColumnWidth + SCENE_GROUP_GAP
  }

  // 3) 옮기지 않는 카드(프롬프트 · 씬 없는 샷 · 샷 없는 영상)를 피한다(검토 C 2번): 정렬한 카드(+ 입력 구멍 라벨 · 줄 간격)와 겹치면
  //    정렬 전체를 그 카드 오른쪽 열 간격 뒤로 민다. 멀리 있는 카드는 건드리지 않는다.
  const obstacles = nodes
    .filter((node) => CARD_KINDS.has(node.data.kind) && !placed.has(node.id))
    .map((node) => boxAt(node.position, sizeOf(node)))
  const arranged = nodes
    .filter((node) => CARD_KINDS.has(node.data.kind) && placed.has(node.id))
    .map((node) => ({ id: node.id, size: sizeOf(node) }))
  for (let round = 0; round <= obstacles.length; round++) {
    const boxes = arranged.map(({ id, size }) => boxAt(placed.get(id)!, size))
    const hit = obstacles.filter((obstacle) =>
      boxes.some((card) => intersects(obstacle, { x: card.x - PORT_LABEL_SPACE, y: card.y - NODE_ROW_GAP, w: card.w + PORT_LABEL_SPACE * 2, h: card.h + NODE_ROW_GAP * 2 })),
    )
    if (hit.length === 0 || boxes.length === 0) break
    const left = Math.min(...boxes.map((card) => card.x))
    const dx = Math.max(...hit.map((obstacle) => obstacle.x + obstacle.w + NODE_COLUMN_GAP - left))
    if (dx <= 0) break
    for (const [id, at] of placed) placed.set(id, { x: at.x + dx, y: at.y })
  }
  return placed
}

/**
 * start 에서 시작해, 같은 세로줄(가로로 겹치는)의 다른 카드와 줄 간격(56)보다 가까우면 그 카드 밑으로 내린다.
 * 새 카드 크기는 모르니 넉넉한 크기로 센다.
 */
function freeSpotBelow(nodes: readonly DirectorNode[], start: XYPosition, size: Size, sizing: CardSizing): XYPosition {
  const cards = nodes.filter((node) => CARD_KINDS.has(node.data.kind)).map((node) => boxAt(node.position, cardSize(node, sizing)))
  let y = start.y
  for (let round = 0; round <= cards.length; round++) {
    const blocker = cards.find(
      (card) => card.x < start.x + size.width && start.x < card.x + card.w
        && card.y < y + size.height + NODE_ROW_GAP && y < card.y + card.h + NODE_ROW_GAP,
    )
    if (!blocker) break
    y = blocker.y + blocker.h + NODE_ROW_GAP
  }
  return { x: start.x, y }
}

const topOf = (list: readonly DirectorNode[]) => [...list].sort(byPlace)[0]

/**
 * 새 테이크 자리(검토 C 1번): 그 샷에 테이크가 있으면 그 테이크 열에서 맨 아래 테이크 밑, 없으면 그 씬의 테이크 열
 * (씬에 테이크가 없으면 샷 오른쪽 열 간격 = 샷 x + VIDEO_OFFSET_X)에서 샷 높이부터. 다른 카드와 겹치면 아래로 내린다.
 */
export function newTakePosition(nodes: readonly DirectorNode[], shotId: string, sizing: CardSizing = {}): XYPosition | null {
  const shot = nodes.find((node) => node.id === shotId)
  if (!shot || !isShotData(shot.data)) return null
  const sceneId = shot.data.parentSceneNodeId
  const takesOf = (id: string) => nodes.filter((node) => isVideoData(node.data) && node.data.parentShotNodeId === id)
  const siblings = takesOf(shotId)
  let start: XYPosition
  if (siblings.length > 0) {
    start = {
      x: topOf(siblings)!.position.x,
      y: Math.max(...siblings.map((take) => take.position.y + cardSize(take, sizing).height)) + NODE_ROW_GAP,
    }
  } else {
    const sceneShots = sceneId ? nodes.filter((node) => isShotData(node.data) && node.data.parentSceneNodeId === sceneId) : []
    const sceneTakes = sceneShots.flatMap((sceneShot) => takesOf(sceneShot.id))
    start = { x: sceneTakes.length > 0 ? topOf(sceneTakes)!.position.x : shot.position.x + VIDEO_OFFSET_X, y: shot.position.y }
  }
  return freeSpotBelow(nodes, start, generousCardSize('video', sizing.tall), sizing)
}

/**
 * 새 샷 자리(검토 C 1번): 그 씬에 샷이 있으면 그 샷 열에서 맨 아래 줄(샷과 그 테이크) 밑, 없으면 씬 오른쪽 샷 열 맨 위.
 * 다른 카드와 겹치면 아래로 내린다.
 */
export function newShotPosition(nodes: readonly DirectorNode[], sceneId: string, sizing: CardSizing = {}): XYPosition | null {
  const scene = nodes.find((node) => node.id === sceneId)
  if (!scene) return null
  const siblings = nodes.filter((node) => isShotData(node.data) && node.data.parentSceneNodeId === sceneId)
  let start: XYPosition
  if (siblings.length > 0) {
    const rowBottom = (shot: DirectorNode) => Math.max(
      shot.position.y + cardSize(shot, sizing).height,
      ...nodes
        .filter((node) => isVideoData(node.data) && node.data.parentShotNodeId === shot.id)
        .map((take) => take.position.y + cardSize(take, sizing).height),
    )
    start = { x: topOf(siblings)!.position.x, y: Math.max(...siblings.map(rowBottom)) + NODE_ROW_GAP }
  } else {
    start = { x: scene.position.x + SHOT_OFFSET_X, y: scene.position.y }
  }
  return freeSpotBelow(nodes, start, generousCardSize('shot', sizing.tall), sizing)
}

/** 지금 화면에 그린 캔버스 카드의 크기(DOM, 배율과 무관한 레이아웃 크기). 브라우저 밖이면 null. */
export function renderedCardSizes(): Map<string, Size> | null {
  if (typeof document === 'undefined') return null
  const sizes = new Map<string, Size>()
  for (const element of document.querySelectorAll<HTMLElement>('.react-flow__node[data-id]')) {
    const id = element.dataset.id
    if (id && element.offsetWidth > 0 && element.offsetHeight > 0) sizes.set(id, { width: element.offsetWidth, height: element.offsetHeight })
  }
  return sizes
}

/** [자동 정렬]이 화면 밖 카드가 그려지기를 기다리는 최대 프레임 수. 지나면 못 잰 카드는 넉넉하게 세고 정렬한다. */
export const ARRANGE_WAIT_FRAMES = 10

interface ArrangeWait {
  /** 캔버스에 그려야 하는 카드 id. */
  cardIds: () => readonly string[]
  /** 지금 그려져 크기를 잴 수 있는 카드 id. 브라우저 밖이면 null(기다리지 않는다). */
  renderedIds: () => { has(id: string): boolean } | null
  arrange: () => void
  requestFrame?: (callback: () => void) => number
  cancelFrame?: (handle: number) => void
}

/**
 * [자동 정렬](검토 C 3번): 캔버스가 화면 밖 카드까지 그리는 동안 프레임마다 보고, 다 그려졌거나 ARRANGE_WAIT_FRAMES 가 지나면 한 번 정렬한다.
 * 돌려준 함수를 부르면(캔버스가 닫힘) 기다림을 멈추고 정렬하지 않는다.
 */
export function arrangeOnceCardsRendered({
  cardIds,
  renderedIds,
  arrange,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
}: ArrangeWait): () => void {
  let waited = 0
  let handle = requestFrame(function check() {
    const rendered = renderedIds()
    const missing = rendered !== null && cardIds().some((id) => !rendered.has(id))
    if (missing && ++waited < ARRANGE_WAIT_FRAMES) {
      handle = requestFrame(check)
      return
    }
    arrange()
  })
  return () => cancelFrame(handle)
}
