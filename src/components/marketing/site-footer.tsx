import Link from 'next/link'
import { Film } from 'lucide-react'
import { ContactPopover } from '@/components/contact-popover'

/** 공개(마케팅) 페이지 공용 푸터 (#landing-v2 2026-08-03). */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black px-6 py-14 text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Film className="size-6 text-primary" />
            <span className="text-lg font-bold tracking-tight">Tale Studio</span>
          </div>
          <p className="max-w-md text-sm font-light leading-relaxed text-gray-400">
            From a one-line story to a previz video. The pre-production
            studio built with an AI production team.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-sm text-gray-400">
          <Link href="/playground" className="w-fit transition-colors hover:text-white">
            Playground
          </Link>
          <Link href="/pricing" className="w-fit transition-colors hover:text-white">
            Pricing
          </Link>
          <Link href="/docs" className="w-fit transition-colors hover:text-white">
            Docs
          </Link>
          <ContactPopover />
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl items-center justify-between border-t border-white/10 pt-6 text-xs text-gray-500">
        <span>&copy; {new Date().getFullYear()} Tale Studio. All rights reserved.</span>
      </div>
    </footer>
  )
}
