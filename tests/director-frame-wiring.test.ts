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

describe('Director Video frame wiring', () => {
  it('START/END는 한 개씩 저장하고 같은 source도 서로 다른 슬롯에 연결한다', () => {
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

  it('START/END 재연결은 기존 입력을 교체하고 REF는 여러 장·중복 방지다', () => {
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

  it('파생 ShotImage가 재생성돼도 저장된 source ID에서 frame 엣지를 복원한다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
    api().updateNodeData<'shot'>(sourceShotId, { writerShotId: 'writer-source' })
    const targetShotId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Target')
    const videoId = api().addVideoTake(targetShotId)!
    api().rebuildShotChainNodes()

    const imageId = `dn_simg_${sourceShotId}`
    expect(api().nodes.some((node) => node.id === imageId && isShotImageData(node.data))).toBe(true)
    api().wireFrameToVideo(imageId, videoId, 'frame-ref')
    expect(api().edges.some((edge) => edge.source === imageId && edge.target === videoId)).toBe(true)

    api().rebuildShotChainNodes()

    expect(
      api().edges.some(
        (edge) =>
          edge.data?.category === 'frame' &&
          edge.source === imageId &&
          edge.target === videoId &&
          edge.targetHandle === 'frame-ref',
      ),
    ).toBe(true)
  })

  it('frame 엣지를 삭제하면 대응하는 입력만 제거한다', () => {
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

describe('Director Shot image-reference wiring', () => {
  it('여러 이미지 source를 Shot에 연결하고 중복은 한 번만 저장한다', () => {
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

  it('image 엣지를 삭제하면 해당 source만 Shot 입력에서 제거한다', () => {
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

  it('applyUpdates가 connectImage를 같은 배선 경로로 적용한다', () => {
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

  it('파생 ShotImage가 재생성돼도 이미지 source ID에서 image 엣지를 복원한다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
    api().updateNodeData<'shot'>(sourceShotId, { writerShotId: 'writer-source' })
    const targetShotId = api().addShotNode(sceneId, { x: 720, y: 0 }, 'Target')
    api().wireImageToShot(sourceShotId, targetShotId, 'image-reference')
    api().rebuildShotChainNodes()

    const imageId = `dn_simg_${sourceShotId}`
    expect(api().nodes.some((node) => node.id === imageId && isShotImageData(node.data))).toBe(true)
    api().wireImageToShot(imageId, targetShotId, 'image-reference')
    api().rebuildShotChainNodes()

    expect(
      api().edges.some(
        (edge) =>
          edge.data?.category === 'image' &&
          edge.source === imageId &&
          edge.target === targetShotId,
      ),
    ).toBe(true)
  })
})
