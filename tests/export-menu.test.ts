import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/export', () => ({
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  exportProject: vi.fn(),
  exportStage: vi.fn(),
}))

import {
  estimateExportBytes,
  LARGE_EXPORT_CONFIRM_BYTES,
  resolveExportStage,
  shouldConfirmLargeExport,
} from '@/components/export-menu'

const MB = 1024 * 1024

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
