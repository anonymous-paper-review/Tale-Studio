// 월드 샷(wide/establishing) 비동기 생성 — fal T2I submit + generation_jobs.
//
// 캐릭터 뷰(generate-sheet)와 동일 패턴: submit만 하고 jobId 반환 → 완료는 webhook(/poll reconcile)이
// storage 업로드 + locations[column] 갱신. 프롬프트는 호출자(artist-store)가 빌드해 전달한다.
// fal 전용 — gemini/tailscale provider는 webhook 미지원이라 호출자가 기존 동기 경로를 쓴다.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { createGenerationJob } from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'

export const runtime = 'nodejs'
export const maxDuration = 60

const VALID_COLUMNS = new Set(['wide_shot', 'establishing_shot'])

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 멀티유저 쿼터 (Phase 3): 유저 in-flight 작업이 상한이면 429.
    const quota = await checkUserQuota(user.id)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const { projectId, locationId, column, prompt, aspectRatio } =
      (await req.json()) as {
        projectId?: string
        locationId?: string
        column?: string
        prompt?: string
        aspectRatio?: string
      }

    if (!projectId || !locationId || !column || !prompt) {
      return NextResponse.json(
        { error: 'projectId, locationId, column, prompt required' },
        { status: 400 },
      )
    }
    if (!VALID_COLUMNS.has(column)) {
      return NextResponse.json({ error: `invalid column: ${column}` }, { status: 400 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

    const { request_id, model } = await falImageSubmit({
      prompt,
      aspect_ratio: aspectRatio ?? '16:9',
      webhookUrl: resolveWebhookUrl(),
    })

    const job = await createGenerationJob({
      projectId,
      requestId: request_id,
      model,
      kind: 'world_shot',
      target: { workspaceId: project.workspace_id, locationId, column },
    })

    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-world]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
