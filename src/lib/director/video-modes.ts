// 영상 만드는 방식(오너 2026-11-22 D2~D5) — 화면(Camera · 노드 보기)과 서버(video-submit)가 같이 쓰는 이름과 규칙. 순수 함수만.
//
//   기본 'start_end'  = 실사 시작 · 끝 그림(지금 방식)
//   ① 'continue'      = 앞 샷 영상의 마지막 장면을 이번 샷의 시작 그림으로(+ 이번 샷 실사 끝이 있으면 끝으로)
//   ② 'reference'     = 그림을 참고로만(샷 실사 · 인물 시트 · 배경 · 소품) — 시작 · 끝 장면으로 쓰지 않는다
//   ③ 'start_middle'  = 실사 시작 + 미들(연출 · 의도 스케치) — 끝은 보내지 않는다
//   ④ 'start_prompt'  = 실사 시작 한 장 + 연출 글 — 끝은 있어도 보내지 않는다
// 방식은 Take 값을 바꾸지 않는다(Take = 모델 · 해상도, billing/take-cost).

export const VIDEO_MODES = ['start_end', 'continue', 'reference', 'start_middle', 'start_prompt'] as const
export type VideoMode = (typeof VIDEO_MODES)[number]
export const DEFAULT_VIDEO_MODE: VideoMode = 'start_end'

export function isVideoMode(value: unknown): value is VideoMode {
  return (VIDEO_MODES as readonly unknown[]).includes(value)
}

/**
 * ③ 미들 출처(오너 결정 2 — 시험 영상을 나란히 보고 오너가 고른다, 리드 2026-11-22: 상수 하나로 바꿔 끼운다).
 *   'rough' = 러프 미들(Writer 콘티 화살표 편집기로 고친 최신 연출, 추천) · 'real' = 실사 시트의 가운데 장.
 */
export type StartMiddleSource = 'rough' | 'real'
export const START_MIDDLE_SOURCE: StartMiddleSource = 'rough'

/** ② 레퍼런스에 샷 실사 시작 그림을 넣나(오너 결정 1 — 추천 true). false = 인물 시트 · 배경 · 소품만. */
export const REFERENCE_INCLUDES_SHOT_IMAGE = true

/** Take 이력 요약 칸(fb-camera, 리드 2026-11-22) — 그 Take 를 어떻게 만들었나. */
export const TAKE_VIA = ['button', 'chat', 'batch'] as const
export type TakeVia = (typeof TAKE_VIA)[number]

export function isTakeVia(value: unknown): value is TakeVia {
  return (TAKE_VIA as readonly unknown[]).includes(value)
}

/** ① 이어서의 출처(영상 제출의 continueFrom) — 앞 샷 Take · 그 영상을 낸 작업 · 잡은 장면 주소. */
export interface ContinueFrom {
  videoClipId: string
  generationJobId: string
  frameUrl: string
}

const ID = /^[A-Za-z0-9_-]{1,128}$/

/** 요청 · 기록에서 읽은 값이 이어서 출처 모양인지 — 아니면 null. 주소가 우리 보관함 · 그 작업의 장면인지는 서버가 따로 본다. */
export function parseContinueFrom(value: unknown): ContinueFrom | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const { videoClipId, generationJobId, frameUrl } = row
  if (typeof videoClipId !== 'string' || !ID.test(videoClipId)) return null
  if (typeof generationJobId !== 'string' || !ID.test(generationJobId)) return null
  if (typeof frameUrl !== 'string' || !frameUrl.trim() || frameUrl.length > 2048) return null
  return { videoClipId, generationJobId, frameUrl }
}

export interface SceneShotOrder {
  shotId: string
  sceneId: string | null
  sortOrder: number | null
}

/** 같은 씬의 바로 앞 샷 — 씬 안 sort_order 오름차순(값이 없으면 맨 뒤), 같으면 shot_id 순(샷 읽기와 같은 순서). 씬 첫 샷이면 null. */
export function previousShotInScene(shots: readonly SceneShotOrder[], shotId: string): string | null {
  const me = shots.find((shot) => shot.shotId === shotId)
  if (!me || !me.sceneId) return null
  const order = (value: number | null) => (typeof value === 'number' && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY)
  const scene = shots
    .filter((shot) => shot.sceneId === me.sceneId)
    .sort((a, b) => order(a.sortOrder) - order(b.sortOrder) || a.shotId.localeCompare(b.shotId))
  const index = scene.findIndex((shot) => shot.shotId === shotId)
  return index > 0 ? scene[index - 1]!.shotId : null
}

/** 방식을 고를 수 없는 까닭 — 화면이 단추를 끄고 까닭을 보인다. */
export type VideoModeBlock =
  | 'storyboard_missing'
  | 'first_shot_in_scene'
  | 'previous_video_missing'
  | 'previous_video_generating'
  | 'middle_missing'

export interface VideoModeFacts {
  /** 이번 샷의 실사 시작 그림이 있나(모든 방식의 전제 — #ref-gate). */
  hasStoryboard: boolean
  firstShotInScene: boolean
  /** 앞 샷의 Editor 로 가는 영상 — 있음 · 만드는 중 · 없음. */
  previousVideo: 'ready' | 'generating' | 'none'
  /** ③ 의 미들 그림이 있나(START_MIDDLE_SOURCE 쪽). */
  hasMiddle: boolean
}

export function videoModeAvailability(
  mode: VideoMode,
  facts: VideoModeFacts,
): { enabled: true; reason: null } | { enabled: false; reason: VideoModeBlock } {
  if (!facts.hasStoryboard) return { enabled: false, reason: 'storyboard_missing' }
  if (mode === 'continue') {
    if (facts.firstShotInScene) return { enabled: false, reason: 'first_shot_in_scene' }
    if (facts.previousVideo === 'generating') return { enabled: false, reason: 'previous_video_generating' }
    if (facts.previousVideo === 'none') return { enabled: false, reason: 'previous_video_missing' }
  }
  if (mode === 'start_middle' && !facts.hasMiddle) return { enabled: false, reason: 'middle_missing' }
  return { enabled: true, reason: null }
}

/** 영상 요청에 실을 방식 — Take 에 적힌 방식. 노드에서 손으로 이은 그림이 있으면 손 배선이 이긴다(방식은 보내지 않는다). */
export function videoModeForRequest(override: { videoMode?: unknown } | null | undefined, hasManualWiring: boolean): VideoMode | undefined {
  if (hasManualWiring) return undefined
  return isVideoMode(override?.videoMode) ? override.videoMode : undefined
}

/** 새 Take 기록에 남길 설정 — 실제로 쓰지 않는 방식 · 이어서가 아닌 방식의 이어서 출처는 지운다(기록이 실제와 같게). */
export function takeOverrideForRequest<T extends Record<string, unknown>>(override: T, mode: VideoMode | undefined): T {
  const next: Record<string, unknown> = { ...override }
  if (!mode) delete next.videoMode
  if (mode !== 'continue') delete next.continueFrom
  return next as T
}
