// 영상 만드는 방식(오너 2026-11-27 N4a "dev에서 수정한 것처럼 4개의 영상 생성 방식" — dev fb1120-video 와 같은 이름 · 규칙) — 화면(샷 상세 · 노드)과
//   서버(video-submit)가 같이 쓰는 이름과 규칙. 순수 함수만.
//
//   ① 'continue'      = 앞 샷 영상의 마지막 장면만 이번 샷의 시작 그림으로 — 이번 샷의 끝 그림은 보내지 않는다
//   ② 'reference'     = 그림을 참고로만(샷 실사 · 인물 시트 · 배경 · 소품) — 시작 · 끝 장면으로 쓰지 않는다
//   ③ 'start_middle'  = 실사 시작 + 미들(실사 시트의 가운데 장 — 연출 · 의도, 오너 V2) — 끝은 보내지 않는다
//   ④ 'start_prompt'  = 실사 시작 한 장 + 연출 글 — 기본(방식을 고르지 않으면 이것, 오너 M1)
//   옛 'start_end'(실사 시작 · 끝)는 오너 "기존에 있던 Start, End 프레임 생성 방식은 일단 폐기"로 고를 수 없다 — 옛 Take 다시 만들기 · 옛 화면이
//   보내면 기본으로 만든다. 어느 방식이든 끝 그림 · 러프(목각 인형) 그림은 영상에 보내지 않는다. 방식은 Take 값을 바꾸지 않는다(Take = 모델 · 해상도).
//   약속: tests/director/video-mode-rules.test.ts · video-modes.test.ts
import { mediaPathFromUrl } from '@/lib/storage/media-url'

export const VIDEO_MODES = ['continue', 'reference', 'start_middle', 'start_prompt'] as const
export type VideoMode = (typeof VIDEO_MODES)[number]
/** 기본 방식 — 오너 M1(dev 때 "추천대로"): 시작+프롬프트. */
export const DEFAULT_VIDEO_MODE: VideoMode = 'start_prompt'
/** 폐기한 시작+끝 — 고를 수 없다. 옛 Take · 옛 화면이 보내면 기본으로 만든다. */
export const RETIRED_START_END = 'start_end' as const

export function isVideoMode(value: unknown): value is VideoMode {
  return (VIDEO_MODES as readonly unknown[]).includes(value)
}

/** 요청 · 기록에 적힐 수 있는 이름인가 — 고를 수 있는 넷 + 옛 시작+끝. 고를 수 있는지는 isVideoMode 로 본다. */
export function isKnownVideoMode(value: unknown): value is VideoMode | typeof RETIRED_START_END {
  return value === RETIRED_START_END || isVideoMode(value)
}

/** ② 레퍼런스에 샷 실사 시작 그림을 넣나(dev 결정 1 추천 true — 오너 답 전). false = 인물 시트 · 배경 · 소품만. */
export const REFERENCE_INCLUDES_SHOT_IMAGE = true

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
  const { videoClipId, generationJobId, frameUrl } = value as Record<string, unknown>
  if (typeof videoClipId !== 'string' || !ID.test(videoClipId)) return null
  if (typeof generationJobId !== 'string' || !ID.test(generationJobId)) return null
  if (typeof frameUrl !== 'string' || !frameUrl.trim() || frameUrl.length > 2048) return null
  return { videoClipId, generationJobId, frameUrl }
}

/**
 * 지금 영상 파일을 낸 작업(검토 rev-video 4 — 서버 director-video-takes 의 madeByJob · 이어서 출처 확인과 같은 뜻). 영상 파일은 `…/videos/<Take>/<작업>.mp4` 다.
 *   같은 Take 다시 만들기가 실패 · 멈춤이면 Take 의 마지막 작업은 그 실패한 작업이고 영상은 예전 작업 것이다 — 이어서 장면은 이 작업으로 잡고 올린다.
 *   파일 이름을 못 읽는 주소면 마지막 작업이 끝났을 때만 그 작업이다. 작업 기록이 아예 없는 Take(복사한 프로젝트 · 기록 전 옛 Take)는 파일 이름이 있어도
 *   그 작업이 이 프로젝트에 없을 수 있어 모르는 것으로 둔다(화면은 "만든 기록이 없어요"). 모르면 null.
 */
export function videoMadeByJobId(take: { videoUrl: string | null; videoClipId: string | null; generationJobId: string | null; lastAttemptStatus: string | null }): string | null {
  if (!take.videoUrl || !take.videoClipId || !take.generationJobId) return null
  const file = mediaPathFromUrl(take.videoUrl)?.match(/\/videos\/([^/]+)\/([^/]+)\.mp4$/)
  if (file) return file[1] === take.videoClipId && ID.test(file[2]!) ? file[2]! : null
  return take.lastAttemptStatus === 'completed' ? take.generationJobId : null
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
  | 'middle_outdated'

export interface VideoModeFacts {
  /** 이번 샷의 실사 시작 그림이 있나(모든 방식의 전제 — #ref-gate). */
  hasStoryboard: boolean
  firstShotInScene: boolean
  /** 앞 샷의 Editor 로 가는 영상 — 있음 · 만드는 중 · 없음. */
  previousVideo: 'ready' | 'generating' | 'none'
  /** ③ 의 미들(실사 시트의 가운데 장)이 있나. */
  hasMiddle: boolean
  /** ③ 의 실사 미들이 러프를 고치기 전 그림인가("러프 바뀜" — video-mode-frames realMiddleOutdated, dev 리드 D1). 없으면 아니다. */
  middleOutdated?: boolean
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
  if (mode === 'start_middle' && facts.middleOutdated) return { enabled: false, reason: 'middle_outdated' }
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
