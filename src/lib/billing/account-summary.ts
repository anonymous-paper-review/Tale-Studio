// 계정·결제 페이지 요약 — 종류별 잔액 · 구독 상태 · 최근 내역 · 팩 구매 가능 여부 (#payments-phase-3 P9a).
//   순수 함수만. DB 는 /api/billing/account 라우트가 읽어서 넘긴다. 약속은 tests/billing-account.test.ts.
//
//   종류별 잔액 계산은 take_hold RPC(20260902150000)와 같은 규칙이다: grant 행의 잔여 = grant.delta +
//   그 grant_id 를 가리키는 후속 행 delta 합. grant_id 없는 차감(환불 회수·미배분 hold)과 manual_adjust 는
//   "other" 로 묶는다 — 음수 잔액의 원인이 거기 있다. 행 수가 늘어 무거워지면 RPC 로 옮긴다.

export type LedgerKind =
  | 'grant_free'
  | 'grant_plan'
  | 'grant_purchase'
  | 'grant_bonus'
  | 'hold'
  | 'hold_release'
  | 'consume'
  | 'expire'
  | 'refund_revoke'
  | 'manual_adjust'

export interface LedgerRow {
  id: string
  kind: LedgerKind
  delta: number
  grant_id: string | null
  expires_at: string | null
  ref_kind: string | null
  ref_id: string | null
  reason: string | null
  created_at: string
}

const GRANT_KINDS = new Set<LedgerKind>(['grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus'])

export interface TakeBreakdown {
  total: number
  free: number
  plan: number
  purchase: number
  bonus: number
  /** grant 에 안 묶인 행(환불 회수·수동 조정·미배분 hold)의 합. 음수 잔액은 보통 여기서 온다. */
  other: number
  /** 남은 플랜 lot 중 가장 이른 만료일. 플랜 잔여가 0이면 null. */
  planExpiresAt: string | null
  /** 남은 충전 lot 중 가장 이른 만료일. */
  purchaseExpiresAt: string | null
}

export function takeBreakdown(rows: readonly LedgerRow[]): TakeBreakdown {
  const remainingByGrant = new Map<string, number>()
  for (const row of rows) {
    if (GRANT_KINDS.has(row.kind)) remainingByGrant.set(row.id, (remainingByGrant.get(row.id) ?? 0) + row.delta)
  }
  let other = 0
  for (const row of rows) {
    if (GRANT_KINDS.has(row.kind)) continue
    if (row.grant_id && remainingByGrant.has(row.grant_id)) {
      remainingByGrant.set(row.grant_id, (remainingByGrant.get(row.grant_id) ?? 0) + row.delta)
    } else {
      other += row.delta
    }
  }

  const out: TakeBreakdown = {
    total: 0,
    free: 0,
    plan: 0,
    purchase: 0,
    bonus: 0,
    other,
    planExpiresAt: null,
    purchaseExpiresAt: null,
  }
  for (const row of rows) {
    if (!GRANT_KINDS.has(row.kind)) continue
    const remaining = remainingByGrant.get(row.id) ?? 0
    if (row.kind === 'grant_free') out.free += remaining
    else if (row.kind === 'grant_plan') out.plan += remaining
    else if (row.kind === 'grant_purchase') out.purchase += remaining
    else out.bonus += remaining
    if (remaining > 0 && row.expires_at) {
      if (row.kind === 'grant_plan' && (!out.planExpiresAt || row.expires_at < out.planExpiresAt)) {
        out.planExpiresAt = row.expires_at
      }
      if (row.kind === 'grant_purchase' && (!out.purchaseExpiresAt || row.expires_at < out.purchaseExpiresAt)) {
        out.purchaseExpiresAt = row.expires_at
      }
    }
  }
  out.total = rows.reduce((sum, row) => sum + row.delta, 0)
  return out
}

export interface ActivityItem {
  kind: LedgerKind
  delta: number
  refKind: string | null
  refId: string | null
  reason: string | null
  at: string
}

/**
 * 최근 내역 — 한 영상(ref)에 여러 lot 으로 쪼개진 hold 행을 한 줄로 합친다. 최신순.
 * 그룹 키 = kind + ref. ref 가 없는 행(적립·수동 조정)은 행마다 한 줄.
 */
export function groupRecentActivity(rows: readonly LedgerRow[], limit = 20): ActivityItem[] {
  const groups = new Map<string, ActivityItem>()
  for (const row of rows) {
    const key = row.ref_id ? `${row.kind}:${row.ref_kind ?? ''}:${row.ref_id}` : `row:${row.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.delta += row.delta
      if (row.created_at > existing.at) existing.at = row.created_at
    } else {
      groups.set(key, {
        kind: row.kind,
        delta: row.delta,
        refKind: row.ref_kind,
        refId: row.ref_id,
        reason: row.reason,
        at: row.created_at,
      })
    }
  }
  return [...groups.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit)
}

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'cancel_scheduled' | 'canceled' | 'paused'

export interface SubscriptionRow {
  plan: string
  status: string
  current_period_end: string | null
}

export interface SubscriptionSummary {
  plan: string
  status: SubscriptionStatus
  /** 다음 결제일. 취소 예약·실패·무료면 null. */
  nextBillingAt: string | null
  /** 취소가 예약됐을 때 이용이 끝나는 날. */
  accessEndsAt: string | null
  paymentFailed: boolean
}

function normalizeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'past_due':
    case 'cancel_scheduled':
    case 'canceled':
    case 'paused':
      return status
    default:
      return 'none'
  }
}

export function summarizeSubscription(workspacePlan: string, row: SubscriptionRow | null): SubscriptionSummary {
  if (!row) {
    return { plan: workspacePlan, status: 'none', nextBillingAt: null, accessEndsAt: null, paymentFailed: false }
  }
  const status = normalizeStatus(row.status)
  return {
    plan: workspacePlan,
    status,
    nextBillingAt: status === 'active' ? row.current_period_end : null,
    accessEndsAt: status === 'cancel_scheduled' ? row.current_period_end : null,
    paymentFailed: status === 'past_due',
  }
}

/** v4 충전 상한(오너 09-07 확정): 무료 플랜은 팩 1회. 구독 중은 제한 없음. */
export function canBuyTakePack(input: { plan: string; packPurchasedBefore: boolean }): boolean {
  if (input.plan !== 'free') return true
  return !input.packPurchasedBefore
}
