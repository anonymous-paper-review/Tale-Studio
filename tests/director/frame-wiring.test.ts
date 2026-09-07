// 영상에 연결한 시작·끝 장면과 참고 이미지를 다시 불러와도 그대로 유지한다
import { beforeEach, describe, expect, it } from 'vitest'
import {
  isShotImageData,
  isVideoData,
} from '@/types/director'
import { useDirectorCanvasStore } from '@/stores/director-store'

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
})

function api() {
  return useDirectorCanvasStore.getState()
}

function seedVideo() {
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
  const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
  const targetShotId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Target')
  const videoId = api().addVideoTake(targetShotId)!
  return { sourceShotId, targetShotId, videoId }
}

describe('Director 영상의 장면 연결', () => {
  it('START와 END에는 각각 한 장면을 연결하고 같은 장면도 둘 다 쓸 수 있다', () => {
    const { sourceShotId, videoId } = seedVideo()

    api().wireFrameToVideo(sourceShotId, videoId, 'frame-start')
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-end')

    const video = api().nodes.find((node) => node.id === videoId)
    expect(video && isVideoData(video.data) ? video.data.frameInputs : null).toEqual({
      start: sourceShotId,
      end: sourceShotId,
      refs: [],
    })
    expect(
      api().edges.filter(
        (edge) => edge.data?.category === 'frame' && edge.target === videoId,
      ),
    ).toHaveLength(2)
  })

  it('START와 END를 다시 연결하면 이전 장면을 바꾸고 REF에는 여러 장면을 중복 없이 남긴다', () => {
    const { sourceShotId, targetShotId, videoId } = seedVideo()
    const secondSourceId = api().addShotNode(
      api().nodes.find((node) => node.id === targetShotId)?.data.kind === 'shot'
        ? (api().nodes.find((node) => node.id === targetShotId)?.data as { parentSceneNodeId: string }).parentSceneNodeId
        : null,
      { x: 360, y: 1120 },
      'Second source',
    )

    api().wireFrameToVideo(sourceShotId, videoId, 'frame-start')
    api().wireFrameToVideo(secondSourceId, videoId, 'frame-start')
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-ref')
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-ref')
    api().wireFrameToVideo(secondSourceId, videoId, 'frame-ref')

    const video = api().nodes.find((node) => node.id === videoId)
    expect(video && isVideoData(video.data) ? video.data.frameInputs : null).toEqual({
      start: secondSourceId,
      end: null,
      refs: [sourceShotId, secondSourceId],
    })
    expect(
      api().edges.filter(
        (edge) =>
          edge.data?.category === 'frame' &&
          edge.target === videoId &&
          edge.targetHandle === 'frame-start',
      ),
    ).toHaveLength(1)
  })

  it('Writer에서 이어온 샷의 장면 연결은 다시 불러와도 유지된다 (#node-merge)', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
    api().updateNodeData<'shot'>(sourceShotId, { writerShotId: 'writer-source' })
    const targetShotId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Target')
    const videoId = api().addVideoTake(targetShotId)!
    api().rebuildShotChainNodes()

    api().wireFrameToVideo(sourceShotId, videoId, 'frame-ref')
    api().rebuildShotChainNodes()

    expect(
      api().edges.some(
        (edge) =>
          edge.data?.category === 'frame' &&
          edge.source === sourceShotId &&
          edge.target === videoId &&
          edge.targetHandle === 'frame-ref',
      ),
    ).toBe(true)
  })

  it('장면 연결 하나를 지우면 그 장면만 영상 입력에서 빠진다', () => {
    const { sourceShotId, videoId } = seedVideo()
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-start')
    api().wireFrameToVideo(sourceShotId, videoId, 'frame-ref')

    const startEdge = api().edges.find(
      (edge) =>
        edge.data?.category === 'frame' &&
        edge.target === videoId &&
        edge.targetHandle === 'frame-start',
    )!
    api().deleteEdge(startEdge.id)

    const video = api().nodes.find((node) => node.id === videoId)
    expect(video && isVideoData(video.data) ? video.data.frameInputs : null).toEqual({
      start: null,
      end: null,
      refs: [sourceShotId],
    })
    expect(
      api().edges.some(
        (edge) =>
          edge.data?.category === 'frame' &&
          edge.target === videoId &&
          edge.targetHandle === 'frame-ref',
      ),
    ).toBe(true)
  })
})

describe('Director Shot의 참고 이미지 연결', () => {
  it('여러 이미지를 Shot에 연결해도 같은 이미지는 한 번만 남긴다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceOneId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source one')
    const sourceTwoId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Source two')
    const targetShotId = api().addShotNode(sceneId, { x: 720, y: 0 }, 'Target')

    api().wireImageToShot(sourceOneId, targetShotId, 'image-reference')
    api().wireImageToShot(sourceOneId, targetShotId, 'image-reference')
    api().wireImageToShot(sourceTwoId, targetShotId, 'image-reference')

    const target = api().nodes.find((node) => node.id === targetShotId)
    expect(target && target.data.kind === 'shot' ? target.data.imageInputs : null).toEqual([
      sourceOneId,
      sourceTwoId,
    ])
    expect(
      api().edges.filter(
        (edge) => edge.data?.category === 'image' && edge.target === targetShotId,
      ),
    ).toHaveLength(2)
  })

  it('이미지 연결 하나를 지우면 그 이미지만 Shot에서 빠진다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceOneId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source one')
    const sourceTwoId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Source two')
    const targetShotId = api().addShotNode(sceneId, { x: 720, y: 0 }, 'Target')
    api().wireImageToShot(sourceOneId, targetShotId, 'image-reference')
    api().wireImageToShot(sourceTwoId, targetShotId, 'image-reference')

    const edge = api().edges.find(
      (candidate) =>
        candidate.data?.category === 'image' &&
        candidate.source === sourceOneId &&
        candidate.target === targetShotId,
    )!
    api().deleteEdge(edge.id)

    const target = api().nodes.find((node) => node.id === targetShotId)
    expect(target && target.data.kind === 'shot' ? target.data.imageInputs : null).toEqual([
      sourceTwoId,
    ])
  })

  it('이미지 연결 요청도 화면에서 직접 연결한 것과 같은 결과가 된다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
    const targetShotId = api().addShotNode(sceneId, { x: 720, y: 0 }, 'Target')

    const result = api().applyUpdates([
      {
        type: 'connectImage',
        sourceId: sourceShotId,
        targetId: targetShotId,
        targetHandle: 'image-reference',
      },
    ])

    expect(result.applied).toBe(1)
    expect(result.skipped).toHaveLength(0)
    const target = api().nodes.find((node) => node.id === targetShotId)
    expect(target && target.data.kind === 'shot' ? target.data.imageInputs : null).toEqual([
      sourceShotId,
    ])
  })

  it('Writer에서 이어온 샷의 이미지 연결은 다시 불러와도 유지된다 (#node-merge)', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
    api().updateNodeData<'shot'>(sourceShotId, { writerShotId: 'writer-source' })
    const targetShotId = api().addShotNode(sceneId, { x: 720, y: 0 }, 'Target')
    api().wireImageToShot(sourceShotId, targetShotId, 'image-reference')
    api().rebuildShotChainNodes()

    expect(
      api().edges.some(
        (edge) =>
          edge.data?.category === 'image' &&
          edge.source === sourceShotId &&
          edge.target === targetShotId,
      ),
    ).toBe(true)
  })
})
