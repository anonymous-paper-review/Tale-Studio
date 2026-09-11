import 'server-only'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { supabaseAdmin } from './admin'

type Workspace = Pick<Database['public']['Tables']['workspaces']['Row'], 'id' | 'plan' | 'owner_id'>
type WorkspaceOwner = Pick<User, 'id' | 'email' | 'user_metadata'>

async function findWorkspace(ownerId: string): Promise<Workspace | null> {
  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .select('id, plan, owner_id')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

/** 새 프로젝트와 편집 화면이 같은 작업 공간 준비 경로를 사용한다. */
export async function ensureWorkspace(user: WorkspaceOwner): Promise<Workspace> {
  const existing = await findWorkspace(user.id)
  if (existing) return existing

  const { data: created, error } = await supabaseAdmin
    .from('workspaces')
    .insert({
      name: user.user_metadata?.full_name || user.email || 'My Studio',
      // 전체 계정 ID로 이름을 고정한다. slug 고유 제약이 동시 요청의 중복 생성을 막는다.
      slug: `studio-${user.id}`,
      owner_id: user.id,
    })
    .select('id, plan, owner_id')
    .single()

  if (error?.code === '23505') {
    // 다른 요청이 먼저 만들었으면 소유자로 다시 찾는다. 이름만으로 다른 공간에 합류하지 않는다.
    const concurrent = await findWorkspace(user.id)
    if (concurrent) return concurrent
  }
  if (error || !created) throw new Error(error?.message ?? 'Failed to create workspace')
  return created
}
