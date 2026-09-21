'use client'

// 구매 진입점 공용 흐름. 서버가 판정한 거래 또는 플랜 변경만 열고, 옵션창이 닫힐 때까지 기다린다.
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { loadPaddle, subscribePaddleEvents } from '@/lib/billing/paddle-client'
import { useT } from '@/lib/i18n'
import { fetchTakeBalance } from '@/lib/billing/use-take-balance'
import { refetchBillingAccount } from '@/lib/billing/use-billing-account'
import type { CheckoutDenyReason, CheckoutKind } from '@/lib/billing/checkout'
import type { PlanChangePreview } from '@/components/billing/plan-change-dialog'
import { PADDLE_PLANS } from '@/lib/billing/catalog'

const DENY_COPY: Record<CheckoutDenyReason, string> = {
  payments_not_open: 'Payments are being prepared',
  unknown_item: 'That product is not available.',
  not_purchasable: 'Payments for this product open soon.',
  free_pack_limit: 'Free plans can buy one pack. Subscribe to keep topping up.',
  already_subscribed: 'You already have a subscription.',
  past_due: 'Your last payment failed. Please update your card before subscribing again.',
}

/** 결제 뒤 잔액이 바뀔 때까지 기다린다. 웹훅이 수 초~수 분 늦을 수 있다(specs/payments-readiness.md 2장). */
async function confirmAfterCheckout(t: ReturnType<typeof useT>, before: number | null): Promise<void> {
  const id = toast.loading(t('Confirming your payment…'))
  const startedAt = Date.now()
  while (Date.now() - startedAt < 90_000) {
    await new Promise((r) => setTimeout(r, 3000))
    const [take] = await Promise.all([fetchTakeBalance(), refetchBillingAccount()])
    if (take.balance !== null && before !== null && take.balance !== before) {
      const delta = take.balance - before
      toast.success(delta > 0 ? t('{n} Takes added to your balance.', { n: delta }) : t('Your balance is updated.'), { id })
      return
    }
    if (take.balance !== null && before === null) {
      toast.success(t('Your balance is updated.'), { id })
      return
    }
  }
  // 90초를 다 썼다 = Paddle 재시도와 폴링이 둘 다 실패했다. 그 자리에서 Paddle 에 직접 물어본다(P12 즉시 재조회).
  //   그 유저의 결제만 본다 — 서버가 로그인 유저의 워크스페이스에 묶인 Paddle 고객으로만 조회한다.
  try {
    const res = await fetch('/api/billing/reconcile-me', { method: 'POST' })
    const body = (await res.json().catch(() => ({}))) as { recovered?: number }
    if (res.ok && (body.recovered ?? 0) > 0) {
      const [take] = await Promise.all([fetchTakeBalance(), refetchBillingAccount()])
      const delta = take.balance !== null && before !== null ? take.balance - before : 0
      toast.success(delta > 0 ? t('{n} Takes added to your balance.', { n: delta }) : t('Your balance is updated.'), { id })
      return
    }
  } catch {
    // 재조회 실패는 아래 안내로 떨어진다 — 유저에게 보일 것은 같다.
  }
  toast.warning(t('Still confirming. Check the account page in a minute.'), { id, duration: 10_000 })
}

export interface StartCheckoutOptions {
  kind: CheckoutKind
  id: string
  /** 로그인 뒤 돌아올 내부 주소. 옵션 선택 쿼리도 함께 보존한다. */
  returnTo?: string
  /** 준비 성공 후에만 호출한다. 기존 옵션창이 닫힐 때까지 결제/변경 확인창을 기다리게 한다. */
  onReady?: () => void | Promise<void>
}

export function useCheckout() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)
  const [planChange, setPlanChange] = useState<PlanChangePreview | null>(null)
  const busyRef = useRef(false)
  const mounted = useRef(true)
  const subscription = useRef<(() => void) | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      subscription.current?.()
      subscription.current = null
    }
  }, [])

  async function startCheckout({ kind, id, returnTo, onReady }: StartCheckoutOptions): Promise<void> {
    // 렌더 전에 들어오는 연속 클릭도 막는다. React state는 표시용이고 이 ref가 요청 잠금이다.
    if (busyRef.current || !mounted.current) return
    busyRef.current = true
    setBusy(true)
    subscription.current?.()
    subscription.current = null
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id }),
      })
      if (!mounted.current) return
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(returnTo || pathname || '/pricing')}`)
        return
      }
      const body = (await res.json().catch(() => ({}))) as {
        transactionId?: string
        error?: string
        planChange?: Omit<PlanChangePreview, 'targetPlanName'>
      }
      if (!mounted.current) return
      if (!res.ok || !body.transactionId) {
        if (body.planChange) {
          const name = PADDLE_PLANS.find((p) => p.id === body.planChange!.targetPlan)?.name ?? body.planChange.targetPlan
          await onReady?.()
          if (mounted.current) setPlanChange({ ...body.planChange, targetPlanName: name })
          return
        }
        const reason = body.error as CheckoutDenyReason | undefined
        toast.error(t(reason && reason in DENY_COPY ? DENY_COPY[reason] : 'Could not open checkout. Please try again.'))
        return
      }

      const transactionId = body.transactionId
      const before = (await fetchTakeBalance()).balance
      if (!mounted.current) return
      let requested = false
      let finished = false
      const finish = () => {
        finished = true
        subscription.current?.()
        subscription.current = null
      }
      // Initialize 자체가 _ptxn 결제를 열 수 있으므로 초기화 전에 구독한다. 다른 거래의 완료는 받지 않는다.
      subscription.current = subscribePaddleEvents((event) => {
        if (finished || !mounted.current) return
        const eventTransactionId = event.data?.transaction_id
        if (eventTransactionId && eventTransactionId !== transactionId) return
        if (event.name === 'checkout.completed' && eventTransactionId === transactionId) {
          finish()
          void confirmAfterCheckout(t, before)
        } else if (event.name === 'checkout.closed' && (eventTransactionId === transactionId || requested)) {
          finish()
        } else if ((event.name === 'checkout.error' || event.name === 'checkout.failed') && (eventTransactionId === transactionId || requested)) {
          finish()
          toast.error(t('Could not open checkout. Please try again.'))
        }
      })
      const paddle = await loadPaddle()
      if (!paddle) throw new Error('Paddle unavailable')
      if (!mounted.current || finished) return
      await onReady?.()
      if (!mounted.current || finished) return
      requested = true
      paddle.Checkout.open({ transactionId })
    } catch {
      subscription.current?.()
      subscription.current = null
      if (mounted.current) toast.error(t('Could not open checkout. Please try again.'))
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return { busy, startCheckout, planChange, setPlanChange }
}
