import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  loadEditorState: vi.fn(),
  projectId: 'project-1' as string | null,
}))

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/stores/project-store', () => ({
  useProjectStore: { getState: () => ({ projectId: mocks.projectId }) },
}))
vi.mock('@/lib/editor-persistence', () => ({
  deleteAudioBlob: vi.fn(),
  loadEditorState: mocks.loadEditorState,
  saveEditorState: vi.fn(),
}))

import { scheduleServerSave, useEditorStore } from '@/stores/editor-store'

type DbShot = Record<string, unknown>
type DbClip = Record<string, unknown>

function query(result: unknown) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

function configureLoad(shots: DbShot[] | null, clips: DbClip[] | null, error?: string) {
  mocks.createClient.mockReturnValue({
    from: vi.fn((table: string) => query({
      data: table === 'shots' ? shots : clips,
      error: error ? { message: error } : null,
    })),
  })
}
function deferredLoadClient() {
  let resolveShots!: (value: { data: DbShot[]; error: null }) => void
  let rejectShots!: (reason?: unknown) => void
  let resolveClips!: (value: { data: DbClip[]; error: null }) => void
  const shots = new Promise<{ data: DbShot[]; error: null }>((resolve, reject) => {
    resolveShots = resolve
    rejectShots = reject
  })
  const clips = new Promise<{ data: DbClip[]; error: null }>((resolve) => {
    resolveClips = resolve
  })
  return {
    client: {
      from: vi.fn((table: string) => query(table === 'shots' ? shots : clips)),
    },
    resolveShots,
    rejectShots,
    resolveClips,
  }
}

function shot(videoUrl: string | null = null): DbShot {
  return {
    shot_id: 'shot-1',
    scene_id: 'scene-1',
    shot_type: 'wide',
    video_url: videoUrl,
  }
}

function clip(overrides: Partial<DbClip>): DbClip {
  return {
    id: 'clip-1',
    shot_id: 'shot-1',
    url: 'https://video.test/default.mp4',
    status: 'completed',
    is_final: false,
    take_number: 1,
    created_at: '2026-07-20T00:00:00.000Z',
    last_attempt_at: '2026-07-20T00:00:00.000Z',
    last_attempt_job_id: 'job-1',
    deleted_at: null,
    thumbnail_url: 'https://video.test/default.jpg',
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.projectId = 'project-1'
  useEditorStore.getState().reset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function deferredResponse() {
  let resolve!: (value: Pick<Response, 'ok' | 'status'>) => void
  const promise = new Promise<Pick<Response, 'ok' | 'status'>>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function savedPanelWidth(call: unknown): number {
  const [, options] = call as [string, { body: string }]
  return JSON.parse(options.body).state.panelSizes.sourceW
}
function editorSnapshot(sourceW: number) {
  return {
    version: 1,
    shots: [],
    clipOrder: {},
    videoClips: [],
    audioClips: [],
    audioSources: [],
    audioTracks: [],
    panelSizes: { sourceW, previewH: 360 },
  }
}

describe('editor video handoff loading', () => {
  it('uses the Final take URL, thumbnail, and completed status over a newer successful take', async () => {
    configureLoad([shot('https://legacy.test/stale.mp4')], [
      clip({ id: 'final', url: 'https://video.test/final.mp4', thumbnail_url: 'https://video.test/final.jpg', is_final: true, take_number: 1 }),
      clip({ id: 'newer', url: 'https://video.test/newer.mp4', thumbnail_url: 'https://video.test/newer.jpg', take_number: 2 }),
    ])

    await useEditorStore.getState().loadData()

    expect(useEditorStore.getState().videoClips).toMatchObject([{
      shotId: 'shot-1',
      url: 'https://video.test/final.mp4',
      thumbnailUrl: 'https://video.test/final.jpg',
      status: 'completed',
    }])
  })

  it('keeps the newest successful media when a later attempt failed', async () => {
    configureLoad([shot()], [
      clip({
        id: 'older-success',
        url: 'https://video.test/older-success.mp4',
        thumbnail_url: 'https://video.test/older-success.jpg',
        take_number: 1,
        created_at: '2026-07-20T00:00:00.000Z',
      }),
      clip({
        id: 'newer-success',
        url: 'https://video.test/newer-success.mp4',
        thumbnail_url: 'https://video.test/newer-success.jpg',
        take_number: 2,
        created_at: '2026-07-20T01:00:00.000Z',
      }),
      clip({
        id: 'later-failed',
        url: null,
        status: 'failed',
        thumbnail_url: null,
        take_number: 3,
        created_at: '2026-07-20T02:00:00.000Z',
        last_attempt_at: '2026-07-20T03:00:00.000Z',
      }),
    ])

    await useEditorStore.getState().loadData()

    expect(useEditorStore.getState().videoClips[0]).toMatchObject({
      url: 'https://video.test/newer-success.mp4',
      thumbnailUrl: 'https://video.test/newer-success.jpg',
      status: 'completed',
    })
  })

  it('does not revive a legacy projection when relational rows are unusable', async () => {
    configureLoad([shot('https://legacy.test/stale.mp4')], [
      clip({ url: null, status: 'failed', thumbnail_url: null }),
    ])

    await useEditorStore.getState().loadData()

    expect(useEditorStore.getState().videoClips[0]).toMatchObject({
      url: null,
      thumbnailUrl: null,
      status: 'failed',
    })
  })

  it('uses the legacy projection only when there are no relational rows', async () => {
    configureLoad([shot('https://legacy.test/compatible.mp4')], [])

    await useEditorStore.getState().loadData()

    expect(useEditorStore.getState().videoClips[0]).toMatchObject({
      url: 'https://legacy.test/compatible.mp4',
      thumbnailUrl: null,
      status: 'completed',
    })
  })

  it('clears prior project media after an empty or failed reload', async () => {
    configureLoad([shot()], [clip({ url: 'https://video.test/prior.mp4' })])
    await useEditorStore.getState().loadData()
    expect(useEditorStore.getState().videoClips).toHaveLength(1)

    mocks.projectId = 'project-2'
    configureLoad([], [])
    await useEditorStore.getState().loadData()
    expect(useEditorStore.getState().videoClips).toEqual([])
    expect(useEditorStore.getState().shots).toEqual([])

    configureLoad(null, null, 'network unavailable')
    await useEditorStore.getState().loadData()
    expect(useEditorStore.getState().videoClips).toEqual([])
    expect(useEditorStore.getState().shots).toEqual([])
    expect(useEditorStore.getState().error).toContain('network unavailable')
  })

  it('discards late successful and rejected loads after reset without changing projects', async () => {
    const lateSuccess = deferredLoadClient()
    mocks.createClient.mockReturnValueOnce(lateSuccess.client)

    const successfulLoad = useEditorStore.getState().loadData()
    useEditorStore.getState().reset()
    lateSuccess.resolveShots({ data: [shot('https://legacy.test/old.mp4')], error: null })
    lateSuccess.resolveClips({ data: [clip({ url: 'https://video.test/old.mp4' })], error: null })
    await successfulLoad

    expect(useEditorStore.getState()).toMatchObject({
      shots: [],
      videoClips: [],
      error: null,
    })

    const lateRejection = deferredLoadClient()
    mocks.createClient.mockReturnValueOnce(lateRejection.client)

    const rejectedLoad = useEditorStore.getState().loadData()
    useEditorStore.getState().reset()
    lateRejection.rejectShots(new Error('stale load failed'))
    lateRejection.resolveClips({ data: [], error: null })
    await rejectedLoad

    expect(useEditorStore.getState()).toMatchObject({
      shots: [],
      videoClips: [],
      error: null,
    })
  })

  it('discards a late persisted snapshot after reset without changing projects', async () => {
    vi.stubGlobal('window', {})
    let resolvePersisted!: (value: unknown) => void
    mocks.loadEditorState.mockReturnValueOnce(new Promise((resolve) => {
      resolvePersisted = resolve
    }))

    const persistedLoad = useEditorStore.getState().loadPersisted()
    useEditorStore.getState().reset()
    resolvePersisted({
      audioClips: [{
        id: 'stale-audio',
        sourceId: 'stale-source',
        trackId: 'atrack_1',
        startSec: 0,
        durationSec: 1,
        volume: 1,
        muted: false,
      }],
      audioSources: [],
      audioTracks: [{ id: 'atrack_1' }],
      clipOrder: {},
      panelSizes: { sourceW: 411, previewH: 360 },
    })
    await persistedLoad

    expect(useEditorStore.getState()).toMatchObject({
      audioClips: [],
      panelSizes: { sourceW: 256, previewH: 360 },
    })
  })
  it('keeps a populated new-project canonical snapshot when an old-project load resolves late', async () => {
    const oldProject = deferredLoadClient()
    mocks.createClient.mockReturnValue(oldProject.client)

    const oldLoad = useEditorStore.getState().loadData()

    mocks.projectId = 'project-2'
    configureLoad([{
      shot_id: 'shot-2',
      scene_id: 'scene-2',
      shot_type: 'close',
      video_url: 'https://legacy.test/new-project.mp4',
    }], [
      clip({
        id: 'project-2-final',
        shot_id: 'shot-2',
        url: 'https://video.test/project-2-final.mp4',
        thumbnail_url: 'https://video.test/project-2-final.jpg',
        is_final: true,
      }),
    ])
    await useEditorStore.getState().loadData()

    oldProject.resolveShots({ data: [shot('https://legacy.test/old.mp4')], error: null })
    oldProject.resolveClips({ data: [clip({ url: 'https://video.test/old.mp4' })], error: null })
    await oldLoad

    expect(useEditorStore.getState()).toMatchObject({
      shots: [{ shotId: 'shot-2', sceneId: 'scene-2' }],
      videoClips: [{
        shotId: 'shot-2',
        url: 'https://video.test/project-2-final.mp4',
        thumbnailUrl: 'https://video.test/project-2-final.jpg',
      }],
      clipOrder: { 'scene-2': ['shot-2'] },
    })
  })
  it('keeps a populated new-project canonical snapshot when an old-project load rejects late', async () => {
    const oldProject = deferredLoadClient()
    mocks.createClient.mockReturnValue(oldProject.client)

    const oldLoad = useEditorStore.getState().loadData()

    mocks.projectId = 'project-2'
    configureLoad([{
      shot_id: 'shot-2',
      scene_id: 'scene-2',
      shot_type: 'close',
    }], [
      clip({
        id: 'project-2-final',
        shot_id: 'shot-2',
        url: 'https://video.test/project-2-final.mp4',
        thumbnail_url: 'https://video.test/project-2-final.jpg',
        is_final: true,
      }),
    ])
    await useEditorStore.getState().loadData()

    oldProject.rejectShots(new Error('old project unavailable'))
    oldProject.resolveClips({ data: [], error: null })
    await oldLoad

    expect(useEditorStore.getState()).toMatchObject({
      shots: [{ shotId: 'shot-2', sceneId: 'scene-2' }],
      videoClips: [{
        shotId: 'shot-2',
        url: 'https://video.test/project-2-final.mp4',
        thumbnailUrl: 'https://video.test/project-2-final.jpg',
      }],
      clipOrder: { 'scene-2': ['shot-2'] },
      error: null,
    })
  })


  it('keeps the newest same-project canonical load when an older load resolves last', async () => {
    const older = deferredLoadClient()
    const newer = deferredLoadClient()
    mocks.createClient
      .mockReturnValueOnce(older.client)
      .mockReturnValueOnce(newer.client)

    const olderLoad = useEditorStore.getState().loadData()
    const newerLoad = useEditorStore.getState().loadData()

    newer.resolveShots({ data: [shot()], error: null })
    newer.resolveClips({
      data: [clip({ id: 'new-final', url: 'https://video.test/new-final.mp4', is_final: true })],
      error: null,
    })
    await newerLoad

    older.resolveShots({ data: [shot()], error: null })
    older.resolveClips({
      data: [clip({ id: 'old-final', url: 'https://video.test/old-final.mp4', is_final: true })],
      error: null,
    })
    await olderLoad

    expect(useEditorStore.getState().videoClips[0]?.url).toBe(
      'https://video.test/new-final.mp4',
    )
  })
  it('keeps the newest same-project canonical snapshot when an older load rejects late', async () => {
    const older = deferredLoadClient()
    const newer = deferredLoadClient()
    mocks.createClient
      .mockReturnValueOnce(older.client)
      .mockReturnValueOnce(newer.client)

    const olderLoad = useEditorStore.getState().loadData()
    const newerLoad = useEditorStore.getState().loadData()

    newer.resolveShots({ data: [shot()], error: null })
    newer.resolveClips({
      data: [clip({ id: 'new-final', url: 'https://video.test/new-final.mp4', is_final: true })],
      error: null,
    })
    await newerLoad

    older.rejectShots(new Error('older load unavailable'))
    older.resolveClips({ data: [], error: null })
    await olderLoad

    expect(useEditorStore.getState()).toMatchObject({
      videoClips: [{
        shotId: 'shot-1',
        url: 'https://video.test/new-final.mp4',
      }],
      error: null,
    })
  })

  it('clears a stale load error after a populated canonical reload succeeds', async () => {
    configureLoad(null, null, 'temporary outage')
    await useEditorStore.getState().loadData()
    expect(useEditorStore.getState().error).toContain('temporary outage')

    configureLoad([shot()], [clip({ url: 'https://video.test/recovered.mp4' })])
    await useEditorStore.getState().loadData()

    expect(useEditorStore.getState().error).toBeNull()
    expect(useEditorStore.getState().videoClips[0]?.url).toBe(
      'https://video.test/recovered.mp4',
    )
  })
})
describe('editor server save serialization', () => {
  it('sends the in-flight snapshot before only the newest pending snapshot', async () => {
    vi.useFakeTimers()
    vi.clearAllTimers()
    const first = deferredResponse()
    const fetchMock = vi.fn(() => first.promise)
    vi.stubGlobal('fetch', fetchMock)

    scheduleServerSave('serialization-a', editorSnapshot(401))
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    scheduleServerSave('serialization-a', editorSnapshot(402))
    scheduleServerSave('serialization-a', editorSnapshot(403))
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    first.resolve({ ok: true, status: 200 })
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(savedPanelWidth)).toEqual([401, 403])
  })

  it('does not retry a stale failure and retries the newest snapshot', async () => {
    vi.useFakeTimers()
    vi.clearAllTimers()
    const first = deferredResponse()
    const newest = deferredResponse()
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => newest.promise)
      .mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    scheduleServerSave('serialization-b', editorSnapshot(401))
    await vi.advanceTimersByTimeAsync(1500)
    scheduleServerSave('serialization-b', editorSnapshot(403))

    first.resolve({ ok: false, status: 500 })
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls.map(savedPanelWidth)).toEqual([401, 403])

    newest.resolve({ ok: false, status: 500 })
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(250)

    expect(fetchMock.mock.calls.map(savedPanelWidth)).toEqual([401, 403, 403])
  })
})
