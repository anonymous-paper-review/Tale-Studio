// 지난 판 줄(오너 2026-11-26 A4 · S3 · D2) — 카드에 마우스를 올리면 카드 바로 아래에 뜨는 지난 판 작은 카드의 규칙.
//   Artist(인물 · 배경 칸) · Storyboard(실사 샷) · Director(이미지 판 · Take)가 같이 쓰는 순수 규칙이다. 화면은 components/version-history.
//   지금 판은 넣지 않는다(카드가 곧 지금 판). 가장 새 판부터 5개까지 보이고, 넘치는 수는 more 로 센다 — 모든 판은 상세에 있다.
//   지난 판이 없으면 빈 줄이고, 화면은 줄을 띄우지 않는다. 판 기록은 이미 저장된 것만 읽는다(새 저장 칸 없음):
//   이미지 = shots.storyboard_image.versions, 영상 = 그 샷의 Take, Artist = 칸마다 남은 후보(고른 것 + 최근 5장).
//   약속: tests/director/version-history.test.ts
import { currentStoryboardVersion, storyboardImageVersions } from '@/lib/director/storyboard-image-versions'
import { isArrowVersionId } from '@/lib/storyboard/real-arrow-edit'
import { compareDirectorVideoTakeOrder } from '@/lib/director-video-take-selection'
import { historyPick, type VersionSummary } from '@/lib/artist/style-versions'
import type { StoryboardImage } from '@/types/director'

/** 줄에 한 번에 보이는 지난 판 수(오너 "5개까지"). */
export const HISTORY_STRIP_SIZE = 5

/** 줄에 보일 것 — 가장 새 것부터 5개, 그리고 보이지 않는 나머지 수. */
export function historyStrip<T>(pastNewestFirst: readonly T[]): { shown: T[]; more: number } {
  return { shown: pastNewestFirst.slice(0, HISTORY_STRIP_SIZE), more: Math.max(0, pastNewestFirst.length - HISTORY_STRIP_SIZE) }
}

/** 지난 이미지 판 하나 — 작은 카드에는 시작 그림을 보인다. */
export interface PastImageVersion {
  id: string
  n: number
  thumbUrl: string
  upload: boolean
  /** 화면에서 멈춘 작업이 뒤늦게 끝난 그림 — 기록에만 있던 판. */
  stopped: boolean
}

/** 지난 이미지 판 — 지금 그림인 판을 뺀 나머지, 가장 새 판(번호가 큰 것)부터. 판이 하나뿐이거나 그림이 없으면 빈 목록.
 *  arrowMiddleThumb(Storyboard 만, 검토 rev-realarrow 1): 화살표를 고친 판(arrows-…)은 시작 장이 밑 판과 같아 가운데 장을 작은 그림으로 쓴다. */
export function pastImageVersions(image: StoryboardImage | null | undefined, opts?: { arrowMiddleThumb?: boolean }): PastImageVersion[] {
  const currentId = currentStoryboardVersion(image)?.id ?? null
  return storyboardImageVersions(image)
    .filter((version) => version.id !== currentId)
    .sort((a, b) => b.n - a.n)
    .map((version) => ({
      id: version.id,
      n: version.n,
      thumbUrl: (opts?.arrowMiddleThumb && isArrowVersionId(version.id) ? version.frames?.direction : null) ?? version.frames?.start ?? version.url,
      upload: version.source === 'upload',
      stopped: version.cancelled === true,
    }))
}

/** 줄이 읽는 Take 한 개 — Director 영상 노드(VideoNodeData)에서 필요한 칸만. */
export interface TakeHistoryInput {
  id: string
  takeNumber: number
  createdAt?: string | null
  status: string
  videoUrl: string | null
  thumbnailUrl?: string | null
  cancelledAt?: string | null
}

/** 지난 Take 하나 — 작은 카드에는 썸네일, 없으면 영상의 첫 장면. */
export interface PastTake {
  id: string
  takeNumber: number
  videoUrl: string
  thumbUrl: string | null
  stopped: boolean
}

/** 지난 Take — 카드가 트는 Take 를 뺀, 다 만들어 볼 수 있는 Take 만 가장 새 것부터. 실패 · 만드는 중 · 끝나지 않은 멈춘 Take 는
 *  채택할 영상이 없어 넣지 않는다. 멈췄지만 뒤늦게 끝난 Take 는 영상이 있어 넣는다(★ 로 고를 수 있다). */
export function pastTakes(takes: readonly TakeHistoryInput[], cardTakeId: string | null): PastTake[] {
  return takes
    .filter((take) => take.id !== cardTakeId && take.status === 'completed' && typeof take.videoUrl === 'string' && take.videoUrl.trim().length > 0)
    .map((take) => ({ take, order: { id: take.id, take_number: take.takeNumber, created_at: take.createdAt ?? null } }))
    .sort((a, b) => compareDirectorVideoTakeOrder(a.order, b.order))
    .map(({ take }) => ({
      id: take.id,
      takeNumber: take.takeNumber,
      videoUrl: take.videoUrl!.trim(),
      thumbUrl: take.thumbnailUrl ?? null,
      stopped: take.cancelledAt != null,
    }))
}

/** Artist 칸(인물 모습 시트 · 배경 모습)의 지난 그림 — 카드에 보이는 그림(고른 것)을 뺀 후보, 가장 새로 그린 것부터.
 *  칸마다 고른 것 + 최근 5장이 남는다(CANDIDATE_RETENTION). 고른 표시가 다른 그림에 남아 있어도 카드에 보이는 그림은 지난 판이 아니다. */
export function pastCandidates<T extends { id: string; url: string; isSelected: boolean; generatedAt: string }>(
  candidates: readonly T[] | null | undefined,
  shownUrl?: string | null,
): T[] {
  return (candidates ?? [])
    .filter((candidate) => !candidate.isSelected && candidate.url.trim().length > 0 && candidate.url !== shownUrl)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
}

/** Artist 지난 그림 하나 — otherStyle 이 있으면 다른 작품 스타일 판(그 판)에서 그린 그림이라 채택할 수 없다(10/28 작품 스타일 규칙). */
export interface PastArtistImage {
  id: string
  url: string
  generatedAt: string
  otherStyle: VersionSummary | null
}

/** Artist 칸의 지난 그림과 채택할 수 있는지 — 작품 스타일은 하나라, 다른 스타일 판에서 그린 그림은 흐리게 보이고 [채택]이 꺼진다
 *  (상세 기록의 [불러오기] · 서버 other_style 거절과 같은 판정 historyPick). 작품 스타일 기록이 하나뿐이면 가리지 않는다. */
export function pastArtistImages(
  candidates: readonly { id: string; url: string; isSelected: boolean; generatedAt: string }[] | null | undefined,
  shownUrl: string | null | undefined,
  style: { versions: readonly VersionSummary[]; currentStyleId: string | null },
): PastArtistImage[] {
  return pastCandidates(candidates, shownUrl).map((candidate) => {
    const pick = style.versions.length < 2 ? null : historyPick({ generatedAt: candidate.generatedAt, versions: style.versions, currentStyleId: style.currentStyleId })
    return { id: candidate.id, url: candidate.url, generatedAt: candidate.generatedAt, otherStyle: pick && !pick.loadable ? pick.version : null }
  })
}
