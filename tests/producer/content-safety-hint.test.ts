// 미성년자와 위험한 상황이 함께 나오면 안전 검토가 필요하다고 알린다
import { describe, it, expect } from 'vitest'
import { assessContentSafetyRisk } from '@/lib/writer/content-safety-hint'

describe('assessContentSafetyRisk', () => {
  it('미성년자와 위험한 상황이 함께 나오면 주의가 필요하다고 알린다 (2026-06-28 실패 케이스)', () => {
    const r = assessContentSafetyRisk(
      '10대 초반 소녀가 그림을 그린다. 늙은 기사가 행인을 납치해 피를 물감으로 바친다.',
    )
    expect(r.risky).toBe(true)
    expect(r.minorTerms.length).toBeGreaterThan(0)
    expect(r.harmTerms.length).toBeGreaterThan(0)
  })

  it('미성년자만 나오고 위험한 상황이 없으면 안전하다고 판단한다', () => {
    expect(assessContentSafetyRisk('소녀가 평화롭게 그림을 그린다.').risky).toBe(false)
  })

  it('위험한 상황만 나오고 미성년자가 없으면 안전하다고 판단한다', () => {
    expect(assessContentSafetyRisk('늙은 기사가 칼로 적을 베어 피를 흘린다.').risky).toBe(false)
  })

  it('미성년자와 위험한 상황이 모두 없으면 안전하다고 판단한다', () => {
    expect(assessContentSafetyRisk('상인들이 시장에서 물건을 판다.').risky).toBe(false)
  })

  it('영어로 적힌 위험한 상황도 알아본다', () => {
    expect(assessContentSafetyRisk('A child watches as blood drips down.').risky).toBe(true)
  })
})
