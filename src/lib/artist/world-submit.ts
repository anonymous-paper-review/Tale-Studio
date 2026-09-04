import { createGenerationJob, type GenerationJob, type GenerationJobActor } from '@/lib/generation-jobs'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { applyStyleAnchor, type AnchorableSubmit, type ResolvedStyleAnchor } from '@/lib/style-anchor'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { DEFAULT_WORLD_IMAGE_MODEL, resolveImageEndpoint, type ImageModelKey } from '@/lib/image-models'

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
  chatTraceId?: string | null
  /** 이미지 생성 모델(약속 B5) — 없으면 배경 기본값(DEFAULT_WORLD_IMAGE_MODEL = 지금 것, GPT Image 2). */
  model?: ImageModelKey | null
  /** 콘텐츠 정책 거절 뒤 우회 재시도(약속 B9) — 실패 집계의 safeFailCount 기준으로 스냅샷에 남긴다. */
  safeMode?: boolean
  /** 배경 설명(EN base)의 해시 — 후보의 appearance_hash 로 저장돼 "설명 바뀜"(B7) 판정 근거가 된다. */
  descriptionHash?: string | null
  /** 배경 모습(약속 C10) — 변형 키. 없거나 'default' 면 locations 행(기본 모습)이 대상. */
  appearanceKey?: string | null
  /** 변형 생성의 연속성 참조(기본 모습 wide_shot) — 캐릭터가 기본 얼굴을 참조하는 것과 같다. */
  referenceImageUrls?: string[] | null
}

export async function submitWorldShotJob(
  input: SubmitWorldShotJobInput,
): Promise<GenerationJob> {
  const modelKey: ImageModelKey = input.model ?? DEFAULT_WORLD_IMAGE_MODEL
  const refs = (input.referenceImageUrls ?? []).filter((u) => typeof u === 'string' && !!u)
  const baseOpts: AnchorableSubmit = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? '16:9',
    ...(refs.length ? { reference_image_urls: refs } : {}),
  }
  const anchored = input.anchor ? applyStyleAnchor(input.anchor, baseOpts, refs.length ? 'multiref' : 'single') : baseOpts
  // 모델은 참조(앵커 이미지) 유무에 따라 t2i/edit 엔드포인트를 고른다 — 캐릭터 시트 라우트와 같은 규칙.
  const finalOpts: AnchorableSubmit = {
    ...anchored,
    model: resolveImageEndpoint(modelKey, !!anchored.reference_image_urls?.length).endpoint,
  }

  const { request_id, model, fal_key_id } = await falImageSubmit({
    ...finalOpts,
    webhookUrl: resolveWebhookUrl(),
  })

  return createGenerationJob({
    projectId: input.projectId,
    requestId: request_id,
    model,
    falKeyId: fal_key_id,
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
      appearance_hash: input.descriptionHash ?? null,
      style_anchor_key: input.anchor?.key ?? null,
      image_model: modelKey,
      ...(input.safeMode ? { safe_mode: true } : {}),
    },
    chatTraceId: input.chatTraceId ?? null,
    target: {
      workspaceId: input.workspaceId ?? undefined,
      locationId: input.locationId,
      column: input.column,
      ...(input.appearanceKey && input.appearanceKey !== 'default' ? { appearanceKey: input.appearanceKey } : {}),
    },
  })
}
