// Shot 체인 배선(#node-merge 2026-08-31 대공사) — rebuildShotChainNodes 검증.
//   파생 SHOT IMAGE/플레이스홀더 카드는 제거됐다: 실사 이미지는 Shot(이미지 노드) 카드가
//   직접 표시하고, 체인은 SHOT → SHOT VIDEO 직결이다. 구 persist에 남은 파생 노드는
//   rebuild가 멱등 정리한다.
import { beforeEach, describe, expect, it } from 'vitest'
import { useDirectorCanvasStore } from '@/stores/director-store'
import {
  VIDEO_OFFSET_X,
  isShotImageData,
  isVideoData,
  isVideoPlaceholderData,
  type DirectorNode,
} from '@/types/director'

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
})

function api() {
  return useDirectorCanvasStore.getState()
}

/** Scene + writer 샷(writerShotId 有) + 수동 샷(無) 시드, [writerShotNodeId, manualShotNodeId] 반환 */
function seed(): [string, string] {
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'S1')
  const writerShot = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Shot1')
  api().updateNodeData<'shot'>(writerShot, { writerShotId: 'sh_1' })
  const manualShot = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Shot2')
  return [writerShot, manualShot]
}

describe('rebuildShotChainNodes (#node-merge 직결 체인)', () => {
  it('파생 카드(shotImage/videoPlaceholder)를 만들지 않는다', () => {
    seed()
    api().rebuildShotChainNodes()
    const nodes = api().nodes
    expect(nodes.some((n) => isShotImageData(n.data))).toBe(false)
    expect(nodes.some((n) => isVideoPlaceholderData(n.data))).toBe(false)
  })

  it('구 persist 잔재(파생 노드)를 멱등 정리한다', () => {
    const [writerShot] = seed()
    // 구버전 persist에서 로드된 파생 노드를 흉내낸다
    useDirectorCanvasStore.setState((s) => ({
      nodes: [
        ...s.nodes,
        {
          id: `dn_simg_${writerShot}`,
          type: 'shotImage',
          position: { x: 720, y: 0 },
          data: { kind: 'shotImage', label: 'legacy', parentShotNodeId: writerShot },
        } as DirectorNode,
        {
          id: `dn_vph_${writerShot}`,
          type: 'videoPlaceholder',
          position: { x: 1080, y: 0 },
          data: { kind: 'videoPlaceholder', label: 'legacy', parentShotNodeId: writerShot },
        } as DirectorNode,
      ],
    }))
    api().rebuildShotChainNodes()
    expect(api().nodes.some((n) => isShotImageData(n.data))).toBe(false)
    expect(api().nodes.some((n) => isVideoPlaceholderData(n.data))).toBe(false)
  })

  it('writer 샷의 Shot→Video parent 엣지를 직결 chain 엣지로 대체한다', () => {
    const [writerShot] = seed()
    const videoId = api().addVideoTake(writerShot)! // addVideoTake 가 rebuild 를 내장 호출

    const edges = api().edges
    expect(
      edges.some(
        (e) => e.data?.category === 'parent' && e.source === writerShot && e.target === videoId,
      ),
    ).toBe(false)
    const chain = edges.filter((e) => e.data?.category === 'chain')
    expect(chain.map((e) => [e.source, e.target])).toEqual(
      expect.arrayContaining([[writerShot, videoId]]),
    )
    // 비디오 테이크 기본 위치는 Shot 다음 컬럼
    const video = api().nodes.find((n) => n.id === videoId)!
    expect(video.position.x).toBe(360 + VIDEO_OFFSET_X)
  })

  it('수동 샷(writerShotId 없음)의 Video는 parent 엣지를 유지한다', () => {
    const [, manualShot] = seed()
    const videoId = api().addVideoTake(manualShot)!
    expect(
      api().edges.some(
        (e) => e.data?.category === 'parent' && e.source === manualShot && e.target === videoId,
      ),
    ).toBe(true)
  })

  it('멱등 — 두 번 돌려도 노드/체인 엣지 수가 늘지 않는다', () => {
    const [writerShot] = seed()
    api().addVideoTake(writerShot)
    const count = () => ({
      nodes: api().nodes.length,
      chain: api().edges.filter((e) => e.data?.category === 'chain').length,
    })
    const first = count()
    api().rebuildShotChainNodes()
    expect(count()).toEqual(first)
  })

  it('undo 후에도 체인이 재계산된다', () => {
    const [writerShot] = seed()
    api().rebuildShotChainNodes()
    api().addVideoTake(writerShot)
    api().undo()
    expect(api().nodes.some((n) => isVideoData(n.data))).toBe(false)
    // 테이크가 사라졌으니 체인 엣지도 없어야 한다
    expect(
      api().edges.filter((e) => e.data?.category === 'chain'),
    ).toHaveLength(0)
  })
})
