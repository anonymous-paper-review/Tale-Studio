// Director 노드 보기의 인물 · 배경 카드 겹침 풀기(오너 QA 2026-11-03 3번).
//   rebuildAssetNodes 는 에셋 카드를 ASSET_OFFSET_Y(132px) 간격으로 쌓고, 한 번 정한 자리는 다음에도 그대로 쓴다(브라우저 기억 · DB 에는 없다).
//   2026-08-31 에셋 카드가 그림 카드(16:9)가 된 뒤로 카드가 그 간격보다 커서 위아래 카드가 가렸고, 에셋 정보가 늦게 오면 같은 자리에 겹쳐 쌓이기도 했다.
//   저장된 자리는 그대로 두고, 그릴 때만 겹친 카드를 위 카드 바로 아래로 내린다. 에셋 카드는 손으로 옮길 수 없다(draggable false).
//   약속: tests/director/asset-overlap.test.ts
import { isAssetData, type DirectorNode } from '@/types/director'

/** 에셋 카드 사이 틈(D1 시안 에셋 열 간격과 비슷하게). */
export const ASSET_CARD_GAP = 32
/** 화면이 아직 재지 못한 카드(화면 밖)의 높이 — 그림 16:9 + 제목 · 꼬리, v3 실측 220. */
export const ASSET_CARD_HEIGHT = 220
/** 에셋 카드 폭(AssetNode width). */
export const ASSET_CARD_WIDTH = 240

/**
 * 그릴 노드 목록 — 에셋 카드끼리 겹치면 아래 카드를 위 카드 밑(틈 포함)으로 내린다. 겹친 만큼만, 아래로만.
 * 에셋이 아닌 노드 · 겹치지 않는 카드는 같은 객체 그대로 돌려주고, 받은 노드는 바꾸지 않는다.
 */
export function separateAssetCards(nodes: DirectorNode[]): DirectorNode[] {
  const assets = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.data.kind === 'asset')
  if (assets.length < 2) return nodes
  // 인물 카드부터(에셋 열은 인물 위 → 배경 아래), 같은 종류는 위 카드부터 — 같은 높이면 왼쪽, 그다음 원래 순서.
  //   인물 정보가 늦게 오면 인물 카드가 이미 놓인 배경 카드 자리에 겹쳐 생긴다 — 겹친 카드끼리는 인물이 위에 선다.
  const kindRank = (node: DirectorNode) => (isAssetData(node.data) && node.data.assetKind === 'world' ? 1 : 0)
  assets.sort(
    (a, b) =>
      kindRank(a.node) - kindRank(b.node) ||
      a.node.position.y - b.node.position.y ||
      a.node.position.x - b.node.position.x ||
      a.index - b.index,
  )

  const placed: Array<{ x: number; y: number; w: number; h: number }> = []
  const movedY = new Map<number, number>()
  for (const { node, index } of assets) {
    const w = node.measured?.width ?? ASSET_CARD_WIDTH
    const h = node.measured?.height ?? ASSET_CARD_HEIGHT
    const x = node.position.x
    let y = node.position.y
    // 내린 자리가 다른 카드와 또 겹칠 수 있어 더는 겹치지 않을 때까지 본다(카드 수만큼이면 충분하다).
    for (let pass = 0; pass <= placed.length; pass++) {
      const blocker = placed.find((p) => x < p.x + p.w && p.x < x + w && y < p.y + p.h + ASSET_CARD_GAP && p.y < y + h + ASSET_CARD_GAP)
      if (!blocker) break
      y = blocker.y + blocker.h + ASSET_CARD_GAP
    }
    placed.push({ x, y, w, h })
    if (y !== node.position.y) movedY.set(index, y)
  }
  if (movedY.size === 0) return nodes
  return nodes.map((node, index) => {
    const y = movedY.get(index)
    return y === undefined ? node : { ...node, position: { x: node.position.x, y } }
  })
}
