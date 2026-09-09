import type { Metadata } from 'next'
import { Film } from 'lucide-react'
import { LocaleToggle } from '@/components/marketing/locale-toggle'
import { PaymentLinkCheckout } from '@/components/billing/payment-link-checkout'
import { isCheckoutEnabled } from '@/lib/billing/checkout-availability'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Checkout | Tale Studio',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  // Paddle validates the transaction. Keep its URL untouched for payment-method update links too.
  const hasPaymentLink = typeof query._ptxn === 'string' && query._ptxn.trim().length > 0

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <a href="/pricing" className="flex min-h-12 items-center gap-2 font-semibold">
          <Film className="size-6 text-primary" aria-hidden="true" />
          Tale Studio
        </a>
        <LocaleToggle />
      </header>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <PaymentLinkCheckout hasPaymentLink={hasPaymentLink} checkoutEnabled={isCheckoutEnabled()} />
      </div>
    </main>
  )
}
