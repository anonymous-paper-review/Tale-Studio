'use client'

// 국내 카드 결제(PortOne · KG이니시스) 흐름. 서버가 준비한 결제 번호·금액으로만 결제창을 열고,
//   끝나면 서버에 확인을 맡긴다(서버가 PortOne 에 다시 물어 Take 를 준다). 팩 = 1회 결제, 플랜 = 카드 등록 뒤 첫 달 청구.
import { useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { countText } from '@/lib/i18n/count-text'
import { fetchTakeBalance } from '@/lib/billing/use-take-balance'
import { refetchBillingAccount } from '@/lib/billing/use-billing-account'

export interface PortOneBuyer {
  fullName: string
  phoneNumber: string
}

const DENY_COPY: Record<string, string> = {
  portone_not_configured: 'Korean card payments are not open yet.',
  no_krw_price: 'Korean card payments are not open yet.',
  unknown_item: 'That product is not available.',
  free_pack_limit: 'Free plans can buy one pack. Subscribe to keep topping up.',
  already_subscribed: 'You already have a subscription.',
  payment_failed: 'Your card was declined. Please try another card.',
}

interface Prepared {
  kind: 'pack' | 'plan'
  paymentId: string
  storeId: string
  channelKey: string
  orderName: string
  amountKrw: number
  email: string
}

export function usePortOneCheckout() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)

  async function start(input: { kind: 'pack' | 'plan'; id: string; buyer: PortOneBuyer; returnTo?: string; onReady?: () => void | Promise<void> }) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      const res = await fetch('/api/billing/portone/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: input.kind, id: input.id }),
      })
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(input.returnTo || pathname || '/pricing')}`)
        return
      }
      const prepared = (await res.json().catch(() => ({}))) as Partial<Prepared> & { error?: string }
      if (!res.ok || !prepared.paymentId || !prepared.storeId || !prepared.channelKey) {
        toast.error(t(DENY_COPY[prepared.error ?? ''] ?? 'Could not open checkout. Please try again.'))
        return
      }
      const p = prepared as Prepared
      const PortOne = await import('@portone/browser-sdk/v2')
      await input.onReady?.()
      const customer = { fullName: input.buyer.fullName, phoneNumber: input.buyer.phoneNumber, email: p.email }
      const redirectUrl = `${window.location.origin}/checkout/portone?kind=${p.kind}`

      if (p.kind === 'pack') {
        const before = (await fetchTakeBalance()).balance
        const response = await PortOne.requestPayment({
          storeId: p.storeId,
          channelKey: p.channelKey,
          paymentId: p.paymentId,
          orderName: p.orderName,
          totalAmount: p.amountKrw,
          currency: 'KRW',
          payMethod: 'CARD',
          customer,
          redirectUrl,
        })
        if (!response || response.code) {
          if (response?.message) toast.error(response.message)
          return
        }
        await confirmPack(t, p.paymentId, before)
        return
      }

      const issued = await PortOne.requestIssueBillingKey({
        storeId: p.storeId,
        channelKey: p.channelKey,
        billingKeyMethod: 'CARD',
        issueId: p.paymentId,
        issueName: p.orderName,
        displayAmount: p.amountKrw,
        currency: 'KRW',
        customer,
        redirectUrl: `${redirectUrl}&paymentId=${encodeURIComponent(p.paymentId)}`,
      })
      if (!issued || issued.code || !issued.billingKey) {
        if (issued?.message) toast.error(issued.message)
        return
      }
      await confirmSubscription(t, p.paymentId, issued.billingKey)
    } catch {
      toast.error(t('Could not open checkout. Please try again.'))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return { busy, start }
}

export async function confirmPack(t: ReturnType<typeof useT>, paymentId: string, before: number | null = null): Promise<boolean> {
  const id = toast.loading(t('Confirming your payment…'))
  const res = await fetch('/api/billing/portone/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId }),
  }).catch(() => null)
  const [take] = await Promise.all([fetchTakeBalance(), refetchBillingAccount()])
  if (res?.ok) {
    const delta = take.balance !== null && before !== null ? take.balance - before : 0
    toast.success(delta > 0 ? countText(t, delta, '1 Take added to your balance.', '{n} Takes added to your balance.', { n: delta }) : t('Your balance is updated.'), { id })
    return true
  }
  toast.warning(t('Still confirming. Check the account page in a minute.'), { id, duration: 10_000 })
  return false
}

export async function confirmSubscription(t: ReturnType<typeof useT>, paymentId: string, billingKey: string): Promise<boolean> {
  const id = toast.loading(t('Starting your subscription…'))
  const res = await fetch('/api/billing/portone/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId, billingKey }),
  }).catch(() => null)
  await Promise.all([fetchTakeBalance(), refetchBillingAccount()])
  if (res?.ok) {
    toast.success(t('Your subscription has started.'), { id })
    return true
  }
  const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined
  toast.error(t(DENY_COPY[body?.error ?? ''] ?? 'Could not start your subscription. Please try again.'), { id })
  return false
}
