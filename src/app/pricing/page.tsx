import type { Metadata } from 'next'
import { Check, Clapperboard, Download, Layers, Users, X } from 'lucide-react'
import { ContactPopover } from '@/components/contact-popover'
import { CheckoutButton } from '@/components/billing/checkout-button'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import {
  PADDLE_PLANS,
  PADDLE_TAKE_PACKS,
  TAKE_COEFFICIENT_NOTES,
  isPurchasable,
  type PaddlePlan,
  type PaddleTakePack,
} from '@/lib/billing/catalog'

// Pricing (#payments-phase-3 P4, 2026-09-07) — v4 가격표를 실물로 게시한다. 숫자는 src/lib/billing/catalog.ts
//   (v4 시트 사본)만 읽는다. 결제 버튼은 Paddle 가격 ID 가 있을 때만 살아나고(P7), 그 전엔 "Coming soon".
//   베타 무료 안내는 상단 배너로 남긴다 — 라이브 전환(P9 심사) 때 배너만 떼면 된다.

export const metadata: Metadata = {
  title: 'Pricing · Tale Studio',
  description: 'Starter and Production plans, Take packs, and Studio contracts for AI pre-production.',
}

const AXES = [
  {
    icon: Clapperboard,
    title: 'Minutes per project',
    body: 'Video minutes your plan covers per project. First-pass 720p generation is included.',
  },
  {
    icon: Layers,
    title: 'Linked projects',
    body: 'Projects you can hold at once and cut into a single result.',
  },
  {
    icon: Users,
    title: 'Takes per month',
    body: 'Regenerations, 1080p, and premium models spend Takes. Images never do.',
  },
  {
    icon: Download,
    title: 'Export',
    body: 'Take previz data and AX agent settings out of Tale. Final video exports on every plan.',
  },
]

function usd(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}

function PlanCard({ plan, highlight }: { plan: PaddlePlan; highlight?: boolean }) {
  const e = plan.entitlements
  const purchasable = isPurchasable(plan)
  const rows = [
    `${e.maxMinutesPerProject} min per project`,
    `${e.maxLinkedProjects} linked ${e.maxLinkedProjects === 1 ? 'project' : 'projects'}`,
    `${e.includedTakesPerMonth} Takes per month`,
    `${e.accountSeats} ${e.accountSeats === 1 ? 'account' : 'accounts'}`,
  ]
  return (
    <div
      className={
        highlight
          ? 'flex flex-col rounded-3xl border border-primary/50 bg-white/[0.04] p-6'
          : 'flex flex-col rounded-3xl border border-white/10 bg-white/[0.02] p-6'
      }
    >
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        {highlight && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            Best value
          </span>
        )}
      </div>
      <p className="mb-5">
        <span className="text-3xl font-semibold tracking-tight">{usd(plan.monthlyPriceUsd)}</span>
        <span className="ml-1.5 text-xs text-gray-500">/ month</span>
      </p>
      <ul className="mb-6 flex-1 space-y-2 text-sm text-gray-300">
        {rows.map((row) => (
          <li key={row} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            {row}
          </li>
        ))}
        <li className="flex items-start gap-2">
          {e.canExport ? (
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
          ) : (
            <X className="mt-0.5 size-4 shrink-0 text-gray-600" />
          )}
          <span className={e.canExport ? undefined : 'text-gray-500'}>Export previz data</span>
        </li>
      </ul>
      {purchasable ? (
        <CheckoutButton
          kind="plan"
          id={plan.id}
          className="block w-full rounded-full bg-primary py-3 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Subscribe
        </CheckoutButton>
      ) : (
        <button
          type="button"
          disabled
          className="block w-full cursor-not-allowed rounded-full border border-white/15 py-3 text-center text-sm font-medium text-gray-500"
        >
          Coming soon
        </button>
      )}
    </div>
  )
}

function PackCard({ pack }: { pack: PaddleTakePack }) {
  const purchasable = isPurchasable(pack)
  const perTake = pack.priceUsd / pack.takes
  return (
    <div className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <h3 className="mb-1 text-lg font-semibold">{pack.name}</h3>
      <p className="mb-1">
        <span className="text-3xl font-semibold tracking-tight">{usd(pack.priceUsd)}</span>
      </p>
      <p className="mb-5 text-sm text-gray-400">
        {`${pack.takes.toLocaleString('en-US')} Takes · $${perTake.toFixed(2)} per Take`}
      </p>
      <p className="mb-6 flex-1 text-xs text-gray-500">Valid for 12 months from purchase.</p>
      {purchasable ? (
        <CheckoutButton
          kind="pack"
          id={pack.id}
          className="block w-full rounded-full bg-primary py-3 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Buy Takes
        </CheckoutButton>
      ) : (
        <button
          type="button"
          disabled
          className="block w-full cursor-not-allowed rounded-full border border-white/15 py-3 text-center text-sm font-medium text-gray-500"
        >
          Coming soon
        </button>
      )}
    </div>
  )
}

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="max-w-2xl text-sm font-light leading-relaxed text-gray-400">{body}</p>
    </div>
  )
}

export default function PricingPage() {
  const starter = PADDLE_PLANS.filter((p) => p.tier === 'starter')
  const production = PADDLE_PLANS.filter((p) => p.tier === 'production')

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20 pt-32">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-4xl font-semibold tracking-tighter md:text-5xl">Pricing</h1>
          <p className="text-base font-light text-gray-400">
            Pay for the minutes you plan and the Takes you spend. Images are always free.
          </p>
        </div>

        <div className="mb-16 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 text-center text-sm text-gray-200">
          <span className="font-semibold text-primary">Beta</span> · Everything is free until launch.
          The plans below go live when the beta ends. Beta participants hear first.
        </div>

        <section className="mb-20">
          <SectionHeading
            title="Four things a plan gives you"
            body="Every plan is measured on the same four axes. Higher plans do not unlock features. They give you more room."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {AXES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <Icon className="mb-3 size-5 text-primary" />
                <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
                <p className="text-xs leading-relaxed text-gray-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <SectionHeading
            title="Starter"
            body="For one person and one project at a time. The full production team, all five stages, all models. Previz data stays inside Tale."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {starter.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>

        <section className="mb-20">
          <SectionHeading
            title="Production"
            body="For teams running several projects side by side. More linked projects, more accounts, and Export for the edit suite and client delivery."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5">
            {production.map((plan) => (
              <PlanCard key={plan.id} plan={plan} highlight={plan.id === 'p10'} />
            ))}
          </div>
        </section>

        <section className="mb-20">
          <SectionHeading
            title="Take packs"
            body="Ran out before the month did? Top up. Pack Takes are spent after your plan Takes and never expire mid-year."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {PADDLE_TAKE_PACKS.map((pack) => (
              <PackCard key={pack.id} pack={pack} />
            ))}
          </div>
        </section>

        <section className="mb-20">
          <div className="flex flex-col items-start gap-6 rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="mb-2 text-2xl font-semibold tracking-tight">Studio</h2>
              <p className="max-w-xl text-sm font-light leading-relaxed text-gray-400">
                More than 4 linked projects or 8 accounts? Studio plans are annual contracts with a shared Take pool,
                invoicing, and dedicated support. Studio S starts at 10 accounts and 30,000 Takes a year.
              </p>
            </div>
            <ContactPopover
              side="top"
              align="end"
              trigger={
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold transition-colors hover:border-white/40"
                >
                  Contact us
                </button>
              }
            />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
          <h2 className="mb-4 text-lg font-semibold">What is a Take?</h2>
          <div className="grid grid-cols-1 gap-8 text-sm leading-relaxed text-gray-400 md:grid-cols-2">
            <div>
              <p className="mb-3">
                One Take is one 720p video generation. Regenerating a shot, rendering at 1080p, or using a premium
                model spends more. You always see the cost before you generate.
              </p>
              <ul className="space-y-1.5">
                {TAKE_COEFFICIENT_NOTES.map(({ model, takes }) => (
                  <li key={model} className="flex justify-between border-b border-white/5 pb-1.5">
                    <span>{model}</span>
                    <span className="text-gray-200">
                      {takes} {takes === 1 ? 'Take' : 'Takes'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <p>
                <span className="text-gray-200">Images are free.</span> Storyboards, concept art, and character sheets
                never spend Takes on any plan.
              </p>
              <p>
                <span className="text-gray-200">Plan Takes reset monthly.</span> Unused plan Takes expire at the end of
                each billing month. Pack Takes are valid for 12 months.
              </p>
              <p>
                <span className="text-gray-200">Spent in order.</span> Free Takes first, then plan Takes, then pack Takes,
                so nothing you paid for expires before something that was free.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
