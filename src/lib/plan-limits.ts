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
