'use client'

// 로그인 대시보드 공용 헤더 (#landing-v2b 2026-08-03) — /projects 와 /playground 가 공유.
//   탭 [프로젝트 | Playground] 로 두 페이지가 형제임을 보이고(Playground 가 랜딩의 자식처럼
//   보이던 문제 수정), 유저 메뉴(로그아웃)를 함께 제공한다. 우측 슬롯(children)에는 페이지
//   전용 액션(새 프로젝트 버튼 등)이 들어간다.
//   v3(2026-11-03): 작업 화면과 같은 바탕색 막대(검정 · 반투명 흐림 대신), Tale 로고 묶음, 탭은 v3 segmented 묶음(카드색 · 고른 칸 칩색).
//   11/5 시안(R2~R6 위 막대): 막대 바탕은 페이지 바탕을 따르고(스튜디오 밖 화면 = bg-lobby) 아래 선이 없다. 탭은 알약 하나(side 바탕 ·
//   고른 칸 tab-selected), 언어는 "한국어 ▾" 알약, 프로필은 32 원 하나. 막대와 본문은 같은 폭(DASHBOARD_CONTAINER)으로 줄을 맞춘다.

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, LogOut } from 'lucide-react'
import { TaleLockup } from '@/components/tale-lockup'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { clearLastProjectId } from '@/lib/session-restore'
import { useT } from '@/lib/i18n'
import { PRICING_PAGE_VISIBLE } from '@/lib/billing/pricing-visibility'
import { useLocaleStore } from '@/stores/locale-store'
import type { AppLocale } from '@/lib/locale'
import { cn } from '@/lib/utils'

// 라벨은 영어 원문 = i18n 사전 키 (#i18n-s5) — 렌더에서 t() 를 통과한다.
const TABS = [
  { key: 'projects', label: 'Projects', href: '/projects' },
  { key: 'playground', label: 'Playground', href: '/playground' },
  // #queue-console: 전 프로젝트 생성 잡 운영 콘솔 — 좀비·실패를 보는 유일한 전역 창구.
  { key: 'queue', label: 'Queue', href: '/queue' },
  { key: 'pricing', label: 'Pricing', href: '/pricing' },
  // #payments-phase-3 P9a: 계정·결제(플랜·Take·구매 내역).
  { key: 'account', label: 'Account', href: '/account' },
] as const

// 언어 표시명은 자기 언어로 고정 표기(언어 선택 UI 관례 — 번역하지 않는다).
const LOCALE_LABELS: Record<AppLocale, string> = { en: 'English', ko: '한국어' } // i18n-ok

export type DashboardTab = (typeof TABS)[number]['key']

/** 로그인 뒤 대시보드(막대 · 본문) 폭 — 11/5 시안 R2: 1440 화면에서 본문 1104(양옆 168). */
export const DASHBOARD_CONTAINER = 'mx-auto w-full max-w-[1152px] px-6'

export function DashboardHeader({
  active,
  children,
}: {
  active: DashboardTab
  children?: ReactNode
}) {
  const router = useRouter()
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const [userInfo, setUserInfo] = useState<{ name: string; avatar: string | null } | null>(null)

  useEffect(() => {
    // UI 언어 캐시를 user_metadata 진실에 맞춘다 (#i18n-s5) — 대시보드 진입 1회.
    void useLocaleStore.getState().hydrateFromUser()
    const supabase = createClient()
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!user) return
        setUserInfo({
          name: user.user_metadata?.full_name ?? user.email ?? '',
          avatar: user.user_metadata?.avatar_url ?? null,
        })
      })
      .catch(() => {})
  }, [])

  const handleLogout = async () => {
    clearLastProjectId()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <header className="sticky top-0 z-40 bg-inherit">
      <div className={cn(DASHBOARD_CONTAINER, 'flex min-h-[78px] flex-wrap items-center justify-between gap-3 py-5 lg:flex-nowrap')}>
        <div className="flex min-w-0 flex-wrap items-center gap-3 lg:flex-nowrap lg:gap-[89px]">
          <Link href="/projects" className="flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <TaleLockup size={26} />
          </Link>
          <nav className="flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-side p-1 text-[13px] leading-4">
            {/* 요금표를 숨겨 둔 동안(pricing-visibility) Pricing 탭을 뺀다. */}
            {TABS.filter((tab) => PRICING_PAGE_VISIBLE || tab.key !== 'pricing').map((tab) =>
              tab.key === active ? (
                <span key={tab.key} aria-current="page" className="rounded-full bg-tab-selected px-3.5 py-[7px] font-semibold text-foreground">
                  {t(tab.label)}
                </span>
              ) : (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className="rounded-full px-3.5 py-[7px] font-medium text-subtle-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {t(tab.label)}
                </Link>
              ),
            )}
          </nav>
        </div>
        <div className={cn('flex items-center gap-3')}>
          {children}
          {/* Language 스위치 (#i18n-s5): UI 언어 + 신규 프로젝트의 콘텐츠 언어 기본값. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-8 items-center gap-1 rounded-full bg-side px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={t('Language')}
              >
                {LOCALE_LABELS[locale]}
                <span aria-hidden className="text-[9px]">▾</span>
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
          {userInfo && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {userInfo.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userInfo.avatar}
                      alt={userInfo.name}
                      className="size-8 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded-full bg-card font-num text-[13px] font-semibold text-foreground">
                      {userInfo.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 size-4" />
                  {t('Log out')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
