import {
  confirmGenerationJobReceipt,
  rejectGenerationJobReservation,
  reserveGenerationJob,
  type GenerationJob,
  type GenerationJobActor,
} from '@/lib/generation-jobs'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { applyStyleAnchor, type AnchorableSubmit, type ResolvedStyleAnchor } from '@/lib/style-anchor'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'
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
  const endpointModel = resolveImageEndpoint(modelKey, !!anchored.reference_image_urls?.length).endpoint
  const finalOpts: AnchorableSubmit = { ...anchored, model: endpointModel }

  // 자리 예약이 먼저다(#generation-capacity-trigger 2026-09-14): 트리거가 네 축을 원자적으로 판정하므로
  //   제출을 먼저 하면 거절된 순간 이미 유료 요청이 나간 뒤다(감사 2026-09-11). 접수 번호는 제출 뒤 채운다.
  const job = await reserveGenerationJob({
    projectId: input.projectId,
    model: endpointModel,
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

  try {
    // 외부 접수는 한 번뿐이다. 응답을 잃은 호출을 SDK 재시도로 복제하지 않는다(러프와 같은 이유 —
    //   예약이 이미 자리를 잡고 있으니 재시도는 같은 그림의 이중 발주다).
    // falKeyId: 트리거가 여유 있는 계정으로 바꿔 넣었을 수 있어 반드시 예약 행의 값으로 제출한다.
    const receipt = await falImageSubmit(
      { ...finalOpts, webhookUrl: resolveWebhookUrl() },
      { retry: false, falKeyId: job.fal_key_id },
    )
    try {
      await confirmGenerationJobReceipt(job.id, input.projectId, receipt)
    } catch (error) {
      // 이미 접수됐다 — 연결 저장 실패는 새 번호로 다시 발주할 근거가 아니다.
      console.error(
        '[world-submit] accepted receipt could not be saved:',
        job.id,
        error instanceof Error ? error.message : String(error),
      )
    }
    return { ...job, request_id: receipt.request_id, model: receipt.model, fal_key_id: receipt.fal_key_id }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // 확정 거절(4xx)만 예약을 닫는다. 통신 오류·5xx 는 이미 접수됐을 수 있어 queued 예약을 남긴다 —
    //   실패로 굳히면 같은 그림이 다시 발주된다(submit-rejection.ts 참고).
    if (isDefiniteSubmitRejection(error)) {
      await rejectGenerationJobReservation(job.id, input.projectId, message)
    }
    throw error
  }
}
