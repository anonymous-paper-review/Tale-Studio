// 프로젝트 카드 썸네일 고르기(#landing-v2b 2026-08-03 → 순수 함수로 분리 2026-09-09) — 목록 API 가 쓴다.
//   우선순위: 실사 스토리보드 시작 프레임 > 러프 보드 시작 프레임 > 인물 얼굴 크롭(characters.portrait) > 설정 시트(view_main) > 없음.
//   2026-09-09 동업자 실측: 목록 API 가 characters 에 없는 컬럼(portrait_url)을 골라 항상 시트(1088×608, 도표·색상표 포함)로
//   떨어졌다 — 카드 크기에서 얼굴을 알아볼 수 없었다. 인물 컬럼은 portrait 다.

export type ThumbnailImageJson =
  | { url?: string | null; status?: string | null; frames?: { start?: string | null } | null }
  | null
  | undefined

export interface ThumbnailShotRow {
  project_id: string
  storyboard_image?: unknown
  rough_storyboard?: unknown
}

export interface ThumbnailCharacterRow {
  project_id: string
  portrait?: string | null
  view_main?: string | null
}

/** 완료된 그림의 시작 프레임(없으면 대표 url). 미완료·없음은 null. */
export function pickCompletedImage(img: unknown, allowFrames: boolean): string | null {
  const j = img as ThumbnailImageJson
  if (!j || j.status !== 'completed') return null
  return (allowFrames ? j.frames?.start : null) ?? j.url ?? null
}

/** 프로젝트별 대표 썸네일 — shots 는 sort_order 오름차순으로 넘긴다. */
export function pickProjectThumbnails(
  shots: ReadonlyArray<ThumbnailShotRow>,
  characters: ReadonlyArray<ThumbnailCharacterRow>,
): Map<string, string> {
  const thumbnails = new Map<string, string>()
  // 실사 패스 먼저 — 첫 샷의 러프가 뒤 샷의 실사를 이기지 않게(패스 분리).
  for (const s of shots) {
    if (thumbnails.has(s.project_id)) continue
    const url = pickCompletedImage(s.storyboard_image, true)
    if (url) thumbnails.set(s.project_id, url)
  }
  for (const s of shots) {
    if (thumbnails.has(s.project_id)) continue
    const url = pickCompletedImage(s.rough_storyboard, true)
    if (url) thumbnails.set(s.project_id, url)
  }
  for (const c of characters) {
    if (thumbnails.has(c.project_id)) continue
    const portrait = typeof c.portrait === 'string' && c.portrait.trim() ? c.portrait : null
    const sheet = typeof c.view_main === 'string' && c.view_main.trim() ? c.view_main : null
    const url = portrait ?? sheet
    if (url) thumbnails.set(c.project_id, url)
  }
  return thumbnails
}
