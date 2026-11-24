import type { Metadata } from 'next'
import { DocsContent } from '@/components/marketing/docs-content'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

// Docs (#landing-v2 2026-08-03) — 시작 가이드 + 자주 묻는 질문. 단일 페이지 앵커 구성.
//   내용이 늘어나면 /docs/[slug] 로 쪼갠다 — 지금은 온보딩에 필요한 최소만.

export const metadata: Metadata = {
  title: 'Docs · Tale Studio',
  description: 'Tale Studio getting started guide: how to turn a story into a previz video with the 5-stage pipeline.',
}

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <SiteHeader showLocale />
      <DocsContent />
      <SiteFooter />
    </div>
  )
}
