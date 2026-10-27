// POST /api/billing/voucher — 받은 코드를 넣으면 그 요금제와 한 달 Take 를 넣는다(2026-10-27 오너 바우처).
//   코드 표를 먼저 읽어 없는 코드 · 쓴 코드는 바로 거절하고(작업 공간도 만들지 않는다),
//   실제 쓰기는 DB 함수 redeem_voucher 가 잠금을 걸고 한 번에 한다: 코드 쓴 표시 · 요금제 바꾸기 · Take 넣기.
//   읽은 뒤 다른 사람이 먼저 썼거나 무료가 아닌 계정이면 그 함수가 거절한다.
//   약속: tests/billing/voucher.test.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ensureWorkspace } from '@/lib/supabase/workspace'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { normalizeVoucherCode, voucherTakeGrant, VOUCHER_CODE_PATTERN, type VoucherFailure } from '@/lib/billing/voucher'

export const runtime = 'nodejs'

const FAILURE_STATUS: Record<VoucherFailure, number> = { invalid: 404, used: 409, not_free: 409 }

function fail(code: VoucherFailure) {
  return NextResponse.json({ error: code }, { status: FAILURE_STATUS[code] })
}

export async function POST(req: Request) {
  const demo = demoWriteBlock(req)
  if (demo) return demo
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as { code?: unknown } | null
    const code = normalizeVoucherCode(body?.code)
    if (!VOUCHER_CODE_PATTERN.test(code)) return fail('invalid')

    const { data: voucher, error: lookupError } = await supabaseAdmin
      .from('vouchers')
      .select('plan, redeemed_at')
      .eq('code', code)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!voucher) return fail('invalid')
    if (voucher.redeemed_at) return fail('used')

    const plan = String(voucher.plan)
    const workspace = await ensureWorkspace(user)
    const grant = voucherTakeGrant(plan, new Date())
    const { data, error } = await supabaseAdmin.rpc('redeem_voucher', {
      p_code: code,
      p_workspace: workspace.id,
      p_user: user.id,
      p_plan: plan,
      p_takes: grant.takes,
      p_expires_at: grant.expiresAt,
    })
    if (error) throw new Error(error.message)
    const status = (data as { status?: unknown } | null)?.status
    if (status === 'ok') return NextResponse.json({ ok: true, plan, takes: grant.takes, takesExpireAt: grant.expiresAt })
    if (status === 'invalid' || status === 'used' || status === 'not_free') return fail(status)
    throw new Error(`redeem_voucher returned ${String(status)}`)
  } catch (err) {
    console.error('[billing/voucher]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'voucher_failed' }, { status: 500 })
  }
}
