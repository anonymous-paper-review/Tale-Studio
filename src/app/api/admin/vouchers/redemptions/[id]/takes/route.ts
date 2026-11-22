// 관리자는 등록 고객의 남은 Take 수를 정한 수로 바로 바꾼다. 늘리고 줄이는 규칙은 DB 함수 admin_set_account_takes 한 곳이 정한다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { validAdminTakeTarget } from '@/lib/billing/voucher'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!validAdminTakeTarget(body?.takes)) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const { data, error } = await supabaseAdmin.rpc('admin_set_account_takes', { p_redemption: id, p_target: body.takes })
  if (error) return NextResponse.json({ error: 'takes_update_failed' }, { status: 500 })
  const result = data as { status?: string; before?: number; after?: number } | null
  if (result?.status === 'not_found' || result?.status === 'no_account') return NextResponse.json({ error: 'redemption_not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, before: result?.before, after: result?.after })
}
