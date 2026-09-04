import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

// Pricing (#landing-v2 2026-08-03) — 베타 기간 무료를 정직하게. 유료 플랜은 준비 중 카드로
//   자리만 잡는다(가격 확정 시 여기만 수정).

export const metadata: Metadata = {
  title: 'Pricing · Tale Studio',
  description: 'All Tale Studio features are free to use during the beta.',
}

const FREE_FEATURES = [
  'Full access to the 5-stage AI production team',
  'Rough storyboards, concept art, and live-action previz generation',
  'Video generation with per-shot take management',
  'Unlimited read-only share links',
  'Publish to the Playground',
]

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-32">
        <div className="mb-14 text-center">
          <h1 className="mb-3 text-4xl font-semibold tracking-tighter md:text-5xl">Pricing</h1>
          <p className="text-base font-light text-gray-400">
            All features are free during the beta.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Beta (현재) */}
          <div
            // eslint-disable-next-line no-restricted-syntax -- 글로우·하이라이트 원값 보존(픽셀 불변). 토큰화는 티켓 glow-token-cleanup(#accent-glow-tokenize)
            className="rounded-3xl border border-primary/50 bg-white/[0.04] p-8 shadow-[0_0_60px_rgba(229,9,20,0.08)]">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-xl font-semibold">Beta</h2>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                Currently available
              </span>
            </div>
            <p className="mb-6 text-sm text-gray-400">For every creator signing up now</p>
            <p className="mb-8">
              <span className="text-5xl font-semibold tracking-tight">₩0</span>
              <span className="ml-2 text-sm text-gray-500">/ during beta</span>
            </p>
            <ul className="mb-8 space-y-3 text-sm text-gray-300">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="block rounded-full bg-primary py-3.5 text-center font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start for free
            </Link>
          </div>

          {/* Pro (준비 중) */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 opacity-70">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-xl font-semibold">Pro</h2>
              <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] font-medium text-gray-400">
                Coming soon
              </span>
            </div>
            <p className="mb-6 text-sm text-gray-400">For teams that need more generation volume</p>
            <p className="mb-8">
              <span className="text-5xl font-semibold tracking-tight text-gray-500">-</span>
            </p>
            <p className="text-sm leading-relaxed text-gray-500">
              Usage-based plans will launch when the beta ends. Beta participants
              will be the first to hear about transition perks.
            </p>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-gray-600">
          Fair-use limits may apply to generation volume during the beta.
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
