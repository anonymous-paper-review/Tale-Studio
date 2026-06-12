import { describe, it, expect } from 'vitest'
import {
  computeImageSourceHash,
  isImageStale,
  viewKeyToCandidateView,
  CANDIDATE_RETENTION,
} from '@/lib/image-provenance'

describe('computeImageSourceHash', () => {
  it('동일 외모 → 동일 지문 (결정적)', () => {
    expect(computeImageSourceHash('검은 망토, 긴 흑발')).toBe(
      computeImageSourceHash('검은 망토, 긴 흑발'),
    )
  })

  it('사소한 공백 편집은 같은 지문 (헛-stale 방지)', () => {
    expect(computeImageSourceHash('검은 망토,  긴 흑발 ')).toBe(
      computeImageSourceHash('검은 망토, 긴 흑발'),
    )
  })

  it('내용이 바뀌면 다른 지문', () => {
    expect(computeImageSourceHash('검은 망토')).not.toBe(
      computeImageSourceHash('흰 망토'),
    )
  })

  it('null/undefined/빈문자 → 안전 (빈 문자열 지문)', () => {
    expect(computeImageSourceHash(null)).toBe(computeImageSourceHash(''))
    expect(computeImageSourceHash(undefined)).toBe(computeImageSourceHash('   '))
  })
})

describe('isImageStale', () => {
  it('지문 미상(null) → stale 아님 (레거시 backfill)', () => {
    expect(isImageStale('아무 외모', null)).toBe(false)
    expect(isImageStale('아무 외모', undefined)).toBe(false)
  })

  it('현재 외모가 후보 지문과 같으면 stale 아님', () => {
    const h = computeImageSourceHash('검은 망토, 긴 흑발')
    expect(isImageStale('검은 망토, 긴 흑발', h)).toBe(false)
  })

  it('외모를 고치면 stale', () => {
    const h = computeImageSourceHash('검은 망토')
    expect(isImageStale('흰 망토', h)).toBe(true)
  })
})

describe('viewKeyToCandidateView', () => {
  it('camelCase view key → snake_case candidate view (019 백필과 정합)', () => {
    expect(viewKeyToCandidateView('main')).toBe('main')
    expect(viewKeyToCandidateView('back')).toBe('back')
    expect(viewKeyToCandidateView('sideLeft')).toBe('side_left')
    expect(viewKeyToCandidateView('sideRight')).toBe('side_right')
  })
})

describe('CANDIDATE_RETENTION', () => {
  it('미선택 후보 보관 = 5장 (결정)', () => {
    expect(CANDIDATE_RETENTION).toBe(5)
  })
})
