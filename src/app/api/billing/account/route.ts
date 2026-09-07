// GET /api/billing/account — 계정·결제 페이지 요약 (#payments-phase-3 P9a).
//   로그인 유저 워크스페이스의 플랜 · 구독 상태 · 종류별 Take 잔액 · 최근 내역 · 팩 구매 가능 여부.
//   계산은 전부 src/lib/billing/account-summary.ts(순수 함수)이고 여기는 읽어서 넘길 뿐이다.
//   admin(슈퍼계정)은 balance.total:null 로 응답 — 기존 take-balance 라우트와 같은 규약.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminWorkspaceOwner } from '@/lib/admin'
import { takeBillingMode } from '@/lib/billing/take-hold'
import {
  canBuyTakePack,
  groupRecentActivity,
  summarizeSubscription,
  takeBreakdown,
  type ActivityItem,
  type LedgerRow,
  type SubscriptionSummary,
  type TakeBreakdown,
} from '@/lib/billing/account-summary'

export interface BillingAccountResponse {
  email: string
  isAdmin: boolean
  mode: ReturnType<typeof takeBillingMode>
  subscription: SubscriptionSummary
  balance: TakeBreakdown | null
  recent: ActivityItem[]
  packPurchasedBefore: boolean
  canBuyPack: boolean
  /** Paddle 고객이 있으면 포털(구독 관리·결제 수단·영수증)을 열 수 있다 (P9). */
  hasPaddleCustomer: boolean
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const mode = takeBillingMode()
    const email = user.email ?? ''

    const { data: workspace, error: wsError } = await supabaseAdmin
      .from('workspaces')
      .select('id, owner_id, plan')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (wsError) throw wsError

    if (!workspace) {
      const body: BillingAccountResponse = {
        email,
        isAdmin: false,
        mode,
        subscription: summarizeSubscription('free', null),
        balance: takeBreakdown([]),
        recent: [],
        packPurchasedBefore: false,
        canBuyPack: true,
        hasPaddleCustomer: false,
      }
      return NextResponse.json(body)
    }

    const workspaceId = workspace.id as string
    const plan = typeof workspace.plan === 'string' ? workspace.plan : 'free'
    const isAdmin = isAdminWorkspaceOwner(user, workspace.owner_id)

    const [{ data: subscription, error: subError }, { data: ledger, error: ledgerError }, { data: customer }] = await Promise.all([
      supabaseAdmin
        .from('subscriptions')
        .select('plan, status, current_period_end')
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
      supabaseAdmin
        .from('take_ledger')
        .select('id, kind, delta, grant_id, expires_at, ref_kind, ref_id, reason, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      supabaseAdmin.from('billing_customers').select('mor_customer_id').eq('workspace_id', workspaceId).maybeSingle(),
    ])
    if (subError) throw subError
    if (ledgerError) throw ledgerError

    const rows = (ledger ?? []) as LedgerRow[]
    const packPurchasedBefore = rows.some((row) => row.kind === 'grant_purchase')

    const body: BillingAccountResponse = {
      email,
      isAdmin,
      mode,
      subscription: summarizeSubscription(plan, subscription ?? null),
      balance: isAdmin ? null : takeBreakdown(rows),
      recent: groupRecentActivity(rows),
      packPurchasedBefore,
      canBuyPack: canBuyTakePack({ plan, packPurchasedBefore }),
      hasPaddleCustomer: typeof customer?.mor_customer_id === 'string',
    }
    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/account]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
