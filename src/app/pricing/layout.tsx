import type { Metadata } from 'next'

// /pricing 은 사전(useT)을 타는 클라이언트 페이지라 metadata 는 여기서 낸다 (2026-09-08).
export const metadata: Metadata = {
  title: 'Pricing · Tale Studio',
  description: 'Starter and Producer plans, Take packs, and Studio contracts for AI pre-production.',
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
