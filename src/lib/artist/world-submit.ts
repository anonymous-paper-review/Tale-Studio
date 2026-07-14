import { createGenerationJob, type GenerationJob, type GenerationJobActor } from '@/lib/generation-jobs'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { applyStyleAnchor, type AnchorableSubmit, type ResolvedStyleAnchor } from '@/lib/style-anchor'
import { falImageSubmit } from '@/lib/writer/llm/fal'

export interface SubmitWorldShotJobInput {
  projectId: string
  locationId: string
  column: 'wide_shot'
  prompt: string
  aspectRatio?: string | null
  sourceHash?: string | null
  actor: GenerationJobActor
  userId?: string | null
  workspaceId?: string | null
  anchor?: ResolvedStyleAnchor | null
}

export async function submitWorldShotJob(
  input: SubmitWorldShotJobInput,
): Promise<GenerationJob> {
  const baseOpts: AnchorableSubmit = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? '16:9',
  }
  const finalOpts = input.anchor ? applyStyleAnchor(input.anchor, baseOpts, 'single') : baseOpts

  const { request_id, model } = await falImageSubmit({
    ...finalOpts,
    webhookUrl: resolveWebhookUrl(),
  })

  return createGenerationJob({
    projectId: input.projectId,
    requestId: request_id,
    model,
    kind: 'world_shot',
    actor: input.actor,
    userId: input.userId,
    workspaceId: input.workspaceId ?? undefined,
    provider: 'fal',
    inputSnapshot: {
      prompt: finalOpts.prompt,
      aspect_ratio: finalOpts.aspect_ratio,
      ...(finalOpts.reference_image_urls ? { reference_image_urls: finalOpts.reference_image_urls } : {}),
      ...(finalOpts.model ? { model: finalOpts.model } : {}),
      source_hash: input.sourceHash ?? null,
      style_anchor_key: input.anchor?.key ?? null,
    },
    target: { workspaceId: input.workspaceId ?? undefined, locationId: input.locationId, column: input.column },
  })
}
