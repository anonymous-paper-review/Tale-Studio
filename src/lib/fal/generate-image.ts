import {
  completeGenerationJob,
  confirmGenerationJobReceipt,
  failGenerationJob,
  rejectGenerationJobReservation,
  reserveGenerationJob,
} from '@/lib/generation-jobs'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'
import {
  DEFAULT_IMAGE_MODEL,
  falImageFetch,
  falImageSubmit,
  type FalImageFetchResult,
  type FalImageOptions,
  type FalImageResult,
} from '@/lib/writer/llm/fal'
import { moderatedSubmitInput, type ModerationReceipt } from '@/lib/moderation/creem'
import { recordModerationPass } from '@/lib/api/moderation'

const IMAGE_POLL_INTERVAL_MS = 1_000
const IMAGE_POLL_TIMEOUT_MS = 90_000

type ImageGenerationContext = {
  projectId: string
  userId?: string
  workspaceId?: string
}

/**
 * 프롬프트와 그 프롬프트의 검사 영수증은 함께 다닌다(#creem-moderation 2026-10-11) — 영수증이 필수라
 * 검사를 건너뛴 호출은 타입 오류가 난다. 영수증은 fal 요청에도 작업 스냅샷에도 들어가지 않는다
 * (아래에서 떼어내고, 통과 사실은 관측 이벤트가 남긴다). 인자로 따로 받지 않는 이유: 이 helper 의
 * 인자 개수는 기존 라우트 계약(테스트가 고정한 호출 모양)이라 늘리지 않는다.
 */
export type ModeratedImageOptions = FalImageOptions & { moderation: ModerationReceipt }

function timeoutError(model: string, requestId: string): Error {
  return new Error(`fal image generation timed out (${model}/${requestId})`)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchUntilDeadline(
  model: string,
  requestId: string,
  falKeyId: string,
  deadline: number,
): Promise<FalImageFetchResult> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw timeoutError(model, requestId)

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      falImageFetch(model, requestId, falKeyId),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(model, requestId)), remaining)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Reserve one image-generation slot, submit exactly once, and wait for that same
 * provider request. This helper deliberately does not download or store the image;
 * callers own the resulting URL and decide where the bytes belong.
 */
export async function generateReservedImage(
  opts: ModeratedImageOptions,
  context: ImageGenerationContext,
): Promise<FalImageResult> {
  // 영수증은 여기서 떼어낸다 — fal 요청도, 작업 스냅샷도 "보낼 입력"만 담는다.
  const { moderation, ...falOpts } = opts
  const job = await reserveGenerationJob({
    projectId: context.projectId,
    userId: context.userId,
    workspaceId: context.workspaceId,
    model: falOpts.model ?? DEFAULT_IMAGE_MODEL,
    kind: 'image_generation',
    provider: 'fal',
    inputSnapshot: { ...falOpts },
    target: {},
  })
  recordModerationPass(moderation, {
    projectId: context.projectId,
    kind: 'image_generation',
    userId: context.userId ?? null,
    jobId: job.id,
  })

  let receipt: Awaited<ReturnType<typeof falImageSubmit>>
  try {
    receipt = await falImageSubmit(
      moderatedSubmitInput(falOpts, moderation),
      { retry: false, falKeyId: job.fal_key_id },
    )
  } catch (error) {
    // Only an explicit, definitive provider rejection can close the reservation.
    // A missing response may still mean the provider accepted and queued the job.
    if (isDefiniteSubmitRejection(error)) {
      await rejectGenerationJobReservation(
        job.id,
        context.projectId,
        error instanceof Error ? error.message : String(error),
      )
    }
    throw error
  }

  // If this write fails, retain the reservation: the provider request may already
  // be running, and issuing another paid request would duplicate the image.
  await confirmGenerationJobReceipt(job.id, context.projectId, receipt)

  const deadline = Date.now() + IMAGE_POLL_TIMEOUT_MS
  while (true) {
    const result = await fetchUntilDeadline(
      receipt.model,
      receipt.request_id,
      job.fal_key_id,
      deadline,
    )

    if (result.status === 'COMPLETED') {
      await completeGenerationJob(job.id, result.url)
      return {
        url: result.url,
        width: result.width,
        height: result.height,
        raw: result.raw,
      }
    }

    if (result.status === 'FAILED') {
      const message =
        (typeof result.error === 'string' ? result.error.trim() : '') || 'fal image generation failed'
      await failGenerationJob(job.id, message)
      throw new Error(message)
    }

    const remaining = deadline - Date.now()
    if (remaining <= 0) throw timeoutError(receipt.model, receipt.request_id)
    await wait(Math.min(IMAGE_POLL_INTERVAL_MS, remaining))
  }
}
