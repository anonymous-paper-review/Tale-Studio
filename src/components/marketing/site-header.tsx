'use client'

import Link from 'next/link'
import { TaleLockup } from '@/components/tale-lockup'
import { LocaleToggle } from '@/components/marketing/locale-toggle'
import { PRICING_PAGE_VISIBLE } from '@/lib/billing/pricing-visibility'
import { useT } from '@/lib/i18n'
import { useFirstVisitLocale } from '@/stores/locale-store'

/**
 * 공개(마케팅) 페이지 공용 헤더 (#landing-v2 2026-08-03) — 랜딩·Playground·Pricing·Docs.
 * 2026-11-24 오너 ④: 디자이너 랜딩 머리글 모양 — 로고 묶음, 회색 메뉴, KO/EN 알약, 크림 "시작하기" 알약. 밝게·어둡게 단추는 넣지 않는다.
 * 로그인 사용자가 "시작하기"를 누르면 middleware 가 /login → /projects 로 이어 보낸다.
 */
// showLocale: 사전을 타는 페이지(/pricing)만 언어 토글을 보인다. 영어 고정 페이지에 붙이면 토글해도 안 바뀌어 혼란.
export function SiteHeader({ showLocale = false }: { showLocale?: boolean } = {}) {
  const t = useT()
  useFirstVisitLocale()
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-8 px-6">
        <Link href="/" aria-label="Tale Studio" className="shrink-0">
          <TaleLockup size={30} />
        </Link>
        <nav className="ml-auto flex items-center gap-7 text-body font-medium">
          <Link href="/playground" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
            Playground
          </Link>
          {PRICING_PAGE_VISIBLE && (
            <Link href="/pricing" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
              {t('Pricing')}
            </Link>
          )}
          <Link href="/docs" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
            {t('Docs')}
          </Link>
        </nav>
        <div className="flex items-center gap-2.5">
          {showLocale && <LocaleToggle />}
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-label font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t('Get started')}
          </Link>
        </div>
      </div>
    </header>
  )
}
