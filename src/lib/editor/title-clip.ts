// 제목 클립(2단계 ⑥, 시안 E2 409:5231–5288 · 결정 페이지 "새 제목은 V2 위 2초 글자 클립") — 영상 위에 글자만 얹는 클립의 크기 · 자리 셈.
//   시각마다 그릴 제목과 그 옅기(전환)는 그릴 것 목록(selectFrameAt, 2단계 ⑦)이 영상과 같은 셈으로 정한다.
//   약속: tests/editor/title-clips.test.ts
import type { TitleTextData, TitleTextPlace } from '@/types/shot'

export const TITLE_CLIP_SECONDS = 2
export const TITLE_SIZE_DEFAULT = 30
export const TITLE_SIZE_MIN = 10
export const TITLE_SIZE_MAX = 100
/** 효과 컨트롤 위치 칩 차례(시안 E2 409:5245–5252) · 화면 이름. */
export const TITLE_PLACES: readonly TitleTextPlace[] = ['top', 'middle', 'bottom', 'band']
export const TITLE_PLACE_LABEL: Record<TitleTextPlace, string> = {
  top: 'Upper',
  middle: 'Center',
  bottom: 'Lower',
  band: 'Background band',
}
/** 위 · 아래 자리는 화면 가장자리에서 12%, 배경 띠는 아래에서 8%. */
const PLACE_OFFSET_PCT: Record<TitleTextPlace, number> = { top: 12, middle: 0, bottom: 12, band: 8 }

/** 새 제목의 처음 글자 — 프로젝트 이름(시안 E2 의 첫 제목이 그렇다), 없으면 fallback("제목"). */
export function defaultTitleText(projectTitle: string | null | undefined, fallback: string): string {
  const name = projectTitle?.trim()
  return name ? name : fallback
}

/** 값을 범위 안으로 — 크기 10 ~ 100 정수, 모르는 자리는 가운데. */
export function cleanTitleText(data: TitleTextData): TitleTextData {
  const size = Number.isFinite(data.size) ? Math.round(data.size) : TITLE_SIZE_DEFAULT
  return {
    text: typeof data.text === 'string' ? data.text : '',
    size: Math.min(TITLE_SIZE_MAX, Math.max(TITLE_SIZE_MIN, size)),
    place: TITLE_PLACES.includes(data.place) ? data.place : 'middle',
  }
}

/** 글자 높이(px) = 화면 높이 × 크기 ÷ 400 과 자리 — 크기 30 이면 화면 높이의 7.5%. */
export function titleTextBox(data: TitleTextData, frameHeight: number): { fontPx: number; place: TitleTextPlace; offsetPct: number } {
  const { size, place } = cleanTitleText(data)
  return { fontPx: Math.round(((frameHeight * size) / 400) * 100) / 100, place, offsetPct: PLACE_OFFSET_PCT[place] }
}
