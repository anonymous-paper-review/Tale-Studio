// 관리자는 코드 자체를 유지하면서 바우처 설정을 바꾸거나 등록을 중지·삭제한다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { PADDLE_PLANS } from '@/lib/billing/catalog'

const plans = new Set(PADDLE_PLANS.map((item) => item.id))

async function gate() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  const denied = await gate()
  if (denied) return denied
  const { code } = await context.params
  const body = await request.json().catch(() => null)
  const patch: Record<string, unknown> = {}
  if (body && 'label' in body) {
    if (typeof body.label !== 'string' || !body.label.trim()) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    patch.note = body.label.trim()
  }
  if (body && 'plan' in body) {
    if (!plans.has(body.plan)) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    patch.plan = body.plan
  }
  if (body && 'durationDays' in body) {
    const days = Number(body.durationDays)
    if (!Number.isInteger(days) || days < 1 || days > 3650) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    patch.duration_days = days
  }
  if (body && 'maxUses' in body) {
    const count = Number(body.maxUses)
    if (!Number.isInteger(count) || count < 1 || count > 100000) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    patch.max_uses = count
  }
  if (body && 'active' in body) {
    if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    patch.active = body.active
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('vouchers').update(patch).eq('code', code).is('deleted_at', null).select('code').maybeSingle()
  if (error) return NextResponse.json({ error: 'voucher_update_failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'voucher_not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, context: { params: Promise<{ code: string }> }) {
  const denied = await gate()
  if (denied) return denied
  const { code } = await context.params
  const { data: redemptions, error: listError } = await supabaseAdmin.from('voucher_redemptions').select('id').eq('code', code).is('plan_ended_at', null)
  if (listError) return NextResponse.json({ error: 'voucher_delete_partial' }, { status: 500 })
  for (const redemption of redemptions ?? []) {
    const { error: revokeError } = await supabaseAdmin.rpc('admin_end_voucher_redemption', { p_redemption: redemption.id })
    if (revokeError) return NextResponse.json({ error: 'voucher_delete_partial' }, { status: 500 })
  }
  const { data, error } = await supabaseAdmin.from('vouchers').update({ active: false, deleted_at: new Date().toISOString() }).eq('code', code).is('deleted_at', null).select('code').maybeSingle()
  if (error) return NextResponse.json({ error: 'voucher_delete_failed' }, { status: 500 })
  if (!data) {
    const { data: existing } = await supabaseAdmin.from('vouchers').select('code').eq('code', code).maybeSingle()
    return existing ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'voucher_not_found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
