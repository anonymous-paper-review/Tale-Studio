// 배치도(blockout) 렌더(#blockout 2026-09-03, 무대 진단서 3번) — 무대에서 계산한 화면 배치(screen_layout)를
//   러프 생성 모델의 두 번째 참조 이미지로 준다. 실험(2026-09-02, 겨울_4 28·29·30): 배치도를 주면 gpt-image-2 가
//   위치·크기·향을 따른다(3/3). 글자는 폰트 없는 서버(Vercel)에서 깨질 수 있어 숫자를 7-세그먼트 선으로 그린다.
//   순수 SVG 빌더 + sharp 래스터화. 실패는 호출부가 삼키고(참조 없이 진행) 로그로 남긴다.
import type { ScreenPlacement, ShotScreenLayout, StageCamera } from '@/lib/writer/types/pipeline'
import { project } from '@/lib/writer/pipeline/stage/geometry'

export interface BlockoutFigure {
  /** 러프 프롬프트의 "figure N" — character_blocking 순서(1부터) */
  n: number
  placement: ScreenPlacement
}

export interface BlockoutPanel {
  camera: StageCamera
  figures: BlockoutFigure[]
}

export interface BlockoutColumn {
  start: BlockoutPanel | null
  end: BlockoutPanel | null
}

export interface BlockoutSheetOptions {
  /** 프레임 가로/세로 비 */
  aspect: number
  cellW?: number
  gap?: number
}

const GRID_COLOR = '#cfcfcf'
const HORIZON_COLOR = '#9a9a9a'
const FIGURE_FILL = '#7a7a7a'
const FIGURE_STROKE = '#2a2a2a'
const FACING_COLOR = '#c62828'
const LEDGE_FILL = '#e9e9e9'
const LEDGE_STROKE = '#9a9a9a'

// 7-세그먼트 숫자(폰트 불요): a b c d e f g
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
}
function digitPaths(d: string, x: number, y: number, h: number, stroke: string): string {
  const w = h * 0.55
  const seg = SEGMENTS[d] ?? ''
  const lines: string[] = []
  const L = (x1: number, y1: number, x2: number, y2: number) => lines.push(`<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="${r(Math.max(2, h * 0.14))}" stroke-linecap="round"/>`)
  if (seg.includes('a')) L(x, y, x + w, y)
  if (seg.includes('b')) L(x + w, y, x + w, y + h / 2)
  if (seg.includes('c')) L(x + w, y + h / 2, x + w, y + h)
  if (seg.includes('d')) L(x, y + h, x + w, y + h)
  if (seg.includes('e')) L(x, y + h / 2, x, y + h)
  if (seg.includes('f')) L(x, y, x, y + h / 2)
  if (seg.includes('g')) L(x, y + h / 2, x + w, y + h / 2)
  return lines.join('')
}
export function numberPaths(n: number, cx: number, cy: number, h: number, stroke = '#ffffff'): string {
  const s = String(Math.max(0, Math.floor(n)))
  const w = h * 0.55
  const total = s.length * w + (s.length - 1) * h * 0.25
  let x = cx - total / 2
  const out: string[] = []
  for (const d of s) {
    out.push(digitPaths(d, x, cy - h / 2, h, stroke))
    x += w + h * 0.25
  }
  return out.join('')
}

const r = (v: number) => Math.round(v * 10) / 10

/** 화면 좌표(u∈[-1,1] 오른쪽 양수, v∈[-1,1] 위쪽 양수) → 패널 픽셀 */
function toPx(u: number, v: number, x0: number, y0: number, W: number, H: number): [number, number] {
  return [x0 + ((u + 1) / 2) * W, y0 + ((1 - v) / 2) * H]
}

function facingDelta(facing: ScreenPlacement['facing']): [number, number] {
  switch (facing) {
    case 'front': return [0, 1]
    case 'back': return [0, -1]
    case 'profile_left': return [-1, 0]
    case 'profile_right': return [1, 0]
    case 'three_quarter_front_left': return [-0.7, 0.7]
    case 'three_quarter_front_right': return [0.7, 0.7]
    case 'three_quarter_back_left': return [-0.7, -0.7]
    case 'three_quarter_back_right': return [0.7, -0.7]
    default: return [0, 1]
  }
}

/** 패널 하나의 SVG 조각(클리핑 포함). */
export function panelSvg(panel: BlockoutPanel, x0: number, y0: number, W: number, H: number, aspect: number, clipId: string): string {
  const cam = panel.camera
  const parts: string[] = []
  parts.push(`<clipPath id="${clipId}"><rect x="${r(x0)}" y="${r(y0)}" width="${r(W)}" height="${r(H)}"/></clipPath>`)
  parts.push(`<g clip-path="url(#${clipId})">`)
  parts.push(`<rect x="${r(x0)}" y="${r(y0)}" width="${r(W)}" height="${r(H)}" fill="#ffffff"/>`)
  // 지면 격자 — 카메라 앞 30m, 좌우 ±14m (카메라 기준으로 투영)
  const fx = cam.look_at.x - cam.x
  const fy = cam.look_at.y - cam.y
  const fl = Math.hypot(fx, fy) || 1
  const f = { x: fx / fl, y: fy / fl }
  const rt = { x: f.y, y: -f.x }
  const gridLine = (pts: Array<{ x: number; y: number }>) => {
    let d = ''
    let pen = false
    for (const p of pts) {
      const q = project(cam, { x: p.x, y: p.y, z: 0 }, aspect)
      if (!q || Math.abs(q.u) > 6 || Math.abs(q.v) > 6) { pen = false; continue }
      const [px, py] = toPx(q.u, q.v, x0, y0, W, H)
      d += `${pen ? 'L' : 'M'}${r(px)} ${r(py)} `
      pen = true
    }
    if (d) parts.push(`<path d="${d.trim()}" fill="none" stroke="${GRID_COLOR}" stroke-width="1"/>`)
  }
  for (let k = 1; k <= 30; k++) {
    const pts = []
    for (let s = -14; s <= 14; s += 1) pts.push({ x: cam.x + f.x * k + rt.x * s, y: cam.y + f.y * k + rt.y * s })
    gridLine(pts)
  }
  for (let s = -14; s <= 14; s += 2) {
    const pts = []
    for (let k = 1; k <= 30; k += 1) pts.push({ x: cam.x + f.x * k + rt.x * s, y: cam.y + f.y * k + rt.y * s })
    gridLine(pts)
  }
  // 지평선(카메라 높이의 무한원)
  const far = project(cam, { x: cam.x + f.x * 5000, y: cam.y + f.y * 5000, z: cam.z }, aspect)
  if (far) {
    const [, hy] = toPx(0, far.v, x0, y0, W, H)
    parts.push(`<line x1="${r(x0)}" y1="${r(hy)}" x2="${r(x0 + W)}" y2="${r(hy)}" stroke="${HORIZON_COLOR}" stroke-width="1"/>`)
  }
  // 인물 — 먼 것부터
  const figs = [...panel.figures].filter((g) => g.placement.in_frame || Math.abs(g.placement.screen_x) <= 1.3).sort((a, b) => b.placement.distance_m - a.placement.distance_m)
  for (const g of figs) {
    const p = g.placement
    const [bx, by] = toPx(p.screen_x, p.screen_y, x0, y0, W, H)
    const h = Math.max(6, p.apparent_height * H)
    const lying = p.posture === 'lying'
    const rx = Math.max(10, (lying ? h * 1.2 : h * 0.42))
    parts.push(`<ellipse cx="${r(bx)}" cy="${r(by)}" rx="${r(rx)}" ry="${r(rx * 0.35)}" fill="${LEDGE_FILL}" stroke="${LEDGE_STROKE}" stroke-width="1"/>`)
    if (lying) {
      const w = h * 2.6
      const hh = Math.max(6, h * 0.55)
      parts.push(`<rect class="fig" x="${r(bx - w / 2)}" y="${r(by - hh)}" width="${r(w)}" height="${r(hh)}" rx="${r(hh / 2)}" fill="${FIGURE_FILL}" stroke="${FIGURE_STROKE}" stroke-width="2"/>`)
      parts.push(numberPaths(g.n, bx, by - hh / 2, Math.max(8, hh * 0.6)))
    } else {
      const w = Math.max(6, h * 0.28)
      parts.push(`<rect class="fig" x="${r(bx - w / 2)}" y="${r(by - h)}" width="${r(w)}" height="${r(h)}" rx="${r(w / 2)}" fill="${FIGURE_FILL}" stroke="${FIGURE_STROKE}" stroke-width="2"/>`)
      const hr = Math.max(4, w * 0.62)
      parts.push(`<circle cx="${r(bx)}" cy="${r(by - h + hr * 0.6)}" r="${r(hr)}" fill="${FIGURE_FILL}" stroke="${FIGURE_STROKE}" stroke-width="2"/>`)
      parts.push(numberPaths(g.n, bx, by - h * 0.45, Math.max(8, Math.min(40, h * 0.22))))
    }
    const [dx, dy] = facingDelta(p.facing)
    const len = Math.max(8, Math.min(28, h * 0.18))
    parts.push(`<line x1="${r(bx)}" y1="${r(by)}" x2="${r(bx + dx * len)}" y2="${r(by + dy * len * 0.5)}" stroke="${FACING_COLOR}" stroke-width="3" stroke-linecap="round"/>`)
    parts.push(`<circle cx="${r(bx + dx * len)}" cy="${r(by + dy * len * 0.5)}" r="3" fill="${FACING_COLOR}"/>`)
  }
  parts.push('</g>')
  parts.push(`<rect x="${r(x0)}" y="${r(y0)}" width="${r(W)}" height="${r(H)}" fill="none" stroke="#3a3a3a" stroke-width="2"/>`)
  return parts.join('')
}

/** 시트: 열 = 샷(스토리보드 열 순서), 위 행 = START, 아래 행 = END. */
export function buildBlockoutSheetSvg(columns: BlockoutColumn[], opts: BlockoutSheetOptions): { svg: string; width: number; height: number } {
  const cellW = opts.cellW ?? 400
  const cellH = Math.round(cellW / Math.max(0.2, opts.aspect))
  const gap = opts.gap ?? 16
  const cols = Math.max(1, columns.length)
  const width = gap + cols * (cellW + gap)
  const height = gap + 2 * (cellH + gap)
  const body: string[] = []
  columns.forEach((col, ci) => {
    const x0 = gap + ci * (cellW + gap)
    const panels: Array<[BlockoutPanel | null, number]> = [[col.start, gap], [col.end, gap * 2 + cellH]]
    panels.forEach(([panel, y0], ri) => {
      if (!panel) {
        body.push(`<rect x="${x0}" y="${y0}" width="${cellW}" height="${cellH}" fill="#ffffff" stroke="#bbbbbb" stroke-width="2" stroke-dasharray="6 6"/>`)
        return
      }
      body.push(panelSvg(panel, x0, y0, cellW, cellH, opts.aspect, `clip_${ci}_${ri}`))
    })
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f4f4f4"/>${body.join('')}</svg>`
  return { svg, width, height }
}

/** screen_layout → 패널 쌍. 번호는 blocking 순서(1부터). END 배치가 없으면(정지) START 를 END 로 쓴다. */
export function columnFromLayout(layout: ShotScreenLayout, blockingIds: string[]): BlockoutColumn {
  const n = (id: string) => blockingIds.indexOf(id) + 1
  const start: BlockoutPanel = {
    camera: layout.camera,
    figures: layout.characters.filter((c) => n(c.character_id) > 0).map((c) => ({ n: n(c.character_id), placement: c.start })),
  }
  const end: BlockoutPanel = {
    camera: layout.end_camera ?? layout.camera,
    figures: layout.characters.filter((c) => n(c.character_id) > 0).map((c) => ({ n: n(c.character_id), placement: c.end ?? c.start })),
  }
  return { start, end }
}

/** SVG → PNG(sharp). 서버 전용. */
export async function renderBlockoutPng(svg: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(svg)).png().toBuffer()
}
