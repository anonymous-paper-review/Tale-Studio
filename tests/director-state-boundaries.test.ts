import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: dbMocks.createClient }))

// shots 읽기는 이제 공유 사물함(@/lib/shots-cache)을 지난다. 이 시험은 하이드레이션
// 경합의 각본(응답 시점 제어)이 핵심이라, 사물함을 얇은 다리로 바꿔 각 로드가 방금
// 각본한 supabase client 를 그대로 타게 한다 — 시점 제어가 옛 다리 그대로 보존된다.
// (사물함 자체의 합침·신선·무효화는 tests/shots-cache.test.ts 가 잠근다.)
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: () => Promise.resolve(),
  loadShotsResult: (projectId: string) => {
    const client = dbMocks.createClient.mock.results.at(-1)?.value as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => unknown
          order?: (c: string) => unknown
        }
      }
    }
    const chain = client.from('shots').select('*') as {
      eq: (k: string, v: string) => { order?: (c: string) => unknown }
      order?: (c: string) => unknown
    }
    const eq = chain.eq('project_id', projectId)
    const final = typeof eq?.order === 'function' ? eq.order('sort_order') : eq
    return Promise.resolve(final).then(
      (r) => r as { data: unknown[] | null; error: { message: string } | null },
      (e) => ({
        data: null,
        error: { message: String((e as { message?: string })?.message ?? e) },
      }),
    )
  },
}))

import {
  selectLatestAttempt,
  selectNewestSuccessfulTake,
  type VideoTakeSelectionRecord,
} from '@/lib/director-video-take-selection'
import { selectGridVideoAttemptState } from '@/features/director/canvas-views/StoryboardGridView'
import { translate } from '@/lib/i18n'

// 테스트는 useT() 훅을 못 쓴다(React 렌더 밖) — 고정 locale로 바인딩한 t 스텁을 넘긴다.
const t = (text: string, params?: Record<string, string | number>) => translate('en', text, params)
import {
  canRecoverGenerationAttempt,
  hydratedVideoStatus,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import { isVideoData } from '@/types/director'

type Take = VideoTakeSelectionRecord & {
  url: string | null
  last_attempt_status: 'pending' | 'generating' | 'completed' | 'failed' | null
  last_attempt_error: string | null
  last_attempt_job_id: string | null
}

const take = (overrides: Partial<Take>): Take => ({
  id: 'take-1',
  take_number: 1,
  created_at: '2026-07-20T00:00:00.000Z',
  status: 'completed',
  url: 'https://media.example/previous.mp4',
  is_final: false,
  last_attempt_status: 'completed',
  last_attempt_at: '2026-07-20T00:00:00.000Z',
  last_attempt_error: null,
  last_attempt_job_id: 'job-take-1',
  ...overrides,
})

function finalTestVideos() {
  const store = useDirectorCanvasStore.getState()
  const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
  const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
  const first = store.addVideoTake(shotId)!
  const second = store.addVideoTake(shotId)!
  for (const [id, clipId] of [
    [first, 'clip-1'],
    [second, 'clip-2'],
  ] as const) {
    useDirectorCanvasStore.getState().updateNodeData<'video'>(id, {
      videoClipId: clipId,
      videoUrl: `https://media.example/${clipId}.mp4`,
      status: 'completed',
    })
  }
  return { first, second }
}

function finalFlags(...ids: string[]) {
  const nodes = useDirectorCanvasStore.getState().nodes
  return ids.map((id) => {
    const node = nodes.find((candidate) => candidate.id === id)
    return node && isVideoData(node.data) ? node.data.final : undefined
  })
}

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
  vi.restoreAllMocks()
  dbMocks.createClient.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('director media state boundaries', () => {
  it('keeps a prior successful take playable when a later canonical reconciliation fails', () => {
    const prior = take({ id: 'prior', take_number: 1 })
    const failedReconciliation = take({
      id: 'retry',
      take_number: 2,
      url: null,
      status: 'generating',
      last_attempt_status: 'failed',
      last_attempt_error: 'Canonical video-take hydration failed: unavailable',
      last_attempt_at: '2026-07-20T00:01:00.000Z',
    })

    expect(selectNewestSuccessfulTake([prior, failedReconciliation])?.url).toBe(prior.url)
    expect(selectGridVideoAttemptState([prior, failedReconciliation], t).failure).toContain(
      'Canonical video-take hydration failed',
    )
  })

  it('projects the newest attempt independently from Final intent', () => {
    const finalOlderTake = take({ id: 'final', take_number: 1, is_final: true })
    const newerAttempt = take({
      id: 'new',
      take_number: 2,
      url: null,
      status: 'generating',
      last_attempt_status: 'generating',
      last_attempt_at: '2026-07-20T00:02:00.000Z',
    })

    expect(selectLatestAttempt([finalOlderTake, newerAttempt])?.id).toBe('new')
    expect(selectNewestSuccessfulTake([finalOlderTake, newerAttempt])?.id).toBe('final')
  })
  it('preserves contradictory canonical failure status even when a legacy row retains a URL', () => {
    expect(
      hydratedVideoStatus({
        id: 'take-1',
        shot_id: 'shot-1',
        take_number: 1,
        take_label: null,
        override: null,
        canvas_position: null,
        is_final: false,
        url: 'https://media.example/prior-success.mp4',
        thumbnail_url: null,
        status: 'failed',
        latestJobId: null,
        last_attempt_status: 'failed',
        last_attempt_error: 'retry failed',
        last_attempt_at: null,
        created_at: null,
        updated_at: null,
        latestJobStatus: 'failed',
        latestJobError: 'retry failed',
        latestAttemptAt: null,
      }),
    ).toBe('failed')
    expect(
      hydratedVideoStatus({
        id: 'legacy-take',
        shot_id: 'shot-1',
        take_number: 2,
        take_label: null,
        override: null,
        canvas_position: null,
        is_final: false,
        url: null,
        thumbnail_url: null,
        status: 'queued',
        latestJobId: null,
        last_attempt_status: 'queued',
        last_attempt_error: null,
        last_attempt_at: null,
        created_at: null,
        updated_at: null,
        latestJobStatus: 'generating',
        latestJobError: null,
        latestAttemptAt: null,
      }),
    ).toBe('generating')
  })

  it('only replays a structurally signed recovery receipt for the active attempt', () => {
    const response = { retryable: true, recoveryReceipt: 'payload.signature' }

    expect(canRecoverGenerationAttempt(response, 0, true)).toBe(true)
    expect(canRecoverGenerationAttempt(response, 3, true)).toBe(false)
    expect(canRecoverGenerationAttempt(response, 0, false)).toBe(false)
    expect(canRecoverGenerationAttempt({ retryable: true, recoveryReceipt: 'malformed' }, 0, true)).toBe(
      false,
    )
  })
})

function generationTestVideo() {
  const store = useDirectorCanvasStore.getState()
  const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
  const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
  return { shotId, videoId: store.addVideoTake(shotId)! }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function hydrationClient(
  scenes: Record<string, unknown>[] = [],
  shots: Record<string, unknown>[] = [],
) {
  return {
    from: vi.fn((table: string) => {
      const result = {
        data: table === 'scenes' ? scenes : shots,
        error: null,
      }
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => Promise.resolve(result)),
      }
      return chain
    }),
  }
}

function hydratedTake(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clip-1',
    shot_id: 'shot-1',
    take_number: 1,
    take_label: 'Take 1',
    override: null,
    canvas_position: null,
    is_final: false,
    url: 'https://media.example/previous.mp4',
    thumbnail_url: null,
    status: 'completed',
    latestJobId: 'older-job',
    latestJobStatus: 'completed',
    latestJobError: null,
    latestAttemptAt: '2026-07-20T00:00:00.000Z',
    last_attempt_status: 'completed',
    last_attempt_error: null,
    last_attempt_at: '2026-07-20T00:00:00.000Z',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('video generation orchestration boundaries', () => {
  it('reserves one new take while a same-shot generation is in flight and releases the lock', async () => {
    const store = useDirectorCanvasStore.getState()
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
    let resolveFirst!: (response: Response) => void
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const fetch = vi.fn().mockReturnValueOnce(firstRequest).mockResolvedValue(jsonResponse({ error: 'nope' }, 500))
    vi.stubGlobal('fetch', fetch)

    const first = store.generateVideoForShot(shotId)
    const inFlightVideo = useDirectorCanvasStore.getState().nodes.find(
      (node) => isVideoData(node.data) && node.data.parentShotNodeId === shotId,
    )!
    expect(
      useDirectorCanvasStore
        .getState()
        .nodes.filter((node) => isVideoData(node.data) && node.data.parentShotNodeId === shotId),
    ).toHaveLength(1)
    await expect(useDirectorCanvasStore.getState().regenerateVideo(inFlightVideo.id)).resolves.toBe(true)
    const overlapping = store.generateVideoForShot(shotId)
    expect(await overlapping).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    resolveFirst(jsonResponse({ error: 'nope' }, 500))
    await first

    await store.generateVideoForShot(shotId)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('prevents simultaneous regeneration of the same take', async () => {
    const { videoId } = generationTestVideo()
    let resolveRequest!: (response: Response) => void
    const request = new Promise<Response>((resolve) => {
      resolveRequest = resolve
    })
    const fetch = vi.fn().mockReturnValueOnce(request).mockResolvedValue(jsonResponse({ error: 'nope' }, 500))
    vi.stubGlobal('fetch', fetch)

    const first = useDirectorCanvasStore.getState().regenerateVideo(videoId)
    await expect(useDirectorCanvasStore.getState().regenerateVideo(videoId)).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    resolveRequest(jsonResponse({ error: 'nope' }, 500))
    await first

    await useDirectorCanvasStore.getState().regenerateVideo(videoId)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retains an unsaved generating take when an older hydration snapshot commits', async () => {
    const store = useDirectorCanvasStore.getState()
    useDirectorCanvasStore.setState({ projectId: 'project-1' })
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
    const videoId = store.addVideoTake(shotId)!
    useDirectorCanvasStore.getState().updateNodeData<'video'>(videoId, {
      generationJobId: 'local-idempotency-key',
      lastAttemptStatus: 'generating',
      status: 'generating',
    })
    dbMocks.createClient.mockReturnValue(hydrationClient())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ takes: [] })))

    await useDirectorCanvasStore.getState().hydrateFromDb('project-1')

    const video = useDirectorCanvasStore.getState().nodes.find((node) => node.id === videoId)
    expect(video && isVideoData(video.data) ? video.data.lastAttemptStatus : null).toBe(
      'generating',
    )
  })

  it('preserves a newer local attempt identity over a stale persisted clip snapshot', async () => {
    const store = useDirectorCanvasStore.getState()
    useDirectorCanvasStore.setState({ projectId: 'project-1' })
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
    const videoId = store.addVideoTake(shotId)!
    useDirectorCanvasStore.getState().updateNodeData<'video'>(videoId, {
      videoClipId: 'clip-1',
      generationJobId: 'new-local-attempt',
      lastAttemptStatus: 'generating',
      lastAttemptError: null,
      lastAttemptAt: '2026-07-20T01:00:00.000Z',
      status: 'completed',
      videoUrl: 'https://media.example/previous.mp4',
    })
    dbMocks.createClient.mockReturnValue(hydrationClient())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ takes: [hydratedTake()] })),
    )

    await useDirectorCanvasStore.getState().hydrateFromDb('project-1')

    const video = useDirectorCanvasStore.getState().nodes.find((node) => node.id === videoId)
    expect(video && isVideoData(video.data) ? video.data : null).toMatchObject({
      generationJobId: 'new-local-attempt',
      lastAttemptStatus: 'generating',
      lastAttemptAt: '2026-07-20T01:00:00.000Z',
      videoUrl: 'https://media.example/previous.mp4',
      status: 'completed',
    })
  })
  it('replaces an older local generating attempt with a newer canonical terminal attempt', async () => {
    const store = useDirectorCanvasStore.getState()
    useDirectorCanvasStore.setState({ projectId: 'project-1' })
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
    const videoId = store.addVideoTake(shotId)!
    store.updateNodeData<'video'>(videoId, {
      videoClipId: 'clip-1',
      generationJobId: 'older-local-attempt',
      lastAttemptStatus: 'generating',
      lastAttemptAt: '2026-07-20T00:00:00.000Z',
    })
    dbMocks.createClient.mockReturnValue(hydrationClient())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          takes: [
            hydratedTake({
              latestJobId: 'newer-canonical-attempt',
              latestJobStatus: 'completed',
              latestAttemptAt: '2026-07-20T01:00:00.000Z',
            }),
          ],
        }),
      ),
    )

    await store.hydrateFromDb('project-1')

    const node = useDirectorCanvasStore.getState().nodes.find((candidate) => candidate.id === videoId)!
    expect(isVideoData(node.data) && node.data.generationJobId).toBe('newer-canonical-attempt')
    expect(isVideoData(node.data) && node.data.lastAttemptStatus).toBe('completed')
  })

  it('preserves storyboard mutations made after hydration starts', async () => {
    const store = useDirectorCanvasStore.getState()
    useDirectorCanvasStore.setState({ projectId: 'project-1' })
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
    store.updateNodeData<'scene'>(sceneId, { writerSceneId: 'scene-1' })
    store.updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1' })
    let resolveShots!: (value: { data: Record<string, unknown>[]; error: null }) => void
    const shots = new Promise<{ data: Record<string, unknown>[]; error: null }>((resolve) => {
      resolveShots = resolve
    })
    dbMocks.createClient.mockReturnValue({
      from: vi.fn((table: string) => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() =>
            table === 'shots'
              ? shots
              : Promise.resolve({ data: [{ scene_id: 'scene-1', canvas_position: null }], error: null }),
          ),
        }
        return chain
      }),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ takes: [] })))

    const hydration = store.hydrateFromDb('project-1')
    store.updateNodeData<'shot'>(shotId, {
      storyboardImage: {
        url: 'https://media.example/local-after-start.png',
        status: 'completed',
        errorMessage: null,
        generatedAt: 1,
      },
    })
    resolveShots({
      data: [
        {
          shot_id: 'shot-1',
          canvas_position: null,
          storyboard_image: {
            url: 'https://media.example/canonical-before-start.png',
            status: 'completed',
            errorMessage: null,
            generatedAt: 0,
          },
        },
      ],
      error: null,
    })
    await hydration

    const node = useDirectorCanvasStore.getState().nodes.find((candidate) => candidate.id === shotId)!
    expect(
      !isVideoData(node.data) && node.data.kind === 'shot' && node.data.storyboardImage?.url,
    ).toBe('https://media.example/local-after-start.png')
  })
  it('accepts a newer persisted attempt over an older non-generating local identity', async () => {
    const store = useDirectorCanvasStore.getState()
    useDirectorCanvasStore.setState({ projectId: 'project-1' })
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
    const videoId = store.addVideoTake(shotId)!
    store.updateNodeData<'video'>(videoId, {
      videoClipId: 'clip-1',
      generationJobId: 'older-local-attempt',
      lastAttemptStatus: 'failed',
      lastAttemptError: 'old failure',
    })
    dbMocks.createClient.mockReturnValue(hydrationClient())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          takes: [
            hydratedTake({
              latestJobId: 'newer-persisted-attempt',
              latestJobStatus: 'completed',
              latestJobError: null,
            }),
          ],
        }),
      ),
    )

    await store.hydrateFromDb('project-1')

    const node = useDirectorCanvasStore.getState().nodes.find((candidate) => candidate.id === videoId)!
    expect(isVideoData(node.data) && node.data.generationJobId).toBe('newer-persisted-attempt')
    expect(isVideoData(node.data) && node.data.lastAttemptStatus).toBe('completed')
  })
  it('replays a signed recovery receipt and reaches a completed polling terminal state', async () => {
    vi.useFakeTimers()
    const { videoId } = generationTestVideo()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ retryable: true, recoveryReceipt: 'payload.signature' }, 409))
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job-1', status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { status: 'completed' } }))
    vi.stubGlobal('fetch', fetch)
    useDirectorCanvasStore.setState({ hydrateFromDb: vi.fn().mockResolvedValue(undefined) })

    const result = useDirectorCanvasStore.getState().regenerateVideo(videoId)
    await Promise.resolve()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls.map(([url, init]) => [url, (init as RequestInit | undefined)?.method])).toEqual([
      ['/api/director/generate-video', 'POST'],
      ['/api/director/generate-video', 'POST'],
      ['/api/generation-jobs/job-1', undefined],
    ])
    expect(JSON.parse((fetch.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({
      recoveryReceipt: 'payload.signature',
    })
  })

  it('sends manually wired START/REF/END images with aligned roles', async () => {
    vi.useFakeTimers()
    const store = useDirectorCanvasStore.getState()
    useDirectorCanvasStore.setState({
      projectId: 'project-1',
      hydrateFromDb: vi.fn().mockResolvedValue(undefined),
    })
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceShotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Source')
    const targetShotId = store.addShotNode(sceneId, { x: 100, y: 560 }, 'Target')
    store.updateNodeData<'shot'>(sourceShotId, {
      storyboardImage: {
        url: 'https://media.example/source-default.png',
        status: 'completed',
        errorMessage: null,
        generatedAt: 1,
        frames: {
          start: 'https://media.example/source-start.png',
          direction: 'https://media.example/source-direction.png',
          end: 'https://media.example/source-end.png',
        },
      },
    })
    const videoId = store.addVideoTake(targetShotId)!
    store.wireFrameToVideo(sourceShotId, videoId, 'frame-start')
    store.wireFrameToVideo(sourceShotId, videoId, 'frame-ref')
    store.wireFrameToVideo(sourceShotId, videoId, 'frame-end')

    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job-1', status: 'queued' }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: { status: 'completed', resultUrl: 'https://media.example/video.mp4' },
        }),
      )
    vi.stubGlobal('fetch', fetch)

    const result = useDirectorCanvasStore.getState().regenerateVideo(videoId)
    await Promise.resolve()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(true)

    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toMatchObject({
      referenceImageUrl: 'https://media.example/source-start.png',
      referenceImageUrls: [
        'https://media.example/source-start.png',
        'https://media.example/source-default.png',
        'https://media.example/source-end.png',
      ],
      referenceImageRoles: ['start', 'ref', 'end'],
      generationMethod: 'I2V',
    })
    expect(body.referenceImageUrls).not.toContain('https://media.example/source-direction.png')
  })

  it('uses a previous Video last frame as the target START image without sending video input', async () => {
    vi.useFakeTimers()
    const store = useDirectorCanvasStore.getState()
    useDirectorCanvasStore.setState({
      projectId: 'project-1',
      hydrateFromDb: vi.fn().mockResolvedValue(undefined),
    })
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceShotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Source')
    const targetShotId = store.addShotNode(sceneId, { x: 100, y: 560 }, 'Target')
    const sourceVideoId = store.addVideoTake(sourceShotId)!
    const targetVideoId = store.addVideoTake(targetShotId)!
    store.updateNodeData<'video'>(sourceVideoId, {
      status: 'completed',
      videoUrl: 'https://media.example/source.mp4',
      videoClipId: 'clip-source',
      generationJobId: 'job-source',
    })
    store.updateNodeData<'video'>(targetVideoId, {
      videoChainInputId: sourceVideoId,
      videoChainFrameUrl:
        'https://media.example/videos/clip-source/job-source_chain-frame.jpg',
    })

    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job-target', status: 'queued' }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: { status: 'completed', resultUrl: 'https://media.example/target.mp4' },
        }),
      )
    vi.stubGlobal('fetch', fetch)

    const result = useDirectorCanvasStore.getState().regenerateVideo(targetVideoId)
    await Promise.resolve()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(true)

    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toMatchObject({
      referenceImageUrl:
        'https://media.example/videos/clip-source/job-source_chain-frame.jpg',
      referenceImageUrls: [
        'https://media.example/videos/clip-source/job-source_chain-frame.jpg',
      ],
      referenceImageRoles: ['start'],
      generationMethod: 'I2V',
    })
    expect(body.videoUrl).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain(sourceVideoId)
    vi.useRealTimers()
  })

  it('does not fall back to T2V when a configured video chain has no frame', async () => {
    const store = useDirectorCanvasStore.getState()
    const { videoId } = generationTestVideo()
    store.updateNodeData<'video'>(videoId, {
      videoChainInputId: 'source-video',
      videoChainFrameUrl: null,
    })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(store.regenerateVideo(videoId)).resolves.toBe(false)

    expect(fetch).not.toHaveBeenCalled()
    expect(useDirectorCanvasStore.getState().generationErrors[videoId]).toContain(
      'chain frame',
    )
  })

  it('sends wired Shot image references to storyboard I2I without leaking node IDs', async () => {
    const store = useDirectorCanvasStore.getState()
    useDirectorCanvasStore.setState({
      projectId: 'project-1',
      hydrateFromDb: vi.fn().mockResolvedValue(undefined),
    })
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    const sourceShotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Source')
    const targetShotId = store.addShotNode(sceneId, { x: 100, y: 560 }, 'Target')
    store.updateNodeData<'shot'>(sourceShotId, {
      writerShotId: 'writer-source',
      storyboardImage: {
        url: 'https://media.example/source.png',
        status: 'completed',
        errorMessage: null,
        generatedAt: 1,
      },
    })
    store.updateNodeData<'shot'>(targetShotId, {
      writerShotId: 'writer-target',
    })
    store.wireImageToShot(sourceShotId, targetShotId, 'image-reference')

    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId: 'image-job' }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { status: 'completed', resultUrl: 'https://media.example/target.png' },
        }),
      )
    vi.stubGlobal('fetch', fetch)

    await useDirectorCanvasStore.getState().generateStoryboardImage(targetShotId)

    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.referenceImageUrls).toEqual(['https://media.example/source.png'])
    expect(body.referenceImageUrls).not.toContain(sourceShotId)
  })

  it('stops signed recovery when the attempt is stale', async () => {
    vi.useFakeTimers()
    const { videoId } = generationTestVideo()
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ retryable: true, recoveryReceipt: 'payload.signature' }, 409))
    vi.stubGlobal('fetch', fetch)

    const result = useDirectorCanvasStore.getState().regenerateVideo(videoId)
    await Promise.resolve()
    await Promise.resolve()
    useDirectorCanvasStore.getState().updateNodeData<'video'>(videoId, { generationJobId: 'newer-attempt' })
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('exhausts signed recovery retries without polling', async () => {
    vi.useFakeTimers()
    const { videoId } = generationTestVideo()
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(
      jsonResponse({ retryable: true, recoveryReceipt: 'payload.signature' }, 409),
    ))
    vi.stubGlobal('fetch', fetch)

    const result = useDirectorCanvasStore.getState().regenerateVideo(videoId)
    await Promise.resolve()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/director/generate-video',
      '/api/director/generate-video',
      '/api/director/generate-video',
      '/api/director/generate-video',
    ])
    expect(
      fetch.mock.calls.some(([url]) => String(url).startsWith('/api/generation-jobs/')),
    ).toBe(false)
    const node = useDirectorCanvasStore.getState().nodes.find((candidate) => candidate.id === videoId)!
    expect(isVideoData(node.data) && node.data.lastAttemptStatus).toBe('failed')
  })
  it('fails a malformed successful generation response without losing the provisional attempt identity', async () => {
    const { videoId } = generationTestVideo()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'queued' })))

    await expect(useDirectorCanvasStore.getState().regenerateVideo(videoId)).resolves.toBe(true)

    const node = useDirectorCanvasStore.getState().nodes.find((candidate) => candidate.id === videoId)!
    expect(isVideoData(node.data) && node.data.lastAttemptStatus).toBe('failed')
    expect(isVideoData(node.data) && node.data.generationJobId).toBeTruthy()
  })

  it('records failed polling terminal state and releases its shot reservation', async () => {
    const { videoId } = generationTestVideo()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job-1', status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { status: 'failed', error: 'provider failed' } }))
      .mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 500))
    vi.stubGlobal('fetch', fetch)
    useDirectorCanvasStore.setState({ hydrateFromDb: vi.fn().mockResolvedValue(undefined) })

    await expect(useDirectorCanvasStore.getState().regenerateVideo(videoId)).resolves.toBe(true)
    const node = useDirectorCanvasStore.getState().nodes.find((candidate) => candidate.id === videoId)!
    expect(isVideoData(node.data) && node.data.lastAttemptStatus).toBe('failed')

    await useDirectorCanvasStore.getState().regenerateVideo(videoId)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
describe('Final mutation recovery boundaries', () => {
  it('rolls back the optimistic sibling Final flags when PATCH and hydration both fail', async () => {
    const { first, second } = finalTestVideos()
    useDirectorCanvasStore.getState().updateNodeData<'video'>(first, { final: true })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('PATCH unavailable')))
    useDirectorCanvasStore.setState({
      hydrateFromDb: vi.fn().mockRejectedValue(new Error('canonical unavailable')),
    })

    await expect(useDirectorCanvasStore.getState().setVideoFinal(second, true)).rejects.toThrow(
      'PATCH unavailable',
    )

    expect(finalFlags(first, second)).toEqual([true, false])
    expect(useDirectorCanvasStore.getState().generationErrors[second]).toContain('PATCH unavailable')
  })

  it('does not let an older rejected Final intent overwrite the newest sibling intent', async () => {
    const { first, second } = finalTestVideos()
    let resolveFirst!: (response: Response) => void
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const fetch = vi
      .fn()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    useDirectorCanvasStore.setState({ hydrateFromDb: vi.fn().mockResolvedValue(undefined) })

    const older = useDirectorCanvasStore.getState().setVideoFinal(first, true)
    const newest = useDirectorCanvasStore.getState().setVideoFinal(second, true)
    resolveFirst(new Response(null, { status: 500 }))

    await expect(older).rejects.toThrow('HTTP 500')
    await newest
    expect(finalFlags(first, second)).toEqual([false, true])
    expect(fetch.mock.calls.map(([url, init]) => [
      url,
      JSON.parse((init as RequestInit).body as string),
    ])).toEqual([
      ['/api/director/video-takes/clip-1', { projectId: 'project-1', is_final: true }],
      ['/api/director/video-takes/clip-2', { projectId: 'project-1', is_final: true }],
    ])
  })
  it('reconciles a rejected latest Final PATCH to canonical flags and leaves its queue reusable', async () => {
    const { first, second } = finalTestVideos()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    let hydrationCount = 0
    const hydrateFromDb = vi.fn().mockImplementation(async () => {
      hydrationCount += 1
      useDirectorCanvasStore.setState((state) => ({
        nodes: state.nodes.map((node) =>
          !isVideoData(node.data)
            ? node
            : {
                ...node,
                data: { ...node.data, final: node.id === (hydrationCount === 1 ? first : second) },
              },
        ),
      }))
    })
    useDirectorCanvasStore.setState({ hydrateFromDb })

    await expect(useDirectorCanvasStore.getState().setVideoFinal(second, true)).rejects.toThrow('HTTP 500')
    expect(hydrateFromDb).toHaveBeenCalledTimes(1)
    expect(finalFlags(first, second)).toEqual([true, false])

    await expect(useDirectorCanvasStore.getState().setVideoFinal(second, true)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(finalFlags(first, second)).toEqual([false, true])
  })

  it('cleans a rejected Final queue entry without a detached rejecting promise', async () => {
    const { first, second } = finalTestVideos()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    useDirectorCanvasStore.setState({ hydrateFromDb: vi.fn().mockResolvedValue(undefined) })

    await expect(useDirectorCanvasStore.getState().setVideoFinal(first, true)).rejects.toThrow(
      'HTTP 500',
    )
    await expect(useDirectorCanvasStore.getState().setVideoFinal(second, true)).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(finalFlags(first, second)).toEqual([false, true])
  })
})
