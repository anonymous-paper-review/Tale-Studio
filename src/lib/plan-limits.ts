type V4Plan = 'free' | 's1' | 's2' | 's5' | 's10' | 'p10' | 'p15' | 'p20' | 'p25' | 'p30'

const V4_PLAN_LIMITS: Record<V4Plan, number> = {
  free: 1,
  s1: 1,
  s2: 1,
  s5: 1,
  s10: 1,
  p10: 2,
  p15: 3,
  p20: 3,
  p25: 4,
  p30: 4,
}

function normalizePlan(plan: unknown): V4Plan {
  return typeof plan === 'string' && Object.prototype.hasOwnProperty.call(V4_PLAN_LIMITS, plan)
    ? (plan as V4Plan)
    : 'free'
}

export function getPlanLimit(plan: unknown): number {
  return V4_PLAN_LIMITS[normalizePlan(plan)]
}

export function canUseReference(plan: unknown): boolean {
  return getPlanLimit(plan) >= 2
}

// #f4(2026-08-27 오너 확정): 프로젝트당 영상 생성 한도 — 전 요금제 공통 고정 100회.
//   '생성 시도' 기준(영상 kind 잡 행 수) — 실패도 fal 과금이 발생할 수 있어 차감으로 센다.
//   현재는 표시용 진실(사이드바 게이지)이며 하드 블록은 별도 결정 전까지 없다.
export const PROJECT_VIDEO_GENERATION_LIMIT = 100
