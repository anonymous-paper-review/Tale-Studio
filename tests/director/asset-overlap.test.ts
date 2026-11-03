// Director 노드 보기에서 인물 · 배경 카드가 위아래로 겹치지 않게, 그릴 때 겹친 카드를 아래로 내리는지 검사한다 (오너 QA 2026-11-03 3번)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ASSET_CARD_GAP, ASSET_CARD_HEIGHT, ASSET_CARD_WIDTH, separateAssetCards } from '@/features/director/asset-column'
import { ASSET_OFFSET_Y, type DirectorNode } from '@/types/director'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
function asset(id: string, y: number, x = 80, measuredHeight?: number, assetKind: 'character' | 'world' = 'character'): DirectorNode {
  return {
    id,
    type: 'asset',
    position: { x, y },
    data: { kind: 'asset', assetKind, assetId: id, label: id },
    ...(measuredHeight ? { measured: { width: ASSET_CARD_WIDTH, height: measuredHeight } } : {}),
  } as unknown as DirectorNode
}
function shot(id: string, x: number, y: number): DirectorNode {
  return { id, type: 'shot', position: { x, y }, data: { kind: 'shot', label: id } } as unknown as DirectorNode
}
const heightOf = (node: DirectorNode) => node.measured?.height ?? ASSET_CARD_HEIGHT
/** 두 에셋 카드가 화면에서 겹치나(카드 사이 틈까지 본다). */
function overlap(a: DirectorNode, b: DirectorNode): boolean {
  const xs = a.position.x < b.position.x + ASSET_CARD_WIDTH && b.position.x < a.position.x + ASSET_CARD_WIDTH
  const [top, bottom] = a.position.y <= b.position.y ? [a, b] : [b, a]
  return xs && bottom.position.y < top.position.y + heightOf(top) + ASSET_CARD_GAP
}

describe('같이 정한 것', () => {
  // 왜: 오너 QA 11/3 — "director탭의 node뷰에서 asset들(캐릭터, 배경) 카드가 위아래로 겹쳐져 있다". 운영 3945d1e6(인물 3 · 배경 5)은
  //   에셋 카드를 132px 간격으로 쌓는데 카드(그림 16:9 + 제목 · 꼬리)가 그보다 커서 아래 카드가 위 카드를 가렸다. 저장된 자리도 같은 132px 간격이다.
  it('인물 · 배경 카드가 132px 간격으로 쌓여 있어도 Director 노드 보기에서는 서로 겹치지 않는다', () => {
    const stacked = Array.from({ length: 8 }, (_, i) => asset(`asset-${i}`, 80 + i * ASSET_OFFSET_Y))
    const drawn = separateAssetCards(stacked)
    for (let i = 0; i < drawn.length; i++) {
      for (let j = i + 1; j < drawn.length; j++) expect(overlap(drawn[i]!, drawn[j]!), `${i}·${j}`).toBe(false)
    }
    expect(drawn[0]!.position).toEqual({ x: 80, y: 80 })
  })
})

describe('혼자 정한 것', () => {
  // 왜: 카드 높이는 그림 비율 · 오류 글줄에 따라 다르다 — 화면이 잰 높이가 있으면 그 높이로, 아직 못 잰 카드(화면 밖)는 보통 높이로 띄운다.
  it('화면이 잰 카드 높이가 있으면 그 높이만큼, 아직 못 잰 카드는 보통 높이만큼 띄워 아래 카드를 놓는다', () => {
    const drawn = separateAssetCards([asset('a', 80, 80, 300), asset('b', 212), asset('c', 344)])
    expect(drawn[1]!.position.y).toBe(80 + 300 + ASSET_CARD_GAP)
    expect(drawn[2]!.position.y).toBe(drawn[1]!.position.y + ASSET_CARD_HEIGHT + ASSET_CARD_GAP)
  })

  // 왜: 겹치지 않는 카드까지 움직이면 연결선 · 미니맵이 괜히 흔들린다 — 겹친 만큼만, 아래로만 민다.
  it('이미 떨어져 있는 에셋 카드는 자리를 바꾸지 않는다', () => {
    const apart = 80 + ASSET_CARD_HEIGHT + ASSET_CARD_GAP + 40
    expect(separateAssetCards([asset('a', 80), asset('b', apart)]).map((n) => n.position.y)).toEqual([80, apart])
  })

  // 왜: 샷 · 영상 · 프롬프트 카드는 사용자가 손으로 옮기고 그 자리가 저장된다(샷은 DB canvas_position) — 에셋 겹침을 풀면서 그 자리를 건드리지 않는다.
  it('에셋이 아닌 카드(샷 · 영상 · 프롬프트)는 겹침을 풀 때 자리를 바꾸지 않는다', () => {
    const drawn = separateAssetCards([asset('a', 80), shot('s', 80, 100), asset('b', 212)])
    expect(drawn.find((n) => n.id === 's')!.position).toEqual({ x: 80, y: 100 })
    expect(drawn.find((n) => n.id === 'b')!.position.y).toBe(80 + ASSET_CARD_HEIGHT + ASSET_CARD_GAP)
  })

  // 왜: 에셋 열이 옆으로 갈린 경우(나중에 더한 에셋이 다른 x 에서 시작) 옆 열 카드끼리는 겹치지 않으니 서로 밀지 않는다.
  it('옆으로 떨어진 에셋 카드끼리는 서로 밀지 않는다', () => {
    const drawn = separateAssetCards([asset('a', 80, 80), asset('b', 120, 80 + ASSET_CARD_WIDTH + 40)])
    expect(drawn[1]!.position).toEqual({ x: 80 + ASSET_CARD_WIDTH + 40, y: 120 })
  })

  // 왜: 에셋 열은 인물 위 → 배경 아래로 쌓게 짜여 있다(rebuildAssetNodes). 인물 정보가 늦게 오면 인물 카드가 이미 놓인 배경 카드 자리에
  //   겹쳐 생긴다(개발 DB 77dfa43c 실측) — 겹침만 풀면 인물 · 배경이 섞여 보여서, 겹친 카드끼리는 인물을 먼저 놓는다.
  it('인물 카드와 배경 카드가 같은 자리에 겹쳐 있으면 인물을 위에, 배경을 아래에 놓는다', () => {
    const drawn = separateAssetCards([
      asset('world-1', 80, 80, undefined, 'world'),
      asset('world-2', 80 + ASSET_OFFSET_Y, 80, undefined, 'world'),
      asset('char-1', 80),
      asset('char-2', 80 + ASSET_OFFSET_Y),
    ])
    const order = [...drawn].sort((a, b) => a.position.y - b.position.y).map((n) => n.id)
    expect(order).toEqual(['char-1', 'char-2', 'world-1', 'world-2'])
  })

  // 왜: 리드 지시 — 저장된 자리를 고쳐 쓰지 않고 그릴 때만 푼다. 에셋 자리는 DB 에 없고 브라우저 기억에만 있어, 고쳐 쓰면 다음 진입 · 다른 탭에 섞인다.
  it('겹침을 풀어도 저장된 자리는 바꾸지 않고, 캔버스는 그린 자리로만 보인다', () => {
    const nodes = [asset('a', 80), asset('b', 212)]
    const before = JSON.stringify(nodes)
    const drawn = separateAssetCards(nodes)
    expect(JSON.stringify(nodes)).toBe(before)
    expect(drawn[0]).toBe(nodes[0])
    expect(read('src/app/studio/director/page.tsx')).toMatch(/separateAssetCards\(/)
  })
})
