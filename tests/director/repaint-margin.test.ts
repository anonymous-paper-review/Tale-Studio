// 실사 시트를 샷 칸으로 자를 때 칸에 섞여 들어온 시트 여백(종이색 띠)은 잘라 내고, 밝은 그림은 그대로 두며, 칸 크기는 지금과 같다 (#repaint-margin 2026-11-03)
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { sheetGeometry, sheetSpecOf } from '@/lib/writer/rough-storyboard-grid'
import { cropRoughGridFrames } from '@/lib/writer/rough-grid-crop'

// #repaint-margin (2026-11-03) — 배경 실측: 운영 3945d1e6 「The Keeper's Letters」 real 칸 176장 중 25칸의 가장자리에
//   [시트 종이색 띠 2~22줄][칸 테두리 선]이 섞였다(모델이 칸을 스펙 자리보다 짧게 · 옆으로 밀어 그림). 몇 칸은 띠 너머로
//   아래 칸 테두리 · 그림 몇 줄까지 물었고, 영상은 이 칸을 시작 · 끝 그림으로 받아 흰 띠를 옮겼다(sh_04_46).
// 합성 시트: 스펙 캔버스(2880x1280)에 종이 바탕 + 칸마다 사진처럼 거친 무늬 + 2px 어두운 테두리. 띠는 칸을 짧게 · 밀어 그려 만든다.

const FMT = 'horizontal_16:9'
const PAPER: RGB = [250, 248, 242]
const BORDER: RGB = [20, 20, 20]
type RGB = [number, number, number]
interface Rect { left: number; top: number; width: number; height: number }

function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Sheet {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
  constructor(paper: RGB = PAPER) {
    const spec = sheetSpecOf('grid4', FMT)!
    this.width = spec.canvas.width
    this.height = spec.canvas.height
    this.data = new Uint8Array(this.width * this.height * 3)
    this.fill(0, 0, this.width, this.height, paper)
  }
  fill(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    for (let y = Math.max(0, y0); y < Math.min(this.height, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(this.width, x1); x++) this.data.set(c, (y * this.width + x) * 3)
  }
  /** 사진처럼 거친 무늬 — 같은 seed · 같은 왼쪽 위면 같은 무늬(칸끼리 비교용). */
  noise(x0: number, y0: number, x1: number, y1: number, base: RGB, amp: number, seed: number): void {
    const rand = rng(seed)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const n = (rand() - 0.5) * 2 * amp
        if (y < 0 || y >= this.height || x < 0 || x >= this.width) continue
        this.data.set(base.map((v) => Math.max(0, Math.min(255, Math.round(v + n)))), (y * this.width + x) * 3)
      }
  }
  /** 칸 하나 — 무늬 + 바깥 2px 테두리. */
  panel(x0: number, y0: number, x1: number, y1: number, base: RGB, seed: number): void {
    this.fill(x0, y0, x1, y1, BORDER)
    this.noise(x0 + 2, y0 + 2, x1 - 2, y1 - 2, base, 30, seed)
  }
  png(): Promise<Buffer> {
    return sharp(Buffer.from(this.data), { raw: { width: this.width, height: this.height, channels: 3 } }).png().toBuffer()
  }
}

const SPEC = sheetSpecOf('grid4', FMT)!
const BASES: RGB[][] = [
  [[96, 120, 150], [150, 96, 80], [96, 120, 150]],
  [[80, 140, 200], [200, 90, 60], [120, 160, 90]],
  [[140, 110, 90], [90, 140, 110], [110, 90, 140]],
  [[120, 120, 130], [130, 110, 100], [100, 130, 120]],
]
/** 스펙 칸 자리 그대로 그린 시트(띠 없음). 칸 (s, f) 를 바꾸려면 override 가 [x0, y0, x1, y1] 을 돌려준다. */
async function sheetWith(override: (s: number, f: number, box: [number, number, number, number]) => [number, number, number, number] = (_s, _f, b) => b, extra?: (sheet: Sheet) => void, paper: RGB = PAPER): Promise<Buffer> {
  const sheet = new Sheet(paper)
  for (let s = 0; s < 4; s++)
    for (let f = 0; f < 3; f++) {
      const [x0, x1] = SPEC.colBoxes[s]
      const [y0, y1] = SPEC.rowBoxes[f]
      const [a, b, c, d] = override(s, f, [x0, y0, x1, y1])
      // 한 샷의 시작 · 끝은 같은 무늬(seed 같음)로 — 두 칸이 같은 배율로 잘렸는지 비교할 수 있게.
      sheet.panel(a, b, c, d, BASES[s][f], 1000 + s * 10 + (f === 2 ? 0 : f))
    }
  extra?.(sheet)
  return sheet.png()
}

/** 지금 자르기의 칸 자리(스펙 칸 + 3% 안쪽) — rough-grid-crop 의 repaint 길과 같은 셈. */
function windowOf(s: number, f: number): Rect {
  const { cols, rows } = sheetGeometry('grid4', FMT)
  const W = SPEC.canvas.width
  const H = SPEC.canvas.height
  const insetX = Math.max(2, Math.round((cols[0][1] - cols[0][0]) * W * 0.03))
  const insetY = Math.max(2, Math.round((rows[0][1] - rows[0][0]) * H * 0.03))
  const left = Math.round(cols[s][0] * W) + insetX
  const top = Math.round(rows[f][0] * H) + insetY
  return { left, top, width: Math.round((cols[s][1] - cols[s][0]) * W) - insetX * 2, height: Math.round((rows[f][1] - rows[f][0]) * H) - insetY * 2 }
}

interface Frame { data: Buffer; width: number; height: number }
async function frameOf(png: Buffer): Promise<Frame> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}
type Side = 'top' | 'bottom' | 'left' | 'right'
/** 가장자리에서 i 번째 줄의 평균 색 · 밝기 표준편차. */
function lineAt(fr: Frame, side: Side, i: number): { rgb: RGB; std: number } {
  const horizontal = side === 'top' || side === 'bottom'
  const n = horizontal ? fr.width : fr.height
  const fixed = side === 'top' ? i : side === 'bottom' ? fr.height - 1 - i : side === 'left' ? i : fr.width - 1 - i
  let r = 0, g = 0, b = 0, s = 0, s2 = 0
  for (let k = 0; k < n; k++) {
    const x = horizontal ? k : fixed
    const y = horizontal ? fixed : k
    const o = (y * fr.width + x) * 3
    r += fr.data[o]; g += fr.data[o + 1]; b += fr.data[o + 2]
    const l = 0.299 * fr.data[o] + 0.587 * fr.data[o + 1] + 0.114 * fr.data[o + 2]
    s += l; s2 += l * l
  }
  const mean = s / n
  return { rgb: [r / n, g / n, b / n], std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) }
}
const near = (a: RGB, b: RGB, tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
/** 가장자리 depth 줄 안에 종이색 줄(고른 종이색) 또는 테두리 선(고른 어두운 줄)이 있나. */
function edgeArtifacts(fr: Frame, side: Side, depth = 30): { paper: number; border: number } {
  let paper = 0
  let border = 0
  for (let i = 0; i < depth; i++) {
    const { rgb, std } = lineAt(fr, side, i)
    if (near(rgb, PAPER, 10) && std <= 4) paper++
    if (i < 4 && near(rgb, BORDER, 25) && std <= 8) border++
  }
  return { paper, border }
}
async function sizeOf(png: Buffer): Promise<string> {
  const m = await sharp(png).metadata()
  return `${m.width}x${m.height}`
}
async function plainCut(sheet: Buffer, s: number, f: number): Promise<Buffer> {
  return (await sharp(sheet).extract(windowOf(s, f)).removeAlpha().raw().toBuffer())
}

// 시작 칸(행 0)을 아래로 30px 짧게 — 칸 자리 안쪽 아래 16줄이 종이, 그 위 2줄이 테두리(운영 sh_04_38 · sh_05_56 꼴).
const shortStart = (s: number) => (ss: number, f: number, b: [number, number, number, number]): [number, number, number, number] =>
  ss === s && f === 0 ? [b[0], b[1], b[2], b[3] - 30] : b

describe('실사 시트 칸 자르기 — 시트 여백 띠를 잘라 낸다 (#repaint-margin)', () => {
  it('칸 아래에 시트 여백 흰 띠가 붙어 있으면 잘라 낸 칸에는 띠가 없다', async () => {
    // 왜: 모델이 칸을 시트 칸 자리보다 조금 짧게 그리면 고정 자르기가 아래 종이 여백까지 물어, 그 칸으로 만든 영상 첫 장면에 흰 띠가 남는다(운영 3945d1e6 22칸).
    const sheet = await sheetWith(shortStart(0))
    const before = await frameOf(await sharp(sheet).extract(windowOf(0, 0)).png().toBuffer())
    expect(edgeArtifacts(before, 'bottom').paper, '합성 시트의 자르기 자리에 띠가 있어야 시험이 된다').toBeGreaterThan(10)
    const [shot] = await cropRoughGridFrames(sheet, 'grid4', 1, FMT, 'repaint')
    const after = await frameOf(shot.start)
    expect(edgeArtifacts(after, 'bottom')).toEqual({ paper: 0, border: 0 })
  }, 30_000)

  it('띠 너머로 아래 칸 테두리 · 그림이 조금 보여도 띠와 함께 잘라 낸다', async () => {
    // 왜: 모델이 칸 줄 전체를 위로 당겨 그리면 고정 자르기가 여백을 지나 아래 칸 테두리 · 그림 몇 줄까지 문다(운영 sh_04_46 시작 칸).
    const window = windowOf(1, 0)
    const bottom = window.top + window.height
    const sheet = await sheetWith((s, f, b) => {
      if (s !== 1) return b
      // 시작 칸은 자르기 자리 아래 끝에서 25줄 위에서 끝나고(테두리 포함), 방향 칸은 자르기 자리 아래 9줄 안으로 올라온다.
      if (f === 0) return [b[0], b[1], b[2], bottom - 25]
      if (f === 1) return [b[0], bottom - 9, b[2], bottom - 9 + (b[3] - b[1])]
      return b
    })
    const [, shot] = await cropRoughGridFrames(sheet, 'grid4', 2, FMT, 'repaint')
    const after = await frameOf(shot.start)
    expect(edgeArtifacts(after, 'bottom')).toEqual({ paper: 0, border: 0 })
    // 맨 아래 3줄은 시작 칸 자신의 무늬색이어야 한다 — 아래 칸(방향, 붉은 무늬) 색이 남으면 이웃 조각이 섞인 것.
    const own = BASES[1][0]
    const neighbor = BASES[1][1]
    for (let i = 0; i < 3; i++) {
      const { rgb } = lineAt(after, 'bottom', i)
      const dOwn = rgb.reduce((a, v, k) => a + Math.abs(v - own[k]), 0)
      const dNeighbor = rgb.reduce((a, v, k) => a + Math.abs(v - neighbor[k]), 0)
      expect(dOwn, `아래에서 ${i}번째 줄 색 ${rgb.map(Math.round)}`).toBeLessThan(dNeighbor)
    }
  }, 30_000)

  it('칸 왼쪽이나 오른쪽에 붙은 여백 띠도 잘라 낸다', async () => {
    // 왜: 모델이 칸을 옆으로 조금 밀어 그리면 옆 가장자리에 종이 줄과 테두리 선이 남는다(운영 sh_02_20 · sh_04_42 · sh_06_66).
    const sheet = await sheetWith((s, f, b) => {
      const w = windowOf(s, f)
      if (s === 2 && f === 0) return [w.left + 4, b[1], b[2], b[3]] // 왼쪽 4줄 종이 + 테두리
      if (s === 3 && f === 2) return [b[0], b[1], w.left + w.width - 3, b[3]] // 오른쪽 3줄 종이 + 테두리
      return b
    })
    const shots = await cropRoughGridFrames(sheet, 'grid4', 4, FMT, 'repaint')
    expect(edgeArtifacts(await frameOf(shots[2].start), 'left')).toEqual({ paper: 0, border: 0 })
    expect(edgeArtifacts(await frameOf(shots[3].end), 'right')).toEqual({ paper: 0, border: 0 })
  }, 30_000)

  it('칸 가장자리의 흰 벽 · 흰 침구는 깎지 않는다', async () => {
    // 왜: 병실 벽 · 이불처럼 밝은 그림은 시트 종이색과 다르거나(차가운 흰색) 고르지 않다(주름) — 여백으로 잘못 보고 깎으면 그림이 사라진다.
    const sheet = await sheetWith(undefined, (sh) => {
      const wall = windowOf(3, 0)
      const wb = wall.top + wall.height
      sh.fill(wall.left - 20, wb - 62, wall.left + wall.width + 20, wb - 60, [30, 30, 30]) // 걸레받이 같은 어두운 선
      sh.noise(wall.left - 20, wb - 60, wall.left + wall.width + 20, wb + 12, [236, 238, 241], 1, 7) // 차가운 흰 벽
      const bed = windowOf(3, 2)
      const bb = bed.top + bed.height
      sh.fill(bed.left - 20, bb - 42, bed.left + bed.width + 20, bb - 40, [40, 38, 36])
      sh.noise(bed.left - 20, bb - 40, bed.left + bed.width + 20, bb + 12, [248, 246, 240], 16, 9) // 주름진 흰 침구
    })
    const shots = await cropRoughGridFrames(sheet, 'grid4', 4, FMT, 'repaint')
    const wall = await sharp(shots[3].start).removeAlpha().raw().toBuffer()
    const bed = await sharp(shots[3].end).removeAlpha().raw().toBuffer()
    expect(wall.equals(await plainCut(sheet, 3, 0)), '흰 벽 칸은 지금 자르기와 같아야 한다').toBe(true)
    expect(bed.equals(await plainCut(sheet, 3, 2)), '흰 침구 칸은 지금 자르기와 같아야 한다').toBe(true)
  }, 30_000)

  it('칸 가장자리의 매끈한 흰 벽 · 날아간 하늘 · 눈밭은 곧은 선이 붙어 있어도 깎지 않는다', async () => {
    // 왜: 걸레받이 · 지붕선 · 울타리 가로대가 붙은 고른 흰 면은 시트 여백과 생김새가 같다 — 시트 종이색과 아주 가깝지 않으면 그림으로 보고 그대로 둔다(검토 지적, 첫 판은 23~27줄을 깎아 칸이 11% 커졌다).
    const sheet = await sheetWith(undefined, (sh) => {
      const wall = windowOf(0, 0)
      const wb = wall.top + wall.height
      sh.fill(wall.left - 20, wb - 22, wall.left + wall.width + 20, wb - 20, [35, 32, 30]) // 걸레받이
      sh.noise(wall.left - 20, wb - 20, wall.left + wall.width + 20, wb + 12, [244, 244, 242], 1, 11) // 매끈한 흰 벽 20줄
      const sky = windowOf(1, 0)
      sh.noise(sky.left - 20, sky.top - 12, sky.left + sky.width + 20, sky.top + 24, [252, 252, 252], 0, 12) // 날아간 하늘 24줄
      sh.fill(sky.left - 20, sky.top + 24, sky.left + sky.width + 20, sky.top + 26, [40, 36, 34]) // 곧은 지붕선
      const snow = windowOf(2, 2)
      const sb = snow.top + snow.height
      sh.fill(snow.left - 20, sb - 26, snow.left + snow.width + 20, sb - 24, [52, 44, 38]) // 울타리 가로대
      sh.noise(snow.left - 20, sb - 24, snow.left + snow.width + 20, sb + 12, [244, 247, 251], 1, 13) // 푸른빛 눈밭
    })
    const shots = await cropRoughGridFrames(sheet, 'grid4', 3, FMT, 'repaint')
    for (const [s, f, frame] of [[0, 0, shots[0].start], [1, 0, shots[1].start], [2, 2, shots[2].end]] as const) {
      const got = await sharp(frame).removeAlpha().raw().toBuffer()
      expect(got.equals(await plainCut(sheet, s, f)), `샷 ${s} 칸 ${f} 은 지금 자르기와 같아야 한다`).toBe(true)
    }
  }, 30_000)

  it('그림 속 흰 면이 종이색과 같아도, 바깥쪽에 칸 테두리가 먼저 오면 깎지 않는다', async () => {
    // 왜: 진짜 여백은 자르기 자리 밖으로도 칸 사이 여백(종이)으로 이어지고, 그림 속 흰 면은 자리 밖에서 곧 그 칸의 테두리를 만난다 —
    //   종이색 ±4 안의 따뜻한 흰 벽 · 크림색 벽 · 밝은 종이 위 날아간 하늘을 띠로 보고 23~27줄을 깎던 것(2차 검토 지적).
    /** 칸 (s, f) 안쪽 전체 너비로, 자르기 자리 아래 rows 줄부터 칸 테두리 직전까지 흰 면 + 그 위 곧은 어두운 줄. */
    const surfaceAtBottom = (sh: Sheet, s: number, f: number, color: RGB, rows: number) => {
      const [x0, x1] = SPEC.colBoxes[s]
      const [, y1] = SPEC.rowBoxes[f]
      const w = windowOf(s, f)
      const wb = w.top + w.height
      sh.fill(x0 + 2, wb - rows - 2, x1 - 2, wb - rows, [35, 32, 30])
      sh.noise(x0 + 2, wb - rows, x1 - 2, y1 - 2, color, 0, 31)
    }
    const cream = await sheetWith(undefined, (sh) => {
      surfaceAtBottom(sh, 0, 0, [248, 246, 240], 20) // 따뜻한 흰 벽
      surfaceAtBottom(sh, 1, 0, [251, 249, 244], 20) // 크림색 벽
    })
    const creamShots = await cropRoughGridFrames(cream, 'grid4', 2, FMT, 'repaint')
    expect((await sharp(creamShots[0].start).removeAlpha().raw().toBuffer()).equals(await plainCut(cream, 0, 0)), '따뜻한 흰 벽').toBe(true)
    expect((await sharp(creamShots[1].start).removeAlpha().raw().toBuffer()).equals(await plainCut(cream, 1, 0)), '크림색 벽').toBe(true)

    const brightPaper: RGB = [253, 253, 251]
    const bright = await sheetWith(shortStart(3), (sh) => {
      const [x0, x1] = SPEC.colBoxes[0]
      const [y0] = SPEC.rowBoxes[0]
      const w = windowOf(0, 0)
      sh.noise(x0 + 2, y0 + 2, x1 - 2, w.top + 24, [252, 252, 252], 0, 32) // 날아간 하늘(칸 테두리부터 자리 안 24줄)
      sh.fill(x0 + 2, w.top + 24, x1 - 2, w.top + 26, [40, 36, 34]) // 곧은 지붕선
    }, brightPaper)
    const brightShots = await cropRoughGridFrames(bright, 'grid4', 4, FMT, 'repaint')
    expect((await sharp(brightShots[0].start).removeAlpha().raw().toBuffer()).equals(await plainCut(bright, 0, 0)), '날아간 하늘').toBe(true)
    // 같은 시트의 진짜 띠(샷 3 시작 칸)는 그대로 잘린다 — 바깥으로 칸 사이 여백이 이어진다.
    let paperRows = 0
    const banded = await frameOf(brightShots[3].start)
    for (let i = 0; i < 30; i++) {
      const { rgb, std } = lineAt(banded, 'bottom', i)
      if (near(rgb, brightPaper, 6) && std <= 4) paperRows++
    }
    expect(paperRows, '밝은 종이 시트의 진짜 띠').toBe(0)
  }, 30_000)

  it('시트 종이색이 흔한 크림색과 달라도 그 시트의 칸 사이 여백 색으로 띠를 알아본다', async () => {
    // 왜: 시트마다 종이색이 다르다(운영 시트 10장 247~253) — 정해 둔 한 색과 견주면 어두운 종이의 띠는 놓치고 흰 그림은 띠로 본다.
    const greyPaper: RGB = [238, 236, 232]
    const sheet = await sheetWith(shortStart(0), undefined, greyPaper)
    const [shot] = await cropRoughGridFrames(sheet, 'grid4', 1, FMT, 'repaint')
    const after = await frameOf(shot.start)
    let paperRows = 0
    for (let i = 0; i < 30; i++) {
      const { rgb, std } = lineAt(after, 'bottom', i)
      if (near(rgb, greyPaper, 6) && std <= 4) paperRows++
    }
    expect(paperRows, '잘라 낸 칸 아래 30줄 안의 종이색 줄 수').toBe(0)
  }, 30_000)

  it('칸 사이 여백에서 종이색을 잴 수 없으면 깎지 않는다', async () => {
    // 왜: 모델이 시트를 여백 없이 꽉 채워 그리면 무엇이 종이인지 모른다 — 모를 때는 지금 자르기 그대로 둔다.
    const sheet = await sheetWith(shortStart(0), (sh) => {
      // 시트 바깥 여백 · 칸 사이를 모두 거친 무늬로 덮고 칸 자리만 되살린다 — 시작 칸 아래 짧아진 자리의 종이색 줄은 남는다.
      const saved = sh.data.slice()
      sh.noise(0, 0, sh.width, sh.height, [120, 116, 110], 30, 21)
      for (let s = 0; s < 4; s++)
        for (let f = 0; f < 3; f++) {
          const w = windowOf(s, f)
          for (let y = w.top - 14; y < w.top + w.height + 14; y++) {
            const from = (y * sh.width + w.left - 23) * 3
            sh.data.set(saved.subarray(from, from + (w.width + 46) * 3), from)
          }
        }
    })
    const [shot] = await cropRoughGridFrames(sheet, 'grid4', 1, FMT, 'repaint')
    const got = await sharp(shot.start).removeAlpha().raw().toBuffer()
    expect(got.equals(await plainCut(sheet, 0, 0))).toBe(true)
  }, 30_000)

  it('종이색이 정해 둔 상한보다 안쪽까지 이어지면 그림으로 보고 깎지 않는다', async () => {
    // 왜: 여백은 칸 가장자리의 얇은 줄이다 — 칸 높이의 10% 넘게 이어지는 종이색은 빈 벽 · 눈밭 같은 그림일 수 있어 지우면 내용이 사라진다.
    const sheet = await sheetWith(undefined, (sh) => {
      const w = windowOf(0, 0)
      const wb = w.top + w.height
      sh.fill(w.left - 20, wb - 54, w.left + w.width + 20, wb - 52, [30, 30, 30])
      sh.fill(w.left - 20, wb - 52, w.left + w.width + 20, wb + 12, PAPER) // 칸 높이(350)의 15% 를 넘는 종이색 그림
    })
    const [shot] = await cropRoughGridFrames(sheet, 'grid4', 1, FMT, 'repaint')
    const got = await sharp(shot.start).removeAlpha().raw().toBuffer()
    expect(got.equals(await plainCut(sheet, 0, 0))).toBe(true)
  }, 30_000)

  it('잘라 낸 칸의 크기는 지금과 같다', async () => {
    // 왜: 영상 모델에 시작 · 끝 그림을 늘 같은 크기로 넘기고, Storyboard 세 장 돌려 보기가 크기 바뀜 없이 돈다.
    const clean = await cropRoughGridFrames(await sheetWith(), 'grid4', 4, FMT, 'repaint')
    const banded = await cropRoughGridFrames(await sheetWith(shortStart(0)), 'grid4', 4, FMT, 'repaint')
    const want = await sizeOf(clean[0].start)
    for (const shot of [...clean, ...banded])
      for (const frame of [shot.start, shot.direction, shot.end]) expect(await sizeOf(frame)).toBe(want)
  }, 30_000)

  it('시작 칸에만 띠가 있어도 한 샷의 세 칸은 같은 자리에서 잘려 같은 배율이 된다', async () => {
    // 왜: 시작 칸만 키우면 영상 모델이 받는 시작 · 끝 그림의 배율이 달라져 멈춘 카메라가 밀리는 것처럼 보이고, 세 장 돌려 보기도 흔들린다(운영 sh_04_38 · sh_05_54).
    const sheet = await sheetWith(shortStart(0))
    const [shot] = await cropRoughGridFrames(sheet, 'grid4', 1, FMT, 'repaint')
    // 시작 · 끝 칸은 같은 무늬로 그렸다 — 같은 자리 · 같은 배율로 잘렸다면 결과가 같다.
    const start = await sharp(shot.start).removeAlpha().raw().toBuffer()
    const end = await sharp(shot.end).removeAlpha().raw().toBuffer()
    let diff = 0
    for (let i = 0; i < start.length; i++) diff += Math.abs(start[i] - end[i])
    expect(diff / start.length, '시작 · 끝 칸의 평균 픽셀 차이').toBeLessThan(1)
    // 끝 · 가운데 칸도 띠 몫만큼 같이 잘렸다 — 지금 자르기(그 칸 그대로)와는 달라야 한다.
    expect(end.equals(await plainCut(sheet, 0, 2))).toBe(false)
    expect((await sharp(shot.direction).removeAlpha().raw().toBuffer()).equals(await plainCut(sheet, 0, 1))).toBe(false)
  }, 30_000)

  it('가운데 칸에만 띠가 있으면 그 칸만 자르고 시작 · 끝 칸은 그대로다', async () => {
    // 왜: 영상에 넘어가는 것은 시작 · 끝 칸이다 — 둘이 멀쩡하면 손대지 않는다. 가운데(방향) 칸은 Storyboard 세 장 돌려 보기에만 쓰인다(운영 sh_06_67 · sh_06_75).
    const sheet = await sheetWith((s, f, b) => (s === 0 && f === 1 ? [b[0], b[1], b[2], b[3] - 30] : b))
    const [shot] = await cropRoughGridFrames(sheet, 'grid4', 1, FMT, 'repaint')
    expect(edgeArtifacts(await frameOf(shot.direction), 'bottom')).toEqual({ paper: 0, border: 0 })
    expect((await sharp(shot.start).removeAlpha().raw().toBuffer()).equals(await plainCut(sheet, 0, 0))).toBe(true)
    expect((await sharp(shot.end).removeAlpha().raw().toBuffer()).equals(await plainCut(sheet, 0, 2))).toBe(true)
  }, 30_000)

  it('띠가 없는 칸은 지금과 똑같이 잘린다', async () => {
    // 왜: 띠가 없는 샷(운영 88샷 중 63샷)은 한 픽셀도 바뀌면 안 된다 — 고치는 것은 띠가 섞인 샷뿐이다.
    const sheet = await sheetWith()
    const shots = await cropRoughGridFrames(sheet, 'grid4', 4, FMT, 'repaint')
    for (let s = 0; s < 4; s++) {
      const frames = [shots[s].start, shots[s].direction, shots[s].end]
      for (let f = 0; f < 3; f++) {
        const got = await sharp(frames[f]).removeAlpha().raw().toBuffer()
        expect(got.equals(await plainCut(sheet, s, f)), `샷 ${s} 칸 ${f}`).toBe(true)
      }
    }
  }, 30_000)
})
