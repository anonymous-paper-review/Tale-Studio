// GET /api/billing/catalog-status — 배포된 서버에서 결제 가능한 상품이 몇 개인지 (#payments-phase-3 P10 공짜 검사).
//   가격 ID 는 NEXT_PUBLIC_ 환경변수라 배포마다 갈린다. 라이브 전환 직후 이게 0 이면 결제 버튼이 전부 죽는다 —
//   그 사고를 배포 직후에 잡으려고 숫자만 노출한다. 가격 ID 자체는 브라우저 번들에 이미 들어가는 공개 값이다.
import { NextResponse } from 'next/server'
import { PADDLE_PLANS, PADDLE_TAKE_PACKS, isPurchasable } from '@/lib/billing/catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const plans = PADDLE_PLANS.filter(isPurchasable).length
  const packs = PADDLE_TAKE_PACKS.filter(isPurchasable).length
  return NextResponse.json({
    purchasable: plans + packs,
    plans,
    packs,
    total: PADDLE_PLANS.length + PADDLE_TAKE_PACKS.length,
    env: process.env.NEXT_PUBLIC_PADDLE_ENV ?? 'unset',
  })
}
