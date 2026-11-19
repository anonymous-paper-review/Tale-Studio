import 'server-only'

// 국내 카드 구독의 매시간 점검 (2026-11-19). 할 일 판정은 decidePortOneRenewal(순수,
//   약속: tests/billing/portone-subscription.test.ts). 여기는 그 판정대로 청구하거나 구독을 끝내는 실행부다.
//   PortOne 예약 결제를 쓰지 않고 우리가 직접 청구한다 — 해지·실패·재시도 규칙이 한 곳(우리 DB)에만 있게.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendOpsAlert } from '@/lib/ops-alert'
import { PADDLE_PLANS } from '@/lib/billing/catalog'
import {
  PORTONE_PLAN_PRICES_KRW,
  PORTONE_SUBSCRIPTION_PREFIX,
  addMonths,
  decidePortOneRenewal,
  newPortOnePaymentId,
  processPortOnePayment,
  type PaddlePlanIdForPortOne,
} from '@/lib/billing/portone'
import {
  chargeBillingKey,
  endPortOneSubscription,
  findBillingKey,
  portoneDeps,
  recordPortOneOrder,
  recordRenewalFailure,
  renewalFailures,
} from '@/lib/billing/portone-server'

export function portonePlanOrderName(planId: string): string {
  const name = PADDLE_PLANS.find((p) => p.id === planId)?.name ?? planId
  return `Tale Studio ${name} (1 month)`
}

export { endPortOneSubscription }

export interface RenewalRunSummary {
  charged: number
  failed: number
  ended: number
  skipped: number
}

export async function runPortOneRenewals(now = new Date()): Promise<RenewalRunSummary> {
  const summary: RenewalRunSummary = { charged: 0, failed: 0, ended: 0, skipped: 0 }
  const { data: rows, error } = await supabaseAdmin
    .from('subscriptions')
    .select('workspace_id, mor_subscription_id, plan, status, current_period_end')
    .like('mor_subscription_id', `${PORTONE_SUBSCRIPTION_PREFIX}%`)
    .in('status', ['active', 'past_due', 'cancel_scheduled'])
    .lte('current_period_end', now.toISOString())
  if (error) throw error

  for (const row of rows ?? []) {
    const subscriptionId = row.mor_subscription_id as string
    const workspaceId = row.workspace_id as string
    const plan = row.plan as string
    const periodEnd = row.current_period_end as string
    try {
      const failures = await renewalFailures(subscriptionId, periodEnd)
      const action = decidePortOneRenewal({
        status: row.status as string,
        currentPeriodEnd: periodEnd,
        now,
        failedAttempts: failures.count,
        lastFailedAt: failures.lastAt,
      })
      if (action === 'wait') {
        summary.skipped += 1
        continue
      }
      if (action === 'end') {
        await endPortOneSubscription({ workspaceId, subscriptionId, plan })
        summary.ended += 1
        continue
      }

      const amountKrw = PORTONE_PLAN_PRICES_KRW[plan as PaddlePlanIdForPortOne] ?? null
      const billingKey = await findBillingKey(subscriptionId)
      if (!amountKrw || !billingKey) {
        await sendOpsAlert({
          level: 'error',
          title: 'PortOne 구독 갱신을 청구할 수 없다', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
          body: `subscription ${subscriptionId} (${plan}): ${!amountKrw ? '원화 가격 없음' : '카드(빌링키) 기록 없음'}. 청구하지 않았다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
        })
        summary.skipped += 1
        continue
      }

      const paymentId = newPortOnePaymentId()
      const nextEnd = addMonths(periodEnd, 1)
      await recordPortOneOrder({ kind: 'plan', paymentId, workspaceId, planId: plan as PaddlePlanIdForPortOne, amountKrw, subscriptionId, periodEnd: nextEnd })
      const charged = await chargeBillingKey({ paymentId, billingKey, orderName: portonePlanOrderName(plan), amountKrw })
      if (charged.ok) {
        await processPortOnePayment(paymentId, portoneDeps)
        summary.charged += 1
        continue
      }

      await recordRenewalFailure({ paymentId, subscriptionId, periodEnd, message: charged.message })
      const { error: dueError } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('mor_subscription_id', subscriptionId)
      if (dueError) throw dueError
      await sendOpsAlert({
        level: 'warn',
        title: 'PortOne 구독 갱신 결제 실패', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
        body: `subscription ${subscriptionId} (${plan}) ${failures.count + 1}번째 실패: ${charged.message}. 한국 시간 9시·12시·18시에 다시 청구하고, 세 번 실패하면 다음 날 무료로 돌린다.`, // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
      })
      summary.failed += 1
    } catch (err) {
      await sendOpsAlert({
        level: 'error',
        title: 'PortOne 구독 갱신 점검 오류', // i18n-ok: 운영 경보(디스코드), 유저 화면 아님
        body: `subscription ${subscriptionId}: ${err instanceof Error ? err.message : String(err)}`,
      })
      summary.skipped += 1
    }
  }
  return summary
}
