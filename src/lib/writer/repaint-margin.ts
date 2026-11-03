// 실사 시트 칸 가장자리에 섞여 들어온 시트 여백(종이색 띠)과 칸 테두리 선을 재는 규칙 (#repaint-margin 2026-11-03).
//
// 배경 실측(운영 3945d1e6 「The Keeper's Letters」 real 칸 176장): 25칸 가장자리에 [종이색 띠 2~22줄][칸 테두리 선 1~3줄]이
//   섞였다 — 모델이 칸을 스펙 자리보다 짧게 · 옆으로 밀어 그리면 고정 자르기(스펙 칸 + 3% 안쪽)가 여백까지 문다. 몇 칸은
//   띠 너머로 아래 칸 테두리 · 그림 몇 줄까지 물었고, 영상은 이 칸을 시작 · 끝 그림으로 받아 흰 띠를 옮겼다(sh_04_46).
// 여백으로 보는 조건(셋 다):
//   ① 종이색 줄 — 줄 평균이 시트 종이색(250·248·243) ±10 이고 줄 전체가 고르다(밝기 표준편차 ≤ 4, 실측 띠 0.3~2.6).
//      차가운 흰 벽 · 그늘진 벽은 색이, 주름진 흰 침구는 고르기가 달라 여기서 걸러진다.
//   ② 상한 — 띠는 변 길이의 10% 안에 있다. 종이색이 그보다 안쪽까지 이어지면 여백이 아니라 그림(빈 벽 · 눈밭)으로 본다.
//   ③ 칸 테두리 — 띠 바로 안쪽 3줄 안에 어두운 줄(밝기 ≤ 140)이 있다. 모델이 그린 칸 테두리 선이다.
// 깎는 양 = 띠의 가장 안쪽 줄까지 + 테두리 몫 3줄. 띠 너머(가장자리 쪽)에 이웃 칸 조각이 있어도 함께 나간다.
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

export const REPAINT_PAPER = { r: 250, g: 248, b: 243 } as const
const PAPER_TOLERANCE = 10
const PAPER_STD_MAX = 4
export const MARGIN_CAP_FRAC = 0.1
const BORDER_SCAN = 3
const BORDER_LUM_MAX = 140
const BORDER_TRIM = 3

type Side = keyof EdgeTrim
interface LineStat {
  r: number
  g: number
  b: number
  lum: number
  std: number
}

/** rect 의 side 가장자리에서 i 번째 줄(안쪽으로) 평균 색 · 밝기 표준편차. */
function lineAt(img: RawImage, rect: Rect, side: Side, i: number): LineStat {
  const horizontal = side === 'top' || side === 'bottom'
  const n = horizontal ? rect.width : rect.height
  const fixed =
    side === 'top' ? rect.top + i
    : side === 'bottom' ? rect.top + rect.height - 1 - i
    : side === 'left' ? rect.left + i
    : rect.left + rect.width - 1 - i
  let r = 0
  let g = 0
  let b = 0
  let sum = 0
  let sum2 = 0
  for (let k = 0; k < n; k++) {
    const x = horizontal ? rect.left + k : fixed
    const y = horizontal ? fixed : rect.top + k
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
  const lum = sum / n
  return { r: r / n, g: g / n, b: b / n, lum, std: Math.sqrt(Math.max(0, sum2 / n - lum * lum)) }
}

function isPaper(s: LineStat): boolean {
  return (
    Math.abs(s.r - REPAINT_PAPER.r) <= PAPER_TOLERANCE &&
    Math.abs(s.g - REPAINT_PAPER.g) <= PAPER_TOLERANCE &&
    Math.abs(s.b - REPAINT_PAPER.b) <= PAPER_TOLERANCE &&
    s.std <= PAPER_STD_MAX
  )
}

/** 한 변에서 깎을 줄 수 — 여백이 아니면 0. */
function sideDepth(img: RawImage, rect: Rect, side: Side): number {
  const across = side === 'top' || side === 'bottom' ? rect.height : rect.width
  const cap = Math.max(1, Math.round(across * MARGIN_CAP_FRAC))
  const lines: LineStat[] = []
  for (let i = 0; i < Math.min(across, cap + BORDER_SCAN + 1); i++) lines.push(lineAt(img, rect, side, i))
  const paper = lines.map(isPaper)
  // 상한 안에서 가장 안쪽의 종이색 줄 — 두 줄 이상 이어진 띠만(우연히 한 줄 맞는 그림 줄은 띠가 아니다).
  let inner = -1
  for (let i = 0; i < Math.min(cap, lines.length); i++) {
    if (paper[i] && ((i > 0 && paper[i - 1]) || (i + 1 < paper.length && paper[i + 1]))) inner = i
  }
  if (inner < 0) return 0
  // 종이색이 상한 너머까지 이어진다 — 여백이 아니라 그림으로 본다.
  if (inner + 1 < paper.length && paper[inner + 1]) return 0
  let border = false
  for (let k = inner + 1; k <= inner + BORDER_SCAN && k < lines.length; k++) {
    if (lines[k].lum <= BORDER_LUM_MAX) border = true
  }
  if (!border) return 0
  return Math.min(across - 1, inner + 1 + BORDER_TRIM)
}

/** rect(자르기 자리) 네 가장자리의 여백 깊이. */
export function repaintMarginTrim(img: RawImage, rect: Rect): EdgeTrim {
  return {
    top: sideDepth(img, rect, 'top'),
    bottom: sideDepth(img, rect, 'bottom'),
    left: sideDepth(img, rect, 'left'),
    right: sideDepth(img, rect, 'right'),
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
