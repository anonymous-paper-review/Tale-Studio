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
//
// ── v5 (2026-07-22, 실사 스트립 e2e 실측): 전역 거터 검출 1차 + v4 앵커 스캔 폴백 ──
// gpt-image-2 가 채운 패널을 리페인트할 때(실사 스트립) 템플릿의 외곽 마진을 버리고 패널을
//   균등 재배치한 출력이 관측됨(패널 위치가 기대에서 최대 ~10% 이동 — ±3% 앵커 밖 → 비례
//   폴백이 이웃 패널 조각을 물었다). 위치는 변해도 **"밝은 런(거터/마진)이 셀을 나눈다 + 셀
//   크기는 균일"** 불변식은 유지되므로, 축 전체에서 밝은 런을 찾아 셀 구간을 직접 유도한다.
//   채택 조건(둘 다): 유도된 셀 개수 == 기대 개수, 셀 크기 균일(±max(6px, 2%)).
//   불통과(밝은 콘텐츠 밴드로 인한 가짜 분할, 거터 소실 병합 등) 시 v4 앵커 스캔으로 폴백.
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
 * 전역 거터 검출(v5) — 축 전체에서 밝은 런(거터·마진)을 찾아 셀 구간을 직접 유도.
 *   템플릿 비례에 무관: 모델이 시트를 재배치해도 "밝은 띠가 셀을 나눈다"는 불변식만 쓴다.
 *   검증(셀 개수 일치 + 크기 균일) 불통과면 null → 호출부가 v4 앵커 스캔으로 폴백.
 */
function globalAxisBounds(
  profile: Float32Array,
  cellCount: number,
  total: number,
): Array<[number, number]> | null {
  const MIN_RUN = 3 // 거터 최소 두께(px) — 노이즈 행/열 배제
  const runs: Array<[number, number]> = []
  let runStart = -1
  for (let i = 0; i <= total; i++) {
    const bright = i < total && profile[i] <= GUTTER_RATIO
    if (bright && runStart < 0) runStart = i
    else if (!bright && runStart >= 0) {
      if (i - runStart >= MIN_RUN) runs.push([runStart, i - 1])
      runStart = -1
    }
  }

  // 셀 후보 = 밝은 런 사이(및 축 양끝)의 어두운 구간. 축 크기 10% 미만은 슬리버(노이즈)로 배제.
  const intervals: Array<[number, number]> = []
  let prevEnd = -1
  for (const [rs, re] of runs) {
    if (rs - 1 > prevEnd) intervals.push([prevEnd + 1, rs - 1])
    prevEnd = re
  }
  if (total - 1 > prevEnd) intervals.push([prevEnd + 1, total - 1])
  const cells = intervals.filter(([a, b]) => b - a + 1 >= total * 0.1)

  if (cells.length !== cellCount) return null
  const sizes = cells.map(([a, b]) => b - a + 1)
  const spread = Math.max(...sizes) - Math.min(...sizes)
  if (spread > Math.max(SIZE_TOLERANCE_PX, total * 0.02)) return null
  // 커버리지 검증 — 전 패널이 같은 위치에 밝은 콘텐츠 밴드(하늘 등)를 가지면 개수·균일을 통과한
  //   "패널 하부만" 오검출이 남는다(실측 prodgrid_2: 4샷 모두 상단 하늘 → 행 커버리지 0.49).
  //   정상 레이아웃의 셀 합은 축의 0.77 이상(템플릿 행) — 0.65 미만이면 기각 → v4 앵커 폴백.
  if (sizes.reduce((a, b) => a + b, 0) < total * 0.65) return null
  return cells.map(([a, b]) => [a + CELL_INSET, b - CELL_INSET] as [number, number])
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
 * 행 높이 균일화(2026-07-22, 실측 e18940f4) — 한 샷의 START/DIRECTING/END 는 각 "행"에서
 *   나오므로 행 높이가 다르면 순환 재생 시 스케일 점프가 보인다(모델이 중간 행을 16px 크게
 *   그린 실측). 클러스터 기준 크기보다 큰 행만 top-anchor 로 축소 — 패널 콘텐츠는 상단부터
 *   그려지므로 초과분은 하단 여백/변형이다. 작은 행의 확장은 거터·이웃 침범 위험이라 유지.
 *   열은 대상 아님: 한 샷 = 한 열이라 열 폭 차이는 순환 점프를 만들지 않는다(참 셀 유지가 정확).
 */
function uniformizeRows(rowsPx: Array<[number, number]>): Array<[number, number]> {
  if (rowsPx.length < 2) return rowsPx
  const ref = referenceSize(rowsPx.map(([a, b]) => b - a))
  return rowsPx.map(([a, b]) =>
    b - a - ref > SIZE_TOLERANCE_PX ? ([a, a + ref] as [number, number]) : ([a, b] as [number, number]),
  )
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

  // v5: 전역 거터 검출 우선(재배치된 출력도 정합) → 검증 불통과 시 v4 앵커 스캔.
  const colPx = globalAxisBounds(colProfile, cols.length, width) ?? scanAxisBounds(colProfile, cols, width)
  const rowPx = uniformizeRows(
    globalAxisBounds(rowProfile, rows.length, height) ?? scanAxisBounds(rowProfile, rows, height),
  )

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
