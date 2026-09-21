// 놓친 결제 찾기 — 대조 계산 (#payments-phase-3 P12). 약속: tests/billing/billing-reconcile.test.ts.
//
//   알림 유실은 반드시 일어난다(배포 순간·서버 다운). Paddle 재시도(라이브 60회/3일)와 결제 직후 폴링(90초)이
//   대부분을 덮고, 둘 다 실패한 것을 두 겹으로 잡는다:
//     ① 즉시 재조회 — 그 유저 결제만, 유저가 보고 있을 때 (POST /api/billing/reconcile-me)
//     ② 일일 대사 — 어제 결제 전부, 유저가 안 보고 있을 때 (GET /api/cron/billing-reconcile)
//   이 파일은 둘이 공유하는 순수 계산과 Paddle 응답 파싱만 갖는다.

export interface PaddleTxnSummary {
  id: string
  customerId: string | null
  billedAt: string | null
  /** 최소 단위 문자열(2900 = $29.00). 경보 메시지에 쓴다. */
  total: string | null
}

export interface ReconcileDiff {
  /** Paddle 에는 있는데 우리 장부에 적립이 없는 결제 — 알림 유실. */
  missing: PaddleTxnSummary[]
  /** 우리 장부에는 적립이 있는데 Paddle 목록에 없는 결제 번호 — 있을 수 없는 일. */
  extra: string[]
  matched: number
}

export function diffLedgerAgainstPaddle(input: {
  paddleTransactions: readonly PaddleTxnSummary[]
  /** take_ledger 에서 ref_kind='paddle_transaction' 으로 적립된 결제 번호들. */
  grantedTransactionIds: readonly string[]
}): ReconcileDiff {
  const granted = new Set(input.grantedTransactionIds)
  const paddleIds = new Set(input.paddleTransactions.map((t) => t.id))
  const missing = input.paddleTransactions.filter((t) => !granted.has(t.id))
  const extra = [...granted].filter((id) => !paddleIds.has(id))
  return { missing, extra, matched: input.paddleTransactions.length - missing.length }
}

/** Paddle 거래 응답에서 대조에 필요한 것만 뽑는다. */
export function toTxnSummary(raw: Record<string, unknown>): PaddleTxnSummary {
  const details = raw.details as { totals?: { total?: unknown } } | undefined
  const total = details?.totals?.total
  return {
    id: String(raw.id ?? ''),
    customerId: typeof raw.customer_id === 'string' ? raw.customer_id : null,
    billedAt: typeof raw.billed_at === 'string' ? raw.billed_at : null,
    total: typeof total === 'string' ? total : null,
  }
}

/** 어제 0시(UTC)부터. 매일 전체를 훑으면 Paddle 호출이 늘고 같은 경보가 매일 반복된다. */
export function yesterdayStart(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0))
  return d.toISOString()
}
