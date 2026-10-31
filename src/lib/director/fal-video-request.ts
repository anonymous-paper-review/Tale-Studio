// fal 영상 요청 만들기·보내기 — 첫 제출(video-submit)과 실패 후 다른 모델로 넘기기(video-fallback)가 함께 쓴다.
import { FalUnknownKeyError, falKeyById } from '@/lib/fal/keys'
import { assertModerationReceipt, type ModerationReceipt } from '@/lib/moderation/creem'
import { VIDEO_MODELS, clampDuration, effectiveVideoResolution, type VideoModelKey } from '@/lib/video-models'

export type FalVideoSubmitRequest = {
  model: string
  input: Record<string, unknown>
}

/* ── FAL.ai reference-to-video (레지스트리 기반, #5) ──
   V2 refs(#real-strip 2026-07-22): imageUrls 가 [START, END] 2장이면 시작·끝 구도 고정 —
   전 모델 refParam 이 image_urls 배열이라 스키마 변경 없이 원소만 늘어난다.
   resolution(오너 2026-10-31): 영상 노드가 고른 해상도. 없거나 모델이 못 내는 값이면 모델 기본 해상도. */
export function buildFalReferenceToVideoRequest(
  modelKey: VideoModelKey,
  prompt: string,
  imageUrls: string[],
  durationSeconds: number,
  aspectRatio: string,
  resolution?: string | null,
): FalVideoSubmitRequest {
  const spec = VIDEO_MODELS[modelKey]
  if (!spec.endpoint) throw new Error('FAL reference-to-video endpoint missing')
  const input: Record<string, unknown> = {
    prompt,
    [spec.refParam]: imageUrls,
  }
  // happy-horse는 negative_prompt 미지원(모델 스키마) — 헛송신 제거(#tfix-fal-wiring 2026-08-11).
  //   고정 negative_prompt 계약 자체는 타 모델에서 유지(존폐는 별도 논의 — 카탈로그 B12).
  if (modelKey !== 'happy-horse') {
    input.negative_prompt = 'blurry, low quality, distorted, deformed'
  }

  // duration: flexible=정수(clamp), fixed(veo)='8s'
  if (spec.duration.mode === 'fixed') {
    input.duration = spec.duration.value
  } else {
    input.duration = clampDuration(spec, durationSeconds)
  }

  // audio: 토글 있는 모델만 — 현재 전 모델 audioDefault=true(91b83f6, 음성은 영상 생성기에
  //   맡긴다는 방침의 전제). 대사 절(#g7)이 가청 대사를 요구하므로 여기가 꺼지면 반쪽이 된다.
  if (spec.audioParam) {
    input[spec.audioParam] = spec.audioDefault
  }

  // resolution: 노출하는 모델만 — 고른 해상도(낼 수 있을 때) 또는 기본 해상도
  if (spec.resolutions.length > 0) {
    input.resolution = effectiveVideoResolution(modelKey, resolution)
  }

  // aspect_ratio: kling-o3는 미노출(확실치 않아 omit), 그 외 전달
  if (modelKey !== 'kling-o3') {
    input.aspect_ratio = aspectRatio
  }

  return { model: spec.endpoint, input }
}

export async function submitFalReferenceToVideo(
  request: FalVideoSubmitRequest,
  webhookUrl: string | undefined,
  falKeyId: unknown,
  /** Creem 검사 통과 영수증(#creem-moderation 2026-10-11) — 필수 인자라 검사 없는 제출은 타입 오류다. */
  moderation: ModerationReceipt,
) {
  // 제출 직전 마지막 검문 — 저장된 스냅샷에서 꺼낸 값이라 타입만으로는 모양을 보장할 수 없다.
  assertModerationReceipt(moderation, 'Video submission')
  const normalizedFalKeyId = typeof falKeyId === 'string' && falKeyId.trim() ? falKeyId : null
  const k = normalizedFalKeyId ? falKeyById(normalizedFalKeyId) : null
  if (!k || k.id !== normalizedFalKeyId) throw new FalUnknownKeyError(normalizedFalKeyId)
  const { request_id } = await k.client.queue.submit(
    request.model,
    webhookUrl ? { input: request.input, webhookUrl } : { input: request.input },
  )
  return {
    taskId: request_id,
    provider: 'fal' as const,
    model: request.model,
    falKeyId: k.id,
  }
}
