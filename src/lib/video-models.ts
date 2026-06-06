// ============================================================================
// Video model registry — Director 영상 생성 모델 카탈로그.
//
// FAL reference-to-video 모델 4종 + self-hosted(local) 1종을 단일 레지스트리로
// 묶는다. generate-video 라우트가 이 spec으로 input(duration/audio/resolution)을
// 구성하고, store/popup이 model key·label·가격 힌트를 소비한다.
//
// duration 처리(#4):
//   - flexible 모델(happy-horse/seedance/kling-o3): shot durationSeconds를 그대로
//     duration(정수)로 전달 (1안). clampDuration으로 min~max 안에 가둔다.
//   - fixed 모델(veo): API가 8초 고정("8s"). 에디터가 shot durationSeconds로 트림
//     하고, 라우트는 prompt에 "N초 후 black screen" 지시를 덧붙인다 (2안).
// ============================================================================

export type VideoModelKey =
  | 'happy-horse'
  | 'seedance'
  | 'kling-o3'
  | 'veo'
  | 'local'

/** duration 파라미터 처리 방식 */
export type VideoModelDuration =
  | { mode: 'flexible'; min: number; max: number }
  | { mode: 'fixed'; seconds: 8; value: '8s' }

export interface VideoModelSpec {
  key: VideoModelKey
  /** 사람이 읽는 라벨 (UI 표기) */
  label: string
  /** FAL 엔드포인트. local은 '' (hunyuan 경로) */
  endpoint: string
  /** duration 파라미터 처리 (flexible=정수 초, fixed=8s 고정) */
  duration: VideoModelDuration
  /** reference 이미지 파라미터 이름 (전 모델 image_urls) */
  refParam: 'image_urls'
  /** 오디오 토글 파라미터 이름. null = 토글 없음(네이티브) */
  audioParam: 'generate_audio' | 'audio' | null
  /** 오디오 기본값 (전 모델 OFF) */
  audioDefault: boolean
  /** 지원 해상도 목록. 빈 배열 = 미노출 */
  resolutions: string[]
  /** 기본 해상도 */
  defaultResolution: string
  /** 오디오 없을 때 초당 대략 가격 (UI 힌트, USD). 0 = 미표기/local */
  pricePerSecNoAudio: number
}

export const DEFAULT_VIDEO_MODEL: VideoModelKey = 'happy-horse'

export const VIDEO_MODELS: Record<VideoModelKey, VideoModelSpec> = {
  'happy-horse': {
    key: 'happy-horse',
    label: 'Happy Horse',
    endpoint: 'alibaba/happy-horse/reference-to-video',
    duration: { mode: 'flexible', min: 3, max: 15 },
    refParam: 'image_urls',
    audioParam: null,
    audioDefault: true,
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    pricePerSecNoAudio: 0.14,
  },
  seedance: {
    key: 'seedance',
    label: 'Seedance 2.0',
    endpoint: 'bytedance/seedance-2.0/reference-to-video',
    duration: { mode: 'flexible', min: 4, max: 15 },
    refParam: 'image_urls',
    audioParam: 'generate_audio',
    audioDefault: true,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    pricePerSecNoAudio: 0.3024,
  },
  'kling-o3': {
    key: 'kling-o3',
    label: 'Kling O3 Pro',
    endpoint: 'fal-ai/kling-video/o3/pro/reference-to-video',
    duration: { mode: 'flexible', min: 3, max: 15 },
    refParam: 'image_urls',
    audioParam: 'audio',
    audioDefault: true,
    resolutions: [],
    defaultResolution: '720p',
    pricePerSecNoAudio: 0.112,
  },
  veo: {
    key: 'veo',
    label: 'Veo 3.1',
    endpoint: 'fal-ai/veo3.1/reference-to-video',
    duration: { mode: 'fixed', seconds: 8, value: '8s' },
    refParam: 'image_urls',
    audioParam: 'generate_audio',
    audioDefault: true,
    resolutions: ['720p', '1080p', '4k'],
    defaultResolution: '720p',
    pricePerSecNoAudio: 0.2,
  },
  local: {
    key: 'local',
    label: 'Self-hosted',
    endpoint: '',
    duration: { mode: 'flexible', min: 1, max: 15 },
    refParam: 'image_urls',
    audioParam: null,
    audioDefault: true,
    resolutions: [],
    defaultResolution: '720p',
    pricePerSecNoAudio: 0,
  },
}

/** flexible 모델의 duration을 spec 범위(min~max)로 가두고 정수로 반올림. fixed는 seconds 반환. */
export function clampDuration(spec: VideoModelSpec, seconds: number): number {
  if (spec.duration.mode === 'fixed') return spec.duration.seconds
  const { min, max } = spec.duration
  const v = Math.round(seconds)
  return Math.min(max, Math.max(min, v))
}

/** legacy provider('kling'/'veo'/'local') 및 임의 문자열 → VideoModelKey 정규화. */
export function normalizeProvider(p: string): VideoModelKey {
  if (p === 'kling') return 'kling-o3' // legacy alias
  if (p in VIDEO_MODELS) return p as VideoModelKey
  return DEFAULT_VIDEO_MODEL
}
