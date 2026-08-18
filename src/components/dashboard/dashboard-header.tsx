'use client'

// 로그인 대시보드 공용 헤더 (#landing-v2b 2026-08-03) — /projects 와 /playground 가 공유.
//   탭 [프로젝트 | Playground] 로 두 페이지가 형제임을 보이고(Playground 가 랜딩의 자식처럼
//   보이던 문제 수정), 유저 메뉴(로그아웃)를 함께 제공한다. 우측 슬롯(children)에는 페이지
//   전용 액션(새 프로젝트 버튼 등)이 들어간다.

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Film, LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { clearLastProjectId } from '@/lib/session-restore'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'projects', label: '프로젝트', href: '/projects' },
  { key: 'playground', label: 'Playground', href: '/playground' },
  // #queue-console: 전 프로젝트 생성 잡 운영 콘솔 — 좀비·실패를 보는 유일한 전역 창구.
  { key: 'queue', label: 'Queue', href: '/queue' },
] as const

export type DashboardTab = (typeof TABS)[number]['key']

export function DashboardHeader({
  active,
  children,
}: {
  active: DashboardTab
  children?: ReactNode
}) {
  const router = useRouter()
  const [userInfo, setUserInfo] = useState<{ name: string; avatar: string | null } | null>(null)

  useEffect(() => {
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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/projects" className="flex items-center gap-2">
            <Film className="size-6 text-primary" />
            <span className="text-lg font-bold tracking-tight text-white">Tale Studio</span>
          </Link>
          <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-sm font-medium">
            {TABS.map((tab) =>
              tab.key === active ? (
                <span key={tab.key} className="rounded-full bg-white px-4 py-1.5 text-black">
                  {tab.label}
                </span>
              ) : (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className="rounded-full px-4 py-1.5 text-gray-300 transition-colors hover:text-white"
                >
                  {tab.label}
                </Link>
              ),
            )}
          </nav>
        </div>
        <div className={cn('flex items-center gap-3')}>
          {children}
          {userInfo && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full focus:outline-none">
                  {userInfo.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userInfo.avatar}
                      alt={userInfo.name}
                      className="size-8 rounded-full border border-white/20 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white">
                      {userInfo.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className="size-4 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 size-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
