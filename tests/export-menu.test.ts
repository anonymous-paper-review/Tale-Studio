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
vi.mock('@/stores/asset-storage-store', () => ({
  useAssetStorageStore: { getState: () => ({
    listCharactersByProject: () => [],
    listWorldsByProject: () => [],
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

describe('export-menu pure helpers', () => {
  it('maps current project stages to export stages', () => {
    expect(resolveExportStage('producer')).toBe('producer')
    expect(resolveExportStage('writer')).toBe('writer')
    expect(resolveExportStage('artist')).toBe('artist')
    expect(resolveExportStage('director')).toBe('director')
    expect(resolveExportStage('editor')).toBeNull()
    expect(resolveExportStage('unknown')).toBeNull()
    expect(resolveExportStage(null)).toBeNull()
    expect(resolveExportStage(undefined)).toBeNull()
  })

  it('estimates bytes from positive per-kind file counts only', () => {
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

  it('requires confirmation only at the large export threshold', () => {
    expect(LARGE_EXPORT_CONFIRM_BYTES).toBeGreaterThanOrEqual(300 * MB)
    expect(LARGE_EXPORT_CONFIRM_BYTES).toBeLessThanOrEqual(400 * MB)

    expect(shouldConfirmLargeExport(300 * MB)).toBe(false)
    expect(shouldConfirmLargeExport(LARGE_EXPORT_CONFIRM_BYTES - 1)).toBe(false)
    expect(shouldConfirmLargeExport(LARGE_EXPORT_CONFIRM_BYTES)).toBe(true)
    expect(shouldConfirmLargeExport(400 * MB)).toBe(true)
  })
})

describe('whole-project size estimation', () => {
  it('marks the estimate unknown when a database query fails so export uses its confirmation fail-safe', async () => {
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => query({ data: null, error: { message: 'database unavailable' } })),
    })

    await expect(estimateWholeProjectFileCounts('project-1')).resolves.toEqual({
      counts: { image: 0, video: 0, audio: 0, text: 0, other: 0 },
      known: false,
    })
  })
  it('counts only the selected handoff video when the database estimate is available', async () => {
    mocks.createClient.mockReturnValue({
      from: vi.fn((table: string) => {
        const results: Record<string, unknown> = {
          characters: { data: [{ view_main: 'main.png', view_back: 'back.png' }], error: null },
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
        return query(results[table])
      }),
    })

    await expect(estimateWholeProjectFileCounts('project-1')).resolves.toEqual({
      counts: { image: 4, video: 1, audio: 0, text: 0, other: 0 },
      known: true,
    })
  })
})
