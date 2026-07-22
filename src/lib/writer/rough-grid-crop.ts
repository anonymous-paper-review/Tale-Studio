// 러프 스토리보드 그리드 → 샷별 3프레임 크롭 (server-only, sharp) — #rough-grid 2026-07-22.
//
// gpt-image-2/edit 가 채운 그리드/스트립 이미지에서 셀을 잘라 (샷 × [start, direction, end]) 버퍼로.
// 패턴 선례: src/lib/artist/portrait.ts (턴어라운드 시트 비례 크롭).
//
// 에지 스냅(v2, 2026-07-22): 모델 출력은 템플릿과 종횡비·패널 위치가 미세하게 다르게 리샘플된다.
//   v1(격자선 "중심" 검출 스냅)은 어두운 콘텐츠(동굴 스케치·실사 사진)가 행/열 전체를 어둡게 만들어
//   가짜 선 밴드를 만들고 진짜 얇은 테두리선은 콘텐츠에 흡수돼, 밝은 그림에서만 유효했다(실측).
//   v2 는 "어두운 run 의 에지"를 스냅 후보로 쓴다 — 얇은 테두리선이든 콘텐츠 밴드든, run 의
//   시작/끝 에지는 곧 [밝은 거터·여백 ↔ 패널 내용] 전환점 = 실제 패널 경계다. 스케치·실사 공통으로
//   견고함을 3종(클린 그리드/어두운 그리드/실사 스트립) 실측으로 검증. 검출 실패 시 비례 좌표 폴백.
import sharp from 'sharp'
import { gridGeometry, type RoughGridVariant } from '@/lib/writer/rough-storyboard-grid'

export interface RoughGridFrames {
  start: Buffer
  direction: Buffer
  end: Buffer
}

// 에지 검출 파라미터 — 2026-07-22 3종 실측으로 튜닝.
const DARK_PIXEL_THRESHOLD = 200 // 이 값 미만 = 어두운 픽셀
const DARK_RUN_RATIO = 0.12 // 행/열의 12% 이상이 어두우면 "내용 있는 구간" (거터·여백은 ~0)
const RUN_GAP = 3 // 이 간격 이하로 이어진 구간은 같은 run
const SNAP_RANGE_FRAC = 0.03 // 기대 경계에서 ±3% 이내의 에지에만 스냅
const CELL_INSET = 2 // 스냅된 에지에서 셀 안쪽으로 인셋(테두리선 두께 배제)

/** 어두운 비율 프로파일에서 run 들의 시작/끝 에지 목록을 검출. */
function detectRunEdges(profile: Float32Array): { starts: number[]; ends: number[] } {
  const idx: number[] = []
  for (let i = 0; i < profile.length; i++) if (profile[i] > DARK_RUN_RATIO) idx.push(i)
  if (!idx.length) return { starts: [], ends: [] }
  const starts: number[] = []
  const ends: number[] = []
  let st = idx[0]
  let prev = idx[0]
  for (let k = 1; k < idx.length; k++) {
    const i = idx[k]
    if (i - prev > RUN_GAP) {
      starts.push(st)
      ends.push(prev)
      st = i
    }
    prev = i
  }
  starts.push(st)
  ends.push(prev)
  return { starts, ends }
}

/** 기대 px 경계를 에지 후보에 스냅(±range). 후보 없으면 기대값 유지(폴백). */
function snapEdge(expected: number, candidates: number[], range: number): number {
  let best = expected
  let bestDist = range + 1
  for (const c of candidates) {
    const d = Math.abs(c - expected)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
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

  // 어두운 픽셀 비율 프로파일 (열 방향 = 세로 경계, 행 방향 = 가로 경계)
  const colProfile = new Float32Array(width)
  const rowProfile = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    const rowBase = y * width
    for (let x = 0; x < width; x++) {
      if (data[rowBase + x] < DARK_PIXEL_THRESHOLD) {
        colProfile[x] += 1
        rowProfile[y] += 1
      }
    }
  }
  for (let x = 0; x < width; x++) colProfile[x] /= height
  for (let y = 0; y < height; y++) rowProfile[y] /= width
  const vEdges = detectRunEdges(colProfile)
  const hEdges = detectRunEdges(rowProfile)
  const vRange = Math.round(width * SNAP_RANGE_FRAC)
  const hRange = Math.round(height * SNAP_RANGE_FRAC)

  // 각 셀 경계: 기대(비례)값을 실측 에지에 스냅 — 'start' 경계는 run 시작 에지에,
  //   'end' 경계는 run 끝 에지에. 모든 프레임이 같은 실측 기준으로 잘려 순환 점프가 없다.
  const colPx = cols.map(([x0, x1]) => [
    snapEdge(Math.round(width * x0), vEdges.starts, vRange) + CELL_INSET,
    snapEdge(Math.round(width * x1), vEdges.ends, vRange) - CELL_INSET,
  ])
  const rowPx = rows.map(([y0, y1]) => [
    snapEdge(Math.round(height * y0), hEdges.starts, hRange) + CELL_INSET,
    snapEdge(Math.round(height * y1), hEdges.ends, hRange) - CELL_INSET,
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
