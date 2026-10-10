// POST /api/produce/style-facets — 이 프로젝트의 사용자 그림체(앵커 그림)를 분석기(경량 facet lite v0.1)로 조각 네 개로 만들어
//   projects.custom_style_anchor.facets 에 싣는다 (2026-10-09 오너 "그림체도 이미지 분석기 이용해서 facet화").
//
// 동의: 유저가 올린 그림은 분석 동의가 있을 때만 분석 모델에 보낸다(인계 같이 정한 것). 지금 받는 동의는 만화 원고 질문
//   (그림을 분석 모델로 보낸다는 안내를 읽고 "만화 원고로 그대로 영상화"를 고른 것) 하나다 — 문구 판과 시각을 앵커에 남긴다.
// 1~2분 걸린다(모델 두 번). 그 사이 유저가 그림체를 바꿨으면 늦게 끝난 분석이 그 선택을 덮지 않는다.
// 실패해도 앵커 그림은 그대로 남는다 — 생성은 facets 없이 이어진다.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isOwnMediaUrl } from '@/lib/upload/attachment'
import { extractLiteFacets } from '@/lib/style-facets/lite-llm'
import { isAnalysisConsent } from '@/lib/style-facets/consent'
import { triggerAssetDrafts } from '@/lib/artist/draft-trigger'

export const runtime = 'nodejs'
export const maxDuration = 300

type RawAnchor = Record<string, unknown> & { url: string }

/** 분석이 끝났다(성공 · 실패) — 분석을 기다리며 미뤄 둔 Artist 그림을 그리게 한다(빈칸만, 멱등 · 2026-10-10 오너).
 *  Writer 가 아직 그 단계 전이면(디자인 토큰 없음) 아무것도 하지 않고, 그 단계가 분석 결과를 보고 그린다. */
async function drawArtistAfterAnalysis(projectId: string): Promise<void> {
  await triggerAssetDrafts(projectId, { afterStyleAnalysis: true }).catch((error) => {
    console.warn('[style-facets] artist drafts after analysis failed:', error instanceof Error ? error.message : error)
  })
}

async function readAnchor(projectId: string): Promise<RawAnchor | null> {
  const { data, error } = await supabaseAdmin.from('projects').select('custom_style_anchor').eq('id', projectId).maybeSingle()
  if (error) throw error
  const raw = (data as { custom_style_anchor?: unknown } | null)?.custom_style_anchor
  if (!raw || typeof raw !== 'object' || typeof (raw as { url?: unknown }).url !== 'string') return null
  return raw as RawAnchor
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { projectId?: unknown; consent?: unknown } | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  const consent = typeof body?.consent === 'string' ? body.consent : ''
  if (!projectId) return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })
  if (!isAnalysisConsent(consent)) return NextResponse.json({ error: 'analysis_consent_required' }, { status: 400 })
  if (!(await userOwnsProject(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const anchor = await readAnchor(projectId)
    if (!anchor || !isOwnMediaUrl(anchor.url)) return NextResponse.json({ error: 'no_custom_style' }, { status: 409 })

    const { facets, attempts } = await extractLiteFacets(anchor.url)
    if (!facets) {
      // 분석이 실패해도 그림체는 그림으로 남는다 — 미뤄 둔 Artist 그림은 그림만 보고 그린다.
      await drawArtistAfterAnalysis(projectId)
      return NextResponse.json({ ok: false, facets: false, attempts: attempts.length })
    }

    const current = await readAnchor(projectId)
    if (!current || current.url !== anchor.url) return NextResponse.json({ ok: false, facets: false, reason: 'anchor_changed' })

    const next: Record<string, unknown> = { ...current, facets, analysis_consent: { wording: consent, at: new Date().toISOString() } }
    delete next.analysis_pending_at
    const { error } = await supabaseAdmin.from('projects').update({ custom_style_anchor: next }).eq('id', projectId)
    if (error) throw error
    await drawArtistAfterAnalysis(projectId)
    return NextResponse.json({ ok: true, facets: true, figure: !!facets.figure })
  } catch (error) {
    console.error('[style-facets] failed:', error)
    return NextResponse.json({ error: 'style_facets_failed' }, { status: 500 })
  }
}
