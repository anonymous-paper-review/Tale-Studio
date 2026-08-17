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
import { sheetGeometry, sheetSpecOf, type RoughGridVariant } from '@/lib/writer/rough-storyboard-grid'
import type { ProjectFormat } from '@/types/project'

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
// #label-invasion(2026-08-17, 실측 a219b9f3 시트 3장): DIRECTION 라벨 텍스트가 거터 주변을
//   밝은 조각으로 파편화해 밸리 선택이 텍스트 줄 사이 틈에 앉았다. 실측 분포 — 진짜 거터
//   17~53px, 보더로 쪼개진 반쪽 14px, 라벨 줄 틈 4~13px. 임계 15: 틈 전부 기각, 진짜 거터
//   통과(반쪽 14px 가 기각돼도 같은 거터의 온전한 쪽이 창 안에 남아 회복된다 — 시트2 실측).
const MIN_GUTTER_RUN_PX = 15

/** #label-invasion v3(실측 a219b9f3 sh_03): 트림으로 잘려나갈 구간이 "빈 종이"인지 판별.
 *  어두운 행/열이 10% 미만이면 여백·얇은 보더 라인(1~2px 어두움)으로 보고 트림 허용,
 *  라벨 텍스트 밴드처럼 내용이 있으면 트림하지 않는다 — 종전 "초과분=하단 여백" 가정이
 *  DIRECTION 라벨 밴드를 잘라 "KEY:" 첫 줄만 남긴 사고의 수리. */
function bandIsBlank(profile: Float32Array, from: number, to: number): boolean {
  if (to < from) return true
  let dark = 0
  for (let i = Math.max(0, from); i <= Math.min(profile.length - 1, to); i++) {
    if (profile[i] > GUTTER_RATIO) dark++
  }
  return dark / (to - from + 1) < 0.1
}

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
  // #label-invasion: 셀 분할 자격은 진짜 거터 두께(MIN_GUTTER_RUN_PX)부터 — 라벨 텍스트 줄
  //   사이의 얇은 틈(4~11px 실측)이 분할선으로 오인되면 셀이 조각나 균일성 검증이 죽고,
  //   반대로 자격을 높이면 보더로 반쪽 난 진짜 거터(≥14px)는 여전히 통과한다.
  const runs: Array<[number, number]> = []
  let runStart = -1
  for (let i = 0; i <= total; i++) {
    const bright = i < total && profile[i] <= GUTTER_RATIO
    if (bright && runStart < 0) runStart = i
    else if (!bright && runStart >= 0) {
      if (i - runStart >= MIN_GUTTER_RUN_PX) runs.push([runStart, i - 1])
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

  // 거터 골짜기 스캔(#label-invasion v2): 최밝점 하나가 아니라 **창 안의 자격 런들** 중
  //   중심 최근접을 고른다 — 최밝점이 라벨 줄 틈(얇은 런)에 앉아도 옆의 진짜 거터로 회복된다.
  //   자격 = 밝은 런 두께 ≥ MIN_GUTTER_RUN_PX (양끝 시트 마진은 축 경계에 잘릴 수 있어 예외).
  const scan = (gutterCenter: number, isOuter: boolean): { left: number; right: number } | null => {
    const lo = Math.max(0, gutterCenter - range)
    const hi = Math.min(total - 1, gutterCenter + range)
    let g = lo
    for (let i = lo + 1; i <= hi; i++) if (profile[i] < profile[g]) g = i
    if (profile[g] > GUTTER_MISSING_RATIO) return null // 거터 소실(콘텐츠로 덮임) → 폴백
    const runAt = (idx: number): { left: number; right: number } => {
      let L = idx
      while (L > 0 && profile[L - 1] <= GUTTER_RATIO) L--
      let R = idx
      while (R < total - 1 && profile[R + 1] <= GUTTER_RATIO) R++
      return { left: L, right: R }
    }
    const candidates: Array<{ left: number; right: number }> = []
    for (let i = lo; i <= hi; i++) {
      if (profile[i] > GUTTER_RATIO) continue
      const run = runAt(i)
      candidates.push(run)
      i = run.right // 같은 런 재방문 방지
    }
    const qualified = candidates.filter((r) => isOuter || r.right - r.left + 1 >= MIN_GUTTER_RUN_PX)
    if (!qualified.length) return null
    const best = qualified.reduce((a, b) => {
      const da = Math.abs((a.left + a.right) / 2 - gutterCenter)
      const db = Math.abs((b.left + b.right) / 2 - gutterCenter)
      return db < da ? b : a
    })
    return { left: best.left - 1, right: best.right + 1 }
  }

  for (let i = 0; i <= n; i++) {
    const isOuter = i === 0 || i === n
    const gutterCenter =
      i === 0
        ? Math.max(0, expected[0][0] - Math.round(total * OUTER_MARGIN_FRAC))
        : i === n
          ? Math.min(total - 1, expected[n - 1][1] + Math.round(total * OUTER_MARGIN_FRAC))
          : Math.floor((expected[i - 1][1] + expected[i][0]) / 2)
    const hit = scan(gutterCenter, isOuter)
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
    const keepStart = !(Math.abs(a - e0) > Math.abs(b - e1))
    const trimmed = (keepStart ? [a, a + ref] : [b - ref, b]) as [number, number]
    // #label-invasion v3: 잘려나갈 밴드에 내용(라벨 텍스트)이 있으면 트림 포기 — 정보 보존 우선.
    const blank = keepStart
      ? bandIsBlank(profile, trimmed[1] + 1, b)
      : bandIsBlank(profile, a, trimmed[0] - 1)
    return blank ? trimmed : ([a, b] as [number, number])
  })
}

/**
 * 행 높이 균일화(2026-07-22, 실측 e18940f4) — 한 샷의 START/DIRECTING/END 는 각 "행"에서
 *   나오므로 행 높이가 다르면 순환 재생 시 스케일 점프가 보인다(모델이 중간 행을 16px 크게
 *   그린 실측). 클러스터 기준 크기보다 큰 행만 top-anchor 로 축소 — 패널 콘텐츠는 상단부터
 *   그려지므로 초과분은 하단 여백/변형이다. 작은 행의 확장은 거터·이웃 침범 위험이라 유지.
 *   #sheet-formats: 균일화 대상은 **프레임 축** — 레거시(frameAxis rows)는 행, 가로 스트립
 *   (frameAxis cols)은 열. 샷 축은 참 셀 유지가 정확해 균일화하지 않는다.
 */
function uniformizeRows(
  rowsPx: Array<[number, number]>,
  profile: Float32Array,
): Array<[number, number]> {
  if (rowsPx.length < 2) return rowsPx
  const ref = referenceSize(rowsPx.map(([a, b]) => b - a))
  return rowsPx.map(([a, b]) => {
    if (b - a - ref <= SIZE_TOLERANCE_PX) return [a, b] as [number, number]
    // #label-invasion v3: 초과분이 빈 종이일 때만 top-anchor 트림 — DIRECTION 라벨 밴드처럼
    //   내용이 있으면 프레임 높이 차이(순환 스케일 점프)를 감수하고 보존한다(오너 우선순위).
    return bandIsBlank(profile, a + ref + 1, b)
      ? ([a, a + ref] as [number, number])
      : ([a, b] as [number, number])
  })
}

/**
 * 그리드 버퍼에서 shotCount 개 샷의 3프레임을 크롭.
 *   반환 배열 길이 = shotCount (샷 순서 = 제출 시 writerShotIds 순서).
 *   shotCount 가 시트의 샷 축 길이를 넘으면 throw (호출부 버그).
 *   format(#sheet-formats): 포맷 전용 시트의 좌표·프레임 축 — 세로 스트립은 frameAxis 'cols'
 *   (가로 3열: 샷 축이 행, 프레임 축이 열). 미지정/null = 레거시 horizontal 좌표.
 */
export async function cropRoughGridFrames(
  grid: Buffer,
  variant: RoughGridVariant,
  shotCount: number,
  format: ProjectFormat | null = null,
): Promise<RoughGridFrames[]> {
  const { cols, rows, frameAxis } = sheetGeometry(variant, format)
  const framesAlongRows = frameAxis === 'rows'
  const shotAxisLen = framesAlongRows ? cols.length : rows.length
  if (shotCount < 1 || shotCount > shotAxisLen) {
    throw new Error(`rough grid crop: shotCount ${shotCount} out of range for ${variant}`)
  }

  // ── #fixed-crop(2026-08-17, 오너 방향으로 2차 수정): 포맷 스펙 시트의 하이브리드 크롭 ──
  // 실측 결론(a219b9f3 시트 6장): ① fal 은 요청 캔버스를 픽셀 정확히 반환하고 열(가로) 위치
  // 드리프트는 수 px → **열 = 스펙 고정** ② 모델이 DIRECTION 캡션을 괘선 표로 부풀리며 행을
  // 최대 ~100px 민다 → **행 위치 = 적응 검출**(스펙 앵커 ± 창, 두께 자격 밝은 런 — 순수 고정
  // 불가라는 오너 판단이 맞았다) ③ 프레임 크기는 UI 순환·영상 레퍼런스의 전제 → **높이·너비
  // = 스펙 표준으로 상시 균일**(검출된 행 시작 + 표준 높이) ④ DIRECTION 만 하단 오버플로
  // (캡션 표)를 적응 포함 후 비율 유지 축소 + 종이색 패딩으로 정규화 — 라벨 무손실.
  // 레거시(포맷 미상 null) 시트는 종전 적응형(v4/v5) 경로 그대로.
  if (sheetSpecOf(variant, format)) {
    const meta = await sharp(grid).metadata()
    const W = meta.width ?? 0
    const H = meta.height ?? 0
    if (!W || !H) throw new Error('rough grid crop: metadata missing')

    // 행 위치 적응 — 창 스캔이 아니라 **순차 체인**: 캡션 표가 행을 최대 ~110px 밀면 고정 창은
    //   반드시 놓친다. 행 N+1 시작 = 행 N 끝(+DIRECTION 이면 오버플로 통과) 이후 첫 어두운 전환.
    const { data: gdata, info: ginfo } = await sharp(grid)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rowProfile = new Float32Array(ginfo.height)
    for (let y = 0; y < ginfo.height; y++) {
      let dark = 0
      const base = y * ginfo.width
      for (let x = 0; x < ginfo.width; x++) if (gdata[base + x] < DARK_PIXEL_THRESHOLD) dark++
      rowProfile[y] = dark / ginfo.width
    }
    /** fromY 아래에서 다음 행 시작 찾기 — 판별 신호는 **잉크 밀도**다(실측 이중 모드:
     *  캡션 텍스트 줄 0.08~0.20 / 행 그림 0.67~0.90, 중간이 빈다). 두께 기준은 실패했다 —
     *  틈 두께(5~18px)는 진짜 거터와 겹치고, 붙은 캡션 2줄(17px 연속)은 그림으로 오인된다.
     *  래치 = 진한 행(≥ROW_INK)이 ROW_INK_RUN 행 이상 연속(굵은 표 하단 괘선 1~3행 배제),
     *  이후 블록의 진짜 시작(옅은 상단·보더, >0.08 연속)까지 거슬러 올라간다. */
    const ROW_INK = 0.35
    const ROW_INK_RUN = 6
    const scanNextRowTop = (fromY: number, fallbackGap: number): number => {
      const hardLimit = Math.min(ginfo.height - 1, fromY + 220)
      let y = Math.max(0, fromY)
      while (y <= hardLimit && rowProfile[y] > 0.08) y++ // 이전 행 잔여 어두움 통과
      for (; y <= hardLimit; y++) {
        if (rowProfile[y] < ROW_INK) continue
        let b = y
        while (b < ginfo.height && rowProfile[b] >= ROW_INK) b++
        if (b - y >= ROW_INK_RUN) {
          let t = y
          while (t > fromY && rowProfile[t - 1] > 0.08) t--
          return t
        }
        y = b
      }
      return Math.min(ginfo.height - 1, fromY + fallbackGap)
    }
    // 셀 크기는 축마다 한 번만 계산 — 셀별 경계 반올림 ±1px 가 프레임 크기를 흔들지 않게
    //   (스펙상 모든 셀의 비례 폭·높이는 동일하다). 균일성이 이 모드의 존재 이유다.
    // X_BLEED(#fixed-crop square 실측): 모델이 라벨을 셀 좌측 보더에 바짝 써서 3px 인테리어
    //   인셋이 첫 글자 획을 자른다("KEY"→"EY") — 좌우만 보더 포함으로 되돌린다(세로 보더 라인이
    //   프레임 가장자리에 보이는 트레이드, previz 라 무해). 상하는 오버플로·행 체인이 담당.
    const X_BLEED = 3
    const frameW = Math.max(1, Math.round((cols[0][1] - cols[0][0]) * W) + X_BLEED * 2)
    const frameH = Math.max(1, Math.round((rows[0][1] - rows[0][0]) * H))

    // 행 시작 체인: 행1 = 스펙(상단 마진 안정 실측), 행 N+1 = scanNextRowTop 이 캡션의 얇은
    //   블록들을 스스로 건너뛰고 다음 행의 두꺼운 그림 블록에 래치한다. 높이는 표준 고정.
    const GUTTER_GAP = 20
    const rowTops: number[] = [Math.round(rows[0][0] * H)]
    for (let r = 1; r < rows.length; r++) {
      const prevBottom = rowTops[r - 1] + frameH
      rowTops.push(
        Math.min(H - frameH, Math.max(prevBottom, scanNextRowTop(prevBottom + 2, GUTTER_GAP))),
      )
    }

    // ── DIRECTION 하단 오버플로 — 상한 = 다음 행 시작(행 스캔과 한 진실이라 어긋날 수 없다) ──
    // 상한 안에서 열별 마지막 내용 행까지 포함(캡션 표 전체). 표 내부 틈 두께는 더는 판정에
    //   안 쓴다 — 실측상 진짜 거터와 겹쳐 신뢰 불가.
    const PAPER = { r: 250, g: 248, b: 242 }
    const overflowBelow = (left: number, bottom: number, capTo: number): number => {
      const cap = Math.max(0, Math.min(capTo, H - 16) - bottom)
      if (cap <= 4) return 0
      const xEnd = Math.min(left + frameW, ginfo.width)
      let last = -1
      for (let y = bottom; y < bottom + cap; y++) {
        let dark = 0
        const base = y * ginfo.width
        for (let x = left; x < xEnd; x++) if (gdata[base + x] < DARK_PIXEL_THRESHOLD) dark++
        if (dark / (xEnd - left) > 0.04) last = y - bottom
      }
      return last < 0 ? 0 : Math.min(cap, last + 3)
    }

    const out: RoughGridFrames[] = []
    for (let s = 0; s < shotCount; s++) {
      const frames: Buffer[] = []
      for (let f = 0; f < 3; f++) {
        const cx = framesAlongRows ? cols[s] : cols[f]
        const left = Math.max(0, Math.min(Math.round(cx[0] * W) - X_BLEED, W - frameW))
        const top = Math.min(Math.max(0, rowTops[framesAlongRows ? f : s] ?? 0), H - frameH)
        const isDirection = f === 1
        const nextRowTop = framesAlongRows ? rowTops[f + 1] ?? H - 14 : H - 14
        const extend = isDirection ? overflowBelow(left, top + frameH, nextRowTop - 2) : 0
        if (extend > 0) {
          const tall = await sharp(grid)
            .extract({ left, top, width: frameW, height: frameH + extend })
            .png()
            .toBuffer()
          frames.push(
            await sharp(tall)
              .resize(frameW, frameH, { fit: 'contain', background: PAPER })
              .png()
              .toBuffer(),
          )
        } else {
          frames.push(
            await sharp(grid).extract({ left, top, width: frameW, height: frameH }).png().toBuffer(),
          )
        }
      }
      out.push({ start: frames[0], direction: frames[1], end: frames[2] })
    }
    return out
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
  //   균일화는 **프레임 축**에만(순환 재생 스케일 점프 방지) — 축이 열이면 열 폭을 균일화한다.
  const colPx0 = globalAxisBounds(colProfile, cols.length, width) ?? scanAxisBounds(colProfile, cols, width)
  const rowPx0 = globalAxisBounds(rowProfile, rows.length, height) ?? scanAxisBounds(rowProfile, rows, height)
  const colPx = framesAlongRows ? colPx0 : uniformizeRows(colPx0, colProfile)
  const rowPx = framesAlongRows ? uniformizeRows(rowPx0, rowProfile) : rowPx0
  const shotBounds = framesAlongRows ? colPx : rowPx
  const frameBounds = framesAlongRows ? rowPx : colPx

  const out: RoughGridFrames[] = []
  for (let s = 0; s < shotCount; s++) {
    const frames: Buffer[] = []
    for (let f = 0; f < frameBounds.length; f++) {
      // x 축은 항상 cols 계열, y 축은 rows 계열 — 축 배정만 frameAxis 를 따른다.
      const [left, right] = framesAlongRows ? shotBounds[s] : frameBounds[f]
      const [top, bottom] = framesAlongRows ? frameBounds[f] : shotBounds[s]
      const w = Math.max(1, right - left)
      const h = Math.max(1, bottom - top)
      // sharp 인스턴스는 extract 후 재사용 불가 → 셀마다 새로 연다(버퍼 소스라 비용 미미).
      frames.push(await sharp(grid).extract({ left, top, width: w, height: h }).png().toBuffer())
    }
    out.push({ start: frames[0], direction: frames[1], end: frames[2] })
  }
  return out
}
