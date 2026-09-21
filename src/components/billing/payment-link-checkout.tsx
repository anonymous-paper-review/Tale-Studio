'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { startPaymentLinkCheckout, type PaymentLinkCheckoutState } from '@/lib/billing/payment-link-checkout'

const STATUS_COPY: Record<PaymentLinkCheckoutState, { title: string; description: string }> = {
  preparing: {
    title: 'Payments are being prepared',
    description: 'You can browse plans and Take packs. Purchases are not open yet.',
  },
  missing: {
    title: 'No payment link found',
    description: 'Choose a plan or Take pack from pricing to start checkout.',
  },
  opening: {
    title: 'Opening checkout…',
    description: 'Loading your existing payment link with Paddle.',
  },
  open: {
    title: 'Continue in the Paddle checkout',
    description: 'Use the secure checkout window to complete your payment or update your payment method.',
  },
  closed: {
    title: 'Checkout closed',
    description: 'You can reopen the same payment link or return to pricing.',
  },
  error: {
    title: 'Could not load checkout',
    description: 'The payment link or connection may be unavailable. Try again or return to pricing.',
  },
  completed: {
    title: 'Checkout finished',
    description: 'Check your account for the latest payment and balance status.',
  },
}

export function PaymentLinkCheckoutView({ state, onRetry }: { state: PaymentLinkCheckoutState; onRetry: () => void }) {
  const t = useT()
  const copy = STATUS_COPY[state]
  const Icon = state === 'opening' ? Loader2 : state === 'error' ? AlertCircle : state === 'completed' ? CheckCircle2 : CreditCard

  return (
    <section className="flex w-full max-w-md flex-col gap-6 rounded-xl border border-border bg-card p-6" aria-labelledby="checkout-heading" aria-busy={state === 'opening'}>
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <Icon aria-hidden="true" className={`size-8 ${state === 'opening' ? 'animate-spin text-muted-foreground motion-reduce:animate-none' : state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} />
        <h1 id="checkout-heading" className="text-2xl font-semibold tracking-tight">{t(copy.title)}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t(copy.description)}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild className="min-h-12">
          {/* A full navigation also releases the payment link's SDK and overlay. */}
          <a href="/pricing">{t('Back to pricing')}</a>
        </Button>
        {(state === 'closed' || state === 'error') && (
          <Button type="button" onClick={onRetry} className="min-h-12">{t('Try again')}</Button>
        )}
        {state === 'completed' && (
          <Button asChild className="min-h-12"><a href="/account">{t('View account')}</a></Button>
        )}
      </div>
    </section>
  )
}

export function PaymentLinkCheckout({ hasPaymentLink, checkoutEnabled }: { hasPaymentLink: boolean; checkoutEnabled: boolean }) {
  const [state, setState] = useState<PaymentLinkCheckoutState>(!checkoutEnabled ? 'preparing' : hasPaymentLink ? 'opening' : 'missing')
  useEffect(() => startPaymentLinkCheckout(hasPaymentLink, setState, checkoutEnabled), [hasPaymentLink, checkoutEnabled])

  // Preserve every Paddle parameter and reset a failed SDK load without creating another transaction.
  return <PaymentLinkCheckoutView state={checkoutEnabled ? state : 'preparing'} onRetry={() => window.location.reload()} />
}
