// Director → Editor 넘기기 창(D8, 디자이너 1110 확정 · 오너 2026-11-14 답 8번) — 샷마다 Editor 로 가는 영상(Take)이 있는지,
//   없으면 왜 없는지를 보드 순서로 정한다. 영상 없는 샷이 하나라도 있을 때만 창을 연다(다 있으면 지금처럼 바로, 10/1).
//   Editor 로 가는 Take 는 내보내기 · 넘김과 같은 규칙(selectHandoffTake — ★ 최종 먼저, 없으면 가장 최근 완성)이다.
//   약속: tests/director/editor-handover.test.ts
import { selectHandoffTake, selectLatestAttempt } from '@/lib/director-video-take-selection'
import { directorFullLabel, sortByBoard, type BoardNodeNames } from '@/features/director/node-label'
import { isShotData, isVideoData, type DirectorNode } from '@/types/director'

/** 영상이 없는 까닭 — 실패(마지막 시도가 실패) · 만드는 중 · 아직 만들지 않음. */
export type MissingVideoReason = 'failed' | 'generating' | 'not_made'

export interface EditorHandoverShot {
  shotNodeId: string
  label: string
  seconds: number
  /** 줄 머리 작은 그림 — Editor 로 가는 Take 의 썸네일, 없으면 샷 이미지(실사). */
  thumbUrl: string | null
  /** Editor 로 가는 Take — 없으면 null. */
  take: { number: number; final: boolean } | null
  missing: MissingVideoReason | null
}

export interface EditorHandoverView {
  shots: EditorHandoverShot[]
  /** 영상이 없는 샷만(보드 순서). 비어 있으면 창 없이 넘긴다. */
  missing: EditorHandoverShot[]
  total: number
  /** Editor 에 컷으로 들어가는 샷 수 = 영상이 있는 샷 수. */
  cuts: number
  /** 영상이 있는 샷 길이의 합 — 정수 초. */
  seconds: number
}

export function editorHandoverView(nodes: readonly DirectorNode[], names: BoardNodeNames | null | undefined): EditorHandoverView {
  const shotNodes = sortByBoard(nodes.filter((node) => isShotData(node.data)), names)
  const shots = shotNodes.map((node): EditorHandoverShot => {
    const data = node.data
    const records = nodes.flatMap((child) => {
      const video = child.data
      if (!isVideoData(video) || video.parentShotNodeId !== node.id) return []
      return [{
        id: child.id,
        url: video.videoUrl,
        status: video.status,
        is_final: video.final,
        take_number: video.takeNumber,
        created_at: video.createdAt,
        last_attempt_at: video.lastAttemptAt,
        last_attempt_status: video.lastAttemptStatus,
        thumbnail: video.thumbnailUrl,
      }]
    })
    const chosen = selectHandoffTake(records)
    const latest = chosen ? null : selectLatestAttempt(records)
    const missing: MissingVideoReason | null = chosen
      ? null
      : latest?.last_attempt_status === 'generating' || latest?.last_attempt_status === 'pending'
        ? 'generating'
        : latest?.last_attempt_status === 'failed' || latest?.status === 'failed'
          ? 'failed'
          : 'not_made'
    const seconds = isShotData(data) && Number.isFinite(data.durationSeconds) ? data.durationSeconds : 0
    const shotImage = isShotData(data) && data.storyboardImage?.status === 'completed' ? data.storyboardImage.url ?? null : null
    return {
      shotNodeId: node.id,
      label: directorFullLabel(data, names),
      seconds,
      thumbUrl: chosen?.thumbnail ?? shotImage,
      take: chosen ? { number: chosen.take_number, final: chosen.is_final === true } : null,
      missing,
    }
  })
  const withVideo = shots.filter((row) => row.take)
  return {
    shots,
    missing: shots.filter((row) => row.missing),
    total: shots.length,
    cuts: withVideo.length,
    seconds: Math.round(withVideo.reduce((sum, row) => sum + row.seconds, 0)),
  }
}
