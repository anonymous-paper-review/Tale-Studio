// 턴어라운드 시트 → 대표 포트레이트 크롭 (server-only, sharp).
//
// 사람 캐릭터의 view_main 은 캐릭터 템플릿(public/character-template.png) 레이아웃을 채운
// 와이드 모델시트다. 좌상단 CHARACTER CONCEPT 박스 내부를 크롭해 카드/칩용 대표 포트레이트로 쓴다.
// 시트가 템플릿 레이아웃을 유지하므로(I2I 프롬프트가 박스 고정 지시) 상대 좌표는 안정적이다.
//
// ⚠️ 템플릿을 교체하면 이 비율도 재실측할 것 — 좌표는 템플릿 v2(스타일 중립 마네킹판,
//   2026-07-12) 원본 3840×2160 실측: 박스 테두리 x 41..1199 / y 41..896, 제목 텍스트 y 74..102
//   → 내부(제목 아래) x 52..1188, y 132..886.
import sharp from 'sharp'

/** CHARACTER CONCEPT 박스 내부의 상대 좌표 (시트 W/H 에 대한 비율). */
export const TURNAROUND_PORTRAIT_REGION = {
  x0: 0.0135,
  y0: 0.0611,
  x1: 0.3094,
  y1: 0.4102,
} as const

// ── #portrait-paper-trim(2026-08-26, 오너 실측 "카드에서 얼굴 자를 때 흰 바") ──
// 시트 생성 모델이 CONCEPT 박스 안 그림을 박스보다 살짝 좁게 그리면, 고정 비율 크롭이
// [박스 보더 라인 + 박스 밖 종이]를 물고 들어온다. 실측(322×212 포트레이트 우측 11px):
//   종이 열 = 밝기 240~244 가 **균일**(f240=1.000) / 아트워크 열 = 인물·텍스처가 섞여
//   f240≤0.42 / 그 사이에 어두운 보더 라인(평균 175~194) 2~3px.
// 판정: ① 가장자리에서 "≥240 이 98% 이상인 균일 열/행" 런을 걷고 ② 종이를 걷었다면 바로
//   뒤따르는 어두운 보더 라인(평균 ≤215, ≤4px)까지 흡수한다. 변당 10% 안전 상한.
//   완전 평탄한 밝은 아트워크 가장자리 열은 이론상 오걷힘이 가능하나 시각 손실이 없다.
const PAPER_WHITE_MIN = 240 // 이 밝기(0~255) 이상이면 종이 후보
const PAPER_FLAT_FRAC = 0.98 // 열/행의 이 비율 이상이 종이면 "빈 띠"
const PAPER_MAX_TRIM_FRAC = 0.1 // 변당 최대 절삭 비율
const BORDER_DARK_MAX_MEAN = 215 // 종이 뒤에 오는 보더 라인 판정(평균 밝기 상한)
const BORDER_MAX_PX = 4 // 보더 라인 흡수 상한

/** 가장자리의 종이 띠(+박스 보더 라인)만 걷어낸 PNG 버퍼 (띠가 없으면 원본 그대로). */
export async function trimFlatPaperEdges(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  if (!w || !h) return buf
  const colStats = (x: number): { paperFrac: number; mean: number } => {
    let white = 0
    let sum = 0
    for (let y = 0; y < h; y++) {
      const v = data[y * w + x]
      sum += v
      if (v >= PAPER_WHITE_MIN) white++
    }
    return { paperFrac: white / h, mean: sum / h }
  }
  const rowStats = (y: number): { paperFrac: number; mean: number } => {
    let white = 0
    let sum = 0
    const base = y * w
    for (let x = 0; x < w; x++) {
      const v = data[base + x]
      sum += v
      if (v >= PAPER_WHITE_MIN) white++
    }
    return { paperFrac: white / w, mean: sum / w }
  }
  /** 한 변의 절삭 폭: 종이 런 → (종이가 있었으면) 보더 라인 런 순으로 소비. */
  const trimSide = (
    limit: number,
    statAt: (i: number) => { paperFrac: number; mean: number },
  ): number => {
    let n = 0
    while (n < limit && statAt(n).paperFrac >= PAPER_FLAT_FRAC) n++
    if (n > 0) {
      let border = 0
      while (n < limit && border < BORDER_MAX_PX && statAt(n).mean <= BORDER_DARK_MAX_MEAN) {
        n++
        border++
      }
    }
    return n
  }
  const maxX = Math.floor(w * PAPER_MAX_TRIM_FRAC)
  const maxY = Math.floor(h * PAPER_MAX_TRIM_FRAC)
  const left = trimSide(maxX, (i) => colStats(i))
  const right = trimSide(maxX, (i) => colStats(w - 1 - i))
  const top = trimSide(maxY, (i) => rowStats(i))
  const bottom = trimSide(maxY, (i) => rowStats(h - 1 - i))
  if (!left && !right && !top && !bottom) return buf
  return sharp(buf)
    .extract({ left, top, width: w - left - right, height: h - top - bottom })
    .png()
    .toBuffer()
}

/**
 * 시트 버퍼에서 컨셉 포트레이트를 크롭해 PNG 버퍼로.
 *   가드: 시트가 아니면(landscape 가 아니면 — 옛 1:1 정면 포트레이트 등) null 을 반환해
 *   호출자가 원본을 그대로 대표 이미지로 쓰게 한다(엉뚱한 부분 크롭 방지).
 */
export async function cropTurnaroundPortrait(sheet: Buffer): Promise<Buffer | null> {
  const img = sharp(sheet)
  const { width, height } = await img.metadata()
  if (!width || !height) throw new Error('portrait crop: sheet metadata missing')
  if (width / height < 1.4) return null // 시트(≈16:9)가 아님 → 크롭 skip

  const r = TURNAROUND_PORTRAIT_REGION
  const left = Math.round(width * r.x0)
  const top = Math.round(height * r.y0)
  const cropped = await img
    .extract({
      left,
      top,
      width: Math.round(width * (r.x1 - r.x0)),
      height: Math.round(height * (r.y1 - r.y0)),
    })
    .png()
    .toBuffer()
  return trimFlatPaperEdges(cropped) // #portrait-paper-trim
}
