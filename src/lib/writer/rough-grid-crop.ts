// 러프 스토리보드 그리드 → 샷별 3프레임 크롭 (server-only, sharp) — #rough-grid 2026-07-22.
//
// gpt-image-2/edit 가 채운 그리드/스트립 이미지에서 셀을 잘라 (샷 × [start, direction, end]) 버퍼로.
// 패턴 선례: src/lib/artist/portrait.ts (턴어라운드 시트 비례 크롭).
//
// ── 거터 스캔(v4) — 크롭 정렬의 최종 접근 (2026-07-22, 실측 회귀 3회의 교훈) ──
// 모델 출력은 템플릿과 종횡비·패널 위치가 미세하게 다르게 리샘플된다. 앞선 접근들의 실패:
//   v1 격자선 "중심" 검출: 어두운 콘텐츠가 행/열 전체를 어둡게 해 가짜 선 밴드 생성.
//   v2 run "에지" 스냅: 테두리선 에지와 콘텐츠 에지가 섞여 nearest 가 비대칭 크롭 생성.
//   v3 문맥 자격 스냅: "선 뒤=거터" 판정이 밝은 콘텐츠(하늘)와 거터를 구분 못해 이웃 선 오빙.
// v4 는 불변식에서 출발한다: **거터(패널 사이 띠)는 빈 종이다** — 콘텐츠는 셀 안에만 있다.
//   각 경계쌍 사이의 기대 거터 중심 주변(±3%)에서 가장 밝은 지점(골짜기)을 찾고, 양방향으로
//   어두워지는 첫 지점까지 스캔 → 그 지점이 곧 양쪽 셀의 실측 경계. 스케치·실사·밝은 콘텐츠
//   모두에서 성립. 골짜기가 안 밝으면(거터 소실) 그 경계는 비례 기대값 폴백.
//   잔여 리스크(그리드 양끝 열이 시트 외곽 마진·프레임 선까지 물어 과대 크롭)는 크기 클러스터
//   교정으로 잡는다: 크기를 ±6px 로 클러스터링 → (최다, 동수면 작은 쪽) 클러스터를 기준으로
//   **과대 크기만** 기대값에서 먼 경계를 축소. (과소는 모델이 실제로 작게 그린 패널일 수 있어 유지.)
//   4종 실측(클린/어두운/shot_1 그리드 + 실사 스트립)으로 행·열 전부 검증.
import sharp from 'sharp'
import { gridGeometry, type RoughGridVariant } from '@/lib/writer/rough-storyboard-grid'

export interface RoughGridFrames {
  start: Buffer
  direction: Buffer
  end: Buffer
}

const DARK_PIXEL_THRESHOLD = 200 // 이 값 미만 = 어두운 픽셀
const GUTTER_RATIO = 0.12 // 어두운 비율이 이 이하면 "빈 종이(거터)"로 본다
const GUTTER_MISSING_RATIO = 0.3 // 골짜기 최솟값이 이보다 어두우면 거터 소실 → 폴백
const SCAN_RANGE_FRAC = 0.03 // 기대 거터 중심에서 ±3% 탐색
const OUTER_MARGIN_FRAC = 0.02 // 양끝(시트 마진) 거터 중심 = 셀 경계 바깥 2% 지점
const CELL_INSET = 2 // 실측 경계에서 셀 안쪽 인셋(테두리선 두께 배제)
const SIZE_TOLERANCE_PX = 6 // 크기 클러스터 허용 오차

/** 크기 목록에서 기준 크기: ±tol 클러스터링 → (최다 멤버, 동수면 작은 쪽) 클러스터의 중앙값. */
function referenceSize(sizes: number[]): number {
  const clusters: number[][] = []
  for (const s of [...sizes].sort((a, b) => a - b)) {
    const hit = clusters.find((c) => Math.abs(s - c[0]) <= SIZE_TOLERANCE_PX)
    if (hit) hit.push(s)
    else clusters.push([s])
  }
  clusters.sort((a, b) => b.length - a.length || a[0] - b[0])
  const top = clusters[0]
  return top[Math.floor(top.length / 2)]
}

/**
 * 한 축의 셀 경계들을 거터 스캔으로 산출.
 *   cellsFrac = 템플릿 비례 셀 경계쌍, total = 이미지의 그 축 크기.
 *   반환 = 셀별 [inset 적용된 start, end].
 */
function scanAxisBounds(
  profile: Float32Array,
  cellsFrac: ReadonlyArray<readonly [number, number]>,
  total: number,
): Array<[number, number]> {
  const n = cellsFrac.length
  const range = Math.round(total * SCAN_RANGE_FRAC)
  const expected = cellsFrac.map(
    ([f0, f1]) => [Math.round(f0 * total), Math.round(f1 * total)] as [number, number],
  )
  const starts = expected.map(([s]) => s)
  const ends = expected.map(([, e]) => e)

  // 거터 골짜기 스캔: 중심 주변 최밝점 → 양방향으로 어두워지는 첫 지점 = 양쪽 셀 경계.
  const scan = (gutterCenter: number): { left: number; right: number } | null => {
    const lo = Math.max(0, gutterCenter - range)
    const hi = Math.min(total - 1, gutterCenter + range)
    let g = lo
    for (let i = lo + 1; i <= hi; i++) if (profile[i] < profile[g]) g = i
    if (profile[g] > GUTTER_MISSING_RATIO) return null // 거터 소실(콘텐츠로 덮임) → 폴백
    let L = g
    while (L > 0 && profile[L - 1] <= GUTTER_RATIO) L--
    let R = g
    while (R < total - 1 && profile[R + 1] <= GUTTER_RATIO) R++
    return { left: L - 1, right: R + 1 }
  }

  for (let i = 0; i <= n; i++) {
    const gutterCenter =
      i === 0
        ? Math.max(0, expected[0][0] - Math.round(total * OUTER_MARGIN_FRAC))
        : i === n
          ? Math.min(total - 1, expected[n - 1][1] + Math.round(total * OUTER_MARGIN_FRAC))
          : Math.floor((expected[i - 1][1] + expected[i][0]) / 2)
    const hit = scan(gutterCenter)
    if (!hit) continue
    if (i > 0) ends[i - 1] = hit.left
    if (i < n) starts[i] = hit.right
  }

  const bounds = expected.map(
    (_, i) => [starts[i] + CELL_INSET, ends[i] - CELL_INSET] as [number, number],
  )
  if (bounds.length < 2) return bounds

  // 과대 크기 교정: 양끝 스캔이 시트 마진·외곽 프레임까지 물었을 때(실측: 열 372→409).
  const ref = referenceSize(bounds.map(([a, b]) => b - a))
  return bounds.map(([a, b], i) => {
    if (b - a - ref <= SIZE_TOLERANCE_PX) return [a, b] as [number, number]
    const [e0, e1] = expected[i]
    // 기대에서 더 먼 경계가 마진을 문 쪽 — 가까운 경계 기준으로 기준 크기 복원.
    return (Math.abs(a - e0) > Math.abs(b - e1) ? [b - ref, b] : [a, a + ref]) as [number, number]
  })
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

  const colPx = scanAxisBounds(colProfile, cols, width)
  const rowPx = scanAxisBounds(rowProfile, rows, height)

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
