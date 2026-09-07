// 요금제에 따라 만들 수 있는 프로젝트 수와 참고 작품 사용 가능 여부를 분명히 제한한다 (v4)
import { describe, expect, it } from 'vitest'

import { canUseReference, getPlanLimit } from '@/lib/plan-limits'

describe('참고 작품을 고를 수 있는 요금제 한도 (v4)', () => {
  it.each([
    ['free', 1],
    ['s1', 1],
    ['s2', 1],
    ['s5', 1],
    ['s10', 1],
    ['p10', 2],
    ['p15', 3],
    ['p20', 3],
    ['p25', 4],
    ['p30', 4],
  ])('%s 요금제는 프로젝트 %i개까지 허용한다', (plan, expected) => {
    expect(getPlanLimit(plan)).toBe(expected)
  })

  it('알 수 없는 요금제는 무료 요금제의 한도인 1개만 허용한다', () => {
    expect(getPlanLimit('legacy-p1')).toBe(1)
    expect(getPlanLimit(null)).toBe(1)
    expect(getPlanLimit(undefined)).toBe(1)
  })

  it('프로젝트를 두 개 이상 허용하는 요금제만 참고 작품을 가져올 수 있다', () => {
    expect(canUseReference('s10')).toBe(false)
    expect(canUseReference('p10')).toBe(true)
    expect(canUseReference('p30')).toBe(true)
    expect(canUseReference('unknown')).toBe(false)
  })
})
