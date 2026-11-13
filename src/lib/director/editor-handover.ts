// Director → Editor 넘기기 창(D8, 디자이너 1110 확정 · 오너 2026-11-14 답 8번) — 샷마다 Editor 로 가는 영상(Take)이 있는지,
//   없으면 왜 없는지를 보드 순서로 정한다. 영상 없는 샷이 하나라도 있을 때만 창을 연다(다 있으면 지금처럼 바로, 10/1).
//   Editor 로 가는 Take 는 내보내기 · 넘김과 같은 규칙(selectHandoffTake — ★ 최종 먼저, 없으면 가장 최근 완성)이다.
//   화면에서 멈춘 Take 는 ★ 가 아니면 영상 없음 — 투영 · 샷 상태 · 일괄 검사와 같은 규칙(오너 2026-11-14 7번, 리드 검토 a 5).
//   Editor 는 DB 샷(Writer 샷)만 컷으로 받는다 — Director 에서 더한 샷(writerShotId 없음)은 창에 넣지 않는다(검토 b 보통 1).
//   약속: tests/director/editor-handover.test.ts
import { isStoppedTake, selectHandoffTake, selectLatestShotAttempt } from '@/lib/director-video-take-selection'
import { directorFullLabel, sortByBoard, type BoardNodeNames } from '@/features/director/node-label'
import { latestShotTake, takeSettings } from '@/lib/director/remake-take'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { countText } from '@/lib/i18n/count-text'
import { isShotData, isVideoData, type DirectorNode } from '@/types/director'

type Translate = (key: string, params?: Record<string, string | number>) => string

/** [다시 만들기]를 시작하지 못한 까닭 — 창이 그 줄에 보인다(검토 b 2차 낮음 3 — 전엔 말없이 끝났다). no_window 는 보이지 않는다.
 *  pending_text_edit = 그 샷에 [적용]을 기다리는 Lumi 글 고침 카드가 있다(옛 글로 만들지 않는다 — board 검토 b 재검토 보통 1).
 *  video_limit = 내 영상 동시 한도에 걸렸다(멈춘 Take 도 뒤에서 끝날 때까지 자리를 쓴다 — 리드 재검토 a).
 *  takes_unknown = Take 잔액을 읽지 못했다(누를 때마다 다시 읽는다 — 검토 b 2차 낮음 1). */
export type RemakeFailReason = 'no_window' | 'pending_text_edit' | 'image_batch' | 'video_batch' | 'image_running' | 'image_failed' | 'video_running' | 'video_limit' | 'not_started' | 'takes_unknown'
export type RemakeResult = { started: true } | { started: false; reason: RemakeFailReason }

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
        cancelled_at: video.cancelledAt ?? null,
      }]
    })
    const chosen = selectHandoffTake(records)
    // 가장 새 시도는 샷 상태와 같게 고른다 — 멈춘 Take 의 시각은 멈춘 때(리드 2026-11-14 규칙). 그것이 멈춘 Take 면
    //   뒤에서 돌든 실패했든 만드는 중도 실패도 아니다(아직 만들지 않음) — 이 창에서 새 Take 를 바로 만들 수 있다.
    const latest = chosen ? null : selectLatestShotAttempt(records)
    const live = latest && !isStoppedTake(latest) ? latest : null
    const missing: MissingVideoReason | null = chosen
      ? null
      : live?.last_attempt_status === 'generating' || live?.last_attempt_status === 'pending'
        ? 'generating'
        : live?.last_attempt_status === 'failed' || live?.status === 'failed'
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
  // 끈 단추에는 까닭을 적는다 — "영상 만드는 중"은 그 샷을 만드는 중으로 읽혔다(검토 b 2차 낮음 2).
  if (opts.batch === 'images') return { label: t('You can make it after the image batch finishes'), disabled: true }
  if (opts.batch === 'videos') return { label: t('You can make it after the video batch finishes'), disabled: true }
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

/** [다시 만들기]를 누른 줄 모음 — 줄마다 따로 넣고 뺀다. 한 칸이던 때는 먼저 누른 줄이 끝나며 나중에 누른 다른 줄의
 *  스피너까지 꺼서, 아직 이미지를 그리는 줄의 단추가 다시 켜졌다(리드 2026-11-14, entry 탐침). */
export function withStartingRow(rows: ReadonlySet<string>, shotNodeId: string, starting: boolean): ReadonlySet<string> {
  const next = new Set(rows)
  if (starting) next.add(shotNodeId)
  else next.delete(shotNodeId)
  return next
}

/** [다시 만들기]를 시작하지 못한 까닭 모음 — 줄마다 따로 넣고 뺀다(null 이면 그 줄 것만 지운다). 한 칸이던 때는 다른 줄을
 *  누르거나 다른 줄이 끝나면 앞 줄의 까닭이 사라졌다(검토 b 낮음, 리드 2026-11-14). */
export function withRowNotice(notices: ReadonlyMap<string, string>, shotNodeId: string, message: string | null): ReadonlyMap<string, string> {
  const next = new Map(notices)
  if (message) next.set(shotNodeId, message)
  else next.delete(shotNodeId)
  return next
}

/** [다시 만들기]를 시작하지 못한 까닭 글 — 그 줄 아래에 보인다. 창이 닫혀 있었으면(no_window) 보일 것이 없다. */
export function remakeNotice(reason: RemakeFailReason, t: Translate): string | null {
  switch (reason) {
    case 'image_batch':
      return t('You can make it after the image batch finishes')
    case 'video_batch':
      return t('You can make it after the video batch finishes')
    case 'image_running':
      return t("This shot's image is being made. You can make the video once it is done.")
    case 'image_failed':
      return t('Failed to generate the image.')
    case 'video_running':
      return t("This shot's video is already being made.")
    // 내 영상 동시 한도 — 멈춘 Take 도 뒤에서 끝날 때까지 자리를 쓴다(리드 재검토 a).
    case 'video_limit':
      return t('Too many videos are being made at once (stopped Takes keep their spot until they finish). You can make it once one is done.')
    case 'not_started':
      return t('Could not start the video. Try again in a moment.')
    case 'takes_unknown':
      return t("I couldn't check your Takes, so I didn't start. Please try again in a moment.")
    case 'pending_text_edit':
      return t('A text change is waiting for [Apply]. Apply or discard it, then make it again.')
    default:
      return null
  }
}

// 길이는 샷 계획 길이의 합이다 — Editor 는 클립마다 실제 영상 파일 길이로 줄일 수 있어 어림("약 N초")으로 보인다(리드 2026-11-14 · export 확인).

/** 창 머리 줄 — 영상 있는 샷 수 / 전체 · 약 N초 · 빈 칸이 생기지 않는다는 말. */
export function handoverHeaderLine(view: EditorHandoverView, t: Translate): string {
  return t('{done}/{total} videos · about {seconds}s · Shots without video do not go into the timeline as empty slots.', { done: view.cuts, total: view.total, seconds: view.seconds })
}

/** 넘기기 단추 — 빠질 샷이 있으면 "… 빼고 넘기기", 없으면(창을 연 채 다 만들어졌다) 시안 D8 의 "Editor로 넘기기 · 컷 N · 약 N초"(낮음 3). */
//   영어는 컷이 하나면 단수 문장(리드 11/14 — 영어 재점검 "1 cuts").
export function proceedButtonLabel(view: EditorHandoverView, t: Translate): string {
  const cuts = { cuts: view.cuts, seconds: view.seconds }
  if (view.missing.length === 0) return countText(t, view.cuts, 'Hand over to Editor · 1 cut · about {seconds}s', 'Hand over to Editor · {cuts} cuts · about {seconds}s', cuts)
  return view.missing.length === 1
    ? countText(t, view.cuts, 'Hand over without {label} · 1 cut · about {seconds}s', 'Hand over without {label} · {cuts} cuts · about {seconds}s', { ...cuts, label: view.missing[0].label })
    : countText(t, view.cuts, 'Hand over without {count} shots · 1 cut · about {seconds}s', 'Hand over without {count} shots · {cuts} cuts · about {seconds}s', { ...cuts, count: view.missing.length })
}
