// 캐릭터 외형과 그림체가 바뀐 시점을 구분해 이미지가 최신인지 올바르게 알린다 (SCENARIO-6)
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
  it('이미지 출처를 알 수 없으면 현재 이미지를 최신으로 본다', () => {
    expect(classifyImageStale(A, lookV1, { sourceHash: null, appearanceHash: null })).toBe('fresh')
  })

  it('현재 외형과 그림체가 이미지와 같으면 최신으로 본다', () => {
    const sh = computeImageSourceHash(A, lookV1)
    expect(classifyImageStale(A, lookV1, { sourceHash: sh, appearanceHash: apptA })).toBe('fresh')
  })

  it('외형은 같고 그림체만 새로 도착하면 그림체 반영 전 상태로 알린다', () => {
    // 핸드오프 초안: sourceHash = 외형-only(룩 부재), appearanceHash = 외형-only
    expect(
      classifyImageStale(A, lookV1, { sourceHash: apptA, appearanceHash: apptA }),
    ).toBe('look-pending')
  })

  it('외형만 기록된 이미지에 그림체가 도착하면 반영 전 상태로 알린다', () => {
    expect(
      classifyImageStale(A, lookV1, { sourceHash: apptA, appearanceHash: null }),
    ).toBe('look-pending')
  })

  it('외형을 바꾸면 기존 이미지가 수정 필요 상태가 된다', () => {
    // 후보는 A 로 만들어짐(appearanceHash=apptA). 현재 외형은 B 로 바뀜.
    expect(
      classifyImageStale(B, lookV1, { sourceHash: apptA, appearanceHash: apptA }),
    ).toBe('edited')
  })

  it('기존 이미지에 다른 그림체를 적용하면 수정 필요로 보수적으로 알린다', () => {
    // pre-027 에 이미 refresh 로 룩이 박힘 → sourceHash = H(A,lookV1), appearanceHash null
    const looked = computeImageSourceHash(A, lookV1)
    expect(
      classifyImageStale(A, lookV2, { sourceHash: looked, appearanceHash: null }),
    ).toBe('edited') // 전이적 degrade (027 후 새 후보는 appearanceHash 로 정확)
  })

  it('SCENARIO-6: 그림체만 바뀐 재실행은 대기로, 외형을 바꾸면 수정으로 알린다', () => {
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
  it('그림체 순서를 바꿔도 같은 목록으로 본다', () => {
    expect(lookVersionKey([lookV1, lookV2])).toBe(lookVersionKey([lookV2, lookV1]))
  })

  it('의상이나 그림체가 바뀌면 다른 목록으로 구분한다', () => {
    const withCostume = computeLookFingerprint({ l1: { art_style: 'dark_gothic' } }, '붉은 코트')!
    expect(lookVersionKey([lookV1])).not.toBe(lookVersionKey([withCostume]))
  })

  it('그림체가 모두 없으면 목록을 비워 둔다', () => {
    expect(lookVersionKey([null, undefined])).toBe('none')
  })

  it('그림체 없는 항목이 섞여도 있는 그림체만 모은다', () => {
    expect(lookVersionKey([lookV1, null])).toBe(lookVersionKey([lookV1]))
  })
})
