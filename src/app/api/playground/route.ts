// GET /api/playground — 공개 갤러리 목록 (#landing-v2 2026-08-03).
//
// 인증 불필요(공개 표면). playground_items 는 RLS 공개 읽기(published)지만, 클라이언트가
// 테이블 구조에 직접 결합하지 않도록 이 라우트가 유일한 조회 창구다. 게재(insert)는 아직
// 큐레이션 전용 — 서비스롤로만 넣는다(사용자 게재 플로우는 후속 작업).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
// 공개 목록은 짧게 캐시 — 게재 반영이 1분 늦는 것은 무해, 트래픽 스파이크에서 DB 를 지킨다.
export const revalidate = 60

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('playground_items')
    .select('id, kind, url, thumbnail_url, title, author_name, created_at')
    .eq('published', true)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(60)

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'db_error', message: 'failed to load playground items' } },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, items: data ?? [] })
}
