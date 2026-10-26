// 시리즈 정보 조회(2026-10-26) — 이 프로젝트가 다음 화면 앞 화에서 이어받은 것을 한 곳에서 돌려준다.
//   시작 화면 · Writer 띠 · Artist 카드가 useSeriesInfo 로 같이 읽는다. 시리즈가 아니면 view 는 null.
//   앞 화 산문은 ?prose=1 일 때만 싣는다(8000자까지 되는 큰 글이라 띠만 그릴 때는 보내지 않는다).
//   그림체 · 이번 화 등장 여부는 매번 지금 DB 로 판정하므로 캐시하지 않는다.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadPrevProse, loadSeriesContext } from '@/lib/series/server'
import { styleIdOf } from '@/lib/series/snapshot'
import { appearingIn, buildSeriesView } from '@/lib/series/view'
import { getActiveRun } from '@/lib/writer/run-store'

export const runtime = 'nodejs'

const NO_STORE = { headers: { 'cache-control': 'no-store' } }

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    // 주인만 — 로그인만으로 남의 화에서 이어받은 인물 · 그림 주소를 읽을 수 없게 한다.
    if (!(await userOwnsProject(id, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const context = await loadSeriesContext(id)
    if (!context) return NextResponse.json({ view: null }, NO_STORE)

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('style_anchor_key, custom_style_anchor')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(`series project load failed: ${error.message}`)
    // 이번 화 산문의 씬이 아직 없으면 등장 여부는 null 이다 — 안 나온다고 단정하지 않는다.
    const run = await getActiveRun(id)
    const wantsProse = new URL(req.url).searchParams.get('prose') === '1'
    const view = buildSeriesView({
      series: context.series,
      prevProjectId: context.prevProjectId,
      prevDeleted: context.prevDeleted,
      currentStyleId: styleIdOf(project ?? {}),
      appearance: appearingIn(run?.state as Parameters<typeof appearingIn>[0]),
      ...(wantsProse ? { prose: context.prevProjectId ? await loadPrevProse(context.prevProjectId) : null } : {}),
    })
    return NextResponse.json({ view }, NO_STORE)
  } catch (e) {
    console.error('[project/series]', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Could not read the series information. Please try again.' }, { status: 503 })
  }
}
