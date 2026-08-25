import { describe, expect, it } from 'vitest'

import { canUseReference, getPlanLimit } from '@/lib/plan-limits'

describe('reference-import v4 plan limits', () => {
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
  ])('%s plan has %i project slots', (plan, expected) => {
    expect(getPlanLimit(plan)).toBe(expected)
  })

  it('fails closed to the free limit for unknown plans', () => {
    expect(getPlanLimit('legacy-p1')).toBe(1)
    expect(getPlanLimit(null)).toBe(1)
    expect(getPlanLimit(undefined)).toBe(1)
  })

  it('opens reference import only for plans with at least two slots', () => {
    expect(canUseReference('s10')).toBe(false)
    expect(canUseReference('p10')).toBe(true)
    expect(canUseReference('p30')).toBe(true)
    expect(canUseReference('unknown')).toBe(false)
  })
})
