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
   참고 그림 칸(refParam: image_urls · H3 는 reference_image_urls) 배열에 원소만 늘어난다.
   resolution(오너 2026-10-31): 영상 노드가 고른 해상도. 없거나 모델이 못 내는 값이면 모델 기본 해상도.
   H3 Max 계열(오너 2026-11-26 D4): 이름이 다른 칸은 레지스트리가 정한다 — 첫 · 마지막 장면 칸(H3 Max), 768P · 1080P,
     글 다시 쓰기 끔, negative_prompt 없음, 참고 그림 9장. roles 는 그림마다의 역할(start · end · ref)이고, 모르면(예전 요청)
     첫 그림 = 시작, 마지막 그림 = 끝(2장 이상)으로 본다 — 지시문의 "첫 그림 = START, 마지막 그림 = END"와 같은 판정. */
export function buildFalReferenceToVideoRequest(
  modelKey: VideoModelKey,
  prompt: string,
  imageUrls: string[],
  durationSeconds: number,
  aspectRatio: string,
  resolution?: string | null,
  roles?: readonly string[] | null,
): FalVideoSubmitRequest {
  const spec = VIDEO_MODELS[modelKey]
  if (!spec.endpoint) throw new Error('FAL reference-to-video endpoint missing')
  const input: Record<string, unknown> = {
    prompt,
    [spec.refParam]: spec.maxRefImages ? imageUrls.slice(0, spec.maxRefImages) : imageUrls,
  }
  // 첫 · 마지막 장면 칸(H3 Max) — 참고 그림 목록은 그대로 두고 시작 · 끝 그림을 이 칸에도 싣는다(video-models frameParams).
  if (spec.frameParams) {
    const frames = startEndFrames(imageUrls, roles)
    if (frames.start) input[spec.frameParams.start] = frames.start
    if (frames.end) input[spec.frameParams.end] = frames.end
  }
  // happy-horse · H3 는 negative_prompt 미지원(모델 스키마) — 헛송신 제거(#tfix-fal-wiring 2026-08-11).
  //   고정 negative_prompt 계약 자체는 타 모델에서 유지(존폐는 별도 논의 — 카탈로그 B12).
  if (spec.negativePrompt !== false) {
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

  // resolution: 노출하는 모델만 — 고른 해상도(낼 수 있을 때) 또는 기본 해상도. 이름이 다른 모델(H3 = 768P · 1080P)은 그 이름으로.
  if (spec.resolutions.length > 0) {
    const chosen = effectiveVideoResolution(modelKey, resolution)
    input.resolution = spec.resolutionValues?.[chosen] ?? chosen
  }

  // aspect_ratio: kling-o3는 미노출(확실치 않아 omit). 받는 목록이 있는 모델(H3)은 그 안의 값만, 그 외 전달.
  if (modelKey !== 'kling-o3' && (!spec.aspectRatios || spec.aspectRatios.includes(aspectRatio))) {
    input.aspect_ratio = aspectRatio
  }

  // 늘 같이 보내는 값(H3: prompt_expansion_mode 'disabled').
  if (spec.fixedInput) Object.assign(input, spec.fixedInput)

  return { model: spec.endpoint, input }
}

/** 시작 · 끝 그림 — 역할이 있으면 역할로, 없으면(예전 요청) 첫 그림 = 시작 · 마지막 그림 = 끝(2장 이상일 때). */
function startEndFrames(imageUrls: readonly string[], roles: readonly string[] | null | undefined): { start: string | null; end: string | null } {
  if (roles && roles.length === imageUrls.length) {
    const at = (role: string) => {
      const index = roles.indexOf(role)
      return index >= 0 ? imageUrls[index] ?? null : null
    }
    return { start: at('start'), end: at('end') }
  }
  return { start: imageUrls[0] ?? null, end: imageUrls.length >= 2 ? imageUrls[imageUrls.length - 1] ?? null : null }
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
