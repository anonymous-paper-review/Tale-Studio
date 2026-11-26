// 샷 상세 영상 탭의 영상 만드는 방식(오너 2026-11-27 N4a "dev에서 수정한 것처럼 4개의 영상 생성 방식") — 이름 · 설명 · 꺼진 까닭과,
//   지금 보드에서 방식 규칙(lib/director/video-modes)이 볼 사실을 모은다. dev 의 Cinema [영상 만들기](fb1120-camera video-mode.ts)와 같은 말 · 같은 규칙.
//   이어서의 앞 영상 = 같은 씬 바로 앞 샷(sort_order — 서버와 같은 previousShotInScene)의 Editor 로 가는 Take(★, 없으면 가장 새 완성 — shotDetailTakes).
//   미들 = 실사 시트의 가운데 장(오너 V2 — 서버와 같은 함수). 실사가 "러프 바뀜"이면 시작+미들은 꺼진다(dev 리드 D1).
//   약속: tests/director/video-mode-picker.test.ts
import { shotDetailFrames, shotDetailTakes, takePhaseOf } from '@/lib/director/shot-detail'
import { realMiddleFrame, realMiddleOutdated } from '@/lib/director/video-mode-frames'
import {
  DEFAULT_VIDEO_MODE,
  VIDEO_MODES,
  isVideoMode,
  previousShotInScene,
  videoMadeByJobId,
  type VideoMode,
  type VideoModeBlock,
  type VideoModeFacts,
} from '@/lib/director/video-modes'
import { isShotData, type DirectorNode, type VideoNodeData, type VideoOverride } from '@/types/director'
import type { Shot } from '@/types/shot'

/** 고르는 차례. */
export const SHOT_VIDEO_MODES: readonly VideoMode[] = VIDEO_MODES

/** 방식 이름(영어 원문 = i18n 키) — 'Continue' 는 이미 다른 뜻('계속하기')의 키라 쓰지 않는다(dev 와 같다). */
export const VIDEO_MODE_LABEL: Record<VideoMode, string> = {
  continue: 'Continuation',
  reference: 'Reference',
  start_middle: 'Start + middle',
  start_prompt: 'Start + prompt',
}

/** 고른 방식이 하는 일 한 줄(영어 원문 = i18n 키). */
export const VIDEO_MODE_HINT: Record<VideoMode, string> = {
  continue: "Starts where the previous shot's video ends.",
  reference: 'Uses the images only as a guide for faces, clothes and places, not as scenes.',
  start_middle: 'Starts from the start image and follows the arrows in the middle frame.',
  start_prompt: 'Starts from the start image and follows the words.',
}

/** 방식을 고를 수 없는 까닭(영어 원문 = i18n 키). */
export const VIDEO_MODE_BLOCK_TEXT: Record<VideoModeBlock, string> = {
  storyboard_missing: 'Make the start image first.',
  first_shot_in_scene: 'This is the first shot of its scene, so there is no video to continue from.',
  previous_video_missing: 'The previous shot has no finished video yet.',
  previous_video_generating: "The previous shot's video is still being made.",
  middle_missing: "This shot's images have no middle frame yet. Remake images first.",
  middle_outdated: 'Remake the images after editing the rough to use Start + middle.',
}

/** 앞 샷의 ★ Take 에 만든 기록(작업 기록)이 없을 때 — 영상은 있는데 마지막 장면을 잡을 수 없다(dev 리드 A 2026-11-23). */
export const CONTINUE_NO_RECORD_TEXT = "The previous shot's video has no generation record, so its last frame can't be carried over. Remake that video to use Continuation."

/** 방식이 꺼진 까닭 글 — "앞 샷 영상 없음"은 ★ Take 가 정말 없을 때만, 기록 없는 ★ Take 면 그 까닭. */
export function videoModeBlockText(reason: VideoModeBlock, context: { previousNoRecord?: boolean } = {}): string {
  return reason === 'previous_video_missing' && context.previousNoRecord ? CONTINUE_NO_RECORD_TEXT : VIDEO_MODE_BLOCK_TEXT[reason]
}

/** 이어서의 출처 — 앞 샷의 Editor 로 가는 Take. plannedSec = 앞 샷 길이(장면을 잡는 자리, video-frame-capture). */
export interface ContinueSource {
  videoClipId: string
  generationJobId: string
  videoUrl: string
  plannedSec: number | null
}

type WriterShotFacts = Pick<Shot, 'shotId' | 'sceneId' | 'sortOrder' | 'roughStoryboard'>

/** 지금 보드에서 방식 규칙이 볼 사실과 이어서의 출처(앞 영상이 준비됐을 때만). */
export function shotVideoModeFacts(input: {
  shotNodeId: string
  nodes: readonly DirectorNode[]
  writerShots: readonly WriterShotFacts[]
}): { facts: VideoModeFacts; previous: ContinueSource | null; previousNoRecord: boolean } {
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
  // 그 Take 를 같은 Take 로 다시 만드는 중이면 끝나면 앞 영상이 바뀐다 — 다 만들 때까지 이어서를 끈다("앞 샷 영상을 아직 만드는 중", 검토 rev-video 4).
  const remaking = !!chosen && takePhaseOf(chosen.data) === 'making'
  // 이어서 장면은 지금 영상 파일을 낸 작업으로 잡고 올린다 — 다시 만들기가 실패 · 멈춤이면 Take 의 마지막 작업은 그 영상을 낸 작업이 아니다(검토 rev-video 4).
  const madeJobId = chosen && !remaking ? videoMadeByJobId(chosen.data) : null
  const ready = chosen && madeJobId && chosen.data.videoUrl && chosen.data.videoClipId ? chosen : null
  // ★ Take 영상은 있는데 만든 작업 기록이 없다(복사한 프로젝트 · 기록 전 옛 Take) — 이어서는 꺼지고 까닭을 따로 말한다.
  const previousNoRecord = !!chosen && !remaking && !!chosen.data.videoUrl && !!chosen.data.videoClipId && !madeJobId
  const previousVideo: VideoModeFacts['previousVideo'] = ready
    ? 'ready'
    : remaking || takes.some((take) => takePhaseOf(take.data) === 'making') ? 'generating' : 'none'
  const plannedSec = previousNode && isShotData(previousNode.data) && typeof previousNode.data.durationSeconds === 'number' ? previousNode.data.durationSeconds : null
  return {
    facts: {
      hasStoryboard: !!shotDetailFrames(data?.storyboardImage).start,
      firstShotInScene: previousId === null,
      previousVideo,
      hasMiddle: !!realMiddleFrame(data?.storyboardImage),
      // dev 리드 D1 — 실사가 참조한 러프가 바뀌었으면(실사 카드의 "러프 바뀜"과 같은 판정) 시작+미들을 끈다. 서버도 409 middle_outdated.
      middleOutdated: realMiddleOutdated(data?.storyboardImage, writerShot?.roughStoryboard),
    },
    previous: ready && madeJobId
      ? { videoClipId: ready.data.videoClipId!, generationJobId: madeJobId, videoUrl: ready.data.videoUrl!, plannedSec }
      : null,
    previousNoRecord,
  }
}

/** 칸을 열 때 골라 둘 방식 — 보고 있는 Take 의 방식(그 Take 의 설정을 이어받는 것과 같다), 없거나 모르는 값이면 기본. */
export function defaultVideoMode(take: Pick<VideoNodeData, 'override'> | null): VideoMode {
  const mode = (take?.override as VideoOverride | undefined)?.videoMode
  return isVideoMode(mode) ? mode : DEFAULT_VIDEO_MODE
}
