// 영상 생성처가 실패를 알리면 같은 테이크를 다음 모델로 이어서 만든다(오너 지시 2026-10-12).
//
// 왜: 최근 30일 영상 실패 17건이 전부 Seedance 2.0 의 "실제 사람과 닮았다" 거절이었다(실사 그림체).
//   실패로 끝내는 대신 미니맥스 → 해피홀스 순서로 다시 만든다. 이미 시도한 모델은 건너뛴다.
//
// 같은 작업 행을 그대로 쓴다 — 새 테이크·새 작업을 만들지 않는다. 화면은 같은 작업을 계속 기다리고,
//   잡아둔 이용권도 그대로 둔다(돌려주지도 더 잡지도 않는다). 대체 모델이 더 싸도 차액을 돌려주지 않는다 —
//   사용자는 고른 모델 값을 내고 영상을 받는다(오너 확인 2026-10-12). 마지막 모델까지 실패해야
//   markDirectorVideoAttemptFailed 로 실패 처리하고 그때 이용권을 돌려준다.
//
// 해상도(오너 2026-10-31): 다음 모델도 처음 고른 해상도(작업 기록의 resolution)를 낼 수 있으면 그 값으로 만든다 —
//   해피홀스는 1080p 를 낸다. 미니맥스는 늘 768P 다. 1080p 로 잡은 Take 도 위 규칙대로 그대로 둔다.
//
// 차지(claim): 실패한 요청 id 를 들고 있는 queued 작업만 'reserved:' 로 바꿔 차지한다. 웹훅과 폴링이
//   같은 실패를 동시에 보더라도 한 쪽만 다음 모델을 보낸다. 'reserved:' 상태는 폴링·청소가 손대지 않는
//   "제출 중" 표시이고, 제출이 끝나면 attach 가 새 요청 id 로 바꾼다(첫 제출과 같은 순서).
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  attachProviderRequestToReservedVideoJob,
  markDirectorVideoAttemptFailed,
} from '@/lib/director-video-takes'
import { getGenerationJobById, type GenerationJob } from '@/lib/generation-jobs'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import type { ModerationReceipt } from '@/lib/moderation/creem'
import {
  type FalVideoSubmitRequest,
  buildFalReferenceToVideoRequest,
  submitFalReferenceToVideo,
} from '@/lib/director/fal-video-request'
import type { Json } from '@/types/database'

/** 실패 후 넘어갈 모델 순서. 처음 요청한 모델과 이미 시도한 모델은 건너뛴다. */
export const VIDEO_FALLBACK_CHAIN = ['minimax', 'happy-horse'] as const
export type VideoFallbackModel = (typeof VIDEO_FALLBACK_CHAIN)[number]

/**
 * MiniMax H3 Max 입구. 참고 영상 모드(reference-to-video)는 인물·화풍 참고 그림이 한 장 이상 있어야
 * 받아준다(시작·끝 그림만 보내면 422). 그래서 가진 그림에 따라 입구를 고른다 — 참고 그림이 있으면
 * reference, 시작·끝 그림만 있으면 image, 그림이 없으면 text. (2026-10-12 실제 호출로 확인)
 */
export const MINIMAX_FALLBACK_ENDPOINTS = {
  reference: 'minimax/h3-max/reference-to-video',
  image: 'minimax/h3-max/image-to-video',
  text: 'minimax/h3-max/text-to-video',
} as const
const MINIMAX_ASPECT_RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'])

type VideoFallbackStep = {
  model: VideoFallbackModel
  endpoint: string
  /** 이 모델로 넘어오게 만든 직전 실패 사유. */
  reason: string
  started_at: string
}

interface FallbackPlan {
  snapshot: Record<string, unknown>
  /** 처음 요청한 모델(resolved_model_key). */
  primaryModel: string | null
  steps: VideoFallbackStep[]
  imageUrls: string[]
  roles: string[] | null
  moderation: ModerationReceipt
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readSteps(snapshot: Record<string, unknown>): VideoFallbackStep[] {
  const record = snapshot.video_fallback
  if (!isRecord(record) || !Array.isArray(record.steps)) return []
  return record.steps.filter((step): step is VideoFallbackStep =>
    isRecord(step) && (VIDEO_FALLBACK_CHAIN as readonly unknown[]).includes(step.model),
  )
}

function readImages(snapshot: Record<string, unknown>): { imageUrls: string[]; roles: string[] | null } {
  const urls = Array.isArray(snapshot.reference_image_urls)
    ? snapshot.reference_image_urls.filter((url): url is string => typeof url === 'string' && url.length > 0)
    : typeof snapshot.reference_image_url === 'string' && snapshot.reference_image_url
      ? [snapshot.reference_image_url]
      : []
  const roles = Array.isArray(snapshot.reference_image_roles)
    && snapshot.reference_image_roles.length === urls.length
    && snapshot.reference_image_roles.every((role) => typeof role === 'string')
    ? snapshot.reference_image_roles as string[]
    : null
  return { imageUrls: urls, roles }
}

/** 다음 모델로 넘길 수 있는 작업인지 — 넘길 재료(최종 프롬프트·검사 영수증)가 없으면 null. */
function readFallbackPlan(job: GenerationJob): FallbackPlan | null {
  if (job.kind !== 'shot_video' || !job.video_clip_id) return null
  const snapshot = job.input_snapshot
  if (!isRecord(snapshot)) return null
  if (typeof snapshot.full_prompt !== 'string' || !snapshot.full_prompt.trim()) return null
  const moderation = snapshot.moderation
  if (!isRecord(moderation) || (moderation.decision !== 'allow' && moderation.decision !== 'skipped')) return null
  return {
    snapshot,
    primaryModel: typeof snapshot.resolved_model_key === 'string' ? snapshot.resolved_model_key : null,
    steps: readSteps(snapshot),
    ...readImages(snapshot),
    moderation: moderation as unknown as ModerationReceipt,
  }
}

/** 아직 시도하지 않은 다음 모델. 해피홀스는 참고 그림이 있어야 만들 수 있다. */
export function nextVideoFallbackModel(triedModels: readonly string[], hasImages: boolean): VideoFallbackModel | null {
  for (const model of VIDEO_FALLBACK_CHAIN) {
    if (triedModels.includes(model)) continue
    if (model === 'happy-horse' && !hasImages) continue
    return model
  }
  return null
}

function buildMinimaxRequest(plan: FallbackPlan, prompt: string, durationSeconds: number, aspectRatio: string): FalVideoSubmitRequest {
  const { imageUrls, roles } = plan
  const start = roles ? imageUrls[roles.indexOf('start')] : imageUrls[0]
  const end = roles ? imageUrls[roles.indexOf('end')] : undefined
  const refs = roles
    ? imageUrls.filter((_, index) => roles[index] === 'ref')
    : imageUrls.slice(1)
  const input: Record<string, unknown> = {
    prompt,
    // 우리 프롬프트는 모션 계약·대사까지 담은 완성본이다 — 모델이 다시 쓰지 않게 한다.
    prompt_expansion_mode: 'disabled',
    duration: Math.min(15, Math.max(1, durationSeconds)),
    resolution: '768P',
  }
  if (start) input.image_url = start
  if (end) input.end_image_url = end
  if (refs.length) input.reference_image_urls = refs
  // 첫·끝 장면 그림이 있으면 화면 비율은 그림을 따른다. 그림이 없을 때만 비율을 지정한다(image 입구에는 비율 칸이 없다).
  if (!start && !end && MINIMAX_ASPECT_RATIOS.has(aspectRatio)) input.aspect_ratio = aspectRatio
  const endpoint = refs.length
    ? MINIMAX_FALLBACK_ENDPOINTS.reference
    : start || end
      ? MINIMAX_FALLBACK_ENDPOINTS.image
      : MINIMAX_FALLBACK_ENDPOINTS.text
  return { model: endpoint, input }
}

function buildFallbackRequest(model: VideoFallbackModel, plan: FallbackPlan): FalVideoSubmitRequest {
  const prompt = plan.snapshot.full_prompt as string
  const durationSeconds = typeof plan.snapshot.duration_seconds === 'number' && Number.isFinite(plan.snapshot.duration_seconds)
    ? plan.snapshot.duration_seconds
    : 5
  const aspectRatio = typeof plan.snapshot.aspect_ratio === 'string' ? plan.snapshot.aspect_ratio : '16:9'
  if (model === 'minimax') return buildMinimaxRequest(plan, prompt, durationSeconds, aspectRatio)
  const resolution = typeof plan.snapshot.resolution === 'string' ? plan.snapshot.resolution : null
  return buildFalReferenceToVideoRequest(model, prompt, plan.imageUrls, durationSeconds, aspectRatio, resolution)
}

/** 실패한 요청 id 를 아직 들고 있는 queued 작업만 'reserved:' 로 차지한다. 다른 처리가 먼저 가져갔으면 false. */
async function claimForFallback(
  job: GenerationJob,
  expectedRequestId: string,
  snapshot: Record<string, unknown>,
  reason: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .update({
      request_id: `reserved:${job.id}`,
      input_snapshot: snapshot as Json,
      last_error: reason.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'queued')
    .eq('request_id', expectedRequestId)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

function describeSubmitError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? `${error.message} (status ${status})` : error.message
}

/**
 * 생성처가 실패를 알린 연결된 영상 작업을 다음 모델로 넘긴다. 넘길 모델이 없거나 넘길 수 없는 작업이면
 * 실패로 끝낸다(이용권 반환 포함). 돌려주는 값은 처리 뒤의 작업 상태다.
 */
export async function failDirectorVideoAttemptOrFallback(job: GenerationJob, evidence: string): Promise<GenerationJob> {
  const plan = readFallbackPlan(job)
  let reason = evidence
  if (plan) {
    let steps = plan.steps
    let expectedRequestId = job.request_id
    for (;;) {
      const triedModels = [...(plan.primaryModel ? [plan.primaryModel] : []), ...steps.map((step) => step.model)]
      const next = nextVideoFallbackModel(triedModels, plan.imageUrls.length > 0)
      if (!next) break
      const request = buildFallbackRequest(next, plan)
      steps = [...steps, { model: next, endpoint: request.model, reason, started_at: new Date().toISOString() }]
      const snapshot = { ...plan.snapshot, video_fallback: { steps } }
      if (!await claimForFallback(job, expectedRequestId, snapshot, reason)) {
        // 웹훅과 폴링이 같은 실패를 함께 봤다 — 먼저 차지한 쪽이 다음 모델을 보낸다.
        return (await getGenerationJobById(job.id)) ?? job
      }
      expectedRequestId = `reserved:${job.id}`
      let submission: Awaited<ReturnType<typeof submitFalReferenceToVideo>>
      try {
        submission = await submitFalReferenceToVideo(request, resolveWebhookUrl(), job.fal_key_id, plan.moderation)
      } catch (error) {
        // 요청 자체가 바로 거절됐다 — 결과를 기다릴 것 없이 그다음 모델로 넘어간다.
        reason = `[fallback:${next}] ${describeSubmitError(error)}`
        console.error('[director/video-fallback] fallback submission rejected:', job.id, reason)
        continue
      }
      await attachProviderRequestToReservedVideoJob(job.project_id, job.id, submission.taskId, {
        provider: submission.provider,
        model: submission.model,
        falKeyId: submission.falKeyId,
      })
      console.warn('[director/video-fallback] video attempt moved to next model:', job.id, next)
      return {
        ...job,
        status: 'queued',
        request_id: submission.taskId,
        model: submission.model,
        error: null,
        input_snapshot: snapshot as Json,
      }
    }
  }
  await markDirectorVideoAttemptFailed(job.project_id, job.id, reason)
  return { ...job, status: 'failed', error: reason }
}
