// Director 위쪽 단추 셋이 세는 일 · 가장 밝은 단추 · 예상 칸 글(시안 D1 406:3717 · D2 406:4588 · R 416:4941, 오너 2026-11-14).
//   순수 함수만 둔다. 샷 상태 판정은 shot-state.ts. 약속: tests/director/toolbar-work.test.ts
import { realImageBatchMinutes } from '@/lib/director/generation-estimate'
import { countText } from '@/lib/i18n/count-text'
import { matchesStatusFilter, type DirectorShotState, type ShotStatusFilter } from '@/lib/director/shot-state'
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

/** 단추 · 예상이 세는 샷 — 상태를 골랐으면 보이는 샷만(리드 11/14 답 1). 전체면 그대로. */
export function workScopeStates(
  states: ReadonlyMap<string, DirectorShotState>,
  filter: ShotStatusFilter,
): ReadonlyMap<string, DirectorShotState> {
  if (filter === 'all') return states
  return new Map([...states].filter(([, state]) => matchesStatusFilter(state, filter)))
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

/** 꺼진 만들기 단추의 까닭(결정 페이지 "꺼진 단추 아래 이유 한 줄", 리드 검토 a 낮음 4). */
export type WorkBlock = 'busy' | 'no_shots' | 'none_in_status' | 'all_making' | 'all_have_images' | 'need_images' | 'all_have_videos'

function scopedStates(
  states: ReadonlyMap<string, DirectorShotState>,
  picked: ReadonlySet<string> | null | undefined,
): DirectorShotState[] {
  const out: DirectorShotState[] = []
  for (const [id, state] of states) if (!picked || picked.size === 0 || picked.has(id)) out.push(state)
  return out
}

/** [이미지 만들기]가 꺼진 까닭 — 켜져 있으면 null. busy = 이미지 일괄이 도는 중(눌러도 새 판이 서지 않는다).
 *  filtered = 상태를 골라 states 가 보이는 샷만이다(그 상태 샷이 없으면 "이 상태의 샷이 없어요"). */
export function imageWorkBlock(
  states: ReadonlyMap<string, DirectorShotState>,
  picked: ReadonlySet<string> | null | undefined,
  busy: boolean,
  filtered = false,
): WorkBlock | null {
  if (busy) return 'busy'
  const pool = scopedStates(states, picked)
  if (pool.length === 0) return filtered ? 'none_in_status' : 'no_shots'
  if (imageButtonMode(states, picked ?? new Set()).shotIds.length > 0) return null
  return pool.some((s) => s === 'image_generating') ? 'all_making' : 'all_have_images'
}

/** [영상 만들기]가 꺼진 까닭 — 켜져 있으면 null. busy = 영상 묶음이 도는 중. */
export function videoWorkBlock(
  states: ReadonlyMap<string, DirectorShotState>,
  picked: ReadonlySet<string> | null | undefined,
  busy: boolean,
  filtered = false,
): WorkBlock | null {
  if (busy) return 'busy'
  const pool = scopedStates(states, picked)
  if (pool.length === 0) return filtered ? 'none_in_status' : 'no_shots'
  if (videoWorkShotIds(states, picked).length > 0) return null
  if (pool.some((s) => s === 'image_needed' || s === 'image_failed' || s === 'image_generating')) return 'need_images'
  return pool.some((s) => s === 'video_generating') ? 'all_making' : 'all_have_videos'
}

const BLOCK_TEXT: Record<'image' | 'video', Record<WorkBlock, string>> = {
  image: {
    busy: 'Making images now. You can press again when it finishes.',
    no_shots: 'No shots yet.',
    none_in_status: 'No shots in this status',
    all_making: 'The rest are being made now.',
    all_have_images: 'Every shot here already has an image.',
    need_images: 'Videos need an image first.',
    all_have_videos: 'Every shot here already has a video.',
  },
  video: {
    busy: 'Making videos now. You can press again when it finishes.',
    no_shots: 'No shots yet.',
    none_in_status: 'No shots in this status',
    all_making: 'The rest are being made now.',
    all_have_images: 'Every shot here already has an image.',
    need_images: 'Videos need an image first.',
    all_have_videos: 'Every shot here already has a video.',
  },
}

/** 꺼진 단추 아래 한 줄 — 꺼진 단추마다 까닭(같으면 한 번), 둘 다 만드는 중이면 한 문장. 꺼진 단추가 없으면 null. */
export function workBlockLine(image: WorkBlock | null, video: WorkBlock | null, t: Translate): string | null {
  if (image === 'busy' && video === 'busy') return t('Making images and videos now. You can press again when they finish.')
  const lines = [image && t(BLOCK_TEXT.image[image]), video && t(BLOCK_TEXT.video[video])].filter((line): line is string => !!line)
  return lines.length > 0 ? [...new Set(lines)].join(' · ') : null
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
  // 만드는 중이면 남은 일이 있어도 시간을 쓰지 않는다(8/26 · 시안 D4 "만드는 중이에요", 리드 검토 a 보통 1).
  if (input.making) return t('Making now')
  if (input.images === 0 && videos === 0) return null
  // 이미지 분은 Storyboard → Director 넘기기 창과 같은 셈(리드 11/14 — 두 곳 숫자가 같게).
  const imageMinutes = realImageBatchMinutes(input.images)
  const videoMinutes = videos > 0 ? Math.max(1, Math.round(estimateVideoSeconds(input.videoModels) / 60)) : 0
  const chain = input.images > 0 && !!input.chain && videos > 0
  // 영어는 수가 1이면 단수 문장(리드 11/14 답 2) — 문장마다 통째 키라 한국어 "이미지 4장 · 약 2분 · Takes 안 써요"는 그대로다.
  const takes = input.videoTakes
  if (chain) {
    const minutes = imageMinutes + videoMinutes
    const params = { images: input.images, videos, minutes, takes }
    const one = input.images === 1 && videos === 1
    if (!input.takesShown) return one ? t('1 image · 1 video · about {minutes} min', params) : t('{images} images · {videos} videos · about {minutes} min', params)
    if (!one) return t('{images} images · {videos} videos · about {minutes} min · {takes} Takes', params)
    return takes === 1 ? t('1 image · 1 video · about {minutes} min · 1 Take', params) : t('1 image · 1 video · about {minutes} min · {takes} Takes', params)
  }
  if (input.images > 0) {
    return countText(t, input.images, '1 image · about {minutes} min · No Takes used', '{count} images · about {minutes} min · No Takes used', { count: input.images, minutes: imageMinutes })
  }
  const params = { count: videos, minutes: videoMinutes, takes }
  if (!input.takesShown) return countText(t, videos, '1 video · about {minutes} min', '{count} videos · about {minutes} min', params)
  if (videos > 1) return t('{count} videos · about {minutes} min · {takes} Takes', params)
  return takes === 1 ? t('1 video · about {minutes} min · 1 Take', params) : t('1 video · about {minutes} min · {takes} Takes', params)
}

/** 2줄 왼쪽 진행 글 "이미지 2장 · 영상 2개 만드는 중"(시안 D4) — 영어는 수가 1이면 단수. 둘 다 0이면 이미지 1장으로 쓴다(일괄이 막 시작됨). */
export function makingLabel(images: number, videos: number, t: Translate): string {
  const parts: string[] = []
  if (images > 0) parts.push(countText(t, images, '1 image', '{count} images', { count: images }))
  if (videos > 0) parts.push(countText(t, videos, '1 video', '{count} videos', { count: videos }))
  if (parts.length === 0) parts.push(t('1 image'))
  return t('Making {what}', { what: parts.join(' · ') })
}

/** "영상까지 이어서"(시안 D4 · 오너 답 6): 이미지를 기다리던 샷 가운데 이미지가 끝난 샷은 영상을 시작하고(start),
 *  쓸 그림이 없거나 이미 다른 길로 영상이 있는 샷은 기다림에서 빼고(drop), 아직 그리는 샷은 기다린다(keep).
 *  resumeWaiting: 러프 · 시트를 기다려 일괄이 다시 돌기를 기다리는 샷(노드 id) — 이 샷도 놓지 않는다(리드 검토 a 낮음 9).
 *  videoBusy: 영상 묶음이 이미 도는 중이면 이미지가 끝난 샷도 기다림에 남긴다 — 묶음이 끝나면 보낸다(리드 검토 a 보통 3). */
export function chainStep(
  waiting: readonly string[],
  states: ReadonlyMap<string, DirectorShotState>,
  imageBusy: boolean,
  resumeWaiting?: ReadonlySet<string>,
  videoBusy = false,
): { start: string[]; drop: string[]; keep: string[] } {
  const out = { start: [] as string[], drop: [] as string[], keep: [] as string[] }
  for (const id of waiting) {
    const state = states.get(id)
    if (state === 'image_done') (videoBusy ? out.keep : out.start).push(id)
    else if (state === 'image_generating' || (state === 'image_needed' && (imageBusy || !!resumeWaiting?.has(id)))) out.keep.push(id)
    else out.drop.push(id)
  }
  return out
}

/** 기다림에서 뺀 샷 가운데 그림을 못 만들어 영상을 시작하지 못한 샷 — 다른 길로 영상이 생긴 샷은 넣지 않는다. */
export function chainMissed(drop: readonly string[], states: ReadonlyMap<string, DirectorShotState>): string[] {
  return drop.filter((id) => {
    const state = states.get(id)
    return state === 'image_needed' || state === 'image_failed'
  })
}
