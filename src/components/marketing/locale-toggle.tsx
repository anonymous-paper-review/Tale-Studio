'use client'

// 마케팅 페이지용 언어 토글 (#payments-phase-3, 2026-09-08 오너: "pricing 도 한국어로").
//   앱 안 DashboardHeader 의 언어 드롭다운과 같은 store(locale-store)를 쓴다. 로그인 유저는 user_metadata 진실을,
//   방문자는 persist 캐시를 본다. 사전을 타는 마케팅 페이지(/pricing)에만 붙인다 — 랜딩·docs 는 영어 고정.
import { useEffect } from 'react'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useFirstVisitLocale, useLocaleStore } from '@/stores/locale-store'
import type { AppLocale } from '@/lib/locale'

// 언어 표시명은 자기 언어로 고정 표기(언어 선택 UI 관례 — 번역하지 않는다).
export const LOCALE_LABELS: Record<AppLocale, string> = { en: 'English', ko: '한국어' } // i18n-ok

export function LocaleToggle() {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  useFirstVisitLocale()
  useEffect(() => {
    void useLocaleStore.getState().hydrateFromUser()
  }, [])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-10 items-center gap-1.5 rounded-full bg-chip px-3 font-num text-label font-semibold text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
          aria-label="Language"
        >
          <Globe className="size-4" />
          {locale === 'ko' ? 'KO' : 'EN'}
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {(Object.keys(LOCALE_LABELS) as AppLocale[]).map((l) => (
          <DropdownMenuItem key={l} onClick={() => void setLocale(l)}>
            <span className="flex-1">{LOCALE_LABELS[l]}</span>
            {locale === l && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
