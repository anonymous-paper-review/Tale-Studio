import { describe, it, expect } from 'vitest'
import {
  computeImageSourceHash,
  computeWorldImageSourceHash,
  computeLookFingerprint,
  isImageStale,
  viewKeyToCandidateView,
  CANDIDATE_RETENTION,
  selectCandidatesToEvict,
  type RetentionCandidate,
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

  // F1 하위호환: 룩 부재(null/undefined/빈) 출력이 레거시 1인자 호출과 바이트 동일이어야 한다.
  it('F1: lookFingerprint 부재 → 레거시 1인자 출력과 바이트 동일', () => {
    const legacy = computeImageSourceHash('검은 망토')
    expect(computeImageSourceHash('검은 망토', null)).toBe(legacy)
    expect(computeImageSourceHash('검은 망토', undefined)).toBe(legacy)
    expect(computeImageSourceHash('검은 망토', '')).toBe(legacy)
  })

  it('룩 반영 시 지문이 달라진다 (룩 미반영 초안과 구분)', () => {
    const noLook = computeImageSourceHash('검은 망토')
    const withLook = computeImageSourceHash('검은 망토', 'art:anime|palette:#000,#fff')
    expect(withLook).not.toBe(noLook)
  })
})

describe('computeLookFingerprint', () => {
  it('룩 전혀 없으면 null', () => {
    expect(computeLookFingerprint(null, null)).toBeNull()
    expect(computeLookFingerprint({}, '')).toBeNull()
    expect(computeLookFingerprint({ l1: {}, palette: {} }, '  ')).toBeNull()
  })

  it('palette 입력 순서 비의존 (정렬로 결정적)', () => {
    const a = computeLookFingerprint(
      { palette: { primary: '#111', secondary: '#222', accent: '#333' } },
      null,
    )
    const b = computeLookFingerprint(
      { palette: { primary: '#333', secondary: '#111', accent: '#222' } },
      null,
    )
    expect(a).toBe(b)
  })

  it('art_style/shape/costume 반영', () => {
    const fp = computeLookFingerprint(
      { l1: { art_style: 'anime', shape_language: 'round' } },
      '붉은 코트',
    )
    expect(fp).toContain('art:anime')
    expect(fp).toContain('shape:round')
    expect(fp).toContain('costume:붉은 코트')
  })

  it('의상만 있어도 룩 지문 생성', () => {
    expect(computeLookFingerprint(null, '붉은 코트')).not.toBeNull()
  })

  it('costume 공백 정규화 (헛-stale 방지)', () => {
    expect(computeLookFingerprint(null, '붉은  코트 ')).toBe(
      computeLookFingerprint(null, '붉은 코트'),
    )
  })
})

describe('computeWorldImageSourceHash', () => {
  it('F1: lookFingerprint 부재 → visualDescription만 (결정적·하위호환)', () => {
    const base = computeWorldImageSourceHash('네온 뒷골목')
    expect(computeWorldImageSourceHash('네온 뒷골목', null)).toBe(base)
    expect(computeWorldImageSourceHash('네온 뒷골목 ', undefined)).toBe(base)
  })

  it('룩 반영 시 달라진다', () => {
    expect(computeWorldImageSourceHash('네온 뒷골목', 'palette:#0ff')).not.toBe(
      computeWorldImageSourceHash('네온 뒷골목'),
    )
  })
})

describe('isImageStale', () => {
  it('지문 미상(null) → stale 아님 (레거시 backfill)', () => {
    expect(isImageStale('아무 외모', null, null)).toBe(false)
    expect(isImageStale('아무 외모', 'art:x', undefined)).toBe(false)
  })

  it('현재 외모+룩이 후보 지문과 같으면 stale 아님', () => {
    const h = computeImageSourceHash('검은 망토, 긴 흑발', 'art:anime')
    expect(isImageStale('검은 망토, 긴 흑발', 'art:anime', h)).toBe(false)
  })

  it('외모를 고치면 stale', () => {
    const h = computeImageSourceHash('검은 망토', null)
    expect(isImageStale('흰 망토', null, h)).toBe(true)
  })

  // AC7: 룩 미반영 초안(룩 부재 지문)은 룩 도착 후 stale로 판정된다.
  it('AC7: 룩 미반영 초안은 룩 도착 후 stale', () => {
    const draftHash = computeImageSourceHash('검은 망토', null) // 핸드오프 시 룩 부재
    // 룩 미도착(현재도 부재) → not stale
    expect(isImageStale('검은 망토', null, draftHash)).toBe(false)
    // 룩 도착(현재 룩 존재) → stale
    expect(isImageStale('검은 망토', 'art:anime|palette:#000', draftHash)).toBe(true)
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

describe('selectCandidatesToEvict (C4 캡/evict)', () => {
  const mk = (
    id: string,
    generatedAt: string,
    opts: { isSelected?: boolean; pinned?: boolean } = {},
  ): RetentionCandidate => ({
    id,
    generatedAt,
    isSelected: opts.isSelected ?? false,
    pinned: opts.pinned ?? false,
  })

  it('cap 이하 → evict 없음', () => {
    const cands = Array.from({ length: 5 }, (_, i) => mk(`c${i}`, `2026-06-0${i + 1}`))
    expect(selectCandidatesToEvict(cands, 5)).toEqual([])
  })

  it('cap 초과(전부 비보호) → 최신 N장 보관, 가장 오래된 것부터 evict', () => {
    const cands = [
      mk('new1', '2026-06-06'),
      mk('new2', '2026-06-05'),
      mk('keep3', '2026-06-04'),
      mk('keep4', '2026-06-03'),
      mk('keep5', '2026-06-02'),
      mk('old', '2026-06-01'),
    ]
    expect(selectCandidatesToEvict(cands, 5)).toEqual(['old'])
  })

  it('선택본은 가장 오래돼도 evict 안 함', () => {
    const cands = [
      mk('n1', '2026-06-06'),
      mk('n2', '2026-06-05'),
      mk('n3', '2026-06-04'),
      mk('n4', '2026-06-03'),
      mk('n5', '2026-06-02'),
      mk('selected-old', '2026-06-01', { isSelected: true }),
    ]
    const evicted = selectCandidatesToEvict(cands, 5)
    expect(evicted).not.toContain('selected-old')
    expect(evicted).toEqual(['n5'])
  })

  it('핀 후보는 evict 안 함', () => {
    const cands = [
      mk('n1', '2026-06-06'),
      mk('n2', '2026-06-05'),
      mk('n3', '2026-06-04'),
      mk('n4', '2026-06-03'),
      mk('n5', '2026-06-02'),
      mk('pinned-old', '2026-06-01', { pinned: true }),
    ]
    expect(selectCandidatesToEvict(cands, 5)).toEqual(['n5'])
  })

  it('보호 후보만으로 cap 초과 → 비보호 전부 evict, 보호는 유지', () => {
    const cands = [
      mk('p1', '2026-06-06', { pinned: true }),
      mk('s1', '2026-06-05', { isSelected: true }),
      mk('p2', '2026-06-04', { pinned: true }),
      mk('p3', '2026-06-03', { pinned: true }),
      mk('p4', '2026-06-02', { pinned: true }),
      mk('unprotected', '2026-06-07'),
    ]
    expect(selectCandidatesToEvict(cands, 5)).toEqual(['unprotected'])
  })

  it('기본 retention = CANDIDATE_RETENTION(5)', () => {
    const cands = Array.from({ length: 7 }, (_, i) =>
      mk(`c${i}`, `2026-06-${String(i + 1).padStart(2, '0')}`),
    )
    expect(selectCandidatesToEvict(cands)).toHaveLength(7 - CANDIDATE_RETENTION)
  })
})
