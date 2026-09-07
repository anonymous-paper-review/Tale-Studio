import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sceneRows } = vi.hoisted(() => ({
  sceneRows: { current: [] as Array<{ scene_id: string }> },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          limit: async () => ({
            data: table === 'scenes' ? sceneRows.current : [],
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

import { useProjectStore, type WriterStatusAssets } from '@/stores/project-store'

function assets(overrides: Partial<WriterStatusAssets> = {}): WriterStatusAssets {
  return {
    chars_ready: 0,
    chars_total: 0,
    worlds_ready: 0,
    worlds_total: 0,
    queued_count: 0,
    failed_count: 0,
    stalled: false,
    images_ready: false,
    ...overrides,
  }
}

function mockWriterStatus(payload: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => payload,
  } as Response)
}

beforeEach(() => {
  sceneRows.current = []
  useProjectStore.getState().resetProject()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('project-store artist image lock gate', () => {
  it('blocks only artist navigation until artistImagesReady', () => {
    useProjectStore.setState({ reachedStage: 'director', artistImagesReady: false })

    const store = useProjectStore.getState()

    expect(store.canNavigateTo('producer')).toBe(true)
    expect(store.canNavigateTo('writer')).toBe(true)
    expect(store.canNavigateTo('artist')).toBe(false)
    expect(store.canNavigateTo('director')).toBe(true)
    expect(store.canNavigateTo('editor')).toBe(false)

    useProjectStore.setState({ artistImagesReady: true })
    expect(useProjectStore.getState().canNavigateTo('artist')).toBe(true)
  })

  it('lets grandfathered projects through when status assets seed images_ready', async () => {
    sceneRows.current = [{ scene_id: 'scene-1' }]
    useProjectStore.setState({ currentStage: 'artist', reachedStage: 'artist' })
    const fetchSpy = mockWriterStatus({
      started: false,
      pipeline_completed: true,
      pipeline_failed: false,
      assets: assets({
        chars_ready: 2,
        chars_total: 2,
        worlds_ready: 1,
        worlds_total: 1,
        images_ready: true,
      }),
    })

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(fetchSpy).toHaveBeenCalledWith('/api/writer/status/project-1?assets=1')
    expect(useProjectStore.getState().artistImagesReady).toBe(true)
    expect(useProjectStore.getState().artistAssetProgress).toEqual({ ready: 3, total: 3 })
    expect(useProjectStore.getState().canNavigateTo('artist')).toBe(true)
  })

  it('seeds failed and stalled CTA fields from status assets', async () => {
    sceneRows.current = [{ scene_id: 'scene-1' }]
    useProjectStore.setState({ currentStage: 'artist', reachedStage: 'artist' })
    mockWriterStatus({
      started: false,
      pipeline_completed: true,
      pipeline_failed: false,
      assets: assets({
        chars_ready: 1,
        chars_total: 2,
        worlds_ready: 1,
        worlds_total: 3,
        failed_count: 1,
        stalled: true,
        images_ready: false,
      }),
    })

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(useProjectStore.getState().artistImagesReady).toBe(false)
    expect(useProjectStore.getState().artistAssetProgress).toEqual({ ready: 2, total: 5 })
    expect(useProjectStore.getState().artistImagesFailed).toBe(true)
    expect(useProjectStore.getState().artistImagesStalled).toBe(true)
    expect(useProjectStore.getState().canNavigateTo('artist')).toBe(false)
  })

  it('does not let the old producer-source-location reachability bypass open artist', async () => {
    useProjectStore.setState({ currentStage: 'artist', reachedStage: 'artist' })
    mockWriterStatus({
      started: false,
      pipeline_completed: false,
      pipeline_failed: false,
      assets: assets({ chars_total: 1, worlds_total: 1, images_ready: false }),
    })

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(useProjectStore.getState().writerNeedsRerun).toBe(true)
    expect(useProjectStore.getState().reachedStage).toBe('producer')
    expect(useProjectStore.getState().canNavigateTo('artist')).toBe(false)
  })

  it('resets artist image gate fields with the project gate flags', () => {
    useProjectStore.setState({
      artistImagesReady: false,
      artistAssetProgress: { ready: 1, total: 4 },
      artistImagesFailed: true,
      artistImagesStalled: true,
    })

    useProjectStore.getState().resetProject()

    expect(useProjectStore.getState().artistImagesReady).toBe(true)
    expect(useProjectStore.getState().artistAssetProgress).toBeNull()
    expect(useProjectStore.getState().artistImagesFailed).toBe(false)
    expect(useProjectStore.getState().artistImagesStalled).toBe(false)
  })

  it('does not flag failed while retry jobs are queued (in-flight), latches when queue drains', () => {
    useProjectStore
      .getState()
      .setArtistAssetGate(assets({ failed_count: 3, queued_count: 2, chars_total: 2 }))
    expect(useProjectStore.getState().artistImagesFailed).toBe(false)

    useProjectStore
      .getState()
      .setArtistAssetGate(assets({ failed_count: 3, queued_count: 0, chars_total: 2 }))
    expect(useProjectStore.getState().artistImagesFailed).toBe(true)
  })
})

describe('retryArtistDrafts action', () => {
  it('POSTs retry-drafts and clears failed/stalled on 200 (resumes polling)', async () => {
    useProjectStore.setState({ projectId: 'project-1', artistImagesFailed: true, artistImagesStalled: true })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response)

    await useProjectStore.getState().retryArtistDrafts()

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/artist/retry-drafts',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(useProjectStore.getState().artistImagesFailed).toBe(false)
    expect(useProjectStore.getState().artistImagesStalled).toBe(false)
  })

  it('also clears on 409 (drafts already queued = progress)', async () => {
    useProjectStore.setState({ projectId: 'project-1', artistImagesFailed: true, artistImagesStalled: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 409 } as Response)

    await useProjectStore.getState().retryArtistDrafts()

    expect(useProjectStore.getState().artistImagesFailed).toBe(false)
    expect(useProjectStore.getState().artistImagesStalled).toBe(false)
  })

  it('keeps the CTA (does not clear) on quota/other errors', async () => {
    useProjectStore.setState({ projectId: 'project-1', artistImagesFailed: true, artistImagesStalled: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response)

    await useProjectStore.getState().retryArtistDrafts()

    expect(useProjectStore.getState().artistImagesFailed).toBe(true)
    expect(useProjectStore.getState().artistImagesStalled).toBe(true)
  })

  it('no-ops without a projectId', async () => {
    useProjectStore.setState({ projectId: null, artistImagesFailed: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await useProjectStore.getState().retryArtistDrafts()

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
