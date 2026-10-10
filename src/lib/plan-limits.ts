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

// 결제 준비 phase-2 슬라이스 1 (#payments-phase-2, v4 3_요금제 시트) — 요금제 사다리 전체 축.
//   기존 getPlanLimit/canUseReference(연결 슬롯 수 반환)의 시그니처·동작은 그대로 두고, 새 축은
//   이 함수로만 노출한다. 미지 plan 은 normalizePlan 을 그대로 재사용해 free 로 떨어진다.
export interface PlanEntitlements {
  /** 프로젝트당 생성 최대(분). */
  maxMinutesPerProject: number
  /** 최대 연결(참조) 프로젝트 슬롯 수 — getPlanLimit 과 동일 값. */
  maxLinkedProjects: number
  /** 포함 Take/월 — grant_plan 적립 시 이 값을 쓴다(월말 소멸). */
  includedTakesPerMonth: number
  canExport: boolean
  accountSeats: number
}

const V4_PLAN_ENTITLEMENTS: Record<V4Plan, PlanEntitlements> = {
  free: { maxMinutesPerProject: 0, maxLinkedProjects: 1, includedTakesPerMonth: 0, canExport: false, accountSeats: 1 },
  s1: { maxMinutesPerProject: 1, maxLinkedProjects: 1, includedTakesPerMonth: 16, canExport: false, accountSeats: 1 },
  s2: { maxMinutesPerProject: 2, maxLinkedProjects: 1, includedTakesPerMonth: 30, canExport: false, accountSeats: 1 },
  s5: { maxMinutesPerProject: 5, maxLinkedProjects: 1, includedTakesPerMonth: 60, canExport: false, accountSeats: 1 },
  s10: { maxMinutesPerProject: 10, maxLinkedProjects: 1, includedTakesPerMonth: 100, canExport: false, accountSeats: 1 },
  p10: { maxMinutesPerProject: 10, maxLinkedProjects: 2, includedTakesPerMonth: 150, canExport: true, accountSeats: 3 },
  p15: { maxMinutesPerProject: 15, maxLinkedProjects: 3, includedTakesPerMonth: 200, canExport: true, accountSeats: 4 },
  p20: { maxMinutesPerProject: 20, maxLinkedProjects: 3, includedTakesPerMonth: 360, canExport: true, accountSeats: 5 },
  p25: { maxMinutesPerProject: 25, maxLinkedProjects: 4, includedTakesPerMonth: 410, canExport: true, accountSeats: 6 },
  p30: { maxMinutesPerProject: 30, maxLinkedProjects: 4, includedTakesPerMonth: 710, canExport: true, accountSeats: 8 },
}

export function getPlanEntitlements(plan: unknown): PlanEntitlements {
  return V4_PLAN_ENTITLEMENTS[normalizePlan(plan)]
}

// #f4(2026-08-27 오너 확정): 프로젝트당 영상 생성 한도 — 전 요금제 공통 고정 100회.
//   '결과물이 나왔거나 나올 생성' 기준이다 — 결과물 없이 실패한 잡(status='failed')은 세지 않고
//   진행 중(queued)과 완료만 센다(환불 정책 §5 ② — 모델 제공자 필터 거절·시스템 오류로 결과물이
//   없으면 Take 와 함께 플랜 포함 한도도 돌려준다). 집계는 generation-quota.countProjectVideoGenerations —
//   사이드바 게이지와 생성 하드 블록(429)이 그 함수 하나를 공유한다.
export const PROJECT_VIDEO_GENERATION_LIMIT = 100
