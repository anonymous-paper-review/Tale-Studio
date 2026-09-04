// 타이틀 카드(검은 화면) 공용 모듈 (약속 J, 2026-09-04) — 미리보기(DOM)와 내보내기(캔버스)가 같은 배치·같은 줄바꿈을 쓴다.
//
//   배치는 카드 폭·높이에 대한 비율(0..1)이라 미리보기 상자 크기와 내보내기 캔버스 크기가 달라도 같은 자리에 놓인다.
//   글자 줄바꿈은 layoutTitleText 하나가 정한다: 미리보기는 오프스크린 캔버스의 measureText 로, 내보내기는 그리는 캔버스의
//   measureText 로 같은 글꼴을 재므로 줄이 같다(약속 J8). 빈 글자는 아무것도 그리지 않는다(약속 J7).
import type { TitleCardData, TitleCardLayer, TitleCardLayout } from '@/types/shot'

export type { TitleCardData, TitleCardLayer, TitleCardLayout }

export const TITLE_CARD_DEFAULT_SECONDS = 5
/** 글자 크기 = 카드 높이 × 비율. 미리보기와 내보내기가 같은 비율을 쓴다. */
export const TITLE_FONT_RATIO = 0.06
export const TITLE_LINE_HEIGHT = 1.25
export const TITLE_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif'

export const DEFAULT_TITLE_CARD_LAYOUT: TitleCardLayout = {
  text: { x: 0.1, y: 0.6, w: 0.8 },
  image: { x: 0.25, y: 0.08, w: 0.5 },
  order: 'text-over-image',
}

export function titleFontPx(cardHeight: number): number {
  return Math.max(8, Math.round(cardHeight * TITLE_FONT_RATIO))
}

export function titleCardFont(cardHeight: number): string {
  return `600 ${titleFontPx(cardHeight)}px ${TITLE_FONT_FAMILY}`
}

export function resolveTitleCardLayout(card: Pick<TitleCardData, 'layout'> | null | undefined): TitleCardLayout {
  const l = card?.layout
  return {
    text: clampLayer(l?.text ?? DEFAULT_TITLE_CARD_LAYOUT.text),
    image: clampLayer(l?.image ?? DEFAULT_TITLE_CARD_LAYOUT.image),
    order: l?.order ?? DEFAULT_TITLE_CARD_LAYOUT.order,
  }
}

/** 카드 밖으로 나가지 않게 — 폭은 5%~100%, 위치는 0..(1-폭)…세로는 0..0.95(높이는 내용이 정한다). */
export function clampLayer(layer: TitleCardLayer): TitleCardLayer {
  const w = Math.min(1, Math.max(0.05, Number.isFinite(layer.w) ? layer.w : 0.5))
  const x = Math.min(1 - w, Math.max(0, Number.isFinite(layer.x) ? layer.x : 0))
  const y = Math.min(0.95, Math.max(0, Number.isFinite(layer.y) ? layer.y : 0))
  return { x, y, w }
}

export type MeasureText = (s: string) => number

/**
 * 순수: 글자 → 줄 목록. 줄바꿈 문자는 그대로 줄을 나누고(빈 줄 유지), 한 줄이 maxWidth 를 넘으면 단어 단위로,
 *   단어 하나가 넘으면 글자 단위로 나눈다(띄어쓰기 없는 한국어·긴 낱말). 빈 글자는 빈 배열.
 */
export function layoutTitleText(text: string, maxWidth: number, measure: MeasureText): string[] {
  if (!text || !text.trim()) return []
  const out: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (paragraph.trim() === '') {
      out.push('')
      continue
    }
    const words = paragraph.split(/(\s+)/).filter((w) => w.length > 0)
    let line = ''
    const pushChars = (word: string) => {
      let chunk = ''
      for (const ch of word) {
        if (chunk && measure(chunk + ch) > maxWidth) {
          out.push(chunk)
          chunk = ch
        } else {
          chunk += ch
        }
      }
      return chunk
    }
    for (const word of words) {
      if (/^\s+$/.test(word)) {
        if (line) line += ' '
        continue
      }
      const candidate = line ? `${line}${word}` : word
      if (measure(candidate) <= maxWidth) {
        line = candidate
        continue
      }
      if (line.trim()) out.push(line.trimEnd())
      line = measure(word) <= maxWidth ? word : pushChars(word)
    }
    if (line.trim()) out.push(line.trimEnd())
  }
  return out
}

/** 이미지 레이어의 실제 사각형(px) — 폭은 비율로, 높이는 원본 비율로. */
export function imageRect(
  layer: TitleCardLayer,
  W: number,
  H: number,
  natural: { width: number; height: number } | null,
): { x: number; y: number; w: number; h: number } {
  const w = layer.w * W
  const ar = natural && natural.width > 0 && natural.height > 0 ? natural.width / natural.height : 16 / 9
  return { x: layer.x * W, y: layer.y * H, w, h: w / ar }
}

/**
 * 내보내기·썸네일 공용: 카드 한 장을 캔버스에 그린다. 순서(order)대로 이미지·글자를 겹친다.
 *   빈 글자는 아무것도 찍지 않는다(약속 J7 — 내부 식별자를 찍던 옛 경로 제거).
 */
export function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  card: TitleCardData,
  image: HTMLImageElement | null,
): void {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)
  const layout = resolveTitleCardLayout(card)
  const drawImage = () => {
    if (!image || !card.imageUrl) return
    const r = imageRect(layout.image, W, H, { width: image.naturalWidth, height: image.naturalHeight })
    try {
      ctx.drawImage(image, r.x, r.y, r.w, r.h)
    } catch {
      /* 손상된 이미지는 건너뛴다 */
    }
  }
  const drawText = () => {
    ctx.font = titleCardFont(H)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const boxX = layout.text.x * W
    const boxW = layout.text.w * W
    const lines = layoutTitleText(card.text ?? '', boxW, (s) => ctx.measureText(s).width)
    const lineH = titleFontPx(H) * TITLE_LINE_HEIGHT
    lines.forEach((line, i) => {
      ctx.fillText(line, boxX + boxW / 2, layout.text.y * H + i * lineH)
    })
  }
  if (layout.order === 'image-over-text') {
    drawText()
    drawImage()
  } else {
    drawImage()
    drawText()
  }
}
