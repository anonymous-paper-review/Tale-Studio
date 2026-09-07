'use client'

// 계정·결제 페이지 (#payments-phase-3 P9a, 2026-09-07) — "산 뒤"에 보는 화면.
//   플랜 · 다음 결제일 · 결제 실패 배너 · 종류별 Take 잔액 · 팩 구매 카드 · 최근 내역 · 계정.
//   숫자는 /api/billing/account 하나에서 온다. 결제 버튼과 "구독 관리"(Paddle 포털)는 Paddle 상품 ID·
//   포털 연동이 붙는 P7·P9 에서 살아나고, 그 전엔 비활성. 부족 토스트의 "Add Takes" 버튼이 여기로 온다(3-10).
//   구조는 Claude 설정 > Billing 을 따랐다(오너 09-07): 플랜 → Take → 구매 → 내역 → 계정.
//   약속: tests/billing-account.test.ts (숫자·상태) + 스크린샷(생김새).

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, LogOut, RefreshCw, X } from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { CheckoutButton } from '@/components/billing/checkout-button'
import { PortalButton } from '@/components/billing/portal-button'
import { createClient } from '@/lib/supabase/client'
import { clearLastProjectId } from '@/lib/session-restore'
import { useT } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { PADDLE_PLANS, PADDLE_TAKE_PACKS, isPurchasable } from '@/lib/billing/catalog'
import { getPlanEntitlements } from '@/lib/plan-limits'
import type { LedgerKind } from '@/lib/billing/account-summary'
import { refetchBillingAccount, useBillingAccount } from '@/lib/billing/use-billing-account'
import { cn } from '@/lib/utils'

// 라벨은 영어 원문 = i18n 사전 키 (#i18n-s5).
const ACTIVITY_LABEL: Record<LedgerKind, string> = {
  grant_free: 'Free Takes',
  grant_plan: 'Plan Takes',
  grant_purchase: 'Take pack',
  grant_bonus: 'Bonus Takes',
  hold: 'Video generation',
  hold_release: 'Returned (generation failed)',
  consume: 'Video generation',
  expire: 'Expired',
  refund_revoke: 'Refund',
  manual_adjust: 'Adjustment',
}

function useDateFormat() {
  const locale = useLocaleStore((s) => s.locale)
  return (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : ''
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-white/10 bg-white/[0.02] p-6', className)}>
      {title && <h2 className="mb-4 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  )
}

const disabledButtonClass =
  'cursor-not-allowed rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-gray-500'
const linkButtonClass =
  'rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/40'

export default function AccountPage() {
  const t = useT()
  const router = useRouter()
  const fmt = useDateFormat()
  const { data, error } = useBillingAccount(true)

  useEffect(() => {
    void refetchBillingAccount()
  }, [])

  const plan = data?.subscription.plan ?? 'free'
  const catalogPlan = useMemo(() => PADDLE_PLANS.find((p) => p.id === plan) ?? null, [plan])
  const entitlements = getPlanEntitlements(plan)
  const balance = data?.balance ?? null
  const negative = balance !== null && balance.total < 0
  const subscription = data?.subscription

  const handleLogout = async () => {
    clearLastProjectId()
    await createClient().auth.signOut()
    router.push('/')
  }

  const planRows = [
    t('{n} min per project', { n: entitlements.maxMinutesPerProject }),
    entitlements.maxLinkedProjects === 1
      ? t('1 linked project')
      : t('{n} linked projects', { n: entitlements.maxLinkedProjects }),
    t('{n} Takes per month', { n: entitlements.includedTakesPerMonth }),
    entitlements.accountSeats === 1 ? t('1 account') : t('{n} accounts', { n: entitlements.accountSeats }),
  ]

  const balanceRows: { label: string; value: number; note: string }[] = balance
    ? [
        { label: t('Plan Takes'), value: balance.plan, note: balance.planExpiresAt ? t('Expires {date}', { date: fmt(balance.planExpiresAt) }) : '' },
        { label: t('Pack Takes'), value: balance.purchase, note: balance.purchaseExpiresAt ? t('Valid until {date}', { date: fmt(balance.purchaseExpiresAt) }) : '' },
        { label: t('Free Takes'), value: balance.free, note: '' },
        { label: t('Bonus Takes'), value: balance.bonus, note: '' },
        { label: t('Other'), value: balance.other, note: '' },
      ].filter((row) => row.value !== 0)
    : []

  return (
    <div className="min-h-screen bg-black text-white">
      <DashboardHeader active="account" />
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('Account & billing')}</h1>
          <p className="mt-1 text-sm text-gray-400">{t('Your plan, Takes, and purchases in one place.')}</p>
        </div>

        {error && !data && (
          <div className="flex items-center justify-between rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-4 text-sm">
            <span>{t('Could not load billing details.')}</span>
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm underline"
              onClick={() => void refetchBillingAccount()}
            >
              <RefreshCw className="size-3.5" />
              {t('Retry')}
            </button>
          </div>
        )}

        {subscription?.paymentFailed && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-warning/50 bg-warning/10 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              {t('Payment failed. Please check your card.')}
            </span>
            {data?.hasPaddleCustomer ? (
              <PortalButton target="payment" className={linkButtonClass}>
                {t('Update payment method')}
              </PortalButton>
            ) : (
              <button type="button" disabled title={t('Available once payments go live.')} className={disabledButtonClass}>
                {t('Update payment method')}
              </button>
            )}
          </div>
        )}

        <Card title={t('Plan')}>
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-semibold">{catalogPlan ? catalogPlan.name : t('Free')}</span>
                {catalogPlan && (
                  <span className="text-sm text-gray-400">
                    {t('{price} / month', { price: `$${catalogPlan.monthlyPriceUsd.toLocaleString('en-US')}` })}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-400">
                {subscription?.status === 'active' && subscription.nextBillingAt
                  ? t('Renews on {date}', { date: fmt(subscription.nextBillingAt) })
                  : subscription?.status === 'cancel_scheduled' && subscription.accessEndsAt
                    ? t('Access until {date}', { date: fmt(subscription.accessEndsAt) })
                    : subscription?.status === 'past_due'
                      ? t('Payment failed. Please check your card.')
                      : subscription?.status === 'canceled'
                        ? t('Canceled')
                        : t('No active subscription')}
              </p>
              {plan === 'free' ? (
                // 오너 09-07: 무료는 "프로젝트당 0분 · 월 0 Take" 대신 한 줄 안내.
                <p className="mt-4 text-sm text-gray-300">{t('Add Takes to start generating video. Images are always free.')}</p>
              ) : (
              <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm text-gray-300 sm:grid-cols-2">
                {planRows.map((row) => (
                  <li key={row} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    {row}
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  {entitlements.canExport ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : (
                    <X className="size-4 shrink-0 text-gray-600" />
                  )}
                  <span className={entitlements.canExport ? undefined : 'text-gray-500'}>{t('Export previz data')}</span>
                </li>
              </ul>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href="/pricing" className={linkButtonClass}>
                {t('Change plan')}
              </Link>
              {data?.hasPaddleCustomer ? (
                <PortalButton target={subscription?.status === 'active' || subscription?.status === 'cancel_scheduled' || subscription?.status === 'past_due' ? 'cancel' : 'overview'} className={linkButtonClass}>
                  {subscription?.status === 'active' || subscription?.status === 'cancel_scheduled' || subscription?.status === 'past_due' ? t('Manage subscription') : t('Billing & receipts')}
                </PortalButton>
              ) : (
                <button type="button" disabled title={t('Available once payments go live.')} className={disabledButtonClass}>
                  {t('Manage subscription')}
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card title={t('Takes')}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className={cn('text-4xl font-semibold tabular-nums', negative && 'text-destructive')}>
                {data?.isAdmin ? t('Unlimited') : balance ? balance.total.toLocaleString('en-US') : '-'}
              </p>
              {negative && (
                <p className="mt-2 max-w-md text-sm text-destructive">
                  {t(
                    'A refund took back Takes you had already used. New video generation is paused until the balance is back above zero.',
                  )}
                </p>
              )}
            </div>
            {balanceRows.length > 0 && (
              <ul className="min-w-56 space-y-1.5 text-sm">
                {balanceRows.map((row) => (
                  <li key={row.label} className="flex items-baseline justify-between gap-6">
                    <span className="text-gray-400">{row.label}</span>
                    <span className="text-right">
                      <span className={cn('tabular-nums', row.value < 0 && 'text-destructive')}>
                        {row.value.toLocaleString('en-US')}
                      </span>
                      {row.note && <span className="ml-2 text-xs text-gray-500">{row.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card title={t('Buy Takes')}>
          {data && !data.canBuyPack ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-300">{t('Free plans can buy one pack. Subscribe to keep topping up.')}</p>
              <Link href="/pricing" className={linkButtonClass}>
                {t('See plans')}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {PADDLE_TAKE_PACKS.map((pack) => (
                <div key={pack.id} className="flex flex-col rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <span className="text-sm font-semibold">{pack.name}</span>
                  <span className="mt-1 text-xl font-semibold">${pack.priceUsd.toLocaleString('en-US')}</span>
                  <span className="text-xs text-gray-400">{t('{n} Takes', { n: pack.takes.toLocaleString('en-US') })}</span>
                  <span className="mb-4 mt-1 text-xs text-gray-500">{t('Valid for 12 months.')}</span>
                  {isPurchasable(pack) ? (
                    <CheckoutButton
                      kind="pack"
                      id={pack.id}
                      className="mt-auto rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      {t('Buy')}
                    </CheckoutButton>
                  ) : (
                    <button type="button" disabled title={t('Available once payments go live.')} className={cn(disabledButtonClass, 'mt-auto w-full')}>
                      {t('Coming soon')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t('Recent activity')}>
          {!data || data.recent.length === 0 ? (
            <p className="text-sm text-gray-500">{t('No activity yet.')}</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {data.recent.map((item, i) => (
                <li key={`${item.kind}-${item.refId ?? i}-${item.at}`} className="flex items-center justify-between py-2.5">
                  <span className="flex flex-col">
                    <span>{t(ACTIVITY_LABEL[item.kind])}</span>
                    <span className="text-xs text-gray-500">
                      {fmt(item.at)}
                      {item.reason ? ` · ${item.reason}` : ''}
                    </span>
                  </span>
                  <span className={cn('tabular-nums', item.delta > 0 ? 'text-success' : 'text-gray-300')}>
                    {item.delta > 0 ? `+${item.delta}` : item.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('Account')}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">{data?.email ?? ''}</span>
            <button type="button" onClick={() => void handleLogout()} className={cn(linkButtonClass, 'flex items-center gap-2')}>
              <LogOut className="size-4" />
              {t('Log out')}
            </button>
          </div>
        </Card>
      </main>
    </div>
  )
}
