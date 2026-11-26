// POST /api/artist/make-images { projectId, styleAnchorKey? } — Artist 새 흐름의 [이미지 만들기](m1126 O1 · O6, 리드 2026-11-26 2차).
//   산문 확정 뒤 디자인 · 씬 · 샷 나누기가 끝났고 그림은 아직이다. 고른 그림체가 지금과 다르면 작품 그림체와 그림 지시의
//   그림체 값(design_tokens.l1)을 새 그림체 것으로 저장하고([재생성하기]와 같은 규칙), 인물 · 배경 · 소품 첫 그림만 건다.
//   씬 · 샷 · 산문(Writer 실행)은 건드리지 않는다. 막는 때: 그림을 그리기 시작한 뒤의 그림체 바꾸기([재생성하기]로) ·
//   Storyboard 를 연 뒤의 그림체 바꾸기 · 이미 그리는 중 · 한도. 약속: tests/artist/make-images-route.test.ts
import { NextResponse } from 'next/server'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { quotaRejectionResponse } from '@/lib/api/quota'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { triggerAssetDrafts } from '@/lib/artist/draft-trigger'
import { artistImagesStarted } from '@/lib/artist/images-started'
import { activeCatalogStyle, freshQueuedDraftJobCount, MAKE_IMAGES_CODES, makeImagesStylePlan } from '@/lib/artist/make-images'
import { styleLookTokens } from '@/lib/artist/style-versions'
import { artistStyleLocked, designL1, readVersionProject, setProjectStyle, withDesignL1 } from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const reject = (code: string, error: string, status = 409) => NextResponse.json({ error, code }, { status })

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json().catch(() => null)) as { projectId?: string; styleAnchorKey?: string | null } | null
    const access = await requireProjectAccess(req, body?.projectId)
    if (!access.ok) return access.response
    const { projectId, userId } = access
    // 공유 열람(읽기 전용)으로는 그리지 않는다 — 소유자만.
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const project = await readVersionProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const requested = typeof body?.styleAnchorKey === 'string' ? body.styleAnchorKey.trim() : ''
    // 바꿀 때만 그림 시작 여부 · Storyboard 열림을 읽는다.
    const changing = !!requested && requested !== (project.style_anchor_key ?? '')
    const plan = makeImagesStylePlan({
      current: { styleKey: project.style_anchor_key, custom: project.custom_style_anchor },
      requested,
      imagesStarted: changing ? await artistImagesStarted(projectId) : false,
      storyboardOpened: changing ? await artistStyleLocked(project) : false,
    })
    if (plan.action === 'reject') return reject(plan.code, plan.error, plan.status)

    // 한도 · 그리는 중을 먼저 본다 — 막혔는데 그림체만 바뀌면 그리지도 않았는데 작품 그림체가 바뀐다.
    const quota = await checkGenerationCapacity(userId, 'image')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'artist_make_images', userId })
    if ((await freshQueuedDraftJobCount(projectId)) > 0) return reject(MAKE_IMAGES_CODES.alreadyQueued, 'Draft image generation already queued')

    let style: string | null = null
    if (plan.action === 'switch') {
      const catalog = await activeCatalogStyle(plan.key)
      if (!catalog) return reject(MAKE_IMAGES_CODES.unknownStyle, 'Unknown style', 400)
      // 그림체가 바뀌면 그림 지시의 그림체 값(매체 · 선 · 형태 · 질감)도 새 그림체 것으로 — [재생성하기]와 같은 규칙.
      const designTokens = withDesignL1(project.design_tokens, styleLookTokens(catalog.medium, designL1(project.design_tokens)))
      await setProjectStyle(projectId, catalog.key, null, designTokens)
      style = catalog.key
    }

    const result = await triggerAssetDrafts(projectId)
    if ('skipped_no_look' in result && result.skipped_no_look) return reject(MAKE_IMAGES_CODES.noLook, 'The designs are not ready yet')
    return NextResponse.json({ ok: true, style, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[artist/make-images]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
