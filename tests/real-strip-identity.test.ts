import { describe, it, expect } from 'vitest'
import {
  assetAuthorityClause,
  buildRealGridPrompt,
  buildRealStripPrompt,
  describeCharacterRef,
  stripIdentityBlock,
} from '@/lib/director/storyboard-strip'

// #ref-gate(2026-09-02, 실측 겨울_4 sh_01_27: 시트 1장 + 인형 셋 → 세 인형이 전부 같은 인물):
//   strip 프롬프트에 "참조 N = 이름(러프 위치·포즈)" 배정과 같은 인물 두 번 금지·배정 없는 인형은 다른 사람 규칙.

const REFS = [
  { name: '용족 수장', position: 'right_third', pose: 'standing tall in gold breastplate, hand resting on waist ornament' },
  { name: '요정 수장', position: 'left_third', pose: 'softly blurred background silhouette standing' },
  { name: '수인 수장', position: null, pose: null },
]

describe('describeCharacterRef', () => {
  it('위치 토큰을 사람 말로, 포즈를 덧붙인다 — 단서 없으면 이름만', () => {
    expect(describeCharacterRef(REFS[0])).toBe('용족 수장 (right third of the frame — standing tall in gold breastplate, hand resting on waist ornament)')
    expect(describeCharacterRef(REFS[2])).toBe('수인 수장')
    expect(describeCharacterRef('그냥 이름')).toBe('그냥 이름')
    expect(describeCharacterRef({ name: 'x', position: 'top_left' })).toBe('x (top left)')
  })
})

describe('stripIdentityBlock', () => {
  it('참조 번호 = 이름 규약, 같은 인물 두 번 금지, 배정 없는 인형은 다른 사람', () => {
    const lines = stripIdentityBlock(REFS)
    expect(lines[0]).toContain('reference image 2 = 용족 수장 (right third of the frame')
    expect(lines[0]).toContain('reference image 3 = 요정 수장 (left third of the frame')
    expect(lines[0]).toContain('reference image 4 = 수인 수장')
    expect(lines[1]).toMatch(/exactly ONCE per panel/)
    expect(lines[1]).toMatch(/never paint the same character twice/)
    expect(lines[1]).toMatch(/matches no assignment is a different, unnamed background person/)
    expect(stripIdentityBlock([])).toEqual([])
  })
})

describe('buildRealStripPrompt 인물 배정', () => {
  const base = { hasStyleRef: true, worldRefCount: 1 }

  it('characterRefs 를 주면 익명 "corresponding character(s)" 문장을 배정 블록으로 대체한다', () => {
    const p = buildRealStripPrompt('a shot', { ...base, characterRefCount: 3, characterRefs: REFS })
    expect(p).toContain('reference image 2 = 용족 수장')
    expect(p).toContain('exactly ONCE per panel')
    expect(p).not.toContain('corresponding character(s)')
    // 권위 절의 번호와 배정 블록의 번호가 같은 규약(2..4 인물, 5 배경, 마지막 스타일)
    expect(p).toContain('reference images 2 to 4 are the CHARACTER sheets; reference image 5 is the LOCATION reference')
  })

  it('characterRefs 가 없으면(레거시 샷) 종전 익명 문장을 유지한다', () => {
    const p = buildRealStripPrompt('a shot', { ...base, characterRefCount: 2 })
    expect(p).toContain('corresponding character(s)')
    expect(p).not.toContain('exactly ONCE per panel')
  })

  it('추가 입력(프레임 참조)은 권위 절에서 인물·세트가 아니라고 못박는다', () => {
    const p = buildRealStripPrompt('a shot', { ...base, characterRefCount: 1, characterRefs: [REFS[0]], extraRefCount: 2 })
    expect(p).toContain('reference images 4 to 5 are additional visual inputs for this shot')
    expect(assetAuthorityClause(0, 0, false, false, 1)).toContain('reference image 2 is an additional visual input')
  })
})

describe('buildRealGridPrompt 칸 배정', () => {
  it('칸 인물에 러프 위치·포즈를 붙이고 같은 인물 두 번 금지 규칙을 싣는다', () => {
    const p = buildRealGridPrompt(2, {
      characterRefCount: 2,
      hasStyleRef: true,
      characterRefs: [{ name: '용족 수장' }, { name: '요정 수장' }],
      columnCharacters: [[REFS[0], REFS[1]], []],
    })
    expect(p).toContain('Column 1: 용족 수장 (right third of the frame — standing tall')
    expect(p).toContain('Column 2: no character — keep this column free of people')
    expect(p).toMatch(/exactly ONCE per panel/)
  })

  it('문자열 이름만 줘도(종전 호출) 그대로 동작한다', () => {
    const p = buildRealGridPrompt(1, {
      characterRefCount: 1,
      hasStyleRef: false,
      characterRefs: [{ name: 'A' }],
      columnCharacters: [['A']],
    })
    expect(p).toContain('Column 1: A')
  })
})
