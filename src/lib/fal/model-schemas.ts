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

// xai/grok-imagine-image text-to-image schema. Same inputs as the edit variant minus image_urls.
const GROK_IMAGINE_IMAGE_FIELDS = [
  'prompt',
  'aspect_ratio',
  'resolution',
  'output_format',
  'num_images',
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

// fal-ai/nano-banana (Google Gemini) text-to-image schema. Uses aspect_ratio, not image_size.
const NANO_BANANA_FIELDS = [
  'prompt',
  'num_images',
  'seed',
  'aspect_ratio',
  'output_format',
  'safety_tolerance',
  'sync_mode',
  'limit_generations',
] as const

// fal-ai/nano-banana/edit image-to-image schema. References are image_urls; aspect_ratio adds 'auto'.
const NANO_BANANA_EDIT_FIELDS = [
  'prompt',
  'image_urls',
  'num_images',
  'seed',
  'aspect_ratio',
  'output_format',
  'safety_tolerance',
  'sync_mode',
  'limit_generations',
] as const

// fal-ai/nano-banana-2 (Google Gemini 3.1 Flash Image) text-to-image schema (fal 문서 2026-09-02 실측).
//   aspect_ratio(auto·21:9~1:8) + resolution(0.5K/1K/2K/4K, 기본 1K). image_size 없음.
const NANO_BANANA_2_FIELDS = [
  'prompt',
  'num_images',
  'seed',
  'aspect_ratio',
  'output_format',
  'safety_tolerance',
  'sync_mode',
  'system_prompt',
  'resolution',
  'limit_generations',
  'enable_web_search',
  'thinking_level',
] as const

// fal-ai/nano-banana-2/edit image-to-image schema. References are image_urls (up to 14); video/audio/pdf refs also exist.
const NANO_BANANA_2_EDIT_FIELDS = [
  'prompt',
  'image_urls',
  'num_images',
  'seed',
  'aspect_ratio',
  'output_format',
  'safety_tolerance',
  'sync_mode',
  'system_prompt',
  'resolution',
  'video_url',
  'audio_url',
  'pdf_url',
  'limit_generations',
  'enable_web_search',
  'thinking_level',
] as const

// fal-ai/bytedance/seedream/v4/text-to-image schema. Uses image_size (min 960², max 4096²).
const SEEDREAM_V4_T2I_FIELDS = [
  'prompt',
  'image_size',
  'num_images',
  'max_images',
  'seed',
  'sync_mode',
  'enable_safety_checker',
  'enhance_prompt_mode',
] as const

// fal-ai/bytedance/seedream/v4/edit image-to-image schema. References are image_urls (up to 10).
const SEEDREAM_V4_EDIT_FIELDS = [
  'prompt',
  'image_urls',
  'image_size',
  'num_images',
  'max_images',
  'seed',
  'sync_mode',
  'enable_safety_checker',
  'enhance_prompt_mode',
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
  'xai/grok-imagine-image': fieldSet(GROK_IMAGINE_IMAGE_FIELDS),
  'xai/grok-imagine-image/edit': fieldSet(GROK_IMAGINE_IMAGE_EDIT_FIELDS),
  'fal-ai/flux-2/klein/9b': fieldSet(FLUX_2_KLEIN_9B_FIELDS),

  'fal-ai/nano-banana': fieldSet(NANO_BANANA_FIELDS),
  'fal-ai/nano-banana/edit': fieldSet(NANO_BANANA_EDIT_FIELDS),
  'fal-ai/nano-banana-2': fieldSet(NANO_BANANA_2_FIELDS),
  'fal-ai/nano-banana-2/edit': fieldSet(NANO_BANANA_2_EDIT_FIELDS),
  'fal-ai/bytedance/seedream/v4/text-to-image': fieldSet(SEEDREAM_V4_T2I_FIELDS),
  'fal-ai/bytedance/seedream/v4/edit': fieldSet(SEEDREAM_V4_EDIT_FIELDS),
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
