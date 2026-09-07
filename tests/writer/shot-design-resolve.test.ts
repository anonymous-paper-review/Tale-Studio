// 촬영 단위는 연결된 설계만 사용하고 연결이 없으면 옆 설계를 가져오지 않는다 (#split-spec 2026-08-10 e1a9fd08 sh_03_15)
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
  it('설계 연결 정보가 있으면 연결된 설계만 사용한다', () => {
    expect(resolveShotDesign(byId, { shotId: 'sh_03_14', designRef: 'shot_13' }, true)).toBe('design-찢기')
  })

  it('나뉜 촬영 단위에 연결 정보가 없으면 옆 설계를 가져오지 않는다', () => {
    // 버그 재현 조건: sh_03_15(분할 자식, ref=null)가 main-id 로 원설계 shot_15 를 집어오면 안 된다.
    expect(resolveShotDesign(byId, { shotId: 'sh_03_15', designRef: null }, true)).toBeNull()
  })

  it('연결된 설계가 없으면 다른 설계로 바꾸지 않고 비워 둔다', () => {
    expect(resolveShotDesign(byId, { shotId: 'sh_03_15', designRef: 'shot_99' }, true)).toBeNull()
  })

  it('오래된 프로젝트에서 연결 정보가 없어도 기존 촬영 단위 설계를 유지한다', () => {
    expect(resolveShotDesign(byId, { shotId: 'shot_15', designRef: null }, false)).toBe('design-추적자돌격')
  })
})
