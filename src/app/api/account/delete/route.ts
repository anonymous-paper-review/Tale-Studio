// POST /api/account/delete — 본인 계정을 지운다 (약관 §9 "You can delete your Tale Studio account
//   at any time from your account settings").
//
//   순서가 계약이다:
//     ① 자동갱신 구독 해지 → 실패하면 아무것도 지우지 않는다(계정은 없는데 청구는 계속되는 상태 금지).
//     ② 사용자의 모든 프로젝트를 보관함 파일까지 지운다(개인정보 §1, src/lib/project/delete-project.ts).
//     ③ 작업공간을 이 계정에서 떼어 낸다 — 작업공간이 로그인 계정에 매달린 채 사라지면 그 아래
//        결제·구독·Take 장부(workspace_id 외래키)가 함께 쓸려간다. 법정 보존 대상이라 남겨야 한다
//        (개인정보 §1 법정 보존표: 계약·결제 5년, 분쟁 3년).
//     ④ 로그인 계정(Supabase auth user) 삭제.
//   ②가 실패하면 ④로 가지 않는다 — 주인 없는 자료가 남으면 아무도 지울 수 없다.
//
//   남은 Take·잔여 기간은 약관 §9 대로 소멸한다. 장부 행을 지우지 않으므로 잔액 계산에서만 사라진다
//   (작업공간 주인이 없어져 아무도 그 잔액을 쓸 수 없다).
//
//   id 를 입력으로 받지 않는다 — 본인 세션의 계정만 지운다. 데모(공유 보기) 세션은 거절.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { deleteProjectDeep } from '@/lib/project/delete-project'
import { cancelSubscriptionNow } from '@/lib/billing/cancel-subscription'
import { pickActiveSubscription, type SubscriptionRow } from '@/lib/billing/subscription-state'

export const runtime = 'nodejs'

/** 한 번에 불러올 프로젝트 수. 지운 만큼 다시 불러 한 페이지 제한에 걸려 미삭제가 남는 일을 막는다. */
const PROJECT_PAGE = 200

export async function POST(req: Request) {
  try {
    const demo = demoWriteBlock(req)
    if (demo) return demo

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: workspaces, error: workspaceError } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
    if (workspaceError) throw workspaceError
    const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id as string)

    // ① 구독 해지가 먼저다.
    for (const workspaceId of workspaceIds) {
      const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('workspace_id', workspaceId)
      if (subscriptionError) throw subscriptionError
      const subscription = pickActiveSubscription(subscriptions as SubscriptionRow[] | null)
      if (!subscription?.mor_subscription_id) continue
      try {
        await cancelSubscriptionNow(subscription.mor_subscription_id)
      } catch (err) {
        console.error('[account/delete] subscription cancel failed:', err instanceof Error ? err.message : String(err))
        return NextResponse.json({ error: 'subscription_cancel_failed' }, { status: 502 })
      }
    }

    // ② 프로젝트(보관함 파일 포함). 새 것이 없을 때까지 돌린다 — 한 번 조회로 끝내면
    //    행 수 제한에 걸린 나머지가 조용히 살아남는다.
    if (workspaceIds.length > 0) {
      const handled = new Set<string>()
      for (;;) {
        const { data: projects, error: projectError } = await supabaseAdmin
          .from('projects')
          .select('id')
          .in('workspace_id', workspaceIds)
          .limit(PROJECT_PAGE)
        if (projectError) throw projectError

        const pending = (projects ?? [])
          .map((project) => project.id as string)
          .filter((id) => !handled.has(id))
        if (pending.length === 0) break

        for (const projectId of pending) {
          handled.add(projectId)
          const result = await deleteProjectDeep({ projectId, userId: user.id })
          // not_found 는 이미 사라진 것이라 넘어간다. forbidden 은 소유 관계가 어긋난 것이므로 멈춘다.
          if (result.status === 'forbidden') {
            console.error('[account/delete] project delete refused:', projectId)
            return NextResponse.json({ error: 'project_delete_failed' }, { status: 500 })
          }
        }
      }

      // ③ 작업공간을 계정에서 떼어 낸다(결제 장부 보존).
      const { error: detachError } = await supabaseAdmin
        .from('workspaces')
        .update({ owner_id: null })
        .eq('owner_id', user.id)
      if (detachError) throw detachError
    }

    // ④ 로그인 계정.
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (deleteUserError) {
      console.error('[account/delete] auth user delete failed:', deleteUserError.message)
      return NextResponse.json({ error: 'account_delete_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[account/delete]', message)
    return NextResponse.json({ error: 'account_delete_failed' }, { status: 500 })
  }
}
