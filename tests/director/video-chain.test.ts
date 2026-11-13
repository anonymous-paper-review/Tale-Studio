// 앞 장면의 마지막 화면을 다음 영상의 시작으로 연결하고, 끊긴 연결은 남기지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isVideoData } from '@/types/director'
import { useDirectorCanvasStore } from '@/stores/director-store'

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function api() {
  return useDirectorCanvasStore.getState()
}

function seedVideos() {
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
  const sourceShotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Source')
  const targetShotId = api().addShotNode(sceneId, { x: 360, y: 560 }, 'Target')
  const sourceVideoId = api().addVideoTake(sourceShotId)!
  const targetVideoId = api().addVideoTake(targetShotId)!
  return { sourceVideoId, targetVideoId }
}

function completeSource(sourceVideoId: string) {
  api().updateNodeData<'video'>(sourceVideoId, {
    status: 'completed',
    videoUrl: 'https://cdn.example/source.mp4',
    videoClipId: 'clip-source',
    generationJobId: 'job-source',
  })
}

describe('이전 영상의 마지막 화면을 다음 영상 시작에 연결하는 약속', () => {
  it('완성되지 않은 이전 영상이면 연결선을 만들지 않는다', async () => {
    const { sourceVideoId, targetVideoId } = seedVideos()

    const connected = await api().wireVideoChainToVideo(
      sourceVideoId,
      targetVideoId,
      'video-chain',
    )

    expect(connected).toBe(false)
    expect(api().edges.some((edge) => edge.data?.category === 'video-chain')).toBe(false)
    const target = api().nodes.find((node) => node.id === targetVideoId)
    expect(target && isVideoData(target.data) ? target.data.videoChainInputId : null).toBeNull()
  })

  it('저장된 올바른 연결은 복원하고 순환 연결은 거부한다', () => {
    const { sourceVideoId, targetVideoId } = seedVideos()
    completeSource(sourceVideoId)
    api().updateNodeData<'video'>(targetVideoId, {
      videoChainInputId: sourceVideoId,
      videoChainFrameUrl:
        'https://cdn.example/workspace/project/videos/clip-source/job-source_chain-frame.jpg',
    })
    api().rebuildVideoChainEdges()

    expect(
      api().edges.filter(
        (edge) =>
          edge.data?.category === 'video-chain' &&
          edge.source === sourceVideoId &&
          edge.target === targetVideoId,
      ),
    ).toHaveLength(1)

    api().updateNodeData<'video'>(sourceVideoId, {
      videoChainInputId: targetVideoId,
      videoChainFrameUrl:
        'https://cdn.example/workspace/project/videos/clip-target/job-target_chain-frame.jpg',
    })
    api().rebuildVideoChainEdges()

    expect(api().edges.some((edge) => edge.data?.category === 'video-chain')).toBe(false)
    const source = api().nodes.find((node) => node.id === sourceVideoId)
    const target = api().nodes.find((node) => node.id === targetVideoId)
    expect(source && isVideoData(source.data) ? source.data.videoChainInputId : null).toBeNull()
    expect(target && isVideoData(target.data) ? target.data.videoChainInputId : null).toBeNull()
  })

  it('마지막 화면을 읽을 수 없으면 임시 연결을 지운다', async () => {
    const { sourceVideoId, targetVideoId } = seedVideos()
    completeSource(sourceVideoId)

    const connected = await api().wireVideoChainToVideo(
      sourceVideoId,
      targetVideoId,
      'video-chain',
    )

    expect(connected).toBe(false)
    expect(
      api().edges.some(
        (edge) =>
          edge.data?.category === 'video-chain' &&
          edge.source === sourceVideoId &&
          edge.target === targetVideoId,
      ),
    ).toBe(false)
    const target = api().nodes.find((node) => node.id === targetVideoId)
    expect(target && isVideoData(target.data) ? target.data.videoChainInputId : null).toBeNull()
    expect(target && isVideoData(target.data) ? target.data.errorMessage : null).toContain(
      'last frame',
    )
  })

  it('연결을 확정하기 전에 이전 영상의 마지막 화면을 저장한다', async () => {
    const { sourceVideoId, targetVideoId } = seedVideos()
    completeSource(sourceVideoId)

    const fakeVideo = {
      duration: 2,
      videoWidth: 1,
      videoHeight: 1,
      crossOrigin: '',
      muted: false,
      preload: '',
      playsInline: false,
      onloadedmetadata: null as (() => void) | null,
      onloadeddata: null as (() => void) | null,
      onseeked: null as (() => void) | null,
      onerror: null as (() => void) | null,
      removeAttribute: vi.fn(),
      load: vi.fn(),
    }
    let currentTime = 0
    Object.defineProperty(fakeVideo, 'src', {
      set: () => {
        queueMicrotask(() => fakeVideo.onloadedmetadata?.())
      },
    })
    Object.defineProperty(fakeVideo, 'currentTime', {
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value
        queueMicrotask(() => fakeVideo.onseeked?.())
      },
    })
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: (callback: BlobCallback) =>
        callback(new Blob(['frame'], { type: 'image/jpeg' })),
    }
    vi.stubGlobal('document', {
      cookie: '',
      createElement: (tag: string) =>
        tag === 'video' ? fakeVideo : fakeCanvas,
    })
    vi.stubGlobal('window', { location: { pathname: '/studio/director' } })
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ publicUrl: 'https://media.example/chain-frame.jpg' }),
    })
    vi.stubGlobal('fetch', fetch)

    const connected = await api().wireVideoChainToVideo(
      sourceVideoId,
      targetVideoId,
      'video-chain',
    )

    expect(connected).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      '/api/assets/upload-image',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    )
    const form = fetch.mock.calls[0]![1]!.body as FormData
    expect(form.get('field')).toBe('chain_frame')
    expect(form.get('entityId')).toBe('clip-source')
    expect(form.get('generationJobId')).toBe('job-source')
    const target = api().nodes.find((node) => node.id === targetVideoId)
    expect(target && isVideoData(target.data) ? target.data.videoChainFrameUrl : null).toBe(
      'https://media.example/chain-frame.jpg',
    )
  })

  it('영상 연결을 요청하면 지정한 연결 방식으로 적용한다', async () => {
    const { sourceVideoId, targetVideoId } = seedVideos()
    completeSource(sourceVideoId)

    const result = api().applyUpdates([
      {
        type: 'connectVideo',
        sourceId: sourceVideoId,
        targetId: targetVideoId,
        targetHandle: 'video-chain',
      },
    ])

    expect(result.applied).toBe(1)
    expect(result.skipped).toHaveLength(0)
    const target = api().nodes.find((node) => node.id === targetVideoId)
    expect(target && isVideoData(target.data) ? target.data.videoChainInputId : null).toBe(
      sourceVideoId,
    )
    await Promise.resolve()
    await Promise.resolve()
  })

  it('이전 영상이 바뀌면 다음 영상의 오래된 시작 화면을 버린다', () => {
    const { sourceVideoId, targetVideoId } = seedVideos()
    completeSource(sourceVideoId)
    api().updateNodeData<'video'>(targetVideoId, {
      videoChainInputId: sourceVideoId,
      videoChainFrameUrl:
        'https://cdn.example/workspace/project/videos/clip-source/job-source_chain-frame.jpg',
    })

    api().updateNodeData<'video'>(sourceVideoId, {
      generationJobId: 'job-source-new',
      videoUrl: 'https://cdn.example/source-new.mp4',
    })

    const target = api().nodes.find((node) => node.id === targetVideoId)
    expect(target && isVideoData(target.data) ? target.data.videoChainFrameUrl : null).toBeNull()
    expect(target && isVideoData(target.data) ? target.data.stale : false).toBe(true)
  })
})
