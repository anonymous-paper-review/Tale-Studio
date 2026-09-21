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

const IMAGE_POLL_INTERVAL_MS = 1_000
const IMAGE_POLL_TIMEOUT_MS = 90_000

type ImageGenerationContext = {
  projectId: string
  userId?: string
  workspaceId?: string
}

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
  opts: FalImageOptions,
  context: ImageGenerationContext,
): Promise<FalImageResult> {
  const job = await reserveGenerationJob({
    projectId: context.projectId,
    userId: context.userId,
    workspaceId: context.workspaceId,
    model: opts.model ?? DEFAULT_IMAGE_MODEL,
    kind: 'image_generation',
    provider: 'fal',
    inputSnapshot: opts,
    target: {},
  })

  let receipt: Awaited<ReturnType<typeof falImageSubmit>>
  try {
    receipt = await falImageSubmit(opts, { retry: false, falKeyId: job.fal_key_id })
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
