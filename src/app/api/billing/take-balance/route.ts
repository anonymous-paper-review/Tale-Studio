// GET /api/billing/take-balance — 로그인 유저 워크스페이스의 현재 Take 잔액 + 과금 모드.
//   결제 준비 phase-2 슬라이스 2(#payments-phase-2, v4 #2 "생성 전 N Take 소모 표시")의 잔액 축.
//   admin(슈퍼계정, 2026-09-02 오너 결정)은 balance:null 로 응답 — 클라가 "무제한" 표기에 쓴다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminWorkspaceOwner } from '@/lib/admin'
import { takeBalance } from '@/lib/billing/take-ledger'
import { takeBillingMode } from '@/lib/billing/take-hold'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const mode = takeBillingMode()

    const { data: workspace, error } = await supabaseAdmin
      .from('workspaces')
      .select('id, owner_id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!workspace) return NextResponse.json({ balance: 0, mode })

    if (isAdminWorkspaceOwner(user, workspace.owner_id)) {
      return NextResponse.json({ balance: null, mode })
    }

    const balance = await takeBalance(workspace.id as string)
    return NextResponse.json({ balance, mode })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[billing/take-balance]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
