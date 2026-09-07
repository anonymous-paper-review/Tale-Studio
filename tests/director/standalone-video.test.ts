// 독립 영상 설정은 빠짐없이 저장하고, 잘못된 설정은 사용하지 않는다
import { describe, expect, it } from 'vitest'
import {
  createDefaultStandaloneVideoConfig,
  createStandaloneVideoOwnerKey,
  isStandaloneVideoOwnerKey,
  normalizeStandaloneVideoConfig,
} from '@/lib/director/standalone-video'

describe('독립 영상은 완전한 설정으로 안전하게 준비한다', () => {
  it('독립 영상을 준비하면 안전한 식별자와 서로 간섭하지 않는 기본 설정을 만든다', () => {
    const ownerKey = createStandaloneVideoOwnerKey()
    expect(isStandaloneVideoOwnerKey(ownerKey)).toBe(true)

    const first = createDefaultStandaloneVideoConfig()
    const second = createDefaultStandaloneVideoConfig()
    expect(normalizeStandaloneVideoConfig(first)).toEqual(first)
    expect(first.camera).not.toBe(second.camera)
    expect(first.lighting).not.toBe(second.lighting)
    expect(first.cameraPreset).not.toBe(second.cameraPreset)
  })

  it('설정이 빠지거나 낯선 값이 섞이면 저장된 독립 영상 설정을 사용하지 않는다', () => {
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
