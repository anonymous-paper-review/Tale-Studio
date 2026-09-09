'use client'

// Pricing (#payments-phase-3 P4, 2026-09-07) — v4 가격표를 실물로 게시한다. 숫자는 src/lib/billing/catalog.ts
//   (v4 시트 사본)만 읽는다. 결제 버튼은 서버가 운영 구매를 열고 가격 ID 가 있을 때만 살아난다.
//   구매가 닫혀 있어도 공개 요금제와 옵션 비교는 그대로 유지한다.
//   2026-09-08 오너: 한국어도 보이게 — 문구는 전부 t() 를 타고(사전 messages-ko.ts), 헤더에 언어 토글. metadata 는 layout.tsx.

import { Clapperboard, Download, Layers, Users } from 'lucide-react'
import { ContactPopover } from '@/components/contact-popover'
import { PricingFamilies } from '@/components/billing/pricing-families'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { useT } from '@/lib/i18n'
import { TAKE_COEFFICIENT_NOTES } from '@/lib/billing/catalog'

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

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="max-w-2xl text-sm font-light leading-relaxed text-gray-400">{body}</p>
    </div>
  )
}

export function PricingPageContent({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  const t = useT()

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

        {!checkoutEnabled && (
          <div className="mb-16 rounded-xl border border-border bg-muted/30 px-5 py-4 text-center text-sm text-foreground" role="status">
            <p className="font-medium">{t('Payments are being prepared')}</p>
            <p className="mt-1 text-muted-foreground">{t('You can browse plans and Take packs. Purchases are not open yet.')}</p>
          </div>
        )}

        <section className="mb-20" aria-label={t('Choose a plan or Take pack')}>
          <PricingFamilies checkoutEnabled={checkoutEnabled} />
        </section>

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
