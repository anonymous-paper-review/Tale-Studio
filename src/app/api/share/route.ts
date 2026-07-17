import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { buildProjectSnapshot } from '@/lib/demo/snapshot'
import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

// project-share-demo-mode — 공유 링크 CRUD(소유자 전용).
//   POST   { projectId, expiresInDays? } → 스냅샷 캡처 + 링크 발급
//   GET    ?projectId → 링크 목록
//   DELETE ?id|?token → 링크 취소(revoked_at)

function newToken(): string {
  return `${randomUUID()}${randomUUID()}`.replace(/-/g, '')
}

async function isOwner(projectId: string, userId: string): Promise<boolean> {
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
  return ws?.owner_id === userId
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string
    expiresInDays?: number
    live?: boolean
  }
  if (!body.projectId)
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  if (!(await isOwner(body.projectId, user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 재사용: 이 프로젝트에 활성(미취소·미만료) 링크가 이미 있으면 새 토큰을 만들지 않고 그대로 돌려준다
  //   — 클릭마다 링크가 늘어나던 문제 제거. 프로젝트당 안정된 링크 하나.
  //   레거시 동결 스냅샷 링크는 라이브로 정규화해, 재사용 링크가 항상 현재 상태를 반영하게 한다.
  const { data: existing } = await supabaseAdmin
    .from('project_shares')
    .select('id, token, snapshot')
    .eq('project_id', body.projectId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const isLive =
      (existing.snapshot as { __live?: boolean } | null)?.__live === true
    if (!isLive) {
      await supabaseAdmin
        .from('project_shares')
        .update({ snapshot: { __live: true } })
        .eq('id', existing.id)
    }
    return NextResponse.json({
      id: existing.id,
      token: existing.token,
      path: `/share/${existing.token}`,
      reused: true,
    })
  }

  const token = newToken()
  // 기본은 라이브 링크({ __live:true }): GET 라우트가 매 로드마다 현재 DB 를 재조회해
  //   공유 후 편집이 뷰어에 그대로 반영된다. (live:false 를 명시해야 생성 시점 동결 스냅샷)
  const live = body.live !== false
  const snapshot = live
    ? { __live: true }
    : await buildProjectSnapshot(body.projectId)
  const expires_at = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString()
    : null

  const { data, error } = await supabaseAdmin
    .from('project_shares')
    .insert({
      project_id: body.projectId,
      token,
      created_by: user.id,
      snapshot,
      expires_at,
    })
    .select('id, token, created_at, expires_at')
    .single()

  if (error || !data)
    return NextResponse.json(
      { error: error?.message ?? 'insert failed' },
      { status: 500 },
    )

  return NextResponse.json({
    id: data.id,
    token: data.token,
    path: `/share/${data.token}`,
  })
}

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId)
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  if (!(await isOwner(projectId, user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabaseAdmin
    .from('project_shares')
    .select('id, token, created_at, expires_at, revoked_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ shares: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  const token = req.nextUrl.searchParams.get('token')
  if (!id && !token)
    return NextResponse.json({ error: 'id or token required' }, { status: 400 })

  const base = supabaseAdmin.from('project_shares').select('id, project_id')
  const { data: share } = await (id
    ? base.eq('id', id)
    : base.eq('token', token!)
  ).maybeSingle()

  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isOwner(share.project_id, user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabaseAdmin
    .from('project_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', share.id)

  return NextResponse.json({ ok: true })
}
