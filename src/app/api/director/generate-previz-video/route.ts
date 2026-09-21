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
import { falKeyById, pickFalKey } from '@/lib/fal/keys'
import { createGenerationJob, failGenerationJob, STALE_QUEUED_MS } from '@/lib/generation-jobs'
import { checkGenerationCapacity, checkProjectVideoBudget, syncFalKeyLimits } from '@/lib/generation-quota'
import { quotaRejectionResponse, videoBudgetRejectionResponse, capacityReservationRejection } from '@/lib/api/quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { deriveEnBatch } from '@/lib/writer/i18n/derive-en'
import { holdTakesForVideoJob, releaseTakesForJob } from '@/lib/billing/take-hold'
import { takeCostForPreviz } from '@/lib/billing/take-cost'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'

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
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!shot) return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
    if (queued?.length)
      return NextResponse.json({ error: 'Previz video already generating' }, { status: 409 })

    // V2 refs: 러프 3프레임의 START+END. 없으면(구버전 단일 패널) 생성 불가 — 러프 재생성 유도.
    const frames = (shot.rough_storyboard as { frames?: { start?: string; end?: string } } | null)
      ?.frames
    if (!frames?.start || !frames?.end) {
      return NextResponse.json(
        { error: 'Rough storyboard frames are missing. Generate the rough storyboard in the Writer tab first' },
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

    const prompt = buildPrevizVideoPrompt(actionEn, duration)

    // 기록 → Take → 제출 순서다(#previz-record-before-submit 2026-09-08).
    //   예전에는 제출이 맨 앞이라 두 가지가 샜다. (1) 제출과 행 생성 사이에 요청이 죽으면 fal 은
    //   만들고 과금하는데 추적 행이 없어 webhook 이 와도 버려졌다. (2) 잔액 0 인 사용자도 제출이
    //   먼저 나가 회사 비용만 나갔다. 본 영상은 이미 예약이 제출보다 앞이다(generate-video:790).
    //   제출 전 잡은 request_id='reserved:<id>' 로 남고, 제출이 끝나면 실제 id 로 교체한다.
    //   접수 여부가 확인되기 전에는 예약과 사용량을 그대로 유지해 중복 제출·비용을 막는다.
    // 제출 전에 키 상한을 동기화하고 키를 먼저 고른다 — 동기화가 실패하면 예약·과금·제출을
    //   모두 시작하지 않는다. 작업 행에 fal_key_id 를 기록해야 조회 경로가 그 키를 쓴다.
    await syncFalKeyLimits()
    //   키 선택은 과금이 아니다(여유가 가장 큰 키를 고르는 계산일 뿐).
    const falKey = await pickFalKey()
    let job: Awaited<ReturnType<typeof createGenerationJob>>
    // #video-capacity-trigger: 기록 RPC 자체가 동시 경쟁 한도 거절을 던질 수 있다 — 이 예외만 이 자리에서
    //   429 로 전환한다(hold/provider 는 아직 불리지 않았다). 다른 예외는 그대로 바깥 층의 기존 catch 로 전파된다.
    try {
      job = await createGenerationJob({
        projectId,
        requestId: `reserved:${crypto.randomUUID()}`,
        // 제출 전이라 실제 모델을 모른다(falVideoSubmit 의 기본값을 쓴다). 제출 뒤 교체한다.
        model: 'pending',
        falKeyId: falKey.id,
        kind: 'shot_previz_video',
        target: { workspaceId: project.workspace_id as string, writerShotId },
        inputSnapshot: {
          prompt,
          image_urls: [frames.start, frames.end],
          duration,
        },
      })
    } catch (createError) {
      const rejection = capacityReservationRejection(createError, { projectId, kind: 'shot_previz_video', userId: access.userId })
      if (rejection) return rejection
      throw createError
    }

    // #payments-phase-2 #gen-quota-atomic-gate: Take hold — 제출 앞이므로 부족이면 아직 되돌릴 수 있다.
    const holdAmount = takeCostForPreviz()
    const hold = await holdTakesForVideoJob({
      workspaceId: project.workspace_id as string,
      userId: access.userId!,
      jobId: job.id,
      amount: holdAmount,
      projectId,
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

    let request_id: string
    let model: string
    let fal_key_id: string
    try {
      // 동시 예약 트리거가 요청한 키를 다른 계정으로 바꿔 넣을 수 있다. 제출은 반드시 insert
      // 반환 행의 최종 키로만 한다 — 처음 고른 키를 재사용하면 webhook 조회가 엇갈린다.
      const submitFalKey = falKeyById(job.fal_key_id)
      if (!submitFalKey) {
        throw Object.assign(new Error(`unknown fal key id: ${job.fal_key_id ?? '(missing)'}`), { status: 400 })
      }
      ;({ request_id, model, fal_key_id } = await falVideoSubmit({
        prompt,
        image_url: frames.start,
        image_urls: [frames.start, frames.end],
        duration,
        aspect_ratio: '16:9',
        webhookUrl: resolveWebhookUrl(),
      }, submitFalKey))
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError)
      if (isDefiniteSubmitRejection(submitError)) {
        // 제출이 확실히 실패했으면 잡아둔 Take 를 즉시 돌려준다. 알 수 없는 최종 키도
        //   외부에 전혀 보내지 않았으므로 같은 경로로 닫는다.
        try {
          await failGenerationJob(job.id, message)
        } catch (transitionErr) {
          console.error('[director/generate-previz-video] submit failure transition failed:', transitionErr instanceof Error ? transitionErr.message : transitionErr)
        }
        try {
          await releaseTakesForJob(job.id)
        } catch (releaseErr) {
          console.error('[director/generate-previz-video] take release failed:', releaseErr instanceof Error ? releaseErr.message : releaseErr)
        }
        throw submitError
      }
      // 접수 여부가 모호하면(408/425/429/5xx·통신 오류) 이미 외부에 들어갔을 수 있다.
      //   failed 로 닫거나 Take 를 반환하지 않고 reserved: queued 행을 그대로 보존한다.
      console.error('[director/generate-previz-video] submit outcome unknown, reservation kept:', job.id, message)
      return NextResponse.json({ jobId: job.id, status: 'queued' })
    }

    // 제출 성공 — reserved: 를 실제 provider 요청 id 로 교체한다. 이게 있어야 webhook 이 매칭된다.
    const { error: attachError } = await supabaseAdmin
      .from('generation_jobs')
      .update({ request_id, model, fal_key_id, submitted_at: new Date().toISOString(), attempts: 1 })
      .eq('id', job.id)
      .eq('status', 'queued')
    if (attachError) {
      // 교체 실패는 치명적이지 않다 — 접수 여부를 확인할 수 없으므로 reserved: queued 행과
      //   잡아 둔 사용량을 그대로 보존한다. 확인 전 재제출·환급은 중복 비용을 만들 수 있다.
      console.error('[director/generate-previz-video] attach provider request failed:', attachError.message)
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
