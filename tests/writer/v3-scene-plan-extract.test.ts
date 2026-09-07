// 장면 계획이 어떤 응답 형태로 와도 쇼트 수를 잃지 않고 모두 반영한다 (2026-06-28 사고 회귀)
import { describe, it, expect } from 'vitest'
import { extractScenePlans } from '@/lib/writer/pipeline/stages/v3_scene_plan'

// 2026-06-28 사고 회귀: Gemini가 sceneCinematography 응답을 비결정적으로
//   { scene_plans: [...] } 또는 최상위 배열 [...] 로 반환한다. 둘 다 수용해야
//   멀쩡한 플랜이 []로 버려져 shot_count=0 → 샷 붕괴(4씬/20샷 → 7샷)하는 걸 막는다.
describe('extractScenePlans', () => {
  const plans = [
    { scene_id: 'scene_1', shot_count_target: 6 },
    { scene_id: 'scene_2', shot_count_target: 4 },
  ]

  it('장면 계획이 묶음 형태로 오면 모든 계획을 반영한다', () => {
    expect(extractScenePlans({ scene_plans: plans })).toEqual(plans)
  })

  it('장면 계획이 목록으로 바로 오면 모든 계획을 반영한다 (Gemini 변형, 사고 케이스)', () => {
    expect(extractScenePlans(plans)).toEqual(plans)
  })

  it('응답이 없거나 알아볼 수 없으면 장면 계획을 만들지 않는다', () => {
    expect(extractScenePlans(null)).toEqual([])
    expect(extractScenePlans(undefined)).toEqual([])
    expect(extractScenePlans({})).toEqual([])
    expect(extractScenePlans({ scene_plans: null })).toEqual([])
    expect(extractScenePlans('nope')).toEqual([])
    expect(extractScenePlans(42)).toEqual([])
  })
})
