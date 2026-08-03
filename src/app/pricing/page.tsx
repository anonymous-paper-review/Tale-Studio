import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

// Pricing (#landing-v2 2026-08-03) — 베타 기간 무료를 정직하게. 유료 플랜은 준비 중 카드로
//   자리만 잡는다(가격 확정 시 여기만 수정).

export const metadata: Metadata = {
  title: 'Pricing — Tale Studio',
  description: '베타 기간 동안 Tale Studio 의 모든 기능을 무료로 사용할 수 있습니다.',
}

const FREE_FEATURES = [
  '5단계 AI 프로덕션 팀 전체 이용',
  '러프 스토리보드·컨셉 이미지·실사 previz 생성',
  '영상 생성 (샷당 테이크 관리)',
  '읽기 전용 공유 링크 무제한',
  'Playground 공개 게재',
]

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-32">
        <div className="mb-14 text-center">
          <h1 className="mb-3 text-4xl font-semibold tracking-tighter md:text-5xl">Pricing</h1>
          <p className="text-base font-light text-gray-400">
            베타 기간에는 모든 기능이 무료입니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Beta (현재) */}
          <div className="rounded-3xl border border-primary/50 bg-white/[0.04] p-8 shadow-[0_0_60px_rgba(229,9,20,0.08)]">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-xl font-semibold">Beta</h2>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                현재 이용 가능
              </span>
            </div>
            <p className="mb-6 text-sm text-gray-400">지금 가입하는 모든 창작자에게</p>
            <p className="mb-8">
              <span className="text-5xl font-semibold tracking-tight">₩0</span>
              <span className="ml-2 text-sm text-gray-500">/ 베타 기간</span>
            </p>
            <ul className="mb-8 space-y-3 text-sm text-gray-300">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="block rounded-full bg-primary py-3.5 text-center font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              무료로 시작하기
            </Link>
          </div>

          {/* Pro (준비 중) */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 opacity-70">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-xl font-semibold">Pro</h2>
              <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] font-medium text-gray-400">
                준비 중
              </span>
            </div>
            <p className="mb-6 text-sm text-gray-400">더 많은 생성량이 필요한 팀에게</p>
            <p className="mb-8">
              <span className="text-5xl font-semibold tracking-tight text-gray-500">—</span>
            </p>
            <p className="text-sm leading-relaxed text-gray-500">
              베타가 끝나면 생성량 기반 플랜을 공개할 예정입니다. 베타 참여자에게는
              전환 혜택을 먼저 안내해 드려요.
            </p>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-gray-600">
          베타 기간 중 생성량에는 공정 사용 한도가 적용될 수 있습니다.
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
