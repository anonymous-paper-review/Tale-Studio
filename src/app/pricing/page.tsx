import { PricingPageContent } from '@/components/billing/pricing-page'
import { isCheckoutEnabled } from '@/lib/billing/checkout-availability'

export const dynamic = 'force-dynamic'

export default function PricingPage() {
  return <PricingPageContent checkoutEnabled={isCheckoutEnabled()} />
}
