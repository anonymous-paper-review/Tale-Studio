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

describe('Director previous-video last-frame chaining', () => {
  it('rejects an incomplete source without creating a chain edge', async () => {
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

  it('restores a valid persisted chain edge and rejects a cycle', () => {
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

  it('cleans up an optimistic chain when browser frame capture is unavailable', async () => {
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

  it('captures and uploads the source last frame before completing the chain', async () => {
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

  it('applyUpdates uses the dedicated connectVideo action and handle', async () => {
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

  it('invalidates a dependent frame when the source Video attempt changes', () => {
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
