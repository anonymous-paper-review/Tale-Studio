// 관리자는 기존 고객용 바우처 코드와 등록 고객의 유료 권한을 관리한다.
import { NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { PADDLE_PLANS } from '@/lib/billing/catalog'
import { normalizeVoucherCode, VOUCHER_CODE_PATTERN } from '@/lib/billing/voucher'

const planIds = new Set(PADDLE_PLANS.map((item) => item.id))
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

async function gate() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAdminEmail(user.email)) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- request JSON is validated field by field below.
function validSettings(body: any) {
  const durationDays = Number(body.durationDays)
  const maxUses = Number(body.maxUses)
  return typeof body.plan === 'string' && planIds.has(body.plan)
    && Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= 3650
    && Number.isInteger(maxUses) && maxUses >= 1 && maxUses <= 100000
}

export async function GET() {
  try {
    const auth = await gate()
    if ('response' in auth) return auth.response
    const [{ data: vouchers, error: voucherError }, { data: redemptions, error: redemptionError }] = await Promise.all([
      supabaseAdmin.from('vouchers').select('code, plan, note, created_at, max_uses, duration_days, active, deleted_at').order('created_at', { ascending: false }),
      supabaseAdmin.from('voucher_redemptions').select('id, code, redeemed_at, redeemed_by, redeemed_workspace_id, plan, plan_ends_at, plan_ended_at').order('redeemed_at', { ascending: false }),
    ])
    if (voucherError) throw voucherError
    if (redemptionError) throw redemptionError
    const userIds = [...new Set((redemptions ?? []).map((r) => r.redeemed_by).filter(Boolean))] as string[]
    const users = await Promise.all(userIds.map(async (id) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(id)
      return [id, data.user] as const
    }))
    const people = new Map(users.map(([id, user]) => [id, user]))
    const counts = new Map<string, number>()
    for (const row of redemptions ?? []) counts.set(row.code, (counts.get(row.code) ?? 0) + 1)
    return NextResponse.json({
      vouchers: (vouchers ?? []).map((v) => ({ id: v.code, code: v.code, label: v.note ?? '', plan: v.plan, duration_days: v.duration_days, max_uses: v.max_uses, redemption_count: counts.get(v.code) ?? 0, active: v.active, deleted_at: v.deleted_at, created_at: v.created_at })),
      redemptions: (redemptions ?? []).map((r) => {
        const user = r.redeemed_by ? people.get(r.redeemed_by) : null
        return { id: r.id, voucher_id: r.code, workspace_id: r.redeemed_workspace_id, user_id: r.redeemed_by, email: user?.email ?? '', name: String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? ''), plan: r.plan, redeemed_at: r.redeemed_at, expires_at: r.plan_ends_at, revoked_at: r.plan_ended_at, status: Date.parse(r.plan_ends_at) <= Date.now() ? 'expired' : r.plan_ended_at ? 'revoked' : 'active' }
      }),
    })
  } catch (error) {
    console.error('[admin/vouchers GET]', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: 'voucher_admin_failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await gate()
    if ('response' in auth) return auth.response
    const body = await request.json().catch(() => null)
    if (!body || !validSettings(body) || typeof body.label !== 'string' || !body.label.trim()) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    let code = normalizeVoucherCode(body.code)
    if (!code) {
      do {
        code = `TALE${Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('')}`
        const { data } = await supabaseAdmin.from('vouchers').select('code').eq('code', code).maybeSingle()
        if (!data) break
      } while (true)
    }
    if (!VOUCHER_CODE_PATTERN.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('vouchers').insert({ code, plan: body.plan, note: body.label.trim(), duration_days: Number(body.durationDays), max_uses: Number(body.maxUses), active: true }).select('code').single()
    if (error?.code === '23505') return NextResponse.json({ error: 'code_already_exists' }, { status: 409 })
    if (error) throw error
    return NextResponse.json({ ok: true, voucher: { code: data.code } }, { status: 201 })
  } catch (error) {
    console.error('[admin/vouchers POST]', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: 'voucher_admin_failed' }, { status: 500 })
  }
}
