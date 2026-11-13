// Director → Editor 넘기기 창(D8, 디자이너 1110 확정 · 오너 2026-11-14 답 8번) — 샷마다 Editor 로 가는 영상(Take)이 있는지,
//   없으면 왜 없는지를 보드 순서로 정한다. 영상 없는 샷이 하나라도 있을 때만 창을 연다(다 있으면 지금처럼 바로, 10/1).
//   Editor 로 가는 Take 는 내보내기 · 넘김과 같은 규칙(selectHandoffTake — ★ 최종 먼저, 없으면 가장 최근 완성)이다.
//   Editor 는 DB 샷(Writer 샷)만 컷으로 받는다 — Director 에서 더한 샷(writerShotId 없음)은 창에 넣지 않는다(검토 b 보통 1).
//   약속: tests/director/editor-handover.test.ts
import { selectHandoffTake, selectLatestAttempt } from '@/lib/director-video-take-selection'
import { directorFullLabel, sortByBoard, type BoardNodeNames } from '@/features/director/node-label'
import { latestShotTake, takeSettings } from '@/lib/director/remake-take'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { isShotData, isVideoData, type DirectorNode } from '@/types/director'

type Translate = (key: string, params?: Record<string, string | number>) => string

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
  const shotNodes = sortByBoard(nodes.filter((node) => isShotData(node.data) && !!node.data.writerShotId), names)
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

/** 영상 없는 줄의 만들기 단추. 값은 다시 만들기가 이어받을 Take(latestShotTake)의 모델 · 해상도로 센다 — 요청도 그 Take 를
 *  이어받으므로 단추 값과 실제 Take 가 같다(검토 b 보통 2). 일괄이 도는 중이면 끄고 까닭을 단추에 적고(낮음 1),
 *  Take 과금이 꺼져 있으면 값을 적지 않는다(낮음 5 — 노드와 같은 숨김 규칙). */
export function remakeButton(
  nodes: readonly DirectorNode[],
  row: Pick<EditorHandoverShot, 'shotNodeId' | 'missing'>,
  opts: { showTakes: boolean; batch: 'images' | 'videos' | null },
  t: Translate,
): { label: string; disabled: boolean } {
  if (opts.batch === 'images') return { label: t('Making images'), disabled: true }
  if (opts.batch === 'videos') return { label: t('Making videos'), disabled: true }
  const shot = nodes.find((node) => node.id === row.shotNodeId)
  const takes =
    opts.showTakes && shot && isShotData(shot.data)
      ? (() => {
          const { model, resolution } = takeSettings(shot.data, latestShotTake(nodes, row.shotNodeId)?.data ?? null)
          return takeCostForVideo(model, resolution)
        })()
      : null
  const label =
    row.missing === 'not_made'
      ? takes === null ? t('Make video') : t('Make video · {takes} Takes', { takes })
      : takes === null ? t('Make again') : t('Make again · {takes} Takes', { takes })
  return { label, disabled: row.missing === 'generating' }
}

// 길이는 샷 계획 길이의 합이다 — Editor 는 클립마다 실제 영상 파일 길이로 줄일 수 있어 어림("약 N초")으로 보인다(리드 2026-11-14 · export 확인).

/** 창 머리 줄 — 영상 있는 샷 수 / 전체 · 약 N초 · 빈 칸이 생기지 않는다는 말. */
export function handoverHeaderLine(view: EditorHandoverView, t: Translate): string {
  return t('{done}/{total} videos · about {seconds}s · Shots without video do not go into the timeline as empty slots.', { done: view.cuts, total: view.total, seconds: view.seconds })
}

/** 넘기기 단추 — 빠질 샷이 있으면 "… 빼고 넘기기", 없으면(창을 연 채 다 만들어졌다) 시안 D8 의 "Editor로 넘기기 · 컷 N · 약 N초"(낮음 3). */
export function proceedButtonLabel(view: EditorHandoverView, t: Translate): string {
  if (view.missing.length === 0) return t('Hand over to Editor · {cuts} cuts · about {seconds}s', { cuts: view.cuts, seconds: view.seconds })
  return view.missing.length === 1
    ? t('Hand over without {label} · {cuts} cuts · about {seconds}s', { label: view.missing[0].label, cuts: view.cuts, seconds: view.seconds })
    : t('Hand over without {count} shots · {cuts} cuts · about {seconds}s', { count: view.missing.length, cuts: view.cuts, seconds: view.seconds })
}
