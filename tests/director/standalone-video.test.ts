import { describe, expect, it } from 'vitest'
import {
  createDefaultStandaloneVideoConfig,
  createStandaloneVideoOwnerKey,
  isStandaloneVideoOwnerKey,
  normalizeStandaloneVideoConfig,
} from '@/lib/director/standalone-video'

describe('standalone Director video contract', () => {
  it('creates a strict owner key and detached complete defaults', () => {
    const ownerKey = createStandaloneVideoOwnerKey()
    expect(isStandaloneVideoOwnerKey(ownerKey)).toBe(true)

    const first = createDefaultStandaloneVideoConfig()
    const second = createDefaultStandaloneVideoConfig()
    expect(normalizeStandaloneVideoConfig(first)).toEqual(first)
    expect(first.camera).not.toBe(second.camera)
    expect(first.lighting).not.toBe(second.lighting)
    expect(first.cameraPreset).not.toBe(second.cameraPreset)
  })

  it('rejects partial, extra, and malformed persisted configs', () => {
    const complete = createDefaultStandaloneVideoConfig()
    expect(normalizeStandaloneVideoConfig({ prompt: 'partial' })).toBeNull()
    expect(
      normalizeStandaloneVideoConfig({ ...complete, unexpected: true }),
    ).toBeNull()
    expect(
      normalizeStandaloneVideoConfig({ ...complete, provider: 'unknown' }),
    ).toBeNull()
    expect(isStandaloneVideoOwnerKey('standalone:not-a-uuid')).toBe(false)
  })
})
