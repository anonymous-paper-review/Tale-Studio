import 'server-only'

// PortOne 라우트 공용: 로그인 유저의 워크스페이스 · 살아 있는 구독 · 팩 구매 이력. checkout 라우트와 같은 조회 규칙.
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { pickActiveSubscription, type SubscriptionRow } from '@/lib/billing/subscription-state'
import { summarizeSubscription, type SubscriptionStatus } from '@/lib/billing/account-summary'

export interface PortOneBillingContext {
  userId: string
  email: string
  workspaceId: string
  plan: string
  subscription: SubscriptionRow | null
  subscriptionStatus: SubscriptionStatus
  packPurchasedBefore: boolean
}

/** 로그인 안 했으면 'unauthorized', 워크스페이스가 없으면 'no_workspace'. */
export async function loadPortOneContext(): Promise<PortOneBillingContext | 'unauthorized' | 'no_workspace'> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return 'unauthorized'

  const { data: workspace, error } = await supabaseAdmin
    .from('workspaces')
    .select('id, plan')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!workspace) return 'no_workspace'
  const workspaceId = workspace.id as string
  const plan = typeof workspace.plan === 'string' ? workspace.plan : 'free'

  const [{ data: subscriptions, error: subError }, { data: purchases, error: buyError }] = await Promise.all([
    supabaseAdmin.from('subscriptions').select('*').eq('workspace_id', workspaceId),
    supabaseAdmin.from('take_ledger').select('id').eq('workspace_id', workspaceId).eq('kind', 'grant_purchase').limit(1),
  ])
  if (subError) throw subError
  if (buyError) throw buyError
  const subscription = pickActiveSubscription(subscriptions as SubscriptionRow[] | null)
  return {
    userId: user.id,
    email: user.email,
    workspaceId,
    plan,
    subscription,
    subscriptionStatus: summarizeSubscription(plan, subscription ?? null).status,
    packPurchasedBefore: (purchases?.length ?? 0) > 0,
  }
}
