import Link from 'next/link'
import { Film } from 'lucide-react'

/**
 * 공개(마케팅) 페이지 공용 헤더 (#landing-v2 2026-08-03) — 랜딩·Playground·Pricing·Docs.
 * 로그인 사용자가 "시작하기"를 누르면 middleware 가 /login → /projects 로 이어 보낸다.
 * 로고 클릭도 마찬가지(/ → 로그인 상태면 /projects 리다이렉트) — 별도 분기 불필요.
 */
export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Film className="size-6 text-primary" />
          <span className="text-lg font-bold tracking-tight text-white">Tale Studio</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/playground" className="hidden text-gray-300 transition-colors hover:text-white sm:block">
            Playground
          </Link>
          <Link href="/pricing" className="hidden text-gray-300 transition-colors hover:text-white sm:block">
            Pricing
          </Link>
          <Link href="/docs" className="hidden text-gray-300 transition-colors hover:text-white sm:block">
            Docs
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-white px-5 py-2 font-semibold text-black transition-colors hover:bg-primary hover:text-white"
          >
            시작하기
          </Link>
        </nav>
      </div>
    </header>
  )
}
