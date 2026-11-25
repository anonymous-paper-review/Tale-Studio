'use client'

import Link from 'next/link'
import { TaleLockup } from '@/components/tale-lockup'
import { ContactPopover } from '@/components/contact-popover'
import { LegalFooter } from '@/components/legal/legal-footer'
import { PRICING_PAGE_VISIBLE } from '@/lib/billing/pricing-visibility'
import { useT } from '@/lib/i18n'

/** 공개(마케팅) 페이지 공용 푸터 (#landing-v2 2026-08-03). 2026-11-24 오너 ④: 디자이너 랜딩 바닥글 모양. */
export function SiteFooter() {
  const t = useT()
  return (
    <footer className="border-t border-border bg-black px-6 py-14 text-foreground">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 md:grid-cols-3">
        <div className="md:col-span-2">
          <TaleLockup size={28} className="mb-4" />
          <p className="max-w-md text-body leading-relaxed text-muted-foreground">
            {t('From a one-line story to a previz video. The pre-production studio built with an AI production team.')}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 text-body text-muted-foreground">
          <Link href="/playground" className="w-fit transition-colors hover:text-foreground">
            Playground
          </Link>
          {PRICING_PAGE_VISIBLE && (
            <Link href="/pricing" className="w-fit transition-colors hover:text-foreground">
              {t('Pricing')}
            </Link>
          )}
          <Link href="/docs" className="w-fit transition-colors hover:text-foreground">
            {t('Docs')}
          </Link>
          <ContactPopover />
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
        <LegalFooter />
        <span>&copy; {new Date().getFullYear()} Tale Studio. All rights reserved.</span>
      </div>
    </footer>
  )
}
