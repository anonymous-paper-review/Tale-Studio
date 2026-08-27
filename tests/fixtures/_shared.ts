// _shared.ts — 픽스처 빌더 공용 부품 (DB 클라이언트, 대상 프로젝트 해석).
//   `_` 접두라 vitest 가 테스트로 집어가지 않는다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

/** service-role 클라이언트. 머신 전용 — 이 키는 절대 클라이언트 번들로 가지 않는다. */
export function makeDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('[불가] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다 (.env.local 확인).')
    process.exit(2)
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * 대상 프로젝트 결정: 인자로 주면 그것, 아니면 TALE_SMOKE_EMAIL 계정의 첫 프로젝트.
 * 스모크 전용 테스트 계정만 건드리게 해서 실제 작업 프로젝트를 오염시키지 않는다.
 */
export async function resolveProjectId(db: SupabaseClient, explicit?: string): Promise<string> {
  if (explicit) return explicit

  const email = process.env.TALE_SMOKE_EMAIL
  if (!email) {
    console.error('[불가] TALE_SMOKE_EMAIL 이 없다. 프로젝트 id 를 인자로 주거나 .env.local 에 넣을 것.')
    process.exit(2)
  }
  const { data: users, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(`[불가] ${email} 계정을 찾을 수 없다.`)
    process.exit(1)
  }
  const { data: ws } = await db.from('workspaces').select('id').eq('owner_id', user.id)
  const wsIds = (ws ?? []).map((w) => w.id as string)
  if (!wsIds.length) {
    console.error('[불가] 그 계정이 소유한 workspace 가 없다. 앱에 한 번 로그인할 것.')
    process.exit(1)
  }
  const { data: projects } = await db
    .from('projects')
    .select('id')
    .in('workspace_id', wsIds)
    .order('created_at', { ascending: true })
    .limit(1)
  if (!projects?.length) {
    console.error('[불가] 그 계정에 프로젝트가 없다. /studio/producer 를 한 번 열면 자동 생성된다.')
    process.exit(1)
  }
  return projects[0].id as string
}

export const STAGES = ['producer', 'writer', 'artist', 'director', 'editor'] as const

/**
 * 두 단계 중 더 앞선(진행된) 쪽을 반환한다. 제품 코드 `src/stores/project-store.ts` 의
 * `furtherStage` 와 같은 판정(STAGES 배열 인덱스 비교) — reachedStage/current_stage 는
 * 단조 증가해야 하므로, 준비 도구가 단계를 쓸 때도 이미 더 앞서 있으면 낮추지 않는다.
 * (fixture-producer-undoes-writer-unlock-2026-08-25)
 */
export function furtherStage(
  a: (typeof STAGES)[number],
  b: (typeof STAGES)[number],
): (typeof STAGES)[number] {
  return STAGES.indexOf(a) >= STAGES.indexOf(b) ? a : b
}
