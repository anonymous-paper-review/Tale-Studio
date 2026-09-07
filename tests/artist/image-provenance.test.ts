// 외모와 룩이 바뀌면 이미지가 새로 필요한지 알리고, 후보 이미지는 안전하게 보관한다
import { describe, it, expect } from 'vitest'
import {
  computeImageSourceHash,
  computeWorldImageSourceHash,
  computeLookFingerprint,
  isImageStale,
  classifyImageStale,
  lookVersionKey,
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

  it('사소한 공백 차이는 같은 이미지 입력으로 본다 (헛판정 방지)', () => {
    expect(computeImageSourceHash('검은 망토,  긴 흑발 ')).toBe(
      computeImageSourceHash('검은 망토, 긴 흑발'),
    )
  })

  it('내용이 바뀌면 다른 지문', () => {
    expect(computeImageSourceHash('검은 망토')).not.toBe(
      computeImageSourceHash('흰 망토'),
    )
  })

  it('외모 설명이 없거나 비어 있어도 안전한 결과를 만든다', () => {
    expect(computeImageSourceHash(null)).toBe(computeImageSourceHash(''))
    expect(computeImageSourceHash(undefined)).toBe(computeImageSourceHash('   '))
  })

  // F1 하위호환: 룩 부재(null/undefined/빈) 출력이 레거시 1인자 호출과 바이트 동일이어야 한다.
  it('F1: 룩 정보가 없으면 예전 방식과 같은 결과를 낸다', () => {
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
  it('룩 정보가 전혀 없으면 결과를 비워 둔다', () => {
    expect(computeLookFingerprint(null, null)).toBeNull()
    expect(computeLookFingerprint({}, '')).toBeNull()
    expect(computeLookFingerprint({ l1: {}, palette: {} }, '  ')).toBeNull()
  })

  it('색상 입력 순서가 달라도 같은 결과를 낸다', () => {
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

  it('그림체·형태·의상 정보가 룩에 반영된다', () => {
    const fp = computeLookFingerprint(
      { l1: { art_style: 'anime', shape_language: 'round' } },
      '붉은 코트',
    )
    expect(fp).toContain('art:anime')
    expect(fp).toContain('shape:round')
    expect(fp).toContain('costume:붉은 코트')
  })

  it('의상만 있어도 룩 정보를 만든다', () => {
    expect(computeLookFingerprint(null, '붉은 코트')).not.toBeNull()
  })

  it('의상 사이 공백 차이는 같은 룩으로 본다 (헛판정 방지)', () => {
    expect(computeLookFingerprint(null, '붉은  코트 ')).toBe(
      computeLookFingerprint(null, '붉은 코트'),
    )
  })

  it('Q5: 스타일 기준이 없으면 예전 방식과 같은 결과를 낸다 (F1)', () => {
    const tokens = { l1: { art_style: 'anime' }, palette: { primary: '#111' } }
    const base = computeLookFingerprint(tokens, '붉은 코트')
    expect(computeLookFingerprint(tokens, '붉은 코트', null)).toBe(base)
    expect(computeLookFingerprint(tokens, '붉은 코트', undefined)).toBe(base)
    expect(computeLookFingerprint(tokens, '붉은 코트', '  ')).toBe(base)
  })

  it('Q5: 스타일 기준을 정하면 룩 정보에 포함하고 바뀌면 결과도 바뀐다', () => {
    const tokens = { l1: { art_style: 'anime' } }
    const withAnchor = computeLookFingerprint(tokens, null, 'real')
    expect(withAnchor).toContain('anchor:real')
    expect(withAnchor).not.toBe(computeLookFingerprint(tokens, null))
  })

  it('Q5: 스타일 기준만 있어도 룩 정보를 만든다', () => {
    expect(computeLookFingerprint(null, null, 'real')).toBe('anchor:real')
    expect(computeLookFingerprint(null, null, null)).toBeNull()
  })

  it('Q5: 스타일 기준이 바뀌면 룩 정보도 달라진다 (항상 같은 결과)', () => {
    const tokens = { l1: { art_style: 'anime' } }
    const a = computeLookFingerprint(tokens, '코트', 'real')
    const b = computeLookFingerprint(tokens, '코트', 'jp_anime')
    expect(a).not.toBe(b)
    expect(computeLookFingerprint(tokens, '코트', 'real')).toBe(a)
  })

  it('Q5: 같은 스타일 기준을 쓰면 어디서 계산해도 같은 룩 정보가 나온다 (헛판정 방지)', () => {
    const tokens = { l1: { art_style: 'anime' }, palette: { primary: '#111' } }
    const server = computeLookFingerprint(tokens, '코트', 'real')
    const client = computeLookFingerprint(tokens, '코트', 'real')
    expect(server).toBe(client)
    expect(computeLookFingerprint(tokens, '코트', 'real')).not.toBe(
      computeLookFingerprint(tokens, '코트', null),
    )
  })
})

describe('classifyImageStale — 스타일 기준 변경 (Q5)', () => {
  it('스타일 기준만 바뀌고 외형이 같으면 룩 반영 대기로 분류한다 (외형 변경 아님)', () => {
    const appearance = 'a knight in silver armor'
    const tokens = { l1: { art_style: 'anime' } }
    const oldFingerprint = computeLookFingerprint(tokens, '망토', 'real')
    const candidate = {
      sourceHash: computeImageSourceHash(appearance, oldFingerprint),
      appearanceHash: computeImageSourceHash(appearance, null),
    }
    const newFingerprint = computeLookFingerprint(tokens, '망토', 'jp_anime')
    expect(classifyImageStale(appearance, newFingerprint, candidate)).toBe('look-pending')
  })

  it('스타일 기준이 그대로면 최신 상태로 본다', () => {
    const appearance = 'a knight'
    const tokens = { l1: { art_style: 'anime' } }
    const fp = computeLookFingerprint(tokens, '망토', 'real')
    const candidate = {
      sourceHash: computeImageSourceHash(appearance, fp),
      appearanceHash: computeImageSourceHash(appearance, null),
    }
    expect(classifyImageStale(appearance, fp, candidate)).toBe('fresh')
  })

  it('lookVersionKey — 스타일 기준이 바뀌면 버전도 바뀐다', () => {
    const tokens = { l1: { art_style: 'anime' } }
    const before = lookVersionKey([computeLookFingerprint(tokens, '망토', 'real')])
    const after = lookVersionKey([computeLookFingerprint(tokens, '망토', 'jp_anime')])
    expect(before).not.toBe(after)
  })
})

describe('computeWorldImageSourceHash', () => {
  it('F1: 룩 정보가 없으면 배경 설명만으로 예전 방식과 같은 결과를 낸다', () => {
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
  it('지문을 모르면 오래된 이미지로 표시하지 않는다 (예전 이미지 보완)', () => {
    expect(isImageStale('아무 외모', null, null)).toBe(false)
    expect(isImageStale('아무 외모', 'art:x', undefined)).toBe(false)
  })

  it('현재 외모와 룩이 후보와 같으면 오래된 이미지로 보지 않는다', () => {
    const h = computeImageSourceHash('검은 망토, 긴 흑발', 'art:anime')
    expect(isImageStale('검은 망토, 긴 흑발', 'art:anime', h)).toBe(false)
  })

  it('외모를 고치면 이미지가 오래된 것으로 표시된다', () => {
    const h = computeImageSourceHash('검은 망토', null)
    expect(isImageStale('흰 망토', null, h)).toBe(true)
  })

  // AC7: 룩 미반영 초안(룩 부재 지문)은 룩 도착 후 stale로 판정된다.
  it('AC7: 룩 없이 만든 초안은 룩이 도착하면 오래된 이미지로 표시된다', () => {
    const draftHash = computeImageSourceHash('검은 망토', null) // 핸드오프 시 룩 부재
    // 룩 미도착(현재도 부재) → not stale
    expect(isImageStale('검은 망토', null, draftHash)).toBe(false)
    // 룩 도착(현재 룩 존재) → stale
    expect(isImageStale('검은 망토', 'art:anime|palette:#000', draftHash)).toBe(true)
  })
})

describe('viewKeyToCandidateView', () => {
  it('화면의 모습 이름을 후보 이미지 이름으로 올바르게 바꾼다 (019 자료 보완과 일치)', () => {
    expect(viewKeyToCandidateView('main')).toBe('main')
    expect(viewKeyToCandidateView('back')).toBe('back')
    expect(viewKeyToCandidateView('sideLeft')).toBe('side_left')
    expect(viewKeyToCandidateView('sideRight')).toBe('side_right')
  })
})

describe('CANDIDATE_RETENTION', () => {
  it('선택하지 않은 후보 이미지는 5장까지 보관한다 (결정)', () => {
    expect(CANDIDATE_RETENTION).toBe(5)
  })
})

describe('selectCandidatesToEvict (C4 후보 보관 한도)', () => {
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

  it('보관 한도 이하면 삭제하지 않는다', () => {
    const cands = Array.from({ length: 5 }, (_, i) => mk(`c${i}`, `2026-06-0${i + 1}`))
    expect(selectCandidatesToEvict(cands, 5)).toEqual([])
  })

  it('보관 한도를 넘고 보호한 후보가 없으면 최신 후보를 남기고 오래된 것부터 삭제한다', () => {
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

  it('선택한 후보는 오래돼도 삭제하지 않는다', () => {
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

  it('고정한 후보는 삭제하지 않는다', () => {
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

  it('보호한 후보만으로 한도를 넘으면 보호하지 않은 후보를 모두 삭제하고 보호한 후보는 남긴다', () => {
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

  it('기본 보관 수는 5장이다', () => {
    const cands = Array.from({ length: 7 }, (_, i) =>
      mk(`c${i}`, `2026-06-${String(i + 1).padStart(2, '0')}`),
    )
    expect(selectCandidatesToEvict(cands)).toHaveLength(7 - CANDIDATE_RETENTION)
  })
})
