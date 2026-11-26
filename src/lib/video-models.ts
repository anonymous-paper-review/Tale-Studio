// ============================================================================
// Video model registry — Director 영상 생성 모델 카탈로그.
//
// FAL reference-to-video 모델 7종을 단일 레지스트리로 묶는다(2026-11-26 MiniMax H3 Max · H3 Max Turbo 추가). generate-video
// 라우트가 이 spec으로 input(duration/audio/resolution)을 구성하고, store/popup이
// model key·label·가격 힌트를 소비한다.
//
// 2026-10-11: self-hosted('local') 모델을 지웠다 — 결제 심사용 정책 문서가 밝힌
// 처리 업체(fal 등) 밖으로 사용자 글·그림이 나가는 길을 남기지 않는다. 예전에
// 저장된 'local' 이름은 normalizeProvider 가 기본 모델로 바꿔 읽는다.
//
// duration 처리(#4):
//   - flexible 모델(happy-horse/seedance/seedance-2.5/kling-o3): shot durationSeconds를 그대로
//     duration(정수)로 전달 (1안). clampDuration으로 min~max 안에 가둔다.
//   - fixed 모델(veo): API가 8초 고정("8s"). 에디터가 shot durationSeconds로 트림
//     하고, 라우트는 prompt에 "N초 후 black screen" 지시를 덧붙인다 (2안).
// ============================================================================

export type VideoModelKey =
  | 'happy-horse'
  | 'seedance'
  | 'seedance-2.5'
  | 'kling-o3'
  | 'veo'
  | 'h3-max'
  | 'h3-max-turbo'

/** duration 파라미터 처리 방식 */
export type VideoModelDuration =
  | { mode: 'flexible'; min: number; max: number }
  | { mode: 'fixed'; seconds: 8; value: '8s' }

export interface VideoModelSpec {
  key: VideoModelKey
  /** 사람이 읽는 라벨 (UI 표기) */
  label: string
  /** FAL 엔드포인트 */
  endpoint: string
  /** duration 파라미터 처리 (flexible=정수 초, fixed=8s 고정) */
  duration: VideoModelDuration
  /** reference 이미지 파라미터 이름 — image_urls, MiniMax H3 는 reference_image_urls */
  refParam: 'image_urls' | 'reference_image_urls'
  /** 오디오 토글 파라미터 이름. null = 토글 없음(네이티브) */
  audioParam: 'generate_audio' | 'audio' | null
  /**
   * 오디오 기본값. **현재 전 모델 ON** — `91b83f6`(2026-06-06)이 넷 다 true 로 바꿨다.
   *   (이 주석은 그 커밋 전의 "전 모델 OFF" 문구가 남아 있던 것을 코드에 맞춘 것이다.)
   *   `audioParam` 이 null 인 모델(happy-horse)은 이 값이 전송되지 않는다 —
   *   `generate-video/route.ts:173-174` 가 `audioParam` 이 있을 때만 실어 보낸다.
   */
  audioDefault: boolean
  /** 지원 해상도 목록. 빈 배열 = 미노출 */
  resolutions: string[]
  /** 기본 해상도 */
  defaultResolution: string
  /** 오디오 없을 때 초당 대략 가격 (UI 힌트, USD). 0 = 미표기 */
  pricePerSecNoAudio: number
  /**
   * 첫 · 마지막 장면 칸(2026-11-26 H3 Max) — 있으면 시작 · 끝 그림을 이 칸에도 싣는다(영상이 정확히 그 그림으로 시작 · 끝남).
   *   참고 그림 목록(refParam)은 그대로 둔다: H3 참고 입구는 참고 그림 0장이면 거절하고(2026-10-12 실측 422),
   *   지시문의 "image 1 = START, image 2 = END"가 그 목록 순서를 가리킨다. 가운데 장면 칸(middle_image_url)은 쓰지 않는다 —
   *   Director 의 가운데 장은 화살표를 그린 설명 그림이다.
   */
  frameParams?: { start: 'image_url'; end: 'end_image_url' }
  /** 고른 해상도 → 모델이 받는 값(이름이 다를 때만 — H3 = 768P · 1080P, 720P 가 없어 720p 는 768P). 없으면 고른 값 그대로. */
  resolutionValues?: Partial<Record<VideoResolution, string>>
  /** false = negative_prompt 칸이 없는 모델(Happy Horse · H3) — 보내지 않는다. */
  negativePrompt?: false
  /** 받는 화면비 — 있으면 이 목록 밖 값은 보내지 않는다(모델 기본). 없으면 늘 보낸다. */
  aspectRatios?: readonly string[]
  /** 참고 그림 목록 상한(fal 스키마) — 넘치면 뒤에서부터 덜어 낸다. 없으면 그대로. */
  maxRefImages?: number
  /**
   * ② 레퍼런스 방식에서 한 번에 보낼 그림 수(오너 2026-11-27 N4a · dev fb1120-video 값 — fal 스키마 11/22 확인).
   *   Seedance 2.0 · Happy Horse · H3 9 · Seedance 2.5 는 30 까지 받지만 다른 모델과 같은 9 · Veo 는 fal 표에 상한이 없어 구글 문서의 참고 그림 3장 ·
   *   Kling 은 4. 넘으면 소품 → 배경 → 인물 순으로 뒤에서부터 덜어 낸다(video-submit). 손 배선 길은 이 값을 쓰지 않는다(지금 그대로).
   */
  maxImageUrls: number
  /** 참고 그림의 가장 작은 변(px) — 더 작은 그림은 서버가 비율 그대로 키워 보낸다(H3 = 256, m-qa 2026-11-27). 없으면 크기를 보지 않는다. */
  minImageSide?: number
  /** 늘 같이 보내는 값 — H3 는 글 다시 쓰기를 끈다(prompt_expansion_mode 는 필수 칸, 대체 미니맥스와 같은 값). */
  fixedInput?: Readonly<Record<string, string>>
}

// 2026-08-31 오너 확정: 기본 생성기를 Seedance 2.0 으로 전환 (종전 happy-horse).
//   주의: min 4s — 계획 4초 미만 샷은 제출 시 4초로 클램프되고, 에디터 #d11 자동 트림이
//   초과분(죽은 꼬리)을 실측 길이 기준으로 잘라낸다.
export const DEFAULT_VIDEO_MODEL: VideoModelKey = 'seedance'

/** UI 모델 선택지 순서(#ui-cleanup 2026-08-31) — fal.ai 카탈로그 모델만. H3 Max 계열(2026-11-26)은 지금 다섯 뒤. */
export const FAL_VIDEO_MODEL_ORDER: VideoModelKey[] = [
  'seedance',
  'seedance-2.5',
  'happy-horse',
  'kling-o3',
  'veo',
  'h3-max',
  'h3-max-turbo',
]

/** H3 이 받는 화면비 — fal 스키마(2026-11-26 OpenAPI). 'adaptive' 는 보내지 않는다. */
const H3_ASPECT_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const
/** H3 공통 칸 — 해상도 이름(768P · 1080P) · 글 다시 쓰기 끔 · 참고 그림 9장 · negative_prompt 없음 · 소리는 늘 같이 만든다(칸 없음). */
const H3_COMMON: Omit<VideoModelSpec, 'key' | 'label' | 'endpoint'> = {
  duration: { mode: 'flexible', min: 1, max: 15 },
  refParam: 'reference_image_urls',
  audioParam: null,
  audioDefault: true,
  resolutions: ['720p', '1080p'],
  defaultResolution: '720p',
  // fal 가격표(2026-11-26): 768p 초당 $0.08 · 1080p $0.16 — 소리는 늘 같이 만든다.
  pricePerSecNoAudio: 0.08,
  resolutionValues: { '720p': '768P', '1080p': '1080P' },
  negativePrompt: false,
  aspectRatios: H3_ASPECT_RATIOS,
  maxRefImages: 9,
  maxImageUrls: 9,
  // fal 거절 실측(m-qa 2026-11-27): "Minimum dimensions are 256x256" — 9:16 일괄 실사 칸(235 × 421)은 서버가 키워 보낸다(video-ref-min-size).
  minImageSide: 256,
  fixedInput: { prompt_expansion_mode: 'disabled' },
}

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
    maxImageUrls: 9,
    negativePrompt: false,
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
    maxImageUrls: 9,
  },
  // 2026-11-01 오너: 디렉터 영상 모델에 Seedance 2.5 를 더한다. fal 에는 미국 서버 입구(us)만 있다.
  //   fal 은 30초까지 받지만 Take 가 길이와 상관없는 한 편 값이라 다른 모델과 같은 15초에서 끊는다. 4k 는 없다.
  //   초당 가격 힌트 = Seedance 2.0 × 1.53(1000 토큰당 0.0214 대 0.014 달러, 2026-11-01 fal 가격표).
  'seedance-2.5': {
    key: 'seedance-2.5',
    label: 'Seedance 2.5',
    endpoint: 'bytedance/seedance-2.5/us/reference-to-video',
    duration: { mode: 'flexible', min: 4, max: 15 },
    refParam: 'image_urls',
    audioParam: 'generate_audio',
    audioDefault: true,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    pricePerSecNoAudio: 0.4622,
    maxImageUrls: 9,
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
    maxImageUrls: 4,
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
    maxImageUrls: 3,
  },
  // 2026-11-26 오너 D4 "영상모델 H3 Max 계열 추가" — fal 의 MiniMax H3 Max(첫 · 마지막 장면 칸 있음)와 H3 Max Turbo(참고 그림만).
  //   대체 모델 "미니맥스"(video-fallback)도 H3 Max 다 — 그쪽은 늘 768P · 참고 그림이 없으면 image-to-video 입구.
  'h3-max': {
    key: 'h3-max',
    label: 'H3 Max',
    endpoint: 'minimax/h3-max/reference-to-video',
    ...H3_COMMON,
    frameParams: { start: 'image_url', end: 'end_image_url' },
  },
  'h3-max-turbo': {
    key: 'h3-max-turbo',
    label: 'H3 Max Turbo',
    endpoint: 'minimax/h3-max-turbo/reference-to-video',
    ...H3_COMMON,
  },
}

// 해상도 선택(오너 2026-10-31): 영상 노드에서 720p · 1080p 중 고른다. 처음은 720p(종전과 같음).
//   고른 값은 모델이 낼 수 있을 때만 쓴다 — 해상도 칸이 없는 모델(Kling O3 Pro)은 모델 기본값으로 만든다.
//   Take 배수(1080p = 두 배)는 take-cost 가, 실제 요청 값은 fal-video-request 가 이 판정을 같이 쓴다.
export const VIDEO_RESOLUTION_CHOICES = ['720p', '1080p'] as const
export type VideoResolution = (typeof VIDEO_RESOLUTION_CHOICES)[number]
export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = '720p'

export function isVideoResolution(value: unknown): value is VideoResolution {
  return (VIDEO_RESOLUTION_CHOICES as readonly unknown[]).includes(value)
}

/** 이 모델로 해상도를 고를 수 있나 — 고를 수 있는 값(720p · 1080p)을 하나도 내지 않으면 false. */
export function canChooseVideoResolution(modelKey: VideoModelKey): boolean {
  return VIDEO_RESOLUTION_CHOICES.some((resolution) => VIDEO_MODELS[modelKey].resolutions.includes(resolution))
}

/** 실제로 만들 해상도 — 고른 값을 모델이 낼 수 있으면 그 값, 아니면(고르지 않음 · 모르는 값 · 못 내는 모델) 모델 기본값. */
export function effectiveVideoResolution(modelKey: VideoModelKey, requested: unknown): VideoResolution {
  const spec = VIDEO_MODELS[modelKey]
  if (isVideoResolution(requested) && spec.resolutions.includes(requested)) return requested
  return isVideoResolution(spec.defaultResolution) ? spec.defaultResolution : DEFAULT_VIDEO_RESOLUTION
}

/** flexible 모델의 duration을 spec 범위(min~max)로 가두고 정수로 반올림. fixed는 seconds 반환. */
export function clampDuration(spec: VideoModelSpec, seconds: number): number {
  if (spec.duration.mode === 'fixed') return spec.duration.seconds
  const { min, max } = spec.duration
  const v = Math.round(seconds)
  return Math.min(max, Math.max(min, v))
}

/**
 * legacy provider('kling') 및 임의 문자열 → VideoModelKey 정규화.
 * 지워진 self-hosted 이름('local')과 모르는 이름은 기본 모델로 떨어진다 —
 * 거절이 아니라 기본 모델로 읽어 예전 저장 데이터가 깨지지 않게 한다.
 */
export function normalizeProvider(p: string): VideoModelKey {
  if (p === 'kling') return 'kling-o3' // legacy alias
  if (p in VIDEO_MODELS) return p as VideoModelKey
  return DEFAULT_VIDEO_MODEL
}
