// 작가 이미지 준비가 끝난 프로젝트만 Artist 단계로 들어가며, 실패하면 다시 시도할 수 있다
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

describe('project-store 작가 이미지 진입 잠금 확인', () => {
  it('작가 이미지가 준비되기 전에는 Artist로 이동하지 못하게 한다', () => {
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

  it('기존 프로젝트의 준비된 이미지 정보가 있으면 Artist 진입을 허용한다', async () => {
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

  it('이미지 준비 실패와 멈춤 상태를 안내 정보에 반영한다', async () => {
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

  it('예전 Producer 준비 정보만으로는 Artist 진입을 허용하지 않는다', async () => {
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

  it('프로젝트를 초기화하면 작가 이미지 진입 상태도 초기화한다', () => {
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

  it('재시도 작업이 남아 있으면 실패로 표시하지 않고, 모두 끝나면 실패를 표시한다', () => {
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

describe('retryArtistDrafts 재시도 동작', () => {
  it('재시도를 요청해 성공하면 실패와 멈춤 표시를 지우고 상태 확인을 다시 시작한다', async () => {
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

  it('이미 작업이 대기 중이면 실패와 멈춤 표시를 지운다 (진행 중)', async () => {
    useProjectStore.setState({ projectId: 'project-1', artistImagesFailed: true, artistImagesStalled: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 409 } as Response)

    await useProjectStore.getState().retryArtistDrafts()

    expect(useProjectStore.getState().artistImagesFailed).toBe(false)
    expect(useProjectStore.getState().artistImagesStalled).toBe(false)
  })

  it('한도 초과나 다른 오류가 나면 실패와 멈춤 안내를 유지한다', async () => {
    useProjectStore.setState({ projectId: 'project-1', artistImagesFailed: true, artistImagesStalled: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response)

    await useProjectStore.getState().retryArtistDrafts()

    expect(useProjectStore.getState().artistImagesFailed).toBe(true)
    expect(useProjectStore.getState().artistImagesStalled).toBe(true)
  })

  it('프로젝트를 고르지 않았으면 재시도를 요청하지 않는다', async () => {
    useProjectStore.setState({ projectId: null, artistImagesFailed: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await useProjectStore.getState().retryArtistDrafts()

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
