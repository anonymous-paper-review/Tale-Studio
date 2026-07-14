import { supabaseAdmin } from '@/lib/supabase/admin'
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
    .select('snapshot, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!share || share.revoked_at)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now())
    return NextResponse.json({ error: 'Expired' }, { status: 410 })

  return NextResponse.json(share.snapshot ?? {})
}
