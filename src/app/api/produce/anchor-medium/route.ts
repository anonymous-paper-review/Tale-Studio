// POST /api/produce/anchor-medium — 만화 그림체로 정할 그림의 매체(애니 · 카툰 · 실사 등)를 고른다 (2026-10-09).
//   그림체 등록(/api/produce/style-anchor)은 허용 목록 안의 매체가 있어야 받는다. 채팅에서 "이 그림체로"라고 하면 채팅 모델이
//   그림을 보고 목록에서 고르는데, 만화 원고로 그대로 영상화는 채팅을 거치지 않으므로 여기서 같은 일을 한다.
//   모델은 제안만 하고 목록 밖 답은 버린다(lib/style-facets/medium.ts). 고르지 못하면 실패로 돌려준다 — 실사로 채우지 않는다.
// 동의: 그림을 분석 모델에 보내는 일이라 그림체 분석과 같은 동의 판을 받는다(lib/style-facets/consent.ts).
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import { isOwnMediaUrl } from '@/lib/upload/attachment'
import { listStyleAnchorMediums } from '@/lib/style-anchor'
import { isAnalysisConsent } from '@/lib/style-facets/consent'
import { pickAnchorMedium } from '@/lib/style-facets/medium-llm'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { projectId?: unknown; imageUrl?: unknown; consent?: unknown } | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : ''
  if (!projectId) return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })
  if (!isAnalysisConsent(body?.consent)) return NextResponse.json({ error: 'analysis_consent_required' }, { status: 400 })
  if (!isOwnMediaUrl(imageUrl)) return NextResponse.json({ error: 'Only images uploaded to this project can be analyzed.' }, { status: 400 })
  if (!(await userOwnsProject(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const allowed = await listStyleAnchorMediums()
    if (allowed.length === 0) return NextResponse.json({ error: 'medium_list_unavailable' }, { status: 503 })
    const { medium } = await pickAnchorMedium(imageUrl, allowed)
    if (!medium) return NextResponse.json({ error: 'medium_pick_failed' }, { status: 502 })
    return NextResponse.json({ medium })
  } catch (error) {
    console.error('[anchor-medium] failed:', error)
    return NextResponse.json({ error: 'medium_pick_failed' }, { status: 502 })
  }
}
