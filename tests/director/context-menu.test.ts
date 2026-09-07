// 우클릭한 카드에서 할 수 있는 일과 대표 이미지를 올바르게 보여준다 (#context-menu 2026-08-31)
// 우클릭 컨텍스트 메뉴 결정 로직 + 노드 대표 이미지 해석(#context-menu 2026-08-31).
//
// 인터랙션 계약: 좌클릭=선택(RF 기본), 더블클릭=편집 모달, 우클릭=메뉴.
// 메뉴 구성은 순수 함수(nodeContextMenuItems)로 격리했고, 이미지 복사/다운로드 활성 여부는
// nodePrimaryImageUrl 이 판정한다 — 여기서 그 두 계약을 잠근다.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nodeContextMenuItems } from '@/features/director/canvas-interaction'
import { nodePrimaryImageUrl } from '@/features/director/clipboard-image'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isShotData, isVideoData } from '@/types/director'
import { createDefaultStandaloneVideoConfig } from '@/lib/director/standalone-video'

beforeEach(() => {
  vi.unstubAllGlobals()
  useDirectorCanvasStore.getState().reset()
})

function api() {
  return useDirectorCanvasStore.getState()
}

describe('nodeContextMenuItems (우클릭한 카드에서 할 수 있는 일)', () => {
  it('Scene·Shot·Video 카드에서는 편집과 삭제를 고를 수 있다', () => {
    for (const kind of ['scene', 'shot', 'video'] as const) {
      const items = nodeContextMenuItems(kind, false)
      expect(items).toContain('edit')
      expect(items).toContain('delete')
    }
  })

  it('이미지가 있으면 복사와 다운로드를 고를 수 있다', () => {
    const items = nodeContextMenuItems('shot', true)
    expect(items).toContain('copy-image')
    expect(items).toContain('download-image')
  })

  it('이미지가 없으면 복사와 다운로드를 고를 수 없다', () => {
    const items = nodeContextMenuItems('shot', false)
    expect(items).not.toContain('copy-image')
    expect(items).not.toContain('download-image')
  })

  it('asset Image는 편집과 복사는 할 수 있지만 원본과 연결되어 있어 직접 삭제할 수 없다', () => {
    expect(nodeContextMenuItems('asset', true)).toEqual([
      'edit',
      'copy-image',
      'download-image',
    ])
  })

  it('예전에 만들어진 파생 카드는 편집 없이 삭제만 고를 수 있다 (#node-merge)', () => {
    expect(nodeContextMenuItems('shotImage', false)).toEqual(['delete'])
    expect(nodeContextMenuItems('videoPlaceholder', false)).toEqual(['delete'])
  })

  it('prompt 카드에서는 삭제만 고를 수 있다', () => {
    expect(nodeContextMenuItems('prompt', false)).toEqual(['delete'])
  })
})

describe('nodePrimaryImageUrl (카드에 보여줄 대표 이미지)', () => {
  it('Shot 카드에는 완성된 스토리보드 이미지를 보여준다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Shot')
    api().updateNodeData<'shot'>(shotId, {
      storyboardImage: {
        url: 'https://cdn.test/shot.png',
        status: 'completed',
        errorMessage: null,
        generatedAt: Date.now(),
      },
    })
    expect(nodePrimaryImageUrl(api().nodes, shotId)).toBe(
      'https://cdn.test/shot.png',
    )
  })

  it('아직 만들지 않았거나 실패한 Shot과 Scene에는 대표 이미지를 보여주지 않는다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Shot')
    expect(nodePrimaryImageUrl(api().nodes, shotId)).toBeNull()
    expect(nodePrimaryImageUrl(api().nodes, sceneId)).toBeNull()
  })

  it('Video 카드에는 미리보기 이미지를 보여준다', () => {
    const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = api().addShotNode(sceneId, { x: 360, y: 0 }, 'Shot')
    api().updateNodeData<'shot'>(shotId, {
      writerShotId: 'writer-1',
      storyboardImage: {
        url: 'https://cdn.test/parent.png',
        status: 'completed',
        errorMessage: null,
        generatedAt: Date.now(),
      },
    })
    const videoId = api().addVideoTake(shotId)!
    api().updateNodeData<'video'>(videoId, {
      thumbnailUrl: 'https://cdn.test/thumb.jpg',
    })
    expect(nodePrimaryImageUrl(api().nodes, videoId)).toBe(
      'https://cdn.test/thumb.jpg',
    )
    // #node-merge: 파생 shotImage 카드는 더 이상 생성되지 않는다
    api().rebuildShotChainNodes()
    expect(api().nodes.some((n) => n.data.kind === 'shotImage')).toBe(false)
  })

  it('없는 카드를 찾아도 대표 이미지를 보여주지 않는다', () => {
    expect(nodePrimaryImageUrl(api().nodes, 'missing')).toBeNull()
  })
})

describe('addShotNode (Higgsfield식으로 부모 없이 만든 이미지 카드)', () => {
  it('부모 Scene이 없어도 이미지 카드가 생기고 연결선은 만들지 않는다', () => {
    const shotId = api().addShotNode(null, { x: 100, y: 100 }, 'Standalone')
    const node = api().nodes.find((n) => n.id === shotId)
    expect(node && isShotData(node.data)).toBe(true)
    expect(
      api().edges.filter((e) => e.target === shotId && e.type === 'parent'),
    ).toHaveLength(0)
  })

  it('독립 Shot에서도 Video를 만들 수 있다', () => {
    const shotId = api().addShotNode(null, { x: 100, y: 100 }, 'Standalone')
    const videoId = api().addVideoTake(shotId)
    expect(videoId).toBeTruthy()
    const video = api().nodes.find((n) => n.id === videoId)
    expect(video && isVideoData(video.data)).toBe(true)
  })
})

describe('addStandaloneVideo (독립 영상 카드 만들기)', () => {
  it('저장된 영상 정보를 받으면 Video 하나만 만들고 Shot과 연결선을 만들지 않는다', async () => {
    api().setProjectId('project-1')
    const before = api()
    const ownerKey = 'standalone:123e4567-e89b-42d3-a456-426614174000'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            take: {
              id: 'clip-standalone',
              shot_id: ownerKey,
              take_number: 1,
              take_label: 'Video',
              override: createDefaultStandaloneVideoConfig(),
              created_at: '2026-08-31T00:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const videoId = await before.addStandaloneVideo({ x: 100, y: 200 })
    expect(videoId).toBeTruthy()
    const state = api()
    expect(state.nodes).toHaveLength(before.nodes.length + 1)
    const video = state.nodes.find((node) => node.id === videoId)
    expect(video && isVideoData(video.data)).toBe(true)
    if (!video || !isVideoData(video.data)) throw new Error('Video missing')
    expect(video.data).toMatchObject({
      parentShotNodeId: null,
      standaloneVideoKey: ownerKey,
      videoClipId: 'clip-standalone',
    })
    expect(state.nodes.filter((node) => isShotData(node.data))).toHaveLength(
      before.nodes.filter((node) => isShotData(node.data)).length,
    )
    expect(
      state.edges.some(
        (edge) =>
          edge.target === videoId && edge.data?.category === 'parent',
      ),
    ).toBe(false)
  })

  it('바꾼 설정으로 같은 영상의 새 생성을 요청한다', async () => {
    api().setProjectId('project-1')
    const ownerKey = 'standalone:123e4567-e89b-42d3-a456-426614174000'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            take: {
              id: 'clip-standalone',
              shot_id: ownerKey,
              take_number: 1,
              take_label: 'Video',
              override: createDefaultStandaloneVideoConfig(),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    const videoId = await api().addStandaloneVideo({ x: 10, y: 20 })
    if (!videoId) throw new Error('Video missing')
    const config = {
      ...createDefaultStandaloneVideoConfig(),
      prompt: 'A paper boat crosses a dark puddle',
    }
    api().updateNodeData<'video'>(videoId, { override: config })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: 'job-1',
            videoClipId: 'clip-standalone',
            status: 'queued',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, data: { status: 'completed' } }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetch)
    useDirectorCanvasStore.setState({
      hydrateFromDb: vi.fn().mockResolvedValue(undefined),
    })

    const first = api().regenerateVideo(videoId)
    const duplicate = api().regenerateVideo(videoId)
    await expect(duplicate).resolves.toBe(true)
    await expect(first).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/director/generate-video')
    expect(
      JSON.parse((fetch.mock.calls[0]?.[1] as RequestInit).body as string),
    ).toMatchObject({
      standaloneVideoKey: ownerKey,
      standaloneConfig: config,
      videoClipId: 'clip-standalone',
      prompt: config.prompt,
    })
  })
})
