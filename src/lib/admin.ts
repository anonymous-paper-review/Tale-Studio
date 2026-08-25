import { supabaseAdmin } from '@/lib/supabase/admin'

// 관리자 판별 (서버 전용) — 디버그 표면(#debug-prompts 2026-08-06)의 노출 게이트.
//   "관리자 계정이 만든 프로젝트"에서만 생성 풀 프롬프트 등 내부 정보를 팝업에 노출한다.
//   판정은 항상 서버(route)에서 하고 클라이언트에는 boolean 플래그만 내려보낸다.
//
// ⚠️ 이 목록은 route 의 **소유자 검사와 AND** 로 걸린다(관리자 이메일 && 프로젝트 워크스페이스
//   소유자). 그래서 여기 없는 계정이 실제 작업 워크스페이스를 소유하면 디버그가 영영 안 켜진다 —
//   2026-08-07 실측: 작업 프로젝트 25개가 admin@tale.studio 소유인데 목록엔 개인 계정만 있어
//   두 조건이 배타가 됐다(기능 무효). 계정을 추가할 땐 workspaces.owner_id 와 대조할 것.
const DEFAULT_ADMIN_EMAILS = ['auralight.gm@gmail.com', 'admin@tale.studio']

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_ADMIN_EMAILS, ...fromEnv]).has(email.trim().toLowerCase())
}

export function isAdminWorkspaceOwner(
  user: { id: string; email?: string | null },
  ownerId: string | null | undefined,
): boolean {
  return isAdminEmail(user.email) && ownerId === user.id
}

/**
 * "관리자 소유 프로젝트" 판별 — 관리자 이메일 && 프로젝트 워크스페이스 소유자가 본인.
 * 디버그 프롬프트(#debug-prompts)와 정합 검사(#adherence P2)가 같은 게이트를 공유한다.
 * 소유 체인: projects.workspace_id → workspaces.owner_id (projects 에 user 컬럼 없음).
 */
export async function isAdminOwnedProject(
  user: { id: string; email?: string | null },
  projectId: string,
): Promise<boolean> {
  if (!isAdminEmail(user.email)) return false
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('workspace_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project?.workspace_id) return false
  const { data: ws } = await supabaseAdmin
    .from('workspaces')
    .select('owner_id')
    .eq('id', project.workspace_id)
    .maybeSingle()
  return isAdminWorkspaceOwner(user, ws?.owner_id)
}
