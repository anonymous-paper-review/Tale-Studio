// Camera [영상 만들기]의 방식(오너 2026-11-22 D2~D5) — 이름 · 설명 · 꺼진 까닭과, 지금 보드에서 방식 규칙(fb-video video-modes)이 볼 사실을 모은다.
//   이어서의 앞 영상 = 같은 씬 바로 앞 샷(sort_order — 서버와 같은 previousShotInScene)의 Editor 로 가는 Take(★, 없으면 가장 새 완성 — shotDetailTakes).
//   미들 = START_MIDDLE_SOURCE 쪽 그림(러프 미들 · 실사 가운데 장 — 서버와 같은 함수). 새 Take 요청은 늘 방식 · 사람 말 · 만든 길을 새로 적는다(리드 11/22 ⑤ 주의).
//   약속: tests/camera/video-mode.test.ts
import { shotDetailFrames, shotDetailTakes, takePhaseOf } from '@/lib/director/shot-detail'
import { realMiddleFrame, roughMiddleFrame } from '@/lib/director/video-mode-frames'
import {
  DEFAULT_VIDEO_MODE,
  START_MIDDLE_SOURCE,
  VIDEO_MODES,
  isMadeVideoMode,
  isVideoMode,
  previousShotInScene,
  type ContinueFrom,
  type MadeVideoMode,
  type VideoMode,
  type VideoModeBlock,
  type VideoModeFacts,
} from '@/lib/director/video-modes'
import { isShotData, type DirectorNode, type VideoNodeData, type VideoOverride } from '@/types/director'
import type { Shot } from '@/types/shot'

/** 고르는 차례 — 기본이 맨 앞. */
export const CAMERA_VIDEO_MODES: readonly VideoMode[] = VIDEO_MODES

/** 방식 이름(영어 원문 = i18n 키). */
// 이력에는 폐기한 시작+끝(옛 Take)도 이름이 있어야 한다 — 고를 수 있는 넷 + start_end(fb-video 2026-11-22, 타입만).
export const VIDEO_MODE_LABEL: Record<MadeVideoMode, string> = {
  start_end: 'Start + end',
  // 'Continue' 는 이미 다른 뜻('계속하기')의 키라 쓰지 않는다.
  continue: 'Continuation',
  reference: 'Reference',
  start_middle: 'Start + middle',
  start_prompt: 'Start + prompt',
}

/** 고른 방식이 하는 일 한 줄(영어 원문 = i18n 키). */
export const VIDEO_MODE_HINT: Record<MadeVideoMode, string> = {
  start_end: 'Moves from the start image to the end image.',
  continue: "Starts where the previous shot's video ends.",
  reference: 'Uses the images only as a guide for faces, clothes and places, not as scenes.',
  start_middle: 'Starts from the start image and follows the direction sketch.',
  start_prompt: 'Starts from the start image and follows the words. The end image is not used.',
}

/** 방식을 고를 수 없는 까닭(영어 원문 = i18n 키). */
export const VIDEO_MODE_BLOCK_TEXT: Record<VideoModeBlock, string> = {
  storyboard_missing: 'Make the start and end images first.',
  first_shot_in_scene: 'This is the first shot of its scene, so there is no video to continue from.',
  previous_video_missing: 'The previous shot has no finished video yet.',
  previous_video_generating: "The previous shot's video is still being made.",
  middle_missing: 'This shot has no direction sketch yet. Draw its rough first.',
  // 리드 D1(2026-11-22) — 서버 거절(409 middle_outdated)과 같은 글. 화면에서 이 까닭으로 끄는 일(cameraModeFacts middleOutdated)은 fb-camera 몫.
  middle_outdated: 'Redraw the live-action storyboard after editing the rough to use Start + middle.',
}

/** 이어서의 출처 — 앞 샷의 Editor 로 가는 Take. plannedSec = 앞 샷 길이(장면을 잡는 자리, fb-video video-frame-capture). */
export interface ContinueSource {
  takeNodeId: string
  videoClipId: string
  generationJobId: string
  videoUrl: string
  plannedSec: number | null
}

type WriterShotFacts = Pick<Shot, 'shotId' | 'sceneId' | 'sortOrder' | 'roughStoryboard'>

/** 지금 보드에서 방식 규칙이 볼 사실과 이어서의 출처(앞 영상이 준비됐을 때만). */
export function cameraModeFacts(input: {
  shotNodeId: string
  nodes: readonly DirectorNode[]
  writerShots: readonly WriterShotFacts[]
}): { facts: VideoModeFacts; previous: ContinueSource | null } {
  const node = input.nodes.find((n) => n.id === input.shotNodeId)
  const data = node && isShotData(node.data) ? node.data : null
  const writerShotId = data?.writerShotId ?? null
  const writerShot = writerShotId ? input.writerShots.find((shot) => shot.shotId === writerShotId) ?? null : null
  const previousId = writerShotId
    ? previousShotInScene(input.writerShots.map((shot) => ({ shotId: shot.shotId, sceneId: shot.sceneId ?? null, sortOrder: shot.sortOrder ?? null })), writerShotId)
    : null
  const previousNode = previousId ? input.nodes.find((n) => isShotData(n.data) && n.data.writerShotId === previousId) ?? null : null
  const { takes, final } = previousNode ? shotDetailTakes(input.nodes, previousNode.id) : { takes: [], final: null }
  const chosen = final ? takes.find((take) => take.id === final.id) ?? null : null
  const ready = chosen && chosen.data.videoUrl && chosen.data.videoClipId && chosen.data.generationJobId ? chosen : null
  const previousVideo: VideoModeFacts['previousVideo'] = ready
    ? 'ready'
    : takes.some((take) => takePhaseOf(take.data) === 'making') ? 'generating' : 'none'
  const middle = START_MIDDLE_SOURCE === 'rough' ? roughMiddleFrame(writerShot?.roughStoryboard) : realMiddleFrame(data?.storyboardImage)
  const plannedSec = previousNode && isShotData(previousNode.data) && typeof previousNode.data.durationSeconds === 'number' ? previousNode.data.durationSeconds : null
  return {
    facts: {
      hasStoryboard: !!shotDetailFrames(data?.storyboardImage).start,
      firstShotInScene: previousId === null,
      previousVideo,
      hasMiddle: !!middle,
    },
    previous: ready
      ? { takeNodeId: ready.id, videoClipId: ready.data.videoClipId!, generationJobId: ready.data.generationJobId!, videoUrl: ready.data.videoUrl!, plannedSec }
      : null,
  }
}

/** 칸을 열 때 골라 둘 방식 — 가장 새 Take 의 방식([다시 만들기]와 같은 이어받기), 없거나 모르는 값이면 기본. */
export function defaultVideoMode(base: Pick<VideoNodeData, 'override'> | null): VideoMode {
  const mode = (base?.override as VideoOverride | undefined)?.videoMode
  return isVideoMode(mode) ? mode : DEFAULT_VIDEO_MODE
}

/** 그 Take 를 만든 방식 — 다 된 Take 는 그 영상을 낸 작업 기록(옛 시작+끝 포함 — fb-video 2026-11-22), 아직이면 고른 방식. 모르면 null. */
export function takeVideoMode(take: Pick<VideoNodeData, 'madeVideoMode' | 'override'>): MadeVideoMode | null {
  if (isMadeVideoMode(take.madeVideoMode)) return take.madeVideoMode
  const chosen = (take.override as VideoOverride | undefined)?.videoMode
  return isVideoMode(chosen) ? chosen : null
}

/**
 * 새 Take 마다 이어받지 않고 새로 적는 칸 — 방식 · 사람 말(바꿀 점) · 만든 길(단추). [다시 만들기] 상속이 옛 Take 의 note · via 까지 넘기므로
 *   Take 를 만들 때마다 다시 넣는다(옛 판의 요약이 새 판에 붙지 않게, 리드 11/22 ⑤ 주의). 이어서면 방금 잡은 장면을 출처로 싣는다.
 *   change 는 이번에 실을 바꿀 점(첫 영상이면 빈 글 — 샷 상세와 같다). newTakeRequest 의 fresh 로 넘긴다.
 */
export function freshTakeFields(input: { mode: VideoMode; change: string; continueFrom?: ContinueFrom | null }): VideoOverride {
  return {
    videoMode: input.mode,
    ...(input.mode === 'continue' && input.continueFrom ? { continueFrom: input.continueFrom } : {}),
    note: input.change.trim(),
    via: 'button',
  }
}
