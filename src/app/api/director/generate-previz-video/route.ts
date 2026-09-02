// 목각 previz 영상 생성(#previz-video 2026-07-22) — 러프 3프레임의 START+END 를 reference 로
// happy-horse reference-to-video 를 돌려 "연출 판독용" 흑백 목각 인형 영상을 만든다 (V2 방식,
// shot_9 실측 검증: 스케치 룩 유지 + END 프레이밍 수렴). 완료는 webhook → shots.previz_video.
//   실사 테이크(video_clips/generate-video)와 분리된 단순 파생물 — Node 뷰 무영향.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { falVideoSubmit } from '@/lib/writer/llm/fal'
import { createGenerationJob, failGenerationJob, STALE_QUEUED_MS } from '@/lib/generation-jobs'
import { checkGenerationCapacity, checkProjectVideoBudget } from '@/lib/generation-quota'
import { quotaRejectionResponse, videoBudgetRejectionResponse } from '@/lib/api/quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { deriveEnBatch } from '@/lib/writer/i18n/derive-en'
import { holdTakesForVideoJob, releaseTakesForJob } from '@/lib/billing/take-hold'
import { takeCostForPreviz } from '@/lib/billing/take-cost'

export const runtime = 'nodejs'
export const maxDuration = 60

const BodySchema = z.object({
  projectId: z.string().uuid(),
  writerShotId: z.string().min(1),
})

/** 목각 previz 영상 프롬프트 — shot_9 실측 검증본(2026-07-22)을 템플릿화.
 *  스타일 유지 절이 본체 — 모션은 START→END 수렴(V2) + 액션 한 줄 보조. */
function buildPrevizVideoPrompt(actionEn: string, durationSeconds: number): string {
  return `Rough previz storyboard animation in monochrome pencil-sketch style. The references are hand-drawn black-and-white pencil previsualization frames of ONE film shot: the first image is the START frame, the second image is the END frame after the camera and figure movement completes. The figures are wooden artist mannequins (ball-jointed pose dolls with blank featureless egg-shaped heads, no faces).

Animate from the START frame composition to the END frame composition over ${durationSeconds} seconds, keeping the rough monochrome pencil-sketch look in every frame — grayscale only, visible sketch lines, hatching and paper texture, no color, no photorealism, never turn it into a photograph. The figures remain wooden mannequins with blank faceless heads at all times.${actionEn ? `\n\nAction in this shot: ${actionEn}` : ''}

Slow, deliberate, readable movement — this is a previsualization for judging camera work and blocking. Nothing else changes.`
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    const { projectId, writerShotId } = parsed.data

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const budget = await checkProjectVideoBudget(projectId, access.userId!) // #f4 총량 게이트
    if (!budget.ok) return videoBudgetRejectionResponse(budget, { projectId, kind: 'shot_previz_video', userId: access.userId })
    const quota = await checkGenerationCapacity(access.userId!, 'video')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'shot_previz_video', userId: access.userId })

    const [{ data: project }, { data: shot }, { data: queued }] = await Promise.all([
      supabaseAdmin.from('projects').select('workspace_id').eq('id', projectId).maybeSingle(),
      supabaseAdmin
        .from('shots')
        .select('shot_id, action_description, duration_seconds, rough_storyboard')
        .eq('project_id', projectId)
        .eq('shot_id', writerShotId)
        .maybeSingle(),
      supabaseAdmin
        .from('generation_jobs')
        .select('id')
        .eq('project_id', projectId)
        .eq('kind', 'shot_previz_video')
        .eq('status', 'queued')
        .gte('created_at', new Date(Date.now() - STALE_QUEUED_MS).toISOString())
        .contains('target', { writerShotId }),
    ])
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    if (!shot) return NextResponse.json({ error: 'shot not found' }, { status: 404 })
    if (queued?.length)
      return NextResponse.json({ error: 'previz video already generating' }, { status: 409 })

    // V2 refs: 러프 3프레임의 START+END. 없으면(구버전 단일 패널) 생성 불가 — 러프 재생성 유도.
    const frames = (shot.rough_storyboard as { frames?: { start?: string; end?: string } } | null)
      ?.frames
    if (!frames?.start || !frames?.end) {
      return NextResponse.json(
        { error: 'rough storyboard frames missing — generate the rough storyboard in the writer tab first' },
        { status: 422 },
      )
    }

    // 언어 경계: action 은 native 일 수 있음 → EN 정규화(이미 EN 이면 LLM skip).
    const action = ((shot.action_description as string) ?? '').trim()
    const actionEn = action
      ? (await deriveEnBatch([{ id: 'a', native: action }], 'shot action description')).get('a') ??
        action
      : ''
    const duration = Math.max(3, Math.min(15, Math.round((shot.duration_seconds as number) || 5)))

    const { request_id, model, fal_key_id } = await falVideoSubmit({
      prompt: buildPrevizVideoPrompt(actionEn, duration),
      image_url: frames.start,
      image_urls: [frames.start, frames.end],
      duration,
      aspect_ratio: '16:9',
      webhookUrl: resolveWebhookUrl(),
    })
    const job = await createGenerationJob({
      projectId,
      requestId: request_id,
      model,
      falKeyId: fal_key_id,
      kind: 'shot_previz_video',
      target: { workspaceId: project.workspace_id as string, writerShotId },
      inputSnapshot: {
        prompt: buildPrevizVideoPrompt(actionEn, duration),
        image_urls: [frames.start, frames.end],
        duration,
      },
    })

    // #payments-phase-2 #gen-quota-atomic-gate: Take hold — 잡은 이미 제출된 뒤라 부족이어도
    //   이 생성은 되돌릴 수 없다(fal 이미 과금된 상태) — hold 가 enforce 부족이면 잡을 즉시 실패
    //   처리하고 402 로 안내한다(이미 제출된 fal 요청은 별도 정산이 필요 — v4 슬라이스 범위 밖).
    const holdAmount = takeCostForPreviz()
    const hold = await holdTakesForVideoJob({
      workspaceId: project.workspace_id as string,
      userId: access.userId!,
      jobId: job.id,
      amount: holdAmount,
    })
    if (!hold.ok && hold.insufficient) {
      try {
        await failGenerationJob(job.id, 'insufficient_takes')
      } catch (transitionErr) {
        console.error('[director/generate-previz-video] insufficient-takes failure transition failed:', transitionErr instanceof Error ? transitionErr.message : transitionErr)
      }
      return NextResponse.json(
        { error: 'insufficient_takes', required: holdAmount, balance: hold.balance },
        { status: 402 },
      )
    }

    // 낙관 상태 기록 — UI 폴링 전 새로고침에도 '생성 중'이 보이게.
    await supabaseAdmin
      .from('shots')
      .update({
        previz_video: {
          url: (shot.rough_storyboard as { url?: string } | null)?.url ?? '',
          status: 'generating',
          errorMessage: null,
          generatedAt: Date.now(),
        },
      })
      .eq('project_id', projectId)
      .eq('shot_id', writerShotId)

    return NextResponse.json({ jobId: job.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[director/generate-previz-video]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
