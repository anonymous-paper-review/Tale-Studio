// Director 위쪽 단추 셋이 세는 일 · 가장 밝은 단추 · 예상 칸 글(시안 D1 406:3717 · D2 406:4588 · R 416:4941, 오너 2026-11-14).
//   순수 함수만 둔다. 샷 상태 판정은 shot-state.ts. 약속: tests/director/toolbar-work.test.ts
import { realImageBatchMinutes } from '@/lib/director/generation-estimate'
import type { DirectorShotState } from '@/lib/director/shot-state'
import type { VideoModelKey } from '@/lib/video-models'

type Translate = (text: string, params?: Record<string, string | number>) => string

function pick(
  states: ReadonlyMap<string, DirectorShotState>,
  picked: ReadonlySet<string> | null | undefined,
  wanted: readonly DirectorShotState[],
): string[] {
  const out: string[] = []
  for (const [id, state] of states) {
    if (picked && picked.size > 0 && !picked.has(id)) continue
    if (wanted.includes(state)) out.push(id)
  }
  return out
}

/** [이미지 만들기 · N] — 이미지가 없는 샷(이미지 필요 · 이미지 실패). 고른 샷이 있으면 그 안에서만. */
export function imageWorkShotIds(
  states: ReadonlyMap<string, DirectorShotState>,
  picked: ReadonlySet<string> | null | undefined,
): string[] {
  return pick(states, picked, ['image_needed', 'image_failed'])
}

/** [영상 만들기 · N] — 이미지가 있고 완성 영상이 없는 샷(이미지 완료 · 영상 실패). 고른 샷이 있으면 그 안에서만. */
export function videoWorkShotIds(
  states: ReadonlyMap<string, DirectorShotState>,
  picked: ReadonlySet<string> | null | undefined,
): string[] {
  return pick(states, picked, ['image_done', 'video_failed'])
}

/** 상태 고르기로 보이는 샷 안의 고름만 센다(숨긴 샷은 빠진다). */
export function effectivePickedIds(picked: readonly string[], visibleIds: readonly string[]): Set<string> {
  const visible = new Set(visibleIds)
  return new Set(picked.filter((id) => visible.has(id)))
}

/** 전체 체크: 보이는 샷을 모두 고르고, 이미 모두 골랐으면 푼다(시안 D2). */
export function nextPickAll(visibleIds: readonly string[], picked: readonly string[]): string[] {
  const set = new Set(picked)
  const allPicked = visibleIds.length > 0 && visibleIds.every((id) => set.has(id))
  return allPicked ? [] : [...visibleIds]
}

/** 고른 샷 중 이미 이미지가 있는 샷(만드는 중 빼고) — [이미지 다시 만들기 · N]이 다시 만든다(8/27 오너 "전체 재생성" 길). */
export function remakeImageShotIds(
  states: ReadonlyMap<string, DirectorShotState>,
  picked: ReadonlySet<string>,
): string[] {
  return pick(states, picked, ['image_done', 'video_done', 'video_failed']).filter((id) => picked.has(id))
}

/** 이미지 단추가 할 일: 이미지 없는 샷이 있으면 만들기, 고른 샷이 모두 이미지가 있으면 다시 만들기. */
export function imageButtonMode(
  states: ReadonlyMap<string, DirectorShotState>,
  picked: ReadonlySet<string>,
): { mode: 'make' | 'remake'; shotIds: string[] } {
  const make = imageWorkShotIds(states, picked)
  if (make.length > 0 || picked.size === 0) return { mode: 'make', shotIds: make }
  const remake = remakeImageShotIds(states, picked)
  return remake.length > 0 ? { mode: 'remake', shotIds: remake } : { mode: 'make', shotIds: [] }
}

export type PrimaryWorkAction = 'image' | 'video' | 'editor'

/** 가장 밝은(크림) 단추 = 지금 할 일 하나(시안 R): 이미지 → 영상 → 다음: Editor로. */
export function primaryWorkAction({
  imageCount,
  videoCount,
  canHandOff,
}: {
  imageCount: number
  videoCount: number
  canHandOff: boolean
}): PrimaryWorkAction | null {
  if (imageCount > 0) return 'image'
  if (videoCount > 0) return 'video'
  return canHandOff ? 'editor' : null
}

/** 영상 예상 시간 표 — 개발 DB 생성 작업 중앙값(2026-07~11, 접수 → 끝). 자료가 없는 영상 모델은 Seedance 2.0 값.
 *  Seedance 2.0 720p 약 185초 · Happy Horse 약 105초. 이미지는 넘기기 창과 같은 셈(generation-estimate.ts)을 쓴다. */
export const VIDEO_ESTIMATE_SECONDS: Record<VideoModelKey, number> = {
  seedance: 185,
  'seedance-2.5': 185,
  'happy-horse': 105,
  'kling-o3': 185,
  veo: 185,
}

/** 동시에 만드는 영상 수(사람 하나 한도 3). */
const VIDEOS_PER_ROUND = 3

export function estimateVideoSeconds(videoModels: readonly VideoModelKey[]): number {
  let seconds = 0
  for (let i = 0; i < videoModels.length; i += VIDEOS_PER_ROUND) {
    const round = videoModels.slice(i, i + VIDEOS_PER_ROUND)
    seconds += Math.max(...round.map((m) => VIDEO_ESTIMATE_SECONDS[m] ?? VIDEO_ESTIMATE_SECONDS.seedance))
  }
  return seconds
}

/** 예상 칸 글 — 시작 전 예상만, 만드는 중에는 남은 시간을 쓰지 않는다(오너 8/26). 쓸 것이 없으면 null. */
export function workEstimateText(
  input: {
    images: number
    videoModels: readonly VideoModelKey[]
    videoTakes: number
    takesShown: boolean
    making: boolean
    /** 영상까지 이어서: 이미지 장 수만큼 영상도 이어서 만든다. */
    chain?: boolean
  },
  t: Translate,
): string | null {
  const videos = input.videoModels.length
  if (input.images === 0 && videos === 0) return input.making ? t('Making now') : null
  // 이미지 분은 Storyboard → Director 넘기기 창과 같은 셈(리드 11/14 — 두 곳 숫자가 같게).
  const imageMinutes = realImageBatchMinutes(input.images)
  const videoMinutes = videos > 0 ? Math.max(1, Math.round(estimateVideoSeconds(input.videoModels) / 60)) : 0
  if (input.images > 0 && input.chain && videos > 0) {
    const minutes = imageMinutes + videoMinutes
    return input.takesShown
      ? t('{images} images · {videos} videos · about {minutes} min · {takes} Takes', { images: input.images, videos, minutes, takes: input.videoTakes })
      : t('{images} images · {videos} videos · about {minutes} min', { images: input.images, videos, minutes })
  }
  if (input.images > 0) return t('{count} images · about {minutes} min · No Takes used', { count: input.images, minutes: imageMinutes })
  const minutes = videoMinutes
  return input.takesShown
    ? t('{count} videos · about {minutes} min · {takes} Takes', { count: videos, minutes, takes: input.videoTakes })
    : t('{count} videos · about {minutes} min', { count: videos, minutes })
}

/** "영상까지 이어서"(시안 D4 · 오너 답 6): 이미지를 기다리던 샷 가운데 이미지가 끝난 샷은 영상을 시작하고(start),
 *  쓸 그림이 없거나 이미 다른 길로 영상이 있는 샷은 기다림에서 빼고(drop), 아직 그리는 샷은 기다린다(keep). */
export function chainStep(
  waiting: readonly string[],
  states: ReadonlyMap<string, DirectorShotState>,
  imageBusy: boolean,
): { start: string[]; drop: string[]; keep: string[] } {
  const out = { start: [] as string[], drop: [] as string[], keep: [] as string[] }
  for (const id of waiting) {
    const state = states.get(id)
    if (state === 'image_done') out.start.push(id)
    else if (state === 'image_generating' || (state === 'image_needed' && imageBusy)) out.keep.push(id)
    else out.drop.push(id)
  }
  return out
}
