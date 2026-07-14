// 샷 스토리보드 이미지(I2I) 비동기 생성 — fal submit + generation_jobs.
//
// 캐릭터 뷰/월드 샷과 동일 패턴: submit만 하고 jobId 반환 → 완료는 webhook(/poll reconcile)이
// storage 업로드 + shots.storyboard_image(JSONB) 갱신. 프롬프트/레퍼런스는 호출자(director-store)가 전달.
// writerShotId(=shots.shot_id) 필수 — DB 영속 키. 수동 노드(shot_id 없음)는 호출자가 기존 동기 경로 사용.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { createGenerationJob } from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { applyStyleAnchor, resolveStyleAnchorByKey, type AnchorableSubmit } from '@/lib/style-anchor'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 멀티유저 쿼터 (Phase 3): 유저 in-flight 작업이 상한이면 429.
    const quota = await checkUserQuota(user.id)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const { projectId, writerShotId, prompt, referenceImageUrls, aspectRatio } =
      (await req.json()) as {
        projectId?: string
        writerShotId?: string
        prompt?: string
        referenceImageUrls?: string[]
        aspectRatio?: string
      }

    if (!projectId || !writerShotId || !prompt) {
      return NextResponse.json(
        { error: 'projectId, writerShotId, prompt required' },
        { status: 400 },
      )
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id, style_anchor_key')
      .eq('id', projectId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    const anchor = await resolveStyleAnchorByKey(project.style_anchor_key)

    const callerRefs = referenceImageUrls?.length ? referenceImageUrls : undefined
    const baseOpts: AnchorableSubmit = {
      prompt,
      aspect_ratio: aspectRatio ?? '16:9',
      ...(callerRefs ? { reference_image_urls: callerRefs } : {}),
    }
    const mode = callerRefs ? 'multiref' : 'single'
    const finalOpts = anchor ? applyStyleAnchor(anchor, baseOpts, mode) : baseOpts

    const { request_id, model } = await falImageSubmit({
      ...finalOpts,
      webhookUrl: resolveWebhookUrl(),
    })

    const job = await createGenerationJob({
      projectId,
      requestId: request_id,
      model,
      kind: 'shot_storyboard',
      userId: user.id,
      workspaceId: project.workspace_id,
      provider: 'fal',
      inputSnapshot: {
        prompt: finalOpts.prompt,
        aspect_ratio: finalOpts.aspect_ratio,
        reference_image_urls: finalOpts.reference_image_urls,
        ...(finalOpts.model ? { model: finalOpts.model } : {}),
        style_anchor_key: anchor?.key ?? null,
      },
      target: { workspaceId: project.workspace_id, writerShotId },
    })

    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[director/generate-storyboard]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
