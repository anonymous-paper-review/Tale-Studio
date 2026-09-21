// 구독 이력에서 "지금 유효한 구독" 을 고른다 (#payments-phase-3). 약속: tests/billing/subscription-history.test.ts.
//
//   2026-09-08 이전에는 subscriptions.workspace_id 가 기본키였다. 워크스페이스당 행이 하나뿐이라
//   새 구독이 옛 구독을 덮어썼고, 스모크의 가짜 구독이 진짜 구독을 지우는 사고가 났다.
//   지금은 구독 하나당 한 행이고, 활성은 부분 유일 인덱스로 워크스페이스당 하나만 허용한다.
//   덮어쓰기가 구조적으로 불가능해졌고, 취소하고 다시 구독한 이력도 남는다.

/** 아직 살아 있는 구독으로 보는 상태. past_due 는 갱신 실패라 복구 대상이므로 포함한다. */
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const

export interface SubscriptionRow {
  workspace_id: string
  mor_subscription_id: string | null
  plan: string
  status: string
  current_period_end: string | null
  updated_at: string
}

export function pickActiveSubscription(rows: readonly SubscriptionRow[] | null | undefined): SubscriptionRow | null {
  if (!rows || rows.length === 0) return null
  const live = rows.filter((r) => (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(r.status))
  if (live.length === 0) return null
  // 활성이 여럿일 일은 부분 유일 인덱스가 막지만, 이력 조회는 방어적으로 최신을 고른다.
  return [...live].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
}
