import { supabaseAdmin } from '@/lib/supabase/admin'
import { buildProjectSnapshot } from '@/lib/demo/snapshot'
import { NextResponse } from 'next/server'

// project-share-demo-mode — 토큰 게이트 스냅샷 반환(무인증, 공개).
//   revoked/expired 는 거부. 미들웨어 matcher 가 api/ 를 제외하므로 이 라우트는 자체 게이트만.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const { data: share } = await supabaseAdmin
    .from('project_shares')
    .select('project_id, snapshot, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!share || share.revoked_at)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now())
    return NextResponse.json({ error: 'Expired' }, { status: 410 })

  // 라이브 공유: snapshot 에 { __live: true } 마커가 있으면 매 로드마다 현재 DB 를 재조회해
  //   프로젝트 편집(샷 이미지·영상 URL 등)이 뷰어에 그대로 반영된다(동결 스냅샷의 반대).
  const live = (share.snapshot as { __live?: boolean } | null)?.__live === true
  if (live && share.project_id) {
    const fresh = await buildProjectSnapshot(share.project_id as string)
    return NextResponse.json(fresh)
  }

  return NextResponse.json(share.snapshot ?? {})
}
