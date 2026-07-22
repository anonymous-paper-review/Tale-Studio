// Previz 체인 파생 그래프(#previz-chain 2026-07-22) — rebuildShotChainNodes 배선 검증.
//   체인: SCENE → Shot(PREVIZ SHOT IMAGE) → PREVIZ SHOT VIDEO → SHOT VIDEO,
//         SHOT IMAGE(실사)가 아래에서 SHOT VIDEO 로 합류.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useDirectorCanvasStore,
  followChainNodePositions,
} from '@/stores/director-store'
import {
  PREVIZ_VIDEO_OFFSET_X,
  SHOT_IMAGE_OFFSET_Y,
  VIDEO_OFFSET_X,
  isPrevizVideoData,
  isShotImageData,
  isVideoData,
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

describe('rebuildShotChainNodes', () => {
  it('writer 샷에만 PrevizVideo/ShotImage 파생 노드를 만들고 오프셋에 배치한다', () => {
    const [writerShot, manualShot] = seed()
    api().rebuildShotChainNodes()

    const nodes = api().nodes
    const pv = nodes.find((n) => n.id === `dn_pv_${writerShot}`)
    const simg = nodes.find((n) => n.id === `dn_simg_${writerShot}`)
    expect(pv && isPrevizVideoData(pv.data)).toBe(true)
    expect(simg && isShotImageData(simg.data)).toBe(true)
    expect(pv!.position).toEqual({ x: 360 + PREVIZ_VIDEO_OFFSET_X, y: 0 })
    expect(simg!.position).toEqual({ x: 360 + PREVIZ_VIDEO_OFFSET_X, y: SHOT_IMAGE_OFFSET_Y })
    expect(pv!.draggable).toBe(false)

    expect(nodes.find((n) => n.id === `dn_pv_${manualShot}`)).toBeUndefined()
    expect(nodes.find((n) => n.id === `dn_simg_${manualShot}`)).toBeUndefined()
  })

  it('Shot→Video parent 엣지를 PrevizVideo/ShotImage→Video 체인으로 대체한다', () => {
    const [writerShot] = seed()
    const videoId = api().addVideoTake(writerShot)! // addVideoTake 가 rebuild 를 내장 호출

    const edges = api().edges
    // 구 direct parent 엣지는 사라진다
    expect(
      edges.some(
        (e) => e.data?.category === 'parent' && e.source === writerShot && e.target === videoId,
      ),
    ).toBe(false)
    // 체인 배선: shot→pv, pv→video, simg→video
    const chain = edges.filter((e) => e.data?.category === 'chain')
    expect(chain.map((e) => [e.source, e.target])).toEqual(
      expect.arrayContaining([
        [writerShot, `dn_pv_${writerShot}`],
        [`dn_pv_${writerShot}`, videoId],
        [`dn_simg_${writerShot}`, videoId],
      ]),
    )
    // 비디오 테이크 기본 위치는 previz 컬럼 다음(x+720)
    const video = api().nodes.find((n) => n.id === videoId)!
    expect(video.position.x).toBe(360 + VIDEO_OFFSET_X)
  })

  it('멱등 — 두 번 돌려도 파생 노드/엣지 수가 늘지 않는다', () => {
    seed()
    api().rebuildShotChainNodes()
    const count = () => ({
      derived: api().nodes.filter(
        (n) => isPrevizVideoData(n.data) || isShotImageData(n.data),
      ).length,
      chain: api().edges.filter((e) => e.data?.category === 'chain').length,
    })
    const first = count()
    api().rebuildShotChainNodes()
    expect(count()).toEqual(first)
  })

  it('followChainNodePositions — Shot 이동 시 파생 노드가 오프셋을 유지하며 따라온다', () => {
    const [writerShot] = seed()
    api().rebuildShotChainNodes()
    const moved = api().nodes.map((n) =>
      n.id === writerShot ? { ...n, position: { x: 1000, y: 500 } } : n,
    )
    const out = followChainNodePositions(moved)
    const pv = out.find((n) => n.id === `dn_pv_${writerShot}`)!
    const simg = out.find((n) => n.id === `dn_simg_${writerShot}`)!
    expect(pv.position).toEqual({ x: 1000 + PREVIZ_VIDEO_OFFSET_X, y: 500 })
    expect(simg.position).toEqual({ x: 1000 + PREVIZ_VIDEO_OFFSET_X, y: 500 + SHOT_IMAGE_OFFSET_Y })
  })

  it('relayoutCanvas — 체인 포함 자동 정렬: video x=+720, 파생 노드 재배치', () => {
    const [writerShot] = seed()
    const videoId = api().addVideoTake(writerShot)!
    api().relayoutCanvas()

    const shot = api().nodes.find((n) => n.id === writerShot)!
    const video = api().nodes.find((n) => n.id === videoId)!
    const pv = api().nodes.find((n) => n.id === `dn_pv_${writerShot}`)!
    expect(video.position.x).toBe(shot.position.x + VIDEO_OFFSET_X)
    expect(pv.position).toEqual({
      x: shot.position.x + PREVIZ_VIDEO_OFFSET_X,
      y: shot.position.y,
    })
  })

  it('undo 후에도 체인이 재생성된다 (파생은 스냅샷 제외)', () => {
    const [writerShot] = seed()
    api().rebuildShotChainNodes()
    api().addVideoTake(writerShot)
    api().undo()
    // 비디오는 undo 로 사라지고, 파생 노드는 rebuild 로 존재
    expect(api().nodes.some((n) => isVideoData(n.data))).toBe(false)
    expect(api().nodes.some((n) => n.id === `dn_pv_${writerShot}`)).toBe(true)
    expect(
      api().edges.filter((e) => e.data?.category === 'chain').map((e) => e.target),
    ).toContain(`dn_pv_${writerShot}`)
  })
})
