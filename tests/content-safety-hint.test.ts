import { describe, it, expect } from 'vitest'
import { assessContentSafetyRisk } from '@/lib/writer/content-safety-hint'

describe('assessContentSafetyRisk', () => {
  it('미성년+위해 조합이면 risky (2026-06-28 실패 케이스)', () => {
    const r = assessContentSafetyRisk(
      '10대 초반 소녀가 그림을 그린다. 늙은 기사가 행인을 납치해 피를 물감으로 바친다.',
    )
    expect(r.risky).toBe(true)
    expect(r.minorTerms.length).toBeGreaterThan(0)
    expect(r.harmTerms.length).toBeGreaterThan(0)
  })

  it('미성년만 있고 위해 없음 → not risky', () => {
    expect(assessContentSafetyRisk('소녀가 평화롭게 그림을 그린다.').risky).toBe(false)
  })

  it('위해만 있고 미성년 없음 → not risky', () => {
    expect(assessContentSafetyRisk('늙은 기사가 칼로 적을 베어 피를 흘린다.').risky).toBe(false)
  })

  it('둘 다 없음 → not risky', () => {
    expect(assessContentSafetyRisk('상인들이 시장에서 물건을 판다.').risky).toBe(false)
  })

  it('영어 혼합도 감지', () => {
    expect(assessContentSafetyRisk('A child watches as blood drips down.').risky).toBe(true)
  })
})
