// 관리자 수동 빌링 라우트 — 결제 준비 phase-2 슬라이스 1 (#payments-phase-2).
//   MoR(결제) 연동 전 단계라 플랜 변경·Take 적립/조정을 관리자가 수동으로 수행하는 경로다.
//   판정·응답 계약은 기존 admin 게이트(src/lib/admin.ts, tests/admin-gate.test.ts)와 동일 패턴 —
//   비인증 401, 비관리자 403.
import { getPlanEntitlements } from '@/lib/plan-limits'
import { grantTakes, manualAdjustTakes, takeBalance } from '@/lib/billing/take-ledger'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'
import { NextResponse, type NextRequest } from 'next/server'

const GRANT_KINDS = ['grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus'] as const
type GrantKind = (typeof GRANT_KINDS)[number]

/** 다음 달 1일 00:00 UTC — 플랜 포함 Take 의 월말 소멸 시각(v4 6_소멸시효). */
function nextMonthFirstUtc(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString()
}

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isAdminEmail(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, userId: user.id }
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.response

    const workspaceId = new URL(req.url).searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId_required' }, { status: 400 })
    }

    const { data: workspace, error } = await supabaseAdmin
      .from('workspaces')
      .select('plan')
      .eq('id', workspaceId)
      .maybeSingle()
    if (error) throw error
    if (!workspace) {
      return NextResponse.json({ error: 'workspace_not_found' }, { status: 404 })
    }

    const plan = workspace.plan || 'free'
    const balance = await takeBalance(workspaceId)

    return NextResponse.json({
      plan,
      entitlements: getPlanEntitlements(plan),
      takeBalance: balance,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin/billing GET]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.response

    const body = await req.json().catch(() => null)
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
    const action = typeof body?.action === 'string' ? body.action : ''
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId_required' }, { status: 400 })
    }

    if (action === 'set_plan') {
      const plan = typeof body?.plan === 'string' ? body.plan : ''
      if (!plan) {
        return NextResponse.json({ error: 'plan_required' }, { status: 400 })
      }

      const { error: updateError } = await supabaseAdmin
        .from('workspaces')
        .update({ plan })
        .eq('id', workspaceId)
      if (updateError) throw updateError

      let grant: { id: string } | null = null
      // free 는 포함 Take 가 0(v4 사다리) — 적립할 게 없다.
      if (plan !== 'free') {
        const entitlements = getPlanEntitlements(plan)
        if (entitlements.includedTakesPerMonth > 0) {
          grant = await grantTakes({
            workspaceId,
            amount: entitlements.includedTakesPerMonth,
            kind: 'grant_plan',
            expiresAt: nextMonthFirstUtc(),
            refKind: 'admin',
            refId: gate.userId,
            reason: `set_plan -> ${plan} (manual by admin)`,
          })
        }
      }

      return NextResponse.json({ ok: true, plan, grant })
    }

    if (action === 'grant_takes') {
      const amount = Number(body?.amount)
      const kind = typeof body?.kind === 'string' ? body.kind : ''
      if (!GRANT_KINDS.includes(kind as GrantKind)) {
        return NextResponse.json({ error: 'invalid_kind' }, { status: 400 })
      }
      const grant = await grantTakes({
        workspaceId,
        amount,
        kind: kind as GrantKind,
        reason: typeof body?.reason === 'string' ? body.reason : undefined,
      })
      return NextResponse.json({ ok: true, grant })
    }

    if (action === 'adjust') {
      const delta = Number(body?.delta)
      const reason = typeof body?.reason === 'string' ? body.reason : ''
      const adjustment = await manualAdjustTakes({
        workspaceId,
        delta,
        reason,
        adminUserId: gate.userId,
      })
      return NextResponse.json({ ok: true, adjustment })
    }

    return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin/billing POST]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
