'use client'

import Link from 'next/link'
import { TaleLockup } from '@/components/tale-lockup'
import { LocaleToggle } from '@/components/marketing/locale-toggle'
import { PRICING_PAGE_VISIBLE } from '@/lib/billing/pricing-visibility'
import { useT } from '@/lib/i18n'
import { useFirstVisitLocale } from '@/components/marketing/use-first-visit-locale'

/**
 * 공개(마케팅) 페이지 공용 헤더 (#landing-v2 2026-08-03) — 랜딩·Playground·Pricing·Docs.
 * 2026-11-25 오너: 문서(Docs)는 머리글에서 빼고 바닥글에만 둔다.
 * 2026-11-25 오너 "첫 화면 메뉴로 통일": 메뉴는 첫 화면과 같은 Tale 서비스 · 작품 · 요금, 폭 1200px, 로고 크기도 맞춘다. Playground 는 바닥글에만.
 * 2026-11-24 오너 ④: 디자이너 랜딩 머리글 모양 — 로고 묶음, 회색 메뉴, KO/EN 알약, 크림 "시작하기" 알약. 밝게·어둡게 단추는 넣지 않는다.
 * 로그인 사용자가 "시작하기"를 누르면 middleware 가 /login → /projects 로 이어 보낸다.
 */
// showLocale: 사전을 타는 페이지(/pricing)만 언어 토글을 보인다. 영어 고정 페이지에 붙이면 토글해도 안 바뀌어 혼란.
export function SiteHeader({ showLocale = false }: { showLocale?: boolean } = {}) {
  const t = useT()
  useFirstVisitLocale()
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
      <div className="mx-auto flex h-18 max-w-[1200px] items-center gap-8 px-6">
        <Link href="/" aria-label="Tale Studio" className="shrink-0 pt-1">
          <TaleLockup size={34} />
        </Link>
        <nav className="ml-auto flex items-center gap-7 text-[15px] font-medium">
          <Link href="/landing/index.html#service" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
            {t('Product')}
          </Link>
          <Link href="/landing/index.html#works" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
            {t('Showcase')}
          </Link>
          {PRICING_PAGE_VISIBLE && (
            <Link href="/pricing" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
              {t('Pricing')}
            </Link>
          )}
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
