// Shot 체인 파생 그래프(#previz-chain 2026-07-22, 2026-07-27 직선화) — rebuildShotChainNodes 배선 검증.
//   체인: SCENE → SHOT(previz 3프레임 보드) → SHOT IMAGE(실사) → SHOT VIDEO.
//   (구 PREVIZ SHOT VIDEO 노드는 previz 영상 기능 숨김으로 제거 — 영상 진입점은 SHOT VIDEO 하나.)
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useDirectorCanvasStore,
  followChainNodePositions,
} from '@/stores/director-store'
import { chainParentShotNodeId } from '@/features/director/canvas-interaction'
import {
  SHOT_IMAGE_OFFSET_X,
  VIDEO_OFFSET_X,
  isShotImageData,
  isVideoData,
  isVideoPlaceholderData,
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
  it('writer 샷에만 ShotImage 파생 노드를 만들고 Shot 우측 같은 행에 배치한다', () => {
    const [writerShot, manualShot] = seed()
    api().rebuildShotChainNodes()

    const nodes = api().nodes
    const simg = nodes.find((n) => n.id === `dn_simg_${writerShot}`)
    expect(simg && isShotImageData(simg.data)).toBe(true)
    expect(simg!.position).toEqual({ x: 360 + SHOT_IMAGE_OFFSET_X, y: 0 })
    expect(simg!.draggable).toBe(false)

    // previz 영상 노드 제거(2026-07-27) — 'previzVideo' 는 타입 유니온에서 빠져 비교 자체가
    //   불가하므로(컴파일 타임 보장), 파생물이 ShotImage + 플레이스홀더 2개뿐임으로 확인한다.
    const derivedOfShot = nodes.filter(
      (n) => (n.data as { parentShotNodeId?: string }).parentShotNodeId === writerShot,
    )
    expect(derivedOfShot.map((n) => n.id).sort()).toEqual(
      [`dn_simg_${writerShot}`, `dn_vph_${writerShot}`].sort(),
    )
    expect(nodes.find((n) => n.id === `dn_simg_${manualShot}`)).toBeUndefined()
  })

  it('Shot→Video parent 엣지를 Shot→ShotImage→Video 직선 체인으로 대체한다', () => {
    const [writerShot] = seed()
    const videoId = api().addVideoTake(writerShot)! // addVideoTake 가 rebuild 를 내장 호출

    const edges = api().edges
    // 구 direct parent 엣지는 사라진다
    expect(
      edges.some(
        (e) => e.data?.category === 'parent' && e.source === writerShot && e.target === videoId,
      ),
    ).toBe(false)
    // 체인 배선: shot→simg, simg→video (직선)
    const chain = edges.filter((e) => e.data?.category === 'chain')
    expect(chain.map((e) => [e.source, e.target])).toEqual(
      expect.arrayContaining([
        [writerShot, `dn_simg_${writerShot}`],
        [`dn_simg_${writerShot}`, videoId],
      ]),
    )
    // 비디오 테이크 기본 위치는 SHOT IMAGE 다음 컬럼(x+720)
    const video = api().nodes.find((n) => n.id === videoId)!
    expect(video.position.x).toBe(360 + VIDEO_OFFSET_X)
  })

  it('멱등 — 두 번 돌려도 파생 노드/엣지 수가 늘지 않는다', () => {
    seed()
    api().rebuildShotChainNodes()
    const count = () => ({
      derived: api().nodes.filter((n) => isShotImageData(n.data)).length,
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
    const simg = out.find((n) => n.id === `dn_simg_${writerShot}`)!
    expect(simg.position).toEqual({ x: 1000 + SHOT_IMAGE_OFFSET_X, y: 500 })
  })

  it('relayoutCanvas — 체인 포함 자동 정렬: video x=+720, ShotImage x=+360 같은 행', () => {
    const [writerShot] = seed()
    const videoId = api().addVideoTake(writerShot)!
    api().relayoutCanvas()

    const shot = api().nodes.find((n) => n.id === writerShot)!
    const video = api().nodes.find((n) => n.id === videoId)!
    const simg = api().nodes.find((n) => n.id === `dn_simg_${writerShot}`)!
    expect(video.position.x).toBe(shot.position.x + VIDEO_OFFSET_X)
    expect(simg.position).toEqual({
      x: shot.position.x + SHOT_IMAGE_OFFSET_X,
      y: shot.position.y,
    })
  })

  it('테이크 0개면 회색 SHOT VIDEO 플레이스홀더가 종점을 안내하고, 테이크 생성 시 사라진다', () => {
    const [writerShot, manualShot] = seed()
    api().rebuildShotChainNodes()

    const phId = `dn_vph_${writerShot}`
    const ph = api().nodes.find((n) => n.id === phId)
    expect(ph && isVideoPlaceholderData(ph.data)).toBe(true)
    expect(ph!.position).toEqual({ x: 360 + VIDEO_OFFSET_X, y: 0 })
    // 체인 배선: simg→ph
    const chain = api().edges.filter((e) => e.data?.category === 'chain')
    expect(chain.map((e) => [e.source, e.target])).toEqual(
      expect.arrayContaining([[`dn_simg_${writerShot}`, phId]]),
    )
    // 수동 샷엔 플레이스홀더 없음
    expect(api().nodes.find((n) => n.id === `dn_vph_${manualShot}`)).toBeUndefined()

    // 첫 테이크 생성 → 플레이스홀더 제거 + 실제 Video 배선으로 대체
    const videoId = api().addVideoTake(writerShot)!
    expect(api().nodes.find((n) => n.id === phId)).toBeUndefined()
    expect(
      api().edges.some((e) => e.data?.category === 'chain' && e.target === videoId),
    ).toBe(true)
  })

  it('followChainNodePositions — 플레이스홀더도 Shot 이동을 따라온다', () => {
    const [writerShot] = seed()
    api().rebuildShotChainNodes()
    const moved = api().nodes.map((n) =>
      n.id === writerShot ? { ...n, position: { x: 800, y: 200 } } : n,
    )
    const ph = followChainNodePositions(moved).find((n) => n.id === `dn_vph_${writerShot}`)!
    expect(ph.position).toEqual({ x: 800 + VIDEO_OFFSET_X, y: 200 })
  })

  it('파생 카드 상호작용(2026-07-23) — 선택 가능 + 더블클릭은 부모 Shot 으로 위임 + 삭제 불가', () => {
    const [writerShot] = seed()
    api().rebuildShotChainNodes()
    const derived = [`dn_simg_${writerShot}`, `dn_vph_${writerShot}`]
    for (const id of derived) {
      const n = api().nodes.find((x) => x.id === id)!
      expect(n.selectable).toBe(true)
      // 더블클릭 위임 대상 = 부모 Shot
      expect(chainParentShotNodeId(n.data)).toBe(writerShot)
      // 삭제 가드: 확인 모달이 열리지 않는다
      api().openDeleteConfirm(id)
      expect(api().deleteConfirmInfo).toBeNull()
    }
    // 일반 노드는 위임 대상 아님
    const shotNode = api().nodes.find((x) => x.id === writerShot)!
    expect(chainParentShotNodeId(shotNode.data)).toBeNull()
  })

  it('undo 후에도 체인이 재생성된다 (파생은 스냅샷 제외)', () => {
    const [writerShot] = seed()
    api().rebuildShotChainNodes()
    api().addVideoTake(writerShot)
    api().undo()
    // 비디오는 undo 로 사라지고, 파생 노드는 rebuild 로 존재
    expect(api().nodes.some((n) => isVideoData(n.data))).toBe(false)
    expect(api().nodes.some((n) => n.id === `dn_simg_${writerShot}`)).toBe(true)
    expect(
      api().edges.filter((e) => e.data?.category === 'chain').map((e) => e.target),
    ).toContain(`dn_simg_${writerShot}`)
  })
})
