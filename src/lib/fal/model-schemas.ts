import type { VideoModelKey } from '@/lib/video-models'

// fal OpenAPI sources: /api/openapi/queue/openapi.json?endpoint_id=<model>.
// This registry intentionally tracks accepted input keys only; type/range validation stays at submit builders.
type FalVideoModelKey = Exclude<VideoModelKey, 'local'>

const FAL_VIDEO_MODEL_ENDPOINTS: Record<FalVideoModelKey, string> = {
  'happy-horse': 'alibaba/happy-horse/reference-to-video',
  seedance: 'bytedance/seedance-2.0/reference-to-video',
  'kling-o3': 'fal-ai/kling-video/o3/pro/reference-to-video',
  veo: 'fal-ai/veo3.1/reference-to-video',
}

const fieldSet = (fields: readonly string[]): Set<string> => new Set(fields)

// alibaba/happy-horse/reference-to-video schema. Known fact: negative_prompt is unsupported.
const HAPPY_HORSE_REFERENCE_TO_VIDEO_FIELDS = [
  'prompt',
  'image_urls',
  'aspect_ratio',
  'resolution',
  'duration',
  'seed',
  'enable_safety_checker',
] as const

// bytedance/seedance-2.0/reference-to-video schema.
const SEEDANCE_REFERENCE_TO_VIDEO_FIELDS = [
  'prompt',
  'image_urls',
  'video_urls',
  'audio_urls',
  'resolution',
  'duration',
  'aspect_ratio',
  'generate_audio',
  'bitrate_mode',
  'end_user_id',
] as const

// fal-ai/kling-video/o3/pro/reference-to-video schema. Official audio toggle is generate_audio, not audio.
const KLING_O3_REFERENCE_TO_VIDEO_FIELDS = [
  'prompt',
  'multi_prompt',
  'start_image_url',
  'end_image_url',
  'image_urls',
  'elements',
  'generate_audio',
  'duration',
  'shot_type',
  'aspect_ratio',
] as const

// fal-ai/veo3.1/reference-to-video schema. negative_prompt is not an accepted Veo 3.1 R2V input.
const VEO31_REFERENCE_TO_VIDEO_FIELDS = [
  'prompt',
  'aspect_ratio',
  'duration',
  'resolution',
  'generate_audio',
  'auto_fix',
  'safety_tolerance',
  'image_urls',
] as const

// fal-ai/kling-video/v2.1/master/text-to-video schema used by Director's no-reference fallback.
const KLING_V21_MASTER_TEXT_TO_VIDEO_FIELDS = [
  'prompt',
  'duration',
  'aspect_ratio',
  'negative_prompt',
  'cfg_scale',
] as const

// fal-ai/kling-video/v2.1/master/image-to-video schema kept for image_url-based legacy probes.
const KLING_V21_MASTER_IMAGE_TO_VIDEO_FIELDS = [
  'prompt',
  'image_url',
  'duration',
  'negative_prompt',
  'cfg_scale',
] as const

// openai/gpt-image-2 text-to-image schema. Uses image_size, not aspect_ratio/reference_image_urls.
const GPT_IMAGE_2_FIELDS = [
  'prompt',
  'image_size',
  'quality',
  'num_images',
  'output_format',
  'sync_mode',
] as const

// openai/gpt-image-2/edit image-to-image schema. References are image_urls; mask_url is optional.
const GPT_IMAGE_2_EDIT_FIELDS = [
  'prompt',
  'image_urls',
  'image_size',
  'quality',
  'num_images',
  'output_format',
  'sync_mode',
  'mask_url',
] as const

// xai/grok-imagine-image/edit i2i schema (#arrow-layer). aspect_ratio 'auto' preserves input ratio;
//   no image_size/negative_prompt/seed inputs.
const GROK_IMAGINE_IMAGE_EDIT_FIELDS = [
  'prompt',
  'image_urls',
  'aspect_ratio',
  'resolution',
  'output_format',
  'num_images',
] as const

// fal-ai/flux-2/klein/9b schema. Known fact: distilled klein has no negative_prompt or CFG input.
const FLUX_2_KLEIN_9B_FIELDS = [
  'prompt',
  'seed',
  'num_inference_steps',
  'image_size',
  'num_images',
  'sync_mode',
  'enable_safety_checker',
  'output_format',
] as const

export const FAL_INPUT_ALLOWLIST: Record<string, Set<string>> = {
  'happy-horse': fieldSet(HAPPY_HORSE_REFERENCE_TO_VIDEO_FIELDS),
  [FAL_VIDEO_MODEL_ENDPOINTS['happy-horse']]: fieldSet(HAPPY_HORSE_REFERENCE_TO_VIDEO_FIELDS),

  seedance: fieldSet(SEEDANCE_REFERENCE_TO_VIDEO_FIELDS),
  [FAL_VIDEO_MODEL_ENDPOINTS.seedance]: fieldSet(SEEDANCE_REFERENCE_TO_VIDEO_FIELDS),

  'kling-o3': fieldSet(KLING_O3_REFERENCE_TO_VIDEO_FIELDS),
  [FAL_VIDEO_MODEL_ENDPOINTS['kling-o3']]: fieldSet(KLING_O3_REFERENCE_TO_VIDEO_FIELDS),

  veo: fieldSet(VEO31_REFERENCE_TO_VIDEO_FIELDS),
  [FAL_VIDEO_MODEL_ENDPOINTS.veo]: fieldSet(VEO31_REFERENCE_TO_VIDEO_FIELDS),

  'fal-ai/kling-video/v2.1/master/text-to-video': fieldSet(KLING_V21_MASTER_TEXT_TO_VIDEO_FIELDS),
  'fal-ai/kling-video/v2.1/master/image-to-video': fieldSet(KLING_V21_MASTER_IMAGE_TO_VIDEO_FIELDS),

  'openai/gpt-image-2': fieldSet(GPT_IMAGE_2_FIELDS),
  'openai/gpt-image-2/edit': fieldSet(GPT_IMAGE_2_EDIT_FIELDS),
  'xai/grok-imagine-image/edit': fieldSet(GROK_IMAGINE_IMAGE_EDIT_FIELDS),
  'fal-ai/flux-2/klein/9b': fieldSet(FLUX_2_KLEIN_9B_FIELDS),
}

export function getAllowedFields(modelKey: string | null | undefined): Set<string> | undefined {
  if (!modelKey) return undefined
  const allowed = FAL_INPUT_ALLOWLIST[modelKey]
  return allowed ? new Set(allowed) : undefined
}

export function computeIgnoredFields(
  sentBody: Record<string, unknown>,
  modelKey: string | null | undefined,
): string[] {
  const allowed = getAllowedFields(modelKey)
  if (!allowed) return []
  return Object.keys(sentBody).filter((field) => !allowed.has(field))
}

// 모델이 안 받는 필드(예: negative_prompt)를 보내면 fal이 조용히 무시하고 흔적이 관측 로그
// (computeIgnoredFields → ignored_fields)에만 남는다 — 응답을 받고서야 알 수 있는 늦은 신호다.
// pickAllowedFields는 같은 표(getAllowedFields)로 "보내기 직전에" 걸러 애초에 안 보낸다.
// 미등록 모델은 표가 없으므로 입력을 그대로 통과시킨다 — computeIgnoredFields가 미등록 모델에
// 빈 배열(= 아무것도 무시되지 않음)을 반환하는 계약과 대칭. 모르는 모델의 입력을 임의로 깎지 않는다.
export function pickAllowedFields<T extends Record<string, unknown>>(
  input: T,
  modelKey: string | null | undefined,
): T {
  const allowed = getAllowedFields(modelKey)
  if (!allowed) return input
  const filtered = {} as T
  for (const key of Object.keys(input) as Array<keyof T>) {
    if (allowed.has(key as string)) filtered[key] = input[key]
  }
  return filtered
}
