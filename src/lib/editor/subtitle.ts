// 클립 자막 공용 모듈 (약속 K, 2026-09-04) — 클립마다 자막 한 덩어리. 미리보기 오버레이와 내보내기 캔버스가 같은 자리·같은 줄바꿈을 쓴다.
//
//   자리는 화면 비율(0..1, 덩어리의 가운데). 처음 자리는 아래 가운데(0.5, 0.9). 글자는 흰색에 검은 테두리.
//   Writer 가 쓴 대사가 있으면 그것이 초기값이고, 사람이 손대기 전(subtitle === undefined)까지는 대사를 그대로 따른다.
import type { DialogueLine, ShotSubtitle } from '@/types/shot'
import { TITLE_FONT_FAMILY, layoutTitleText } from '@/lib/editor/title-card'

export type { ShotSubtitle }

export const DEFAULT_SUBTITLE_POS = { x: 0.5, y: 0.9 } as const
/** 글자 크기 = 화면 높이 × 비율 */
export const SUBTITLE_FONT_RATIO = 0.045
export const SUBTITLE_LINE_HEIGHT = 1.25
/** 자막 덩어리의 최대 폭(화면 폭 비율) */
export const SUBTITLE_MAX_WIDTH_RATIO = 0.9
/** 검은 테두리 두께 = 글자 크기 × 비율 */
export const SUBTITLE_STROKE_RATIO = 0.12

export function subtitleFontPx(frameHeight: number): number {
  return Math.max(8, Math.round(frameHeight * SUBTITLE_FONT_RATIO))
}
export function subtitleFont(frameHeight: number): string {
  return `600 ${subtitleFontPx(frameHeight)}px ${TITLE_FONT_FAMILY}`
}

/** Writer 대사 → 자막 초기 글자(줄마다 한 대사). 대사가 없으면 빈 글자. */
export function initialSubtitleText(lines: readonly Pick<DialogueLine, 'text'>[] | null | undefined): string {
  if (!lines?.length) return ''
  return lines.map((l) => (l.text ?? '').trim()).filter(Boolean).join('\n')
}

/** 순수: 샷의 자막 값 — 손대지 않았으면(undefined) 대사에서, 손댔으면 저장값. null 은 지운 것(빈 글자). */
export function resolveSubtitle(
  shot: { subtitle?: ShotSubtitle | null; dialogueLines?: readonly Pick<DialogueLine, 'text'>[] } | null | undefined,
): ShotSubtitle {
  if (!shot) return { text: '', ...DEFAULT_SUBTITLE_POS }
  if (shot.subtitle === undefined) return { text: initialSubtitleText(shot.dialogueLines), ...DEFAULT_SUBTITLE_POS }
  if (shot.subtitle === null) return { text: '', ...DEFAULT_SUBTITLE_POS }
  return {
    text: shot.subtitle.text ?? '',
    x: clamp01(shot.subtitle.x, DEFAULT_SUBTITLE_POS.x),
    y: clamp01(shot.subtitle.y, DEFAULT_SUBTITLE_POS.y),
  }
}

export function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback
}

/** 방향키 한 번의 이동량(화면 비율). Shift 는 5배. */
export const SUBTITLE_NUDGE = 0.01

export function nudgeSubtitle(sub: ShotSubtitle, key: string, shift: boolean): ShotSubtitle | null {
  const step = SUBTITLE_NUDGE * (shift ? 5 : 1)
  if (key === 'ArrowLeft') return { ...sub, x: clamp01(sub.x - step, sub.x) }
  if (key === 'ArrowRight') return { ...sub, x: clamp01(sub.x + step, sub.x) }
  if (key === 'ArrowUp') return { ...sub, y: clamp01(sub.y - step, sub.y) }
  if (key === 'ArrowDown') return { ...sub, y: clamp01(sub.y + step, sub.y) }
  return null
}

/** 내보내기: 자막 덩어리를 (x·W, y·H) 가운데에 흰 글자 + 검은 테두리로 그린다. 빈 글자는 아무것도 그리지 않는다. */
export function drawSubtitle(ctx: CanvasRenderingContext2D, W: number, H: number, sub: ShotSubtitle): void {
  const fontPx = subtitleFontPx(H)
  ctx.font = subtitleFont(H)
  const lines = layoutTitleText(sub.text ?? '', SUBTITLE_MAX_WIDTH_RATIO * W, (s) => ctx.measureText(s).width)
  if (!lines.length) return
  const lineH = fontPx * SUBTITLE_LINE_HEIGHT
  const total = lines.length * lineH
  const top = sub.y * H - total / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, fontPx * SUBTITLE_STROKE_RATIO)
  ctx.strokeStyle = '#000000'
  ctx.fillStyle = '#ffffff'
  lines.forEach((line, i) => {
    const y = top + i * lineH
    ctx.strokeText(line, sub.x * W, y)
    ctx.fillText(line, sub.x * W, y)
  })
}
