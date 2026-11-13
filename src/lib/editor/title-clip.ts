// 제목 클립(2단계 ⑥, 시안 E2 409:5231–5288 · 결정 페이지 "새 제목은 V2 위 2초 글자 클립") — 영상 위에 글자만 얹는 클립의 크기 · 자리 셈과,
//   시각마다 모니터에 그릴 제목과 그 옅기. 맞닿은 두 제목의 교차 디졸브는 경계 앞뒤로 둘을 겹쳐 그린다(앞 제목은 끝 뒤까지, 뒤 제목은
//   시작 앞부터 — 글자라 원본이 모자랄 일이 없다). 빈 끝의 교차 디졸브는 제목이 서서히 나타나고 사라진다. 내보내기는 ⑦에서 같은 셈을 쓴다.
//   약속: tests/editor/title-clips.test.ts
import { edgeFadeAt, type TrackItem, type TransitionWindow } from '@/lib/editor/transition'
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

const round3 = (n: number) => Math.round(n * 1000) / 1000
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

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

/**
 * 시각 t 에 그릴 제목과 옅기(1 = 그대로) — titles 는 그릴 차례(아래 줄부터)의 제목 클립 자리. 맞닿은 두 제목 사이 교차 디졸브는 앞 제목이
 *   1 → 0, 뒤 제목이 0 → 1 로 겹치고, 빈 끝의 교차 디졸브는 그 제목만 옅어진다.
 */
export function titleLayersAt(
  titles: readonly TrackItem[],
  windows: readonly TransitionWindow[],
  t: number,
): { shotId: string; fade: number }[] {
  const ids = new Set(titles.map((item) => item.shotId))
  const out: { shotId: string; fade: number }[] = []
  for (const item of titles) {
    let from = item.startSec
    let to = item.startSec + item.durationSec
    let fade = 1
    for (const w of windows) {
      if (w.type !== 'cross' || !w.outgoing || !w.incoming || !ids.has(w.outgoing) || !ids.has(w.incoming)) continue
      const progress = clamp01((t - w.fromSec) / (w.toSec - w.fromSec))
      const inside = t >= w.fromSec && t < w.toSec
      if (w.incoming === item.shotId) {
        from = Math.min(from, w.fromSec)
        if (inside) fade = Math.min(fade, progress)
      }
      if (w.outgoing === item.shotId) {
        to = Math.max(to, w.toSec)
        if (inside) fade = Math.min(fade, 1 - progress)
      }
    }
    if (t < from || t >= to) continue
    fade = Math.min(fade, edgeFadeAt(windows, item.shotId, t))
    out.push({ shotId: item.shotId, fade: round3(clamp01(fade)) })
  }
  return out
}
