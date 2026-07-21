import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: dbMocks.createClient }))
import {
  selectLatestAttempt,
  selectNewestSuccessfulTake,
  type VideoTakeSelectionRecord,
} from '@/lib/director-video-take-selection'
import { selectGridVideoAttemptState } from '@/features/director/canvas-views/StoryboardGridView'
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
    expect(selectGridVideoAttemptState([prior, failedReconciliation]).failure).toContain(
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
