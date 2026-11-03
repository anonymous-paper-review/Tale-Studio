// 실사 시트 칸 가장자리에 섞여 들어온 시트 여백(종이색 띠)과 칸 테두리 선을 재는 규칙 (#repaint-margin 2026-11-03).
//
// 배경 실측(운영 3945d1e6 「The Keeper's Letters」 real 칸 176장): 25칸 가장자리에 [종이색 띠 2~22줄][칸 테두리 선 1~3줄]이
//   섞였다 — 모델이 칸을 스펙 자리보다 짧게 · 옆으로 밀어 그리면 고정 자르기(스펙 칸 + 3% 안쪽)가 여백까지 문다. 몇 칸은
//   띠 너머로 아래 칸 테두리 · 그림 몇 줄까지 물었고, 영상은 이 칸을 시작 · 끝 그림으로 받아 흰 띠를 옮겼다(sh_04_46).
// 종이색은 그 시트에서 잰다(measureSheetPaper) — 운영 시트 10장의 종이색은 247~253 으로 시트마다 달랐고, 한 시트 안의 띠끼리는
//   10장 중 9장에서 1 안쪽으로 같았다. 정해 둔 한 색 ±10 으로 견주던 첫 판은 매끈한 흰 벽 · 날아간 하늘(252) · 푸른 눈밭을 띠로 보고 깎았다(검토 지적).
// 여백으로 보는 조건(넷 다):
//   ① 종이색 줄 — 줄 평균이 그 시트 종이색 ±4 이고 줄 전체가 고르다(밝기 표준편차 ≤ 3, 실측 띠 0.3~2.6). 두 줄 이상 이어진다.
//   ② 상한 — 띠는 변 길이의 10% 안에 있다. 종이색이 그보다 안쪽까지 이어지면 여백이 아니라 그림(빈 벽 · 눈밭)으로 본다.
//   ③ 칸 테두리 — 띠 안쪽(테두리 옆 밝은 번짐 2줄까지 지나) 3줄 안에 어두운 줄(밝기 ≤ 140)이 있다. 모델이 그린 칸 테두리 선이다.
//   ④ 바깥으로 이어짐 — 띠 줄을 자르기 자리 옆 바깥(칸 안쪽 여유 + 칸 사이 여백 절반)까지 늘여도 종이색이다(한쪽이면 된다).
//      진짜 띠는 칸 사이 여백 줄이라 자리 밖으로 이어지고, 그림 속 흰 면은 자리 밖에서 곧 그 칸의 테두리를 만난다(2차 검토 지적:
//      종이색 ±4 안의 따뜻한 흰 벽 · 크림색 벽 · 밝은 종이 위 날아간 하늘).
// 깎는 양 = 띠 + 번짐 줄 + 테두리 몫 3줄. 띠 너머(가장자리 쪽)에 이웃 칸 조각이 있어도 함께 나간다. 종이색을 못 재면 깎지 않는다.
// sharp 를 쓰지 않는 순수 셈이다 — 자르기 · 크기 되돌리기는 rough-grid-crop 의 repaint 길이 한다.

export interface RawImage {
  data: Uint8Array
  width: number
  height: number
  /** 픽셀당 바이트 수(앞 3개를 R · G · B 로 읽는다). */
  channels: number
}
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}
export interface EdgeTrim {
  top: number
  bottom: number
  left: number
  right: number
}
export type RGB = readonly [number, number, number]
/** 칸 경계 비례 좌표 [시작, 끝] — rough-storyboard-grid 의 sheetGeometry cols · rows 와 같은 꼴. */
type Bounds = ReadonlyArray<readonly [number, number]>
/** 띠 줄을 자르기 자리 밖으로 늘여 볼 길이(px) — x 는 좌우로, y 는 위아래로. */
export interface Reach {
  x: number
  y: number
}

const PAPER_TOLERANCE = 4
const PAPER_STD_MAX = 3
export const MARGIN_CAP_FRAC = 0.1
const PALE_LUM_MIN = 200
const PALE_STD_MAX = 6
const PALE_MAX = 2
const BORDER_SCAN = 3
const BORDER_LUM_MAX = 140
const BORDER_TRIM = 3
const SAMPLE_STD_MAX = 3
const SAMPLE_LUM_MIN = 200
const SAMPLE_MIN = 3

type Side = keyof EdgeTrim
interface LineStat {
  r: number
  g: number
  b: number
  lum: number
  std: number
}

/** rect 안 픽셀의 평균 색 · 밝기 표준편차(한 줄이면 rect 의 너비나 높이가 1). */
function regionStat(img: RawImage, rect: Rect): LineStat {
  let r = 0
  let g = 0
  let b = 0
  let sum = 0
  let sum2 = 0
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const o = (y * img.width + x) * img.channels
      const R = img.data[o]
      const G = img.data[o + 1]
      const B = img.data[o + 2]
      r += R
      g += G
      b += B
      const l = 0.299 * R + 0.587 * G + 0.114 * B
      sum += l
      sum2 += l * l
    }
  }
  const n = Math.max(1, rect.width * rect.height)
  const lum = sum / n
  return { r: r / n, g: g / n, b: b / n, lum, std: Math.sqrt(Math.max(0, sum2 / n - lum * lum)) }
}

/** rect 의 side 가장자리에서 i 번째 줄(안쪽으로). */
function lineAt(img: RawImage, rect: Rect, side: Side, i: number): LineStat {
  if (side === 'top') return regionStat(img, { left: rect.left, top: rect.top + i, width: rect.width, height: 1 })
  if (side === 'bottom') return regionStat(img, { left: rect.left, top: rect.top + rect.height - 1 - i, width: rect.width, height: 1 })
  if (side === 'left') return regionStat(img, { left: rect.left + i, top: rect.top, width: 1, height: rect.height })
  return regionStat(img, { left: rect.left + rect.width - 1 - i, top: rect.top, width: 1, height: rect.height })
}

/**
 * 종이색을 잴 줄들 — 칸 사이 여백과 시트 바깥 여백의 가운데 몇 줄(칸 그리드 전체 길이). 칸을 가로지르지 않으므로
 *   고른 밝은 줄이면 종이다. cols · rows 는 비례 좌표, width · height 는 시트 픽셀 크기.
 */
export function paperSampleLines(cols: Bounds, rows: Bounds, width: number, height: number): Rect[] {
  const xs = cols.map(([a, b]) => [Math.round(a * width), Math.round(b * width)] as const)
  const ys = rows.map(([a, b]) => [Math.round(a * height), Math.round(b * height)] as const)
  const gridX0 = xs[0][0]
  const gridX1 = xs[xs.length - 1][1]
  const gridY0 = ys[0][0]
  const gridY1 = ys[ys.length - 1][1]
  const gaps = (bounds: ReadonlyArray<readonly [number, number]>, total: number): Array<[number, number]> => [
    [0, bounds[0][0]],
    ...bounds.slice(1).map((b, i): [number, number] => [bounds[i][1], b[0]]),
    [bounds[bounds.length - 1][1], total],
  ]
  const centers = ([a, b]: [number, number]): number[] => {
    if (b - a < 8) return []
    const c = Math.floor((a + b) / 2)
    return [c - 3, c - 1, c + 1, c + 3]
  }
  const lines: Rect[] = []
  for (const gap of gaps(xs, width)) for (const x of centers(gap)) lines.push({ left: x, top: gridY0, width: 1, height: gridY1 - gridY0 })
  for (const gap of gaps(ys, height)) for (const y of centers(gap)) lines.push({ left: gridX0, top: y, width: gridX1 - gridX0, height: 1 })
  return lines
}

/**
 * 띠 줄을 자리 밖으로 늘여 볼 길이 — 자르기 자리에서 칸 테두리까지(insetX · insetY + 칸 안쪽 여유)를 지나 칸 사이 여백 가운데까지.
 *   칸이 하나뿐인 축은 칸 사이 여백이 없어 10px 를 더한다.
 */
export function marginReach(cols: Bounds, rows: Bounds, width: number, height: number, insetX: number, insetY: number): Reach {
  const halfGap = (bounds: Bounds, total: number): number => {
    const gaps = bounds.slice(1).map((b, i) => Math.round((b[0] - bounds[i][1]) * total))
    return gaps.length ? Math.floor(Math.min(...gaps) / 2) : 10
  }
  return { x: insetX + halfGap(cols, width), y: insetY + halfGap(rows, height) }
}

/** 그 시트의 종이색 — 고른 밝은 줄들의 채널별 가운데 값. 그런 줄이 셋 미만이면(시트를 꽉 채워 그림) null. */
export function measureSheetPaper(img: RawImage, lines: readonly Rect[]): RGB | null {
  const paper = lines
    .filter((l) => l.left >= 0 && l.top >= 0 && l.left + l.width <= img.width && l.top + l.height <= img.height)
    .map((l) => regionStat(img, l))
    .filter((s) => s.std <= SAMPLE_STD_MAX && s.lum >= SAMPLE_LUM_MIN)
  if (paper.length < SAMPLE_MIN) return null
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  return [median(paper.map((s) => s.r)), median(paper.map((s) => s.g)), median(paper.map((s) => s.b))]
}

function isPaper(s: LineStat, paper: RGB): boolean {
  return (
    Math.abs(s.r - paper[0]) <= PAPER_TOLERANCE &&
    Math.abs(s.g - paper[1]) <= PAPER_TOLERANCE &&
    Math.abs(s.b - paper[2]) <= PAPER_TOLERANCE &&
    s.std <= PAPER_STD_MAX
  )
}

/** 테두리 옆 밝은 번짐 줄 — 종이색에서 조금 벗어났지만 밝고 고르다. */
function isPale(s: LineStat): boolean {
  return s.lum >= PALE_LUM_MIN && s.std <= PALE_STD_MAX
}

/** 가장자리에서 index 번째 띠 줄을 자리 밖 양옆으로 reach 만큼 늘인 조각 중 하나라도 종이색인가. */
function continuesOutside(img: RawImage, rect: Rect, side: Side, index: number, paper: RGB, reach: Reach): boolean {
  const segments: Rect[] = []
  if (side === 'top' || side === 'bottom') {
    const y = side === 'top' ? rect.top + index : rect.top + rect.height - 1 - index
    const leftFrom = Math.max(0, rect.left - reach.x)
    const rightFrom = rect.left + rect.width
    segments.push({ left: leftFrom, top: y, width: rect.left - leftFrom, height: 1 })
    segments.push({ left: rightFrom, top: y, width: Math.min(img.width, rightFrom + reach.x) - rightFrom, height: 1 })
  } else {
    const x = side === 'left' ? rect.left + index : rect.left + rect.width - 1 - index
    const topFrom = Math.max(0, rect.top - reach.y)
    const bottomFrom = rect.top + rect.height
    segments.push({ left: x, top: topFrom, width: 1, height: rect.top - topFrom })
    segments.push({ left: x, top: bottomFrom, width: 1, height: Math.min(img.height, bottomFrom + reach.y) - bottomFrom })
  }
  return segments.some((s) => s.width * s.height >= 8 && isPaper(regionStat(img, s), paper))
}

/** 한 변에서 깎을 줄 수 — 여백이 아니면 0. */
function sideDepth(img: RawImage, rect: Rect, side: Side, paper: RGB, reach: Reach): number {
  const across = side === 'top' || side === 'bottom' ? rect.height : rect.width
  const cap = Math.max(1, Math.round(across * MARGIN_CAP_FRAC))
  const lines: LineStat[] = []
  for (let i = 0; i < Math.min(across, cap + PALE_MAX + BORDER_SCAN + 1); i++) lines.push(lineAt(img, rect, side, i))
  const strict = lines.map((s) => isPaper(s, paper))
  // 상한 안에서 가장 안쪽의 종이색 줄 — 두 줄 이상 이어진 띠만(우연히 한 줄 맞는 그림 줄은 띠가 아니다).
  let inner = -1
  for (let i = 0; i < Math.min(cap, lines.length); i++) {
    if (strict[i] && ((i > 0 && strict[i - 1]) || (i + 1 < strict.length && strict[i + 1]))) inner = i
  }
  if (inner < 0) return 0
  // 종이색이 상한 너머까지 이어진다 — 여백이 아니라 그림으로 본다.
  if (inner + 1 < strict.length && strict[inner + 1]) return 0
  // 띠 가운데 줄이 자리 밖 칸 사이 여백으로 이어지나 — 아니면 그림 속 흰 면이다.
  let outer = inner
  while (outer > 0 && strict[outer - 1]) outer--
  if (!continuesOutside(img, rect, side, Math.floor((outer + inner) / 2), paper, reach)) return 0
  let end = inner
  while (end + 1 < lines.length && end - inner < PALE_MAX && isPale(lines[end + 1])) end++
  let border = false
  for (let k = end + 1; k <= end + BORDER_SCAN && k < lines.length; k++) {
    if (lines[k].lum <= BORDER_LUM_MAX) border = true
  }
  if (!border) return 0
  return Math.min(across - 1, end + 1 + BORDER_TRIM)
}

/** rect(자르기 자리) 네 가장자리의 여백 깊이 — paper 는 그 시트에서 잰 종이색, reach 는 자리 밖으로 늘여 볼 길이(marginReach). */
export function repaintMarginTrim(img: RawImage, rect: Rect, paper: RGB, reach: Reach): EdgeTrim {
  return {
    top: sideDepth(img, rect, 'top', paper, reach),
    bottom: sideDepth(img, rect, 'bottom', paper, reach),
    left: sideDepth(img, rect, 'left', paper, reach),
    right: sideDepth(img, rect, 'right', paper, reach),
  }
}

/** 한 샷의 세 칸을 같은 자리에서 자르기 위해 변마다 가장 깊은 값을 고른다. */
export function unionTrim(trims: readonly EdgeTrim[]): EdgeTrim {
  return {
    top: Math.max(0, ...trims.map((t) => t.top)),
    bottom: Math.max(0, ...trims.map((t) => t.bottom)),
    left: Math.max(0, ...trims.map((t) => t.left)),
    right: Math.max(0, ...trims.map((t) => t.right)),
  }
}

export function hasTrim(t: EdgeTrim): boolean {
  return t.top > 0 || t.bottom > 0 || t.left > 0 || t.right > 0
}

/** 여백을 뺀 안쪽에서 원래 칸(width x height)과 같은 비율의 가장 큰 상자 — 가운데 정렬. 원래 크기로 되돌릴 때 비율이 안 바뀐다. */
export function aspectFitBox(width: number, height: number, t: EdgeTrim): Rect {
  const innerW = Math.max(1, width - t.left - t.right)
  const innerH = Math.max(1, height - t.top - t.bottom)
  const ratio = width / height
  let w = innerW
  let h = innerH
  if (innerW / innerH > ratio) w = Math.max(1, Math.round(innerH * ratio))
  else h = Math.max(1, Math.round(innerW / ratio))
  return { left: t.left + Math.floor((innerW - w) / 2), top: t.top + Math.floor((innerH - h) / 2), width: w, height: h }
}
