// 러프 스토리보드(pre-concept previz) 비동기 생성 — fal submit + generation_jobs.
//
// writer 탭 진입/버튼에서 호출. 서버가 대상 샷을 결정해 멱등으로 submit:
//   - rough_storyboard 가 이미 있는 샷 skip (force 제외)
//   - 같은 kind 의 queued 잡이 있는 샷 skip (재진입/더블클릭 중복 방지)
// 완료는 webhook(/poll reconcile)이 storage 업로드 + shots.rough_storyboard(JSONB) 갱신.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { createGenerationJob } from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { buildRoughStoryboardPrompt } from '@/lib/writer/rough-storyboard'

export const runtime = 'nodejs'
export const maxDuration = 60

const BodySchema = z.object({
  projectId: z.string().uuid(),
  /** 지정 시 해당 샷만 (per-shot 재생성). 미지정 시 누락분 전체. */
  shotIds: z.array(z.string()).optional(),
  /** true 면 기존 rough_storyboard 가 있어도 재생성 (단, queued 잡 중복은 여전히 skip) */
  force: z.boolean().optional(),
})

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user)
      return NextResponse.json(
        { ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } },
        { status: 401 },
      )

    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success)
      return NextResponse.json(
        { ok: false, error: { code: 'bad_request', message: parsed.error.message } },
        { status: 400 },
      )
    const { projectId, shotIds, force } = parsed.data

    const quota = await checkUserQuota(user.id)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .maybeSingle()
    if (!project)
      return NextResponse.json(
        { ok: false, error: { code: 'not_found', message: 'project not found' } },
        { status: 404 },
      )

    const [{ data: shots }, { data: scenes }, { data: chars }, { data: queuedJobs }] =
      await Promise.all([
        supabaseAdmin
          .from('shots')
          .select(
            'shot_id, scene_id, shot_type, action_description, characters, camera_config, lighting_config, focal_length, aperture, rough_storyboard',
          )
          .eq('project_id', projectId)
          .order('sort_order'),
        supabaseAdmin
          .from('scenes')
          .select('scene_id, location, time_of_day, mood')
          .eq('project_id', projectId),
        supabaseAdmin
          .from('characters')
          .select('character_id, name')
          .eq('project_id', projectId),
        supabaseAdmin
          .from('generation_jobs')
          .select('target')
          .eq('project_id', projectId)
          .eq('kind', 'shot_rough_storyboard')
          .eq('status', 'queued'),
      ])

    const sceneById = new Map((scenes ?? []).map((s) => [s.scene_id as string, s]))
    const nameById = new Map(
      (chars ?? []).map((c) => [c.character_id as string, c.name as string]),
    )
    const inFlight = new Set(
      (queuedJobs ?? [])
        .map((j) => (j.target as { writerShotId?: string })?.writerShotId)
        .filter(Boolean),
    )

    const wanted = shotIds?.length
      ? (shots ?? []).filter((s) => shotIds.includes(s.shot_id as string))
      : (shots ?? [])

    const submitted: Array<{ shotId: string; jobId: string }> = []
    const skipped: Array<{ shotId: string; reason: 'exists' | 'in_flight' }> = []

    for (const s of wanted) {
      const shotId = s.shot_id as string
      if (inFlight.has(shotId)) {
        skipped.push({ shotId, reason: 'in_flight' })
        continue
      }
      if (!force && s.rough_storyboard) {
        skipped.push({ shotId, reason: 'exists' })
        continue
      }

      const scene = sceneById.get(s.scene_id as string)
      const camera = (s.camera_config ?? {}) as { pan?: number }
      const lighting = (s.lighting_config ?? {}) as { position?: string }
      const prompt = buildRoughStoryboardPrompt({
        shotType: (s.shot_type as string) ?? 'MS',
        actionDescription: (s.action_description as string) ?? '',
        characterNames: ((s.characters as string[]) ?? []).map(
          (id) => nameById.get(id) ?? id,
        ),
        location: scene?.location as string | undefined,
        timeOfDay: scene?.time_of_day as string | undefined,
        mood: scene?.mood as string | undefined,
        cameraPitch: camera.pan ?? null,
        focalLength: (s.focal_length as number | null) ?? null,
        aperture: (s.aperture as number | null) ?? null,
        lightPosition: lighting.position ?? null,
        aspectRatio: '16:9',
      })

      const { request_id, model } = await falImageSubmit({
        prompt,
        aspect_ratio: '16:9',
        webhookUrl: resolveWebhookUrl(),
      })
      const job = await createGenerationJob({
        projectId,
        requestId: request_id,
        model,
        kind: 'shot_rough_storyboard',
        target: { workspaceId: project.workspace_id, writerShotId: shotId },
      })
      submitted.push({ shotId, jobId: job.id })
    }

    return NextResponse.json({ ok: true, data: { submitted, skipped } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/rough-storyboard]', msg)
    return NextResponse.json(
      { ok: false, error: { code: 'internal', message: msg } },
      { status: 500 },
    )
  }
}
