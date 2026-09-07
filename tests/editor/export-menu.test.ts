// 내보내기 전에 예상 용량과 대상 단계를 알려 주고, 큰 작업은 확인을 거친다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/export', () => ({
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  exportProject: vi.fn(),
  exportStage: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
// shots 읽기는 공유 사물함(@/lib/shots-cache)을 지난다 — 이 시험의 각본 client 를 그대로 태운다.
// (사물함 자체는 tests/shots-cache.test.ts 가 잠근다.)
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: () => Promise.resolve(),
  loadShotsResult: (projectId: string) => {
    const client = mocks.createClient.mock.results.at(-1)?.value as {
      from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => unknown } }
    }
    return Promise.resolve(client.from('shots').select('*').eq('project_id', projectId)).then(
      (r) => r as { data: unknown[] | null; error: { message: string } | null },
      (e) => ({ data: null, error: { message: String((e as { message?: string })?.message ?? e) } }),
    )
  },
}))
vi.mock('@/stores/asset-storage-store', () => ({
  useAssetStorageStore: { getState: () => ({
  }) },
}))
vi.mock('@/stores/writer-store', () => ({
  useWriterStore: { getState: () => ({ shots: [] }) },
}))
vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: { getState: () => ({ nodes: [] }) },
}))

import {
  estimateExportBytes,
  estimateWholeProjectFileCounts,
  LARGE_EXPORT_CONFIRM_BYTES,
  resolveExportStage,
  shouldConfirmLargeExport,
} from '@/components/export-menu'

const MB = 1024 * 1024
function query(result: unknown) {
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('내보내기 도움 기능', () => {
  it('현재 화면의 단계를 내보낼 단계로 올바르게 연결한다', () => {
    expect(resolveExportStage('producer')).toBe('producer')
    expect(resolveExportStage('writer')).toBe('writer')
    expect(resolveExportStage('artist')).toBe('artist')
    expect(resolveExportStage('director')).toBe('director')
    expect(resolveExportStage('editor')).toBeNull()
    expect(resolveExportStage('unknown')).toBeNull()
    expect(resolveExportStage(null)).toBeNull()
    expect(resolveExportStage(undefined)).toBeNull()
  })

  it('자료 종류별 개수로 예상 용량을 계산하고 잘못된 개수는 세지 않는다', () => {
    const imageBytes = estimateExportBytes({ image: 1 })
    const videoBytes = estimateExportBytes({ video: 1 })
    const audioBytes = estimateExportBytes({ audio: 1 })

    expect(imageBytes).toBeGreaterThan(0)
    expect(videoBytes).toBeGreaterThan(imageBytes)
    expect(audioBytes).toBeGreaterThan(imageBytes)
    expect(estimateExportBytes({ image: 2, video: 1, audio: 1 })).toBe(
      imageBytes * 2 + videoBytes + audioBytes,
    )
    expect(estimateExportBytes({ image: 1.8 })).toBe(imageBytes)
    expect(estimateExportBytes({ image: 0, video: -1, audio: Number.NaN })).toBe(0)
  })

  it('예상 용량이 큰 작업일 때만 한 번 더 확인한다', () => {
    expect(LARGE_EXPORT_CONFIRM_BYTES).toBeGreaterThanOrEqual(300 * MB)
    expect(LARGE_EXPORT_CONFIRM_BYTES).toBeLessThanOrEqual(400 * MB)

    expect(shouldConfirmLargeExport(300 * MB)).toBe(false)
    expect(shouldConfirmLargeExport(LARGE_EXPORT_CONFIRM_BYTES - 1)).toBe(false)
    expect(shouldConfirmLargeExport(LARGE_EXPORT_CONFIRM_BYTES)).toBe(true)
    expect(shouldConfirmLargeExport(400 * MB)).toBe(true)
  })
})

describe('전체 프로젝트의 내보내기 크기를 가늠한다', () => {
  it('저장된 자료를 확인할 수 없으면 예상치를 알 수 없음으로 표시해 안전하게 확인을 요구한다', async () => {
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => query({ data: null, error: { message: 'database unavailable' } })),
    })

    await expect(estimateWholeProjectFileCounts('project-1')).resolves.toEqual({
      counts: { image: 0, video: 0, audio: 0, text: 0, other: 0 },
      known: false,
    })
  })
  it('기본 인물의 인물표와 초상화만 세고 예전 보기 자료는 세지 않는다', async () => {
    const appearanceQuery = query({ data: [{ sheet_url: 'sheet.png', portrait_url: 'portrait.png' }], error: null })
    mocks.createClient.mockReturnValue({
      from: vi.fn((table: string) => {
        const results: Record<string, unknown> = {
          locations: { data: [{ wide_shot: 'wide.png', establishing_shot: null }], error: null },
          shots: { data: [{ shot_id: 'shot-1', storyboard_image: { status: 'completed', url: 'board.png' }, video_url: 'legacy.mp4' }], error: null },
          video_clips: {
            data: [
              { id: 'old', shot_id: 'shot-1', url: 'old.mp4', status: 'completed', take_number: 1, created_at: '2026-07-20T00:00:00.000Z' },
              { id: 'final', shot_id: 'shot-1', url: 'final.mp4', status: 'completed', is_final: true, take_number: 2, created_at: '2026-07-20T01:00:00.000Z' },
            ],
            error: null,
          },
        }
        return table === 'character_appearances' ? appearanceQuery : query(results[table])
      }),
    })

    await expect(estimateWholeProjectFileCounts('project-1')).resolves.toEqual({
      counts: { image: 4, video: 1, audio: 0, text: 0, other: 0 },
      known: true,
    })
    expect(appearanceQuery.select).toHaveBeenCalledWith('sheet_url,portrait_url')
    expect(appearanceQuery.eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(appearanceQuery.eq).toHaveBeenCalledWith('is_default', true)
  })
})
