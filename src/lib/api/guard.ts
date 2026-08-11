// 프로젝트 종속 API 라우트 공용 접근 가드 (2026-08-11 보안 감사).
//
// 왜 필요한가: src/middleware.ts 의 matcher 가 `api/` 를 제외한다 —
//   '/((?!_next/static|_next/image|favicon.ico|auth/callback|api/|…).*)'
//   즉 미들웨어 인증은 페이지만 막고 API 는 한 줄도 막지 않는다. 라우트가 스스로 막아야 한다.
//   감사 실측: /api/writer/preview/{projectId} 가 쿠키 없이 200 + 스토리 전문을 반환했다.
//
// 소유권 판정은 api/director/presets 의 검증된 패턴을 그대로 쓴다(embed 문법 대신 2단 조회):
//   workspaces.owner_id === user.id → 그 워크스페이스의 projects.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { DEMO_SHARE_COOKIE } from '@/lib/demo/context'

/** 공유 토큰 형태 — api/share/route.ts newToken()(uuid 2개 연결) 산출물. */
const SHARE_TOKEN_RE = /^[0-9a-f]{64}$/i

/** 라우트들이 이미 쓰던 projectId 형태 검증(경로 주입 방어). */
const PROJECT_ID_RE = /^[A-Za-z0-9_-]+$/

export type AccessResult =
  /** projectId 는 검증을 통과한 값 — 호출부가 이걸 쓰면 `string | undefined` 좁히기가 공짜다. */
  | { ok: true; projectId: string; userId: string | null; viaShare: boolean }
  | { ok: false; response: NextResponse }

async function ownsProject(projectId: string, userId: string): Promise<boolean> {
  const { data: workspaces } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)

  const workspaceIds = (workspaces ?? []).map((w) => w.id)
  if (workspaceIds.length === 0) return false

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .in('workspace_id', workspaceIds)
    .maybeSingle()

  return !!project
}

/** demo_share 쿠키 또는 ?share= 쿼리에서 공유 티켓 추출(형태 검증까지). */
function readShareToken(req: Request): string | null {
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('share')
  if (fromQuery && SHARE_TOKEN_RE.test(fromQuery)) return fromQuery

  const cookie = req.headers.get('cookie') ?? ''
  const hit = cookie
    .split('; ')
    .find((c) => c.startsWith(`${DEMO_SHARE_COOKIE}=`))
  if (!hit) return null

  const value = decodeURIComponent(hit.slice(DEMO_SHARE_COOKIE.length + 1))
  return SHARE_TOKEN_RE.test(value) ? value : null
}

/** 공유 티켓이 이 프로젝트를 실제로 열어주는지 — revoke/expire 는 /api/share/[token] 과 동일 규칙. */
async function shareGrantsAccess(projectId: string, token: string): Promise<boolean> {
  const { data: share } = await supabaseAdmin
    .from('project_shares')
    .select('project_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!share || share.revoked_at) return false
  if (share.expires_at && new Date(share.expires_at as string).getTime() < Date.now())
    return false

  return share.project_id === projectId
}

/**
 * 프로젝트 접근 가드. 통과하면 { ok: true }, 아니면 그대로 반환할 응답을 준다.
 *
 * @param allowShare 유효한 공유 티켓 소지자에게도 허용(읽기 라우트 전용).
 *   쓰기·생성 라우트에는 절대 켜지 말 것 — 공유는 읽기전용 열람이다.
 */
export async function requireProjectAccess(
  req: Request,
  projectId: string | undefined | null,
  opts: { allowShare?: boolean } = {},
): Promise<AccessResult> {
  if (!projectId || typeof projectId !== 'string') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'projectId required' }, { status: 400 }),
    }
  }
  if (!PROJECT_ID_RE.test(projectId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'invalid projectId' }, { status: 400 }),
    }
  }

  const user = await getUser()
  if (user && (await ownsProject(projectId, user.id))) {
    return { ok: true, projectId, userId: user.id, viaShare: false }
  }

  if (opts.allowShare) {
    const token = readShareToken(req)
    if (token && (await shareGrantsAccess(projectId, token))) {
      return { ok: true, projectId, userId: user?.id ?? null, viaShare: true }
    }
  }

  // 로그인은 했는데 남의 프로젝트 → 403. 아예 비로그인 → 401.
  //   (존재 여부는 어느 쪽에서도 알려주지 않는다 — 없는 프로젝트도 동일 응답.)
  return {
    ok: false,
    response: user
      ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      : NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  }
}
