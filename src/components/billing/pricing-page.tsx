'use client'

// Pricing (#payments-phase-3 P4, 2026-09-07) — v4 가격표를 실물로 게시한다. 숫자는 src/lib/billing/catalog.ts
//   (v4 시트 사본)만 읽는다. 결제 버튼은 서버가 운영 구매를 열고 가격 ID 가 있을 때만 살아난다.
//   구매가 닫혀 있어도 공개 요금제와 옵션 비교는 그대로 유지한다.
//   2026-09-08 오너: 한국어도 보이게 — 문구는 전부 t() 를 타고(사전 messages-ko.ts), 헤더에 언어 토글. metadata 는 layout.tsx.

import { Clapperboard, Download, Layers, ShieldCheck, Users } from 'lucide-react'
import { ContactPopover } from '@/components/contact-popover'
import { PricingFamilies } from '@/components/billing/pricing-families'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { useLocale, useT } from '@/lib/i18n'
import { pricingSurface } from '@/lib/billing/pricing-selection'
import { readPortOneBillingChannelKey, readPortOnePublicConfig } from '@/lib/billing/portone-public'
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

// 2026-11-25 오너: 모든 요금제에 들어 있는 제작 흐름(사실 확인 — Producer·Writer 채팅 Lumi 가 이야기를 만들고,
//   Writer 가 씬·샷으로 나누고 샷마다 러프 콘티 3장을 그리며, Director 가 실사 스토리보드 스틸을 만든다. 이미지는 Take 를 쓰지 않는다).
const INCLUDED_STEPS = [
  { n: '1', title: 'Make the story with Lumi', body: 'Talk it through with Lumi to settle the story, characters, and settings.' },
  { n: '2', title: 'Break it down', body: 'Lumi splits the story into scenes and shots, with dialogue for each character.' },
  { n: '3', title: 'Rough sketches', body: 'Each shot gets a three-frame rough sketch: start, action, end.' },
  { n: '4', title: 'Storyboard stills', body: 'Turn each shot into a finished still that uses your character sheets and backgrounds.' },
]

function SectionHeading({ eyebrow, title, body }: { eyebrow?: string; title: string; body: string }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 text-label font-bold text-muted-foreground">{eyebrow}</p>}
      <h2 className="mb-2 text-3xl font-bold tracking-tight">{title}</h2>
      <p className="max-w-2xl text-body leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

/** 맨 위 안내: 원화 화면은 작은 알약 "Take 팩은 바로 살 수 있어요", 닫힌 달러 화면은 종전 "결제 준비 중" 상자. */
function PricingBanner({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  const t = useT()
  const locale = useLocale()
  const surface = pricingSurface({
    locale,
    checkoutEnabled,
    koreanCardReady: readPortOnePublicConfig() !== null,
    koreanSubscriptionReady: readPortOneBillingChannelKey() !== null,
  })
  if (surface.banner === 'korean-card') {
    return (
      <div className="mb-12 flex justify-center" role="status">
        <p className="inline-flex items-center gap-2 rounded-full bg-chip px-4 py-2 text-label text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          {t(surface.koreanSubscriptionReady ? 'Pay by Korean card' : 'Take packs can be bought now with a Korean card. Subscriptions open soon.')}
        </p>
      </div>
    )
  }
  if (surface.banner !== 'preparing') return null
  return (
    <div className="mb-12 flex justify-center" role="status">
      <p className="inline-flex flex-wrap items-center justify-center gap-x-2 rounded-full bg-chip px-4 py-2 text-label text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
        <span className="font-semibold text-foreground">{t('Payments are being prepared')}</span>
        <span>{t('You can browse plans and Take packs. Purchases are not open yet.')}</span>
      </p>
    </div>
  )
}

export function PricingPageContent({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  const t = useT()

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <SiteHeader showLocale />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20 pt-32">
        <div className="mb-8 text-center">
          <p className="mb-2 text-label font-bold text-muted-foreground">{t('Pricing')}</p>
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">{t('Pay for what you plan and the Takes you spend')}</h1>
          <p className="text-body text-muted-foreground">
            {t('Images are always free. Storyboards, concept art, and character sheets never spend Takes.')}
          </p>
        </div>

        <PricingBanner checkoutEnabled={checkoutEnabled} />

        <section className="mb-20" aria-label={t('Choose a plan or Take pack')}>
          <PricingFamilies checkoutEnabled={checkoutEnabled} />
        </section>

        <section className="mb-20" aria-labelledby="included-h">
          <div className="rounded-3xl bg-panel p-8">
            <p className="mb-2 text-label font-bold text-muted-foreground">{t('Included in every plan')}</p>
            <h2 id="included-h" className="mb-2 text-3xl font-bold tracking-tight">{t('From story to storyboard with Lumi')}</h2>
            <p className="mb-8 max-w-2xl text-body leading-relaxed text-muted-foreground">
              {t('Before you spend a single Take, see the whole film on paper. Images never spend Takes.')}
            </p>
            <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {INCLUDED_STEPS.map((step) => (
                <li key={step.n} className="rounded-2xl bg-card p-5">
                  <span className="font-num text-label font-bold text-muted-foreground">{step.n}</span>
                  <h3 className="mb-1.5 mt-2 text-body font-semibold">{t(step.title)}</h3>
                  <p className="text-label leading-relaxed text-muted-foreground">{t(step.body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mb-20">
          <SectionHeading
            title={t('Four things a plan gives you')}
            body={t('Every plan is measured on the same four axes. Higher plans do not unlock features. They give you more room.')}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {AXES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-3xl bg-panel p-6">
                <Icon className="mb-3 size-5 text-foreground" />
                <h3 className="mb-1.5 text-body font-semibold">{t(title)}</h3>
                <p className="text-label leading-relaxed text-muted-foreground">{t(body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <div className="flex flex-col items-start gap-6 rounded-3xl bg-panel p-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="mb-2 text-3xl font-bold tracking-tight">{t('Studio')}</h2>
              <p className="max-w-xl text-body leading-relaxed text-muted-foreground">
                {t(
                  'More than 4 linked projects or 8 accounts? Studio plans are annual contracts with a shared Take pool, invoicing, and dedicated support. Studio S starts at 10 accounts and 30,000 Takes a year.',
                )}
              </p>
              <p className="mt-4 flex max-w-xl items-start gap-2 text-sm leading-relaxed text-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{t('Projects, prompts, and generated content created in Studio are not used to train AI models.')}</span>
              </p>
            </div>
            <ContactPopover
              side="top"
              align="end"
              trigger={
                <button
                  type="button"
                  className="inline-flex h-12 shrink-0 items-center rounded-full bg-chip px-6 text-body font-bold transition-colors hover:bg-card"
                >
                  {t('Contact us')}
                </button>
              }
            />
          </div>
        </section>

        <section className="rounded-3xl bg-panel p-8">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">{t('What is a Take?')}</h2>
          <div className="grid grid-cols-1 gap-8 text-body leading-relaxed text-muted-foreground md:grid-cols-2">
            <div>
              <p className="mb-3">
                {t(
                  'One Take is one 720p video generation. Regenerating a shot, rendering at 1080p, or using a premium model spends more. You always see the cost before you generate.',
                )}
              </p>
              <ul className="space-y-1.5">
                {TAKE_COEFFICIENT_NOTES.map(({ model, takes }) => (
                  <li key={model} className="flex justify-between border-b border-border pb-1.5">
                    <span>{model}</span>
                    <span className="text-foreground">{takes === 1 ? t('1 Take') : t('{n} Takes', { n: takes })}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <p>
                <span className="text-foreground">{t('Images are free.')}</span>{' '}
                {t('Storyboards, concept art, and character sheets never spend Takes on any plan.')}
              </p>
              <p>
                <span className="text-foreground">{t('Plan Takes reset each billing period.')}</span>{' '}
                {t('Unused plan Takes expire when the billing period ends. Pack Takes are valid for 12 months.')}
              </p>
              <p>
                <span className="text-foreground">{t('Spent in order.')}</span>{' '}
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
