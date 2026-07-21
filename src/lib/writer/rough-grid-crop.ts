// 러프 스토리보드 그리드 → 샷별 3프레임 크롭 (server-only, sharp) — #rough-grid 2026-07-22.
//
// gpt-image-2/edit 가 채운 그리드/스트립 이미지에서 셀을 잘라 (샷 × [start, direction, end]) 버퍼로.
// 패턴 선례: src/lib/artist/portrait.ts (턴어라운드 시트 비례 크롭).
//
// 격자선 스냅(#rough-grid 정렬, 2026-07-22): 모델 출력은 템플릿과 종횡비가 미세하게 다르게
//   리샘플된다(실측: 1672×941→1664×928, 세로 -1.4%) — 고정 비례 좌표는 행마다 오차가 다르게
//   누적돼(2~5px) 3프레임 순환 시 내용이 위아래로 점프해 보였다. 출력의 실제 격자선(어두운 픽셀
//   프로파일)을 검출해 기대 경계를 가장 가까운 실측 선에 스냅한다. 검출 실패 시 비례 좌표 유지
//   (기존과 동일한 최악치 — 실패 모드 없음).
import sharp from 'sharp'
import { gridGeometry, type RoughGridVariant } from '@/lib/writer/rough-storyboard-grid'

export interface RoughGridFrames {
  start: Buffer
  direction: Buffer
  end: Buffer
}

// 격자선 검출 파라미터 — 진단 스크립트(2026-07-22 실측)와 동일 기준.
const LINE_DARK_THRESHOLD = 200 // 이 값 미만 = 어두운(선) 픽셀
const LINE_RATIO_THRESHOLD = 0.5 // 행/열의 50% 이상이 어두우면 격자선 후보
const LINE_GAP = 4 // 이 간격 이하로 이어진 후보는 같은 선
const SNAP_RANGE_FRAC = 0.03 // 기대 경계에서 ±3% 이내의 검출선에만 스냅
const CELL_INSET = 2 // 스냅된 선 중심에서 셀 안쪽으로 인셋(선 두께 배제)

/** 어두운 픽셀 비율 프로파일에서 선 중심 좌표들을 검출. */
function detectLines(profile: Float32Array): number[] {
  const idx: number[] = []
  for (let i = 0; i < profile.length; i++) if (profile[i] > LINE_RATIO_THRESHOLD) idx.push(i)
  if (!idx.length) return []
  const centers: number[] = []
  let start = idx[0]
  let prev = idx[0]
  for (let k = 1; k < idx.length; k++) {
    const i = idx[k]
    if (i - prev > LINE_GAP) {
      centers.push(Math.round((start + prev) / 2))
      start = i
    }
    prev = i
  }
  centers.push(Math.round((start + prev) / 2))
  return centers
}

/** 기대 px 경계를 검출선에 스냅(±range). `side` 방향으로 인셋해 셀 내부 좌표를 반환. */
function snap(expected: number, lines: number[], range: number, side: 'start' | 'end'): number {
  let best = -1
  let bestDist = range + 1
  for (const l of lines) {
    const d = Math.abs(l - expected)
    if (d < bestDist) {
      bestDist = d
      best = l
    }
  }
  if (best < 0) return expected // 검출 실패 → 비례 좌표 유지
  return side === 'start' ? best + CELL_INSET : best - CELL_INSET
}

/**
 * 그리드 버퍼에서 shotCount 개 열의 3프레임을 크롭.
 *   반환 배열 길이 = shotCount (열 순서 = 제출 시 writerShotIds 순서).
 *   shotCount 가 variant 열 수를 넘으면 throw (호출부 버그).
 */
export async function cropRoughGridFrames(
  grid: Buffer,
  variant: RoughGridVariant,
  shotCount: number,
): Promise<RoughGridFrames[]> {
  const { cols, rows } = gridGeometry(variant)
  if (shotCount < 1 || shotCount > cols.length) {
    throw new Error(`rough grid crop: shotCount ${shotCount} out of range for ${variant}`)
  }
  const { data, info } = await sharp(grid).greyscale().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  if (!width || !height) throw new Error('rough grid crop: metadata missing')

  // 어두운 픽셀 비율 프로파일 (열 방향 = 세로 격자선, 행 방향 = 가로 격자선)
  const colProfile = new Float32Array(width)
  const rowProfile = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    const rowBase = y * width
    for (let x = 0; x < width; x++) {
      if (data[rowBase + x] < LINE_DARK_THRESHOLD) {
        colProfile[x] += 1
        rowProfile[y] += 1
      }
    }
  }
  for (let x = 0; x < width; x++) colProfile[x] /= height
  for (let y = 0; y < height; y++) rowProfile[y] /= width
  const vLines = detectLines(colProfile)
  const hLines = detectLines(rowProfile)
  const vRange = Math.round(width * SNAP_RANGE_FRAC)
  const hRange = Math.round(height * SNAP_RANGE_FRAC)

  // 각 셀 경계: 비례 기대값 → 실측 선 스냅. 모든 행이 "같은 실측 선" 기준으로 잘려
  //   프레임 간 셀-내 위치가 균일해진다(순환 점프 제거).
  const colPx = cols.map(([x0, x1]) => [
    snap(Math.round(width * x0), vLines, vRange, 'start'),
    snap(Math.round(width * x1), vLines, vRange, 'end'),
  ])
  const rowPx = rows.map(([y0, y1]) => [
    snap(Math.round(height * y0), hLines, hRange, 'start'),
    snap(Math.round(height * y1), hLines, hRange, 'end'),
  ])

  const out: RoughGridFrames[] = []
  for (let c = 0; c < shotCount; c++) {
    const [left, right] = colPx[c]
    const frames: Buffer[] = []
    for (let r = 0; r < rowPx.length; r++) {
      const [top, bottom] = rowPx[r]
      const w = Math.max(1, right - left)
      const h = Math.max(1, bottom - top)
      // sharp 인스턴스는 extract 후 재사용 불가 → 셀마다 새로 연다(버퍼 소스라 비용 미미).
      frames.push(await sharp(grid).extract({ left, top, width: w, height: h }).png().toBuffer())
    }
    out.push({ start: frames[0], direction: frames[1], end: frames[2] })
  }
  return out
}
