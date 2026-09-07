// 각 인물 그림은 지정된 사람과 위치·자세를 따르고, 미지정 인물은 따로 구분하며 같은 사람을 중복하지 않는다 (#ref-gate 2026-09-02, 겨울_4 sh_01_27)
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
  it('인물 위치와 자세가 있으면 이름과 함께 설명하고, 없으면 이름만 적는다', () => {
    expect(describeCharacterRef(REFS[0])).toBe('용족 수장 (right third of the frame — standing tall in gold breastplate, hand resting on waist ornament)')
    expect(describeCharacterRef(REFS[2])).toBe('수인 수장')
    expect(describeCharacterRef('그냥 이름')).toBe('그냥 이름')
    expect(describeCharacterRef({ name: 'x', position: 'top_left' })).toBe('x (top left)')
  })
})

describe('stripIdentityBlock', () => {
  it('그림 번호와 인물 이름을 맞추고, 같은 사람을 두 번 그리지 않으며 지정하지 않은 인형은 다른 사람으로 구분한다', () => {
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

describe('인물별 위치와 자세 안내', () => {
  const base = { hasStyleRef: true, worldRefCount: 1 }

  it('인물 목록이 있으면 이름 없는 안내 대신 인물별 그림 번호를 알려준다', () => {
    const p = buildRealStripPrompt('a shot', { ...base, characterRefCount: 3, characterRefs: REFS })
    expect(p).toContain('reference image 2 = 용족 수장')
    expect(p).toContain('exactly ONCE per panel')
    expect(p).not.toContain('corresponding character(s)')
    // 권위 절의 번호와 배정 블록의 번호가 같은 규약(2..4 인물, 5 배경, 마지막 스타일)
    expect(p).toContain('reference images 2 to 4 are the CHARACTER sheets; reference image 5 is the LOCATION reference')
  })

  it('인물 목록이 없으면 이름 없는 안내를 그대로 유지한다', () => {
    const p = buildRealStripPrompt('a shot', { ...base, characterRefCount: 2 })
    expect(p).toContain('corresponding character(s)')
    expect(p).not.toContain('exactly ONCE per panel')
  })

  it('추가로 준 그림은 인물이나 장소가 아닌 참고 자료로 구분한다', () => {
    const p = buildRealStripPrompt('a shot', { ...base, characterRefCount: 1, characterRefs: [REFS[0]], extraRefCount: 2 })
    expect(p).toContain('reference images 4 to 5 are additional visual inputs for this shot')
    expect(assetAuthorityClause(0, 0, false, false, 1)).toContain('reference image 2 is an additional visual input')
  })
})

describe('칸마다 인물을 지정하는 규칙', () => {
  it('칸마다 인물의 위치와 자세를 보여주고, 같은 사람을 두 번 그리지 않는다', () => {
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

  it('이름만 알려도 해당 인물을 칸에 넣는다', () => {
    const p = buildRealGridPrompt(1, {
      characterRefCount: 1,
      hasStyleRef: false,
      characterRefs: [{ name: 'A' }],
      columnCharacters: [['A']],
    })
    expect(p).toContain('Column 1: A')
  })
})
