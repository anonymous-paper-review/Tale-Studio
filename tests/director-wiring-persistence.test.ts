// Director 수동 연결의 DB 직렬화 계약(#wiring-persistence 2026-08-31).
//
// 핵심 계약: 노드 id(dn_*)는 기기-로컬 난수 — DB에는 안정 참조(shot_id/clip_id/asset_id)로
// 저장하고, 다른 기기(다른 노드 id 집합)에서 그 참조가 같은 대상 노드로 복원되어야 한다.
// "새 기기" 시뮬레이션: 같은 writer/clip 식별자를 가진 노드를 새 id로 다시 만들어 resolve 한다.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  parseStableFrameInputs,
  parseStableImageInputs,
  parseStableVideoChain,
  resolveFrameInputs,
  resolveImageInputs,
  resolveWiringRef,
  serializeFrameInputs,
  serializeImageInputs,
  serializeWiringRef,
  isEmptyStableFrameInputs,
} from '@/lib/director/wiring-persistence'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData } from '@/types/director'

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
})

function api() {
  return useDirectorCanvasStore.getState()
}

/** writer 샷 + 완료 테이크가 있는 캔버스 한 벌을 만든다 (노드 id는 호출마다 새로 난수). */
function seedCanvas(suffix: string) {
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
  const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
  api().updateNodeData<'shot'>(sourceShotId, { writerShotId: `writer-src-${suffix}` })
  const targetShotId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Target')
  api().updateNodeData<'shot'>(targetShotId, { writerShotId: `writer-tgt-${suffix}` })
  const videoId = api().addVideoTake(targetShotId)!
  api().updateNodeData<'video'>(videoId, { videoClipId: `clip-${suffix}` })
  return { sceneId, sourceShotId, targetShotId, videoId }
}

describe('serializeWiringRef / resolveWiringRef', () => {
  it('writer 샷·클립·에셋은 안정 참조로 직렬화되고 같은 캔버스에서 되돌아온다', () => {
    const { sourceShotId, videoId } = seedCanvas('a')
    const nodes = api().nodes

    const shotRef = serializeWiringRef(nodes, sourceShotId)
    expect(shotRef).toEqual({ kind: 'shot', shotId: 'writer-src-a' })
    expect(resolveWiringRef(nodes, shotRef!)).toBe(sourceShotId)

    const videoRef = serializeWiringRef(nodes, videoId)
    expect(videoRef).toEqual({ kind: 'video', clipId: 'clip-a' })
    expect(resolveWiringRef(nodes, videoRef!)).toBe(videoId)
  })

  it('안정 키가 없는 노드(수동 Shot·미생성 테이크)는 직렬화 불가(null)', () => {
    const standaloneShotId = api().addShotNode(null, { x: 0, y: 0 }, 'Manual')
    const videoId = api().addVideoTake(standaloneShotId)! // videoClipId 없음
    const nodes = api().nodes
    expect(serializeWiringRef(nodes, standaloneShotId)).toBeNull()
    expect(serializeWiringRef(nodes, videoId)).toBeNull()
    expect(serializeWiringRef(nodes, 'missing')).toBeNull()
  })

  it("구 DB의 'shotImage' 참조는 부모 Shot 노드로 해석된다 (#node-merge 하위호환)", () => {
    const { sourceShotId } = seedCanvas('b')
    api().rebuildShotChainNodes()
    // 파생 카드는 더 이상 없지만, 구 버전이 저장한 shotImage 참조는 여전히 풀린다.
    expect(api().nodes.some((n) => n.data.kind === 'shotImage')).toBe(false)
    expect(
      resolveWiringRef(api().nodes, { kind: 'shotImage', shotId: 'writer-src-b' }),
    ).toBe(sourceShotId)
  })
})

describe('새 기기 시뮬레이션 — 다른 노드 id 집합에서의 복원', () => {
  it('frameInputs가 새 캔버스의 대응 노드 id로 복원된다', () => {
    // 기기 1: 연결을 만들고 직렬화
    const first = seedCanvas('x')
    api().wireFrameToVideo(first.sourceShotId, first.videoId, 'frame-start')
    api().wireFrameToVideo(first.sourceShotId, first.videoId, 'frame-ref')
    const video1 = api().nodes.find((n) => n.id === first.videoId)!
    const stable = serializeFrameInputs(
      api().nodes,
      (video1.data as { frameInputs: { start: string | null; end: string | null; refs: string[] } })
        .frameInputs,
    )
    expect(stable.start).toEqual({ kind: 'shot', shotId: 'writer-src-x' })

    // 기기 2: 같은 식별자, 새 노드 id
    api().reset()
    const second = seedCanvas('x')
    expect(second.sourceShotId).not.toBe(first.sourceShotId)

    const restored = resolveFrameInputs(api().nodes, stable)
    expect(restored.start).toBe(second.sourceShotId)
    expect(restored.refs).toEqual([second.sourceShotId])
    expect(restored.end).toBeNull()
  })

  it('imageInputs 복원은 사라진 참조를 버리고 중복을 제거한다', () => {
    const { sourceShotId, targetShotId } = seedCanvas('y')
    const stable = serializeImageInputs(api().nodes, [sourceShotId, sourceShotId, 'ghost'])
    expect(stable).toHaveLength(1)

    api().reset()
    seedCanvas('z') // 다른 식별자 — writer-src-y 없음
    expect(resolveImageInputs(api().nodes, stable)).toEqual([])

    api().reset()
    const again = seedCanvas('y')
    expect(resolveImageInputs(api().nodes, stable)).toEqual([again.sourceShotId])
    void targetShotId
  })
})

describe('DB jsonb 관대한 파싱', () => {
  it('형태가 어긋난 참조는 버리고 유효한 것만 남긴다', () => {
    expect(
      parseStableImageInputs([
        { kind: 'shot', shotId: 's1' },
        { kind: 'video' }, // clipId 누락
        { kind: 'asset', assetId: 'a1' },
        'garbage',
        null,
      ]),
    ).toEqual([
      { kind: 'shot', shotId: 's1' },
      { kind: 'asset', assetId: 'a1' },
    ])
    expect(parseStableImageInputs(null)).toEqual([])
    expect(parseStableImageInputs('not-array')).toEqual([])
  })

  it('frame_inputs/video_chain 파싱 — null·불량 형태는 null', () => {
    expect(parseStableFrameInputs(null)).toBeNull()
    expect(parseStableFrameInputs([])).toBeNull()
    const parsed = parseStableFrameInputs({
      start: { kind: 'shot', shotId: 's1' },
      end: 'bad',
      refs: [{ kind: 'video', clipId: 'c1' }, 42],
    })
    expect(parsed).toEqual({
      start: { kind: 'shot', shotId: 's1' },
      end: null,
      refs: [{ kind: 'video', clipId: 'c1' }],
    })

    expect(parseStableVideoChain(null)).toBeNull()
    expect(parseStableVideoChain({ frame_url: 'u' })).toBeNull()
    expect(
      parseStableVideoChain({ source_clip_id: 'c1', frame_url: 'https://cdn/f.jpg' }),
    ).toEqual({ source_clip_id: 'c1', frame_url: 'https://cdn/f.jpg' })
    expect(parseStableVideoChain({ source_clip_id: 'c1' })).toEqual({
      source_clip_id: 'c1',
      frame_url: null,
    })
  })

  it('빈 frameInputs 판정 — 스윕이 DB에 null을 쓰는 기준', () => {
    expect(isEmptyStableFrameInputs({ start: null, end: null, refs: [] })).toBe(true)
    expect(
      isEmptyStableFrameInputs({ start: { kind: 'shot', shotId: 's' }, end: null, refs: [] }),
    ).toBe(false)
  })
})

describe('video-chain 직렬화 전제', () => {
  it('완료 테이크의 videoClipId가 안정 키로 쓰인다', () => {
    const { videoId } = seedCanvas('c')
    const node = api().nodes.find((n) => n.id === videoId)!
    expect(isVideoData(node.data) && node.data.videoClipId).toBe('clip-c')
  })
})
