// Director 노드 보기 [자동 정렬]의 배치 규칙(오너 2026-11-10 "피그마 자료처럼 조금 가깝게"): 11/5 시안 D1 · DG 에서 잰 간격으로 놓는다.
//   왼쪽에 에셋 한 열(인물 위 · 배경 아래), 그 오른쪽에 씬마다 [샷 열 | 영상 열] 묶음을 왼쪽에서 오른쪽으로 둔다.
//   카드 크기는 화면이 잰 크기(measured)로 세고, 아직 모르면(화면 밖이라 그려진 적 없는 카드) 넉넉한 크기로 센다:
//   그림 비율 · 테이크 수가 달라도 겹치지 않는다. 씬 없는 샷 · 샷 없는 영상 · 프롬프트 노드는 지금처럼 옮기지 않는다.
//   약속: tests/director/auto-arrange.test.ts
import type { XYPosition } from '@xyflow/react'
import { isAssetData, isSceneData, isShotData, isVideoData, SHOT_OFFSET_X, type DirectorNode } from '@/types/director'

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

/** 아직 그려진 적 없어 크기를 모르는 카드의 셈 크기. 세로 그림의 큰 카드보다 조금 크게 잡는다. */
export const UNMEASURED_NODE_SIZE = {
  asset: { width: 240, height: 240 },
  shot: { width: 280, height: 420 },
  video: { width: 240, height: 280 },
} as const

interface Size { width: number; height: number }

function sizeOf(node: DirectorNode): Size {
  const measured = node.measured
  if (measured?.width && measured?.height) return { width: measured.width, height: measured.height }
  const kind = node.data.kind
  return kind === 'asset' || kind === 'shot' || kind === 'video' ? UNMEASURED_NODE_SIZE[kind] : UNMEASURED_NODE_SIZE.asset
}

/** 지금 놓인 순서(위 → 왼쪽). 정렬해도 사람이 보던 차례를 지킨다. */
const byPlace = (a: DirectorNode, b: DirectorNode) => a.position.y - b.position.y || a.position.x - b.position.x
const assetRank = (node: DirectorNode) => (isAssetData(node.data) && node.data.assetKind === 'world' ? 1 : 0)

/** 옮길 카드마다 새 왼쪽 위 자리. 씬(화면에 안 보이는 묶음 기준점)은 새 샷이 그 샷 열에 붙도록 샷 열 왼쪽 SHOT_OFFSET_X 에 둔다. */
export function arrangeDirectorCanvas(nodes: readonly DirectorNode[]): Map<string, XYPosition> {
  const placed = new Map<string, XYPosition>()

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
  let groupX = assets.length > 0 ? ORIGIN.x + assetColumnWidth + ASSET_TO_SHOT_GAP : ORIGIN.x
  for (const scene of nodes.filter((node) => isSceneData(node.data)).sort(byPlace)) {
    const shots = nodes.filter((node) => isShotData(node.data) && node.data.parentSceneNodeId === scene.id).sort(byPlace)
    const videosOf = (shotId: string) =>
      nodes.filter((node) => isVideoData(node.data) && node.data.parentShotNodeId === shotId).sort(byPlace)
    const shotColumnWidth = Math.max(UNMEASURED_NODE_SIZE.shot.width, ...shots.map((shot) => sizeOf(shot).width))
    const videoX = groupX + shotColumnWidth + NODE_COLUMN_GAP
    let videoColumnWidth = 0
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
    const groupRight = videoColumnWidth > 0 ? videoX + videoColumnWidth : groupX + shotColumnWidth
    groupX = groupRight + SCENE_GROUP_GAP
  }
  return placed
}
