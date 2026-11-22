// ============================================================================
// Video model registry — Director 영상 생성 모델 카탈로그.
//
// FAL reference-to-video 모델 5종을 단일 레지스트리로 묶는다. generate-video
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
  /** reference 이미지 파라미터 이름 (전 모델 image_urls) */
  refParam: 'image_urls'
  /** 오디오 토글 파라미터 이름. null = 토글 없음(네이티브). 2026-11-22: Kling 도 generate_audio(예전 'audio' 는 fal 이 버리던 이름). */
  audioParam: 'generate_audio' | null
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
   * image_urls 에 한 번에 보낼 수 있는 그림 수(방안 고장 1, 2026-11-22 — fal 스키마 11/22 확인).
   *   Seedance 2.0 9 · Happy Horse 1~9 · Seedance 2.5 는 30 까지 받지만 다른 모델과 같은 9 · Veo 는 fal 표에 상한이 없어
   *   구글 문서의 참고 그림 3장 · Kling 은 "영상 넣을 때 4" 문장을 따라 4. 넘으면 참고 그림만 뒤에서부터 덜어 낸다.
   */
  maxImageUrls: number
  /**
   * 첫 장면 · 마지막 장면을 따로 받는 칸(2026-11-22, fal 스키마 확인) — 있으면 시작 · 끝 그림은 image_urls 가 아니라 이 칸으로 가고
   *   image_urls 상한(maxImageUrls)에도 세지 않는다. 지금은 Kling O3 만 있다(나머지 R2V 입구는 그림 목록만 받는다).
   */
  frameSlots?: { start: 'start_image_url'; end: 'end_image_url' }
  /** 받는 화면비 — 있으면 이 목록 밖의 값은 보내지 않는다(모델 기본값). 없으면 늘 보낸다(지금 동작). */
  aspectRatios?: readonly string[]
}

/**
 * Kling O3 소리 켜기(오너 결정 4 대기, 2026-11-22) — 켜면 원가가 초당 $0.112 → $0.14(Take 는 그대로 5).
 *   8/27 약속("음성은 영상 생성기에 맡긴다")대로 로컬은 켬. 오너가 "끔"이라 하면 이 값 하나만 false 로 바꾼다.
 */
export const KLING_O3_AUDIO_ON = true

// 2026-08-31 오너 확정: 기본 생성기를 Seedance 2.0 으로 전환 (종전 happy-horse).
//   주의: min 4s — 계획 4초 미만 샷은 제출 시 4초로 클램프되고, 에디터 #d11 자동 트림이
//   초과분(죽은 꼬리)을 실측 길이 기준으로 잘라낸다.
export const DEFAULT_VIDEO_MODEL: VideoModelKey = 'seedance'

/** UI 모델 선택지 순서(#ui-cleanup 2026-08-31) — fal.ai 카탈로그 모델만. */
export const FAL_VIDEO_MODEL_ORDER: VideoModelKey[] = [
  'seedance',
  'seedance-2.5',
  'happy-horse',
  'kling-o3',
  'veo',
]

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
    // 2026-11-22: 예전 'audio' 는 Kling 칸 이름이 아니라 fal 이 버렸다(소리 없는 영상) — Kling 의 칸은 generate_audio(기본 꺼짐).
    audioParam: 'generate_audio',
    audioDefault: KLING_O3_AUDIO_ON,
    resolutions: [],
    defaultResolution: '720p',
    pricePerSecNoAudio: 0.112,
    maxImageUrls: 4,
    frameSlots: { start: 'start_image_url', end: 'end_image_url' },
    aspectRatios: ['16:9', '9:16', '1:1'],
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

const FRAME_SLOT_ROLES: ReadonlySet<'start' | 'end'> = new Set(['start', 'end'] as const)
const NO_FRAME_SLOT_ROLES: ReadonlySet<'start' | 'end'> = new Set()

/** 첫 · 마지막 장면 칸으로 가는 역할(칸이 있는 모델만 시작 · 끝) — image_urls 상한을 셀 때 뺀다(2026-11-22). */
export function frameSlotRoles(modelKey: VideoModelKey): ReadonlySet<'start' | 'end'> {
  return VIDEO_MODELS[modelKey].frameSlots ? FRAME_SLOT_ROLES : NO_FRAME_SLOT_ROLES
}

/** 첫 · 마지막 장면 칸이 있는 모델에서 그림 역할이 어느 칸으로 가는가 — 요청(fal-video-request)과 글(video-prompt)이 같이 쓴다. */
export interface ModelImageRolePlan {
  firstFrame: boolean
  lastFrame: boolean
  /** image_urls 에 들어가는 그림의 역할(같은 순서). 'start_look' = 참고 칸이 비지 않게 시작 그림을 생김새 참고로 한 번 더 넣은 것. */
  imageRoles: string[]
}

/** 칸이 없는 모델이거나 역할을 모르면 null — 그때는 지금처럼 모든 그림을 image_urls 로 보낸다. */
export function planModelImageRoles(modelKey: VideoModelKey, roles: readonly string[] | undefined): ModelImageRolePlan | null {
  if (!VIDEO_MODELS[modelKey].frameSlots || !roles?.length) return null
  const firstFrame = roles.includes('start')
  const lastFrame = roles.includes('end')
  const rest = roles.filter((role) => role !== 'start' && role !== 'end')
  return { firstFrame, lastFrame, imageRoles: rest.length ? rest : firstFrame ? ['start_look'] : [] }
}

/** planModelImageRoles 를 그림 주소에 적용한다 — 역할 수가 그림 수와 다르면 null(지금처럼 목록 그대로). */
export function planModelImages(
  modelKey: VideoModelKey,
  urls: readonly string[],
  roles: readonly string[] | undefined,
): { firstFrame: string | null; lastFrame: string | null; imageUrls: string[] } | null {
  if (!roles || roles.length !== urls.length || !planModelImageRoles(modelKey, roles)) return null
  const at = (role: string) => {
    const index = roles.indexOf(role)
    return index >= 0 ? urls[index] ?? null : null
  }
  const firstFrame = at('start')
  const rest = urls.filter((_, index) => roles[index] !== 'start' && roles[index] !== 'end')
  return { firstFrame, lastFrame: at('end'), imageUrls: rest.length ? rest : firstFrame ? [firstFrame] : [] }
}
