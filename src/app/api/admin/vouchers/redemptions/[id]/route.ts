// 관리자는 기존 정책에 따라 계정별 바우처 티어·종료일을 바꾸거나 유료 권한을 해지한다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { PADDLE_PLANS } from '@/lib/billing/catalog'

async function gate() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await gate()
  if (denied) return denied
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const endsAt = typeof body?.expiresAt === 'string' ? new Date(body.expiresAt) : null
  if (!PADDLE_PLANS.some((plan) => plan.id === body?.plan) || !endsAt || !Number.isFinite(endsAt.getTime())) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.rpc('admin_update_voucher_redemption', {
    p_redemption: id,
    p_plan: body.plan,
    p_ends_at: endsAt.toISOString(),
    p_revoke: false,
  })
  if (error) return NextResponse.json({ error: 'redemption_update_failed' }, { status: 500 })
  if ((data as { status?: string } | null)?.status === 'not_found') return NextResponse.json({ error: 'redemption_not_found' }, { status: 404 })
  if ((data as { status?: string } | null)?.status === 'ended') return NextResponse.json({ error: 'redemption_ended' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await gate()
  if (denied) return denied
  const { id } = await context.params
  const { data, error } = await supabaseAdmin.rpc('admin_end_voucher_redemption', { p_redemption: id })
  if (error) return NextResponse.json({ error: 'redemption_revoke_failed' }, { status: 500 })
  if ((data as { status?: string } | null)?.status === 'not_found') return NextResponse.json({ error: 'redemption_not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
