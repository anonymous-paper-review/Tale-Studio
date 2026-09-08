'use client'

// 결제 버튼 (#payments-phase-3 P7·P8). 서버(/api/billing/checkout)가 판정하고 만든 거래 번호로만 Paddle 결제창을 연다.
//   로그인 안 했으면 로그인으로. 서버가 거절하면 이유를 토스트로. 결제가 끝나면(checkout.completed) 웹훅이 장부에 적을 때까지
//   "결제 확인 중"을 띄우고 잔액이 바뀌면 "N Take 가 들어왔어요"로 바꾼다(P8 최소). 90초가 지나도 안 바뀌면 계정 페이지로 안내.
//   Paddle.js 는 첫 클릭에 한 번만 초기화한다(모듈 캐시).

import { useState, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { useT } from '@/lib/i18n'
import { fetchTakeBalance } from '@/lib/billing/use-take-balance'
import { refetchBillingAccount } from '@/lib/billing/use-billing-account'
import type { CheckoutDenyReason, CheckoutKind } from '@/lib/billing/checkout'
import { cn } from '@/lib/utils'

let paddlePromise: Promise<Paddle | undefined> | null = null

function loadPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    const environment = process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox'
    paddlePromise = token
      ? initializePaddle({ token, environment, checkout: { settings: { displayMode: 'overlay', theme: 'dark' } } })
      : Promise.resolve(undefined)
  }
  return paddlePromise
}

// 라벨은 영어 원문 = i18n 사전 키.
const DENY_COPY: Record<CheckoutDenyReason, string> = {
  unknown_item: 'That product is not available.',
  not_purchasable: 'Payments for this product open soon.',
  free_pack_limit: 'Free plans can buy one pack. Subscribe to keep topping up.',
  already_subscribed: 'You already have a subscription. Plan changes are coming soon.',
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

export function CheckoutButton({
  kind,
  id,
  children,
  className,
  disabled,
}: {
  kind: CheckoutKind
  id: string
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)

  const open = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id }),
      })
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname || '/pricing')}`)
        return
      }
      const body = (await res.json().catch(() => ({}))) as { transactionId?: string; error?: string }
      if (!res.ok || !body.transactionId) {
        const reason = body.error as CheckoutDenyReason | undefined
        toast.error(t(reason && reason in DENY_COPY ? DENY_COPY[reason] : 'Could not open checkout. Please try again.'))
        return
      }
      const paddle = await loadPaddle()
      if (!paddle) {
        toast.error(t('Could not open checkout. Please try again.'))
        return
      }
      const before = (await fetchTakeBalance()).balance
      paddle.Update({
        eventCallback: (event) => {
          if (event.name === 'checkout.completed') {
            void confirmAfterCheckout(t, before)
          }
        },
      })
      paddle.Checkout.open({ transactionId: body.transactionId })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={() => void open()} disabled={disabled || busy} className={cn(className, busy && 'opacity-70')}>
      {children}
    </button>
  )
}
