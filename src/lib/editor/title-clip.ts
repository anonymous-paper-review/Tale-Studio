// 제목 클립(2단계 ⑥, 시안 E2 409:5231–5288 · 결정 페이지 "새 제목은 V2 위 2초 글자 클립") — 영상 위에 글자만 얹는 클립의 크기 · 줄 · 자리 셈과
//   캔버스 그리기. 모니터 글자 층(TitleTextLayer)과 내보내기(drawTitleText)가 같은 셈으로 같은 줄 · 같은 자리에 그린다(2단계 ⑦).
//   시각마다 그릴 제목과 그 옅기(전환)는 그릴 것 목록(selectFrameAt)이 영상과 같은 셈으로 정한다.
//   약속: tests/editor/title-clips.test.ts · tests/editor/frame-plan.test.ts
import { TITLE_FONT_FAMILY, layoutTitleText, type MeasureText } from '@/lib/editor/title-card'
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
/** 글자 줄 폭 — 화면 폭의 80%. 줄 높이는 글자 크기의 1.25배, 배경 띠 위아래 여백은 0.4배(검정 55%). */
export const TITLE_TEXT_WIDTH = 0.8
const LINE_HEIGHT = 1.25
const BAND_PAD = 0.4
const BAND_FILL = 'rgba(0,0,0,0.55)'
/** 줄 길이를 고르게 하는 문단 줄 수 상한 — 브라우저의 text-wrap: balance 와 같다. */
const BALANCE_MAX_LINES = 6
const round3 = (n: number) => Math.round(n * 1000) / 1000

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

/** 제목 글꼴 — 굵게. 모니터 글자 층 · 줄 재기 · 내보내기가 같은 글꼴을 쓴다. */
export function titleTextFont(fontPx: number): string {
  return `700 ${fontPx}px ${TITLE_FONT_FAMILY}`
}

/**
 * 제목 글자 → 줄 — 줄바꿈 문자는 그대로, 폭을 넘으면 낱말로(한 낱말이 넘치면 글자로) 나누고, 문단마다 줄 길이를 고르게 한다(같은 줄 수를
 *   지키는 가장 좁은 폭, 6줄까지 — 브라우저의 text-wrap: balance 와 같은 셈). 모니터와 내보내기가 같은 잣대(같은 글꼴로 잰 폭)로 부르면
 *   같은 줄이 된다. 빈 글자는 빈 배열.
 */
export function titleTextLines(text: string, maxWidth: number, measure: MeasureText): string[] {
  if (!text.trim()) return []
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((paragraph) => {
      if (!paragraph.trim()) return ['']
      const lines = layoutTitleText(paragraph, maxWidth, measure)
      if (lines.length < 2 || lines.length > BALANCE_MAX_LINES) return lines
      let lo = 0
      let hi = maxWidth
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2
        if (layoutTitleText(paragraph, mid, measure).length <= lines.length) hi = mid
        else lo = mid
      }
      return layoutTitleText(paragraph, hi, measure)
    })
}

/** 제목 글자 덩어리 자리(px) — 위 12% · 가운데 · 아래 12% · 배경 띠(아래 8%, 위아래 여백 글자 크기의 0.4배). 줄 높이는 글자 크기의 1.25배. */
export function titleTextGeometry(
  box: { fontPx: number; place: TitleTextPlace; offsetPct: number },
  lineCount: number,
  frameHeight: number,
): { top: number; lineHeight: number; band: { top: number; height: number } | null } {
  const lineHeight = round3(box.fontPx * LINE_HEIGHT)
  const block = lineHeight * lineCount
  const offset = (frameHeight * box.offsetPct) / 100
  if (box.place === 'top') return { top: round3(offset), lineHeight, band: null }
  if (box.place === 'middle') return { top: round3((frameHeight - block) / 2), lineHeight, band: null }
  if (box.place === 'bottom') return { top: round3(frameHeight - offset - block), lineHeight, band: null }
  const pad = box.fontPx * BAND_PAD
  const bandTop = frameHeight - offset - block - 2 * pad
  return { top: round3(bandTop + pad), lineHeight, band: { top: round3(bandTop), height: round3(block + 2 * pad) } }
}

/** 제목 글자를 캔버스에 — 모니터 글자 층과 같은 글꼴 · 크기 · 줄 · 자리 · 띠(흰 글자, 가운데 맞춤). 빈 글자는 아무것도 그리지 않는다. */
export function drawTitleText(ctx: CanvasRenderingContext2D, W: number, H: number, data: TitleTextData): void {
  const box = titleTextBox(data, H)
  ctx.font = titleTextFont(box.fontPx)
  const lines = titleTextLines(data.text, W * TITLE_TEXT_WIDTH, (s) => ctx.measureText(s).width)
  if (lines.length === 0) return
  const geo = titleTextGeometry(box, lines.length, H)
  if (geo.band) {
    ctx.fillStyle = BAND_FILL
    ctx.fillRect(0, geo.band.top, W, geo.band.height)
  }
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line, i) => ctx.fillText(line, W / 2, geo.top + (i + 0.5) * geo.lineHeight))
}
