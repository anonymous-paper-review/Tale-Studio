// 샷→설계 해석 가드(#split-spec 2026-08-10) 회귀 — 실측 버그(e1a9fd08 sh_03_15) 방어.
//   분할 둘째 자식(design_ref 없음)이 main-id 숫자 조인으로 리넘버된 옆 샷의 설계를 훔쳐
//   설명과 무관한 러프("도면 숨기기" 칸에 추적자 돌격 blocking/focal)가 그려졌다.
import { describe, it, expect } from 'vitest'
import { resolveShotDesign } from '@/lib/writer/shot-design-state'

const byId = new Map<string, string>([
  ['shot_13', 'design-찢기'],
  ['shot_15', 'design-추적자돌격'],
  ['sh_03_15', 'design-추적자돌격'], // 로더가 main 정규화 키로도 색인하는 것을 재현
])

describe('resolveShotDesign', () => {
  it('design_ref 가 있으면 ref 로만 조인한다', () => {
    expect(resolveShotDesign(byId, { shotId: 'sh_03_14', designRef: 'shot_13' }, true)).toBe('design-찢기')
  })

  it('ref 체계 프로젝트에서 ref 없는 샷(분할 자식)은 main-id 폴백 금지 — 옆 설계 도난 방지', () => {
    // 버그 재현 조건: sh_03_15(분할 자식, ref=null)가 main-id 로 원설계 shot_15 를 집어오면 안 된다.
    expect(resolveShotDesign(byId, { shotId: 'sh_03_15', designRef: null }, true)).toBeNull()
  })

  it('ref 가 있는데 설계가 없으면 null — main-id 로 새지 않는다', () => {
    expect(resolveShotDesign(byId, { shotId: 'sh_03_15', designRef: 'shot_99' }, true)).toBeNull()
  })

  it('레거시 프로젝트(전 샷 ref 없음)는 main-id 직조인 유지', () => {
    expect(resolveShotDesign(byId, { shotId: 'shot_15', designRef: null }, false)).toBe('design-추적자돌격')
  })
})
