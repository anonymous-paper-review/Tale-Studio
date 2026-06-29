import { describe, it, expect } from 'vitest'
import {
  classifyImageStale,
  computeImageSourceHash,
  computeLookFingerprint,
  lookVersionKey,
} from '@/lib/image-provenance'

// stale UX 재설계: classifyImageStale 은 fresh/look-pending/edited 를 구분한다.
//   look-pending = 외형 그대로 + 룩만 나중 도착(핸드오프 초안). edited = 외형 변경.
//   핵심 회귀(SCENARIO-6): v1 refresh 후 writer 재실행(v2)해도 look-pending 유지(edited 오분류 금지).

const A = '백금발 소녀, 흰 천 상의' // appearance v1
const B = '검은 갑옷의 소녀' // appearance v2 (edited)
const lookV1 = computeLookFingerprint({ l1: { art_style: 'dark_gothic' } }, null)!
const lookV2 = computeLookFingerprint({ l1: { art_style: 'watercolor' } }, null)!
const apptA = computeImageSourceHash(A, null) // 외형-only 지문 (= appearance_hash 기록값)

describe('classifyImageStale', () => {
  it('sourceHash 없으면 fresh (지문 미상)', () => {
    expect(classifyImageStale(A, lookV1, { sourceHash: null, appearanceHash: null })).toBe('fresh')
  })

  it('stale 아니면 fresh (현재 외형+룩 == sourceHash)', () => {
    const sh = computeImageSourceHash(A, lookV1)
    expect(classifyImageStale(A, lookV1, { sourceHash: sh, appearanceHash: apptA })).toBe('fresh')
  })

  it('look-pending (durable): 외형 그대로 + 룩만 도착, appearanceHash 일치', () => {
    // 핸드오프 초안: sourceHash = 외형-only(룩 부재), appearanceHash = 외형-only
    expect(
      classifyImageStale(A, lookV1, { sourceHash: apptA, appearanceHash: apptA }),
    ).toBe('look-pending')
  })

  it('look-pending (legacy null): appearanceHash null + 외형-only == sourceHash', () => {
    expect(
      classifyImageStale(A, lookV1, { sourceHash: apptA, appearanceHash: null }),
    ).toBe('look-pending')
  })

  it('edited: 외형 변경 → appearanceHash 불일치', () => {
    // 후보는 A 로 만들어짐(appearanceHash=apptA). 현재 외형은 B 로 바뀜.
    expect(
      classifyImageStale(B, lookV1, { sourceHash: apptA, appearanceHash: apptA }),
    ).toBe('edited')
  })

  it('edited (legacy null + 룩 박힌 sourceHash): 보수적 edited', () => {
    // pre-027 에 이미 refresh 로 룩이 박힘 → sourceHash = H(A,lookV1), appearanceHash null
    const looked = computeImageSourceHash(A, lookV1)
    expect(
      classifyImageStale(A, lookV2, { sourceHash: looked, appearanceHash: null }),
    ).toBe('edited') // 전이적 degrade (027 후 새 후보는 appearanceHash 로 정확)
  })

  it('SCENARIO-6 회귀: handoff → v1 → refresh → v2 재실행 → edit', () => {
    // 1) 핸드오프 초안 (룩 부재): sourceHash = appearanceHash = apptA
    const draft = { sourceHash: apptA, appearanceHash: apptA }
    // 2) 룩 v1 도착 → look-pending
    expect(classifyImageStale(A, lookV1, draft)).toBe('look-pending')
    // 3) refresh under v1 → 새 후보 sourceHash = H(A,v1), appearanceHash = apptA → fresh@v1
    const refreshed = { sourceHash: computeImageSourceHash(A, lookV1), appearanceHash: apptA }
    expect(classifyImageStale(A, lookV1, refreshed)).toBe('fresh')
    // 4) writer 재실행 → 룩 v2 → 반드시 look-pending (NOT edited) ← 핵심
    expect(classifyImageStale(A, lookV2, refreshed)).toBe('look-pending')
    // 5) 외형 편집(B) → edited
    expect(classifyImageStale(B, lookV2, refreshed)).toBe('edited')
  })
})

describe('lookVersionKey', () => {
  it('reorder 불변 (정렬 집계)', () => {
    expect(lookVersionKey([lookV1, lookV2])).toBe(lookVersionKey([lookV2, lookV1]))
  })

  it('costume/룩 변경 → 다른 키', () => {
    const withCostume = computeLookFingerprint({ l1: { art_style: 'dark_gothic' } }, '붉은 코트')!
    expect(lookVersionKey([lookV1])).not.toBe(lookVersionKey([withCostume]))
  })

  it('룩 전부 부재 → none', () => {
    expect(lookVersionKey([null, undefined])).toBe('none')
  })

  it('null 섞여도 present 만 집계', () => {
    expect(lookVersionKey([lookV1, null])).toBe(lookVersionKey([lookV1]))
  })
})
