// 계정·결제 페이지 요약 — 종류별 잔액 · 구독 상태 · 최근 내역 · 팩 구매 가능 여부 (#payments-phase-3 P9a).
//   순수 함수만. DB 는 /api/billing/account 라우트가 읽어서 넘긴다. 약속은 tests/billing-account.test.ts.
//
//   종류별 잔액 계산은 take_hold RPC(20260902150000)와 같은 규칙이다: grant 행의 잔여 = grant.delta +
//   그 grant_id 를 가리키는 후속 행 delta 합. 구형 Paddle 환불은 원 결제의 유일한 지급분에 계산상 연결한다.
//   만료는 남은 양만 없앤다. 환불 전에 사용한 분량의 부족액은 만료 후에도 유지한다.

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

/**
 * @param now 만료 판정 기준 시각. 만료일이 지난 lot 은 남은 양을 0 으로 친다 — 잡(Cron)이 만료 행을 넣기 전에도
 *   잔액에 안 잡히게(2026-09-08 오너 지적: 잡을 기다리면 주기만큼 새는 창이 생긴다. 1시간 주기면 최악 59분).
 *   잡이 만료 행을 넣은 뒤에도 같은 숫자가 나온다 — 그 lot 은 이미 0 이라 두 번 빠지지 않는다.
 */
export function takeBreakdown(rows: readonly LedgerRow[], now: Date = new Date()): TakeBreakdown {
  const nowMs = now.getTime()
  const expired = (row: LedgerRow) => row.expires_at !== null && new Date(row.expires_at).getTime() <= nowMs
  const remainingByGrant = new Map<string, number>()
  const grantsById = new Map<string, LedgerRow>()
  const grantByTransaction = new Map<string, string | null>()
  for (const row of rows) {
    if (!GRANT_KINDS.has(row.kind)) continue
    remainingByGrant.set(row.id, (remainingByGrant.get(row.id) ?? 0) + row.delta)
    grantsById.set(row.id, row)
    if (row.ref_kind === 'paddle_transaction' && row.ref_id) {
      grantByTransaction.set(row.ref_id, grantByTransaction.has(row.ref_id) ? null : row.id)
    }
  }
  let other = 0
  for (const row of rows) {
    if (GRANT_KINDS.has(row.kind)) continue
    // 장부는 append-only다. 구형 기록의 금액·출처를 고치지 않고, 서버가 남긴 정확한 형식만 해석한다.
    const legacyTransaction = !row.grant_id && row.kind === 'refund_revoke' && row.ref_kind === 'paddle_adjustment'
      ? /^paddle (?:refund|chargeback) of (txn_[a-z0-9]+) \([0-9]+%\)$/.exec(row.reason ?? '')?.[1]
      : undefined
    const grantId = row.grant_id ?? (legacyTransaction ? grantByTransaction.get(legacyTransaction) : null)
    const grant = grantId ? grantsById.get(grantId) : undefined
    if (grant) {
      // 만료 감사행은 실사용이 아니다. 만료 후 환불이 들어와도 expire+refund를 사용분 채무로 세지 않는다.
      if (row.kind === 'expire' && expired(grant)) continue
      remainingByGrant.set(grant.id, (remainingByGrant.get(grant.id) ?? 0) + row.delta)
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
    const unexpiredRemaining = remainingByGrant.get(row.id) ?? 0
    // 양수 잔여만 만료한다. 실제 사용 + 환불로 생긴 음수는 원래 만료일에도 없어지지 않는다.
    const remaining = expired(row) ? Math.min(0, unexpiredRemaining) : unexpiredRemaining
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
  // 합계는 종류별 합 + 기타(grant 에 안 묶인 행). 단순 sum(delta) 이 아니다 — 만료된 lot 의 남은 양이 빠져야 한다.
  //   잡이 만료 행을 넣으면 그 lot 의 remaining 이 0 이 되고 만료 행은 grant_id 로 그 lot 에 묶여 other 에 안 잡힌다.
  out.total = out.free + out.plan + out.purchase + out.bonus + out.other
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
