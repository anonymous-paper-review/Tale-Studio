'use client'

// Pricing (#payments-phase-3 P4, 2026-09-07) — v4 가격표를 실물로 게시한다. 숫자는 src/lib/billing/catalog.ts
//   (v4 시트 사본)만 읽는다. 결제 버튼은 Paddle 가격 ID 가 있을 때만 살아난다(P7 CheckoutButton — 서버 판정 뒤 Paddle 결제창).
//   없으면 "Coming soon". 베타 무료 배너는 2026-09-08 라이브 상품 등록과 함께 뗐다(오너 지시).
//   2026-09-08 오너: 한국어도 보이게 — 문구는 전부 t() 를 타고(사전 messages-ko.ts), 헤더에 언어 토글. metadata 는 layout.tsx.

import { Check, Clapperboard, Download, Layers, Users, X } from 'lucide-react'
import { ContactPopover } from '@/components/contact-popover'
import { CheckoutButton } from '@/components/billing/checkout-button'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { useT } from '@/lib/i18n'
import {
  PADDLE_PLANS,
  PADDLE_TAKE_PACKS,
  TAKE_COEFFICIENT_NOTES,
  isPurchasable,
  type PaddlePlan,
  type PaddleTakePack,
} from '@/lib/billing/catalog'

// 라벨은 영어 원문 = i18n 사전 키 (#i18n-s5).
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

const primaryButtonClass =
  'block w-full rounded-full bg-primary py-3 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90'
const disabledButtonClass =
  'block w-full cursor-not-allowed rounded-full border border-white/15 py-3 text-center text-sm font-medium text-gray-500'

function PlanCard({ plan, highlight }: { plan: PaddlePlan; highlight?: boolean }) {
  const t = useT()
  const e = plan.entitlements
  const purchasable = isPurchasable(plan)
  const rows = [
    t('{n} min per project', { n: e.maxMinutesPerProject }),
    e.maxLinkedProjects === 1 ? t('1 linked project') : t('{n} linked projects', { n: e.maxLinkedProjects }),
    t('{n} Takes per month', { n: e.includedTakesPerMonth }),
    e.accountSeats === 1 ? t('1 account') : t('{n} accounts', { n: e.accountSeats }),
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
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">{t('Best value')}</span>
        )}
      </div>
      <p className="mb-5">
        <span className="text-3xl font-semibold tracking-tight">{usd(plan.monthlyPriceUsd)}</span>
        <span className="ml-1.5 text-xs text-gray-500">{t('/ month')}</span>
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
          <span className={e.canExport ? undefined : 'text-gray-500'}>{t('Export previz data')}</span>
        </li>
      </ul>
      {purchasable ? (
        <CheckoutButton kind="plan" id={plan.id} className={primaryButtonClass}>
          {t('Subscribe')}
        </CheckoutButton>
      ) : (
        <button type="button" disabled className={disabledButtonClass}>
          {t('Coming soon')}
        </button>
      )}
    </div>
  )
}

function PackCard({ pack }: { pack: PaddleTakePack }) {
  const t = useT()
  const purchasable = isPurchasable(pack)
  const perTake = pack.priceUsd / pack.takes
  return (
    <div className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <h3 className="mb-1 text-lg font-semibold">{pack.name}</h3>
      <p className="mb-1">
        <span className="text-3xl font-semibold tracking-tight">{usd(pack.priceUsd)}</span>
      </p>
      <p className="mb-5 text-sm text-gray-400">
        {t('{n} Takes · {price} per Take', { n: pack.takes.toLocaleString('en-US'), price: `$${perTake.toFixed(2)}` })}
      </p>
      <p className="mb-6 flex-1 text-xs text-gray-500">{t('Valid for 12 months from purchase.')}</p>
      {purchasable ? (
        <CheckoutButton kind="pack" id={pack.id} className={primaryButtonClass}>
          {t('Buy Takes')}
        </CheckoutButton>
      ) : (
        <button type="button" disabled className={disabledButtonClass}>
          {t('Coming soon')}
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
  const t = useT()
  const starter = PADDLE_PLANS.filter((p) => p.tier === 'starter')
  const production = PADDLE_PLANS.filter((p) => p.tier === 'production')

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <SiteHeader showLocale />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20 pt-32">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-4xl font-semibold tracking-tighter md:text-5xl">{t('Pricing')}</h1>
          <p className="text-base font-light text-gray-400">
            {t('Pay for the minutes you plan and the Takes you spend. Images are always free.')}
          </p>
        </div>

        {/* 결제 준비 중 안내 — Paddle 도메인 승인이 나기 전에는 결제창이 안 열린다(거래 생성 단계에서 막힘).
            승인되면 이 블록만 지우면 된다. 2026-09-08. */}
        <div className="mb-16 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 text-center text-sm text-gray-200">
          {t('Payments are being set up. Buttons open soon.')}
        </div>

        <section className="mb-20">
          <SectionHeading
            title={t('Four things a plan gives you')}
            body={t('Every plan is measured on the same four axes. Higher plans do not unlock features. They give you more room.')}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {AXES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <Icon className="mb-3 size-5 text-primary" />
                <h3 className="mb-1.5 text-sm font-semibold">{t(title)}</h3>
                <p className="text-xs leading-relaxed text-gray-400">{t(body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <SectionHeading
            title={t('Starter')}
            body={t('For one person and one project at a time. The full production team, all five stages, all models. Previz data stays inside Tale.')}
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {starter.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>

        <section className="mb-20">
          <SectionHeading
            title={t('Production')}
            body={t('For teams running several projects side by side. More linked projects, more accounts, and Export for the edit suite and client delivery.')}
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5">
            {production.map((plan) => (
              <PlanCard key={plan.id} plan={plan} highlight={plan.id === 'p10'} />
            ))}
          </div>
        </section>

        <section className="mb-20">
          <SectionHeading
            title={t('Take packs')}
            body={t('Ran out before the month did? Top up. Pack Takes are spent after your plan Takes and never expire mid-year.')}
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
              <h2 className="mb-2 text-2xl font-semibold tracking-tight">{t('Studio')}</h2>
              <p className="max-w-xl text-sm font-light leading-relaxed text-gray-400">
                {t(
                  'More than 4 linked projects or 8 accounts? Studio plans are annual contracts with a shared Take pool, invoicing, and dedicated support. Studio S starts at 10 accounts and 30,000 Takes a year.',
                )}
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
                  {t('Contact us')}
                </button>
              }
            />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
          <h2 className="mb-4 text-lg font-semibold">{t('What is a Take?')}</h2>
          <div className="grid grid-cols-1 gap-8 text-sm leading-relaxed text-gray-400 md:grid-cols-2">
            <div>
              <p className="mb-3">
                {t(
                  'One Take is one 720p video generation. Regenerating a shot, rendering at 1080p, or using a premium model spends more. You always see the cost before you generate.',
                )}
              </p>
              <ul className="space-y-1.5">
                {TAKE_COEFFICIENT_NOTES.map(({ model, takes }) => (
                  <li key={model} className="flex justify-between border-b border-white/5 pb-1.5">
                    <span>{model}</span>
                    <span className="text-gray-200">{takes === 1 ? t('1 Take') : t('{n} Takes', { n: takes })}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <p>
                <span className="text-gray-200">{t('Images are free.')}</span>{' '}
                {t('Storyboards, concept art, and character sheets never spend Takes on any plan.')}
              </p>
              <p>
                <span className="text-gray-200">{t('Plan Takes reset each billing period.')}</span>{' '}
                {t('Unused plan Takes expire when the billing period ends. Pack Takes are valid for 12 months.')}
              </p>
              <p>
                <span className="text-gray-200">{t('Spent in order.')}</span>{' '}
                {t('Free Takes first, then plan Takes, then pack Takes, so nothing you paid for expires before something that was free.')}
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
