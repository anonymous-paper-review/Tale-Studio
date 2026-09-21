'use client'

import { loadPaddle, subscribePaddleEvents } from '@/lib/billing/paddle-client'

export type PaymentLinkCheckoutState = 'preparing' | 'missing' | 'opening' | 'open' | 'closed' | 'error' | 'completed'

/** Paddle.js owns the link and opens its existing transaction, including payment-method updates. */
export function startPaymentLinkCheckout(
  hasPaymentLink: boolean,
  onStateChange: (state: PaymentLinkCheckoutState) => void,
  checkoutEnabled = true,
): () => void {
  if (!checkoutEnabled) {
    onStateChange('preparing')
    return () => {}
  }
  if (!hasPaymentLink) {
    onStateChange('missing')
    return () => {}
  }

  let active = true
  let state: PaymentLinkCheckoutState = 'opening'
  onStateChange(state)
  const timeout = setTimeout(() => update('error'), 15_000)

  function update(next: PaymentLinkCheckoutState) {
    if (!active || state === 'completed') return
    clearTimeout(timeout)
    state = next
    onStateChange(next)
  }

  // Subscribe before initialization so the automatic checkout's first event is not lost.
  const unsubscribe = subscribePaddleEvents((event) => {
    switch (event.name) {
      case 'checkout.loaded': update('open'); break
      case 'checkout.closed': update('closed'); break
      case 'checkout.completed': update('completed'); break
      case 'checkout.error':
      case 'checkout.failed': update('error'); break
    }
  })

  try {
    void loadPaddle().then((paddle) => {
      if (!paddle && state === 'opening') update('error')
    }).catch(() => {
      if (state === 'opening') update('error')
    })
  } catch {
    update('error')
  }

  // Do not close the shared checkout on React's development effect cleanup.
  return () => {
    active = false
    clearTimeout(timeout)
    unsubscribe()
  }
}
