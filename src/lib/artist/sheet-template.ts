// 캐릭터 시트 템플릿 v4 스펙 (2026-10-27 오너 — 색 팔레트 · 포즈 1 · 포즈 2 · 3/4 정면 칸을 지우고 남은 칸을 다시 배치).
//
// v4: 대표 포트레이트(v3 와 같은 자리) / 표정 4(기쁨·슬픔·분노·놀람, 팔레트 자리까지 세로로 키움) / 턴어라운드 3뷰
//   (front·side·back — 전체 높이, 전신이 v3 의 두 배쯤) / 디테일 클로즈업 2(오른쪽 열). 최소 라벨만 — 칸별 내용 지시는
//   프롬프트가 전담한다(src/lib/artist/turnaround.ts 의 시트 절과 한 쌍).
// v3(#f8 2026-08-27): v2 의 반복 · 바이어스(전신 라인업 3번 · SIZE GUIDE · 빈 노트 칸 · 회색 마네킹)를 걷어 낸 정형 타일 —
//   여기에 팔레트 5칸 · 턴어라운드 4뷰(¾front 포함) · 개성 포즈 2 가 더 있었다.
//
// 이 스펙이 좌표의 단일 진실이다: 템플릿 PNG 생성기(tests/artist/character-template-assets.test.ts)와
//   포트레이트 크롭(src/lib/artist/portrait.ts)이 전부 여기서 파생된다 — 레이아웃을 바꾸면
//   generator 재실행 + 그 테스트가 PNG 치수 드리프트를 CI 에서 잡는다.
//   ⚠️ v2 시트(기존 생성분)와 좌표가 다르다 — v2 시트에 v3 · v4 크롭을 돌리면 엉뚱한 부분이 잘린다(v3 · v4 포트레이트는 같은 자리).

export interface SheetBox {
  x: number
  y: number
  w: number
  h: number
  /** 박스 상단 안쪽에 그릴 소문자 라벨(생성 모델 앵커용 최소 텍스트). 빈 문자열 = 라벨 없음. */
  label: string
}

const W = 1536
const H = 864
const M = 24 // 바깥 여백
const G = 16 // 타일 사이 거터

// ── 좌측 컬럼(360px): 포트레이트 + 표정 2×2 ──
const COL_A_W = 360
// 포트레이트는 v3 와 같은 자리 · 크기 — 대표 얼굴 크롭 좌표가 그대로라 배포 순간 그리던 v3 시트도 바르게 잘린다.
const PORTRAIT: SheetBox = { x: M, y: M, w: COL_A_W, h: 360, label: 'PORTRAIT' }
const EXPR_TILE_W = (COL_A_W - G) / 2 // 172
const EXPR_Y = PORTRAIT.y + PORTRAIT.h + G // 400
// 팔레트가 빠진 자리까지 표정 2×2 가 세로로 나눠 가진다: (아래 여백까지 높이 − 거터) / 2.
const EXPR_TILE_H = (H - M - EXPR_Y - G) / 2 // 212
const EXPRESSION_LABELS = ['JOY', 'SORROW', 'ANGER', 'SURPRISE'] as const
const EXPRESSIONS: SheetBox[] = EXPRESSION_LABELS.map((label, i) => ({
  x: M + (i % 2) * (EXPR_TILE_W + G),
  y: EXPR_Y + Math.floor(i / 2) * (EXPR_TILE_H + G),
  w: EXPR_TILE_W,
  h: EXPR_TILE_H,
  label,
}))

// ── 우측 영역(x 408..1512 = 1104px): 턴어라운드(전체 높이) + 디테일 2(오른쪽 열) ──
const R_X = M + COL_A_W + M // 408
const R_W = W - R_X - M // 1104
const FULL_H = H - 2 * M // 816
export const TURNAROUND_VIEW_LABELS = ['FRONT', 'SIDE', 'BACK'] as const
const SLOT_PAD = 12 // 턴어라운드 안쪽 좌우 여백
// 뷰 슬롯 폭과 디테일 열 폭을 같게(258) — 턴어라운드 폭 = 슬롯 3 + 거터 2 + 안쪽 여백 2.
const SLOT_W = (R_W - G - 2 * SLOT_PAD - (TURNAROUND_VIEW_LABELS.length - 1) * G) / (TURNAROUND_VIEW_LABELS.length + 1) // 258
const TURNAROUND: SheetBox = {
  x: R_X,
  y: M,
  w: TURNAROUND_VIEW_LABELS.length * SLOT_W + (TURNAROUND_VIEW_LABELS.length - 1) * G + 2 * SLOT_PAD, // 830
  h: FULL_H,
  label: 'TURNAROUND',
}
/** 턴어라운드 내부 뷰 슬롯(라벨 밴드 아래) — 뷰 수만큼 균등 분할, 슬롯 사이 얇은 구분선용 좌표. */
export function turnaroundSlots(): SheetBox[] {
  const innerX = TURNAROUND.x + SLOT_PAD
  const innerW = TURNAROUND.w - 2 * SLOT_PAD
  const n = TURNAROUND_VIEW_LABELS.length
  const slotW = (innerW - (n - 1) * G) / n
  return TURNAROUND_VIEW_LABELS.map((label, i) => ({
    x: innerX + i * (slotW + G),
    y: TURNAROUND.y + 40,
    w: slotW,
    h: TURNAROUND.h - 52,
    label,
  }))
}

const DETAIL_X = TURNAROUND.x + TURNAROUND.w + G // 1254
const DETAIL_W = W - M - DETAIL_X // 258
const DETAIL_H = (FULL_H - G) / 2 // 400
const DETAILS: SheetBox[] = [0, 1].map((i) => ({
  x: DETAIL_X,
  y: M + i * (DETAIL_H + G),
  w: DETAIL_W,
  h: DETAIL_H,
  label: `DETAIL ${i + 1}`,
}))

export const CHARACTER_SHEET_SPEC = {
  canvas: { width: W, height: H },
  portrait: PORTRAIT,
  expressions: EXPRESSIONS,
  turnaround: TURNAROUND,
  details: DETAILS,
} as const

/** 포트레이트 크롭 상대 좌표 — 박스 보더(2px)와 라벨 밴드(상단 26px)를 피한 내부. */
export function portraitRegionOfSpec(): { x0: number; y0: number; x1: number; y1: number } {
  const b = CHARACTER_SHEET_SPEC.portrait
  return {
    x0: (b.x + 4) / W,
    y0: (b.y + 26) / H,
    x1: (b.x + b.w - 4) / W,
    y1: (b.y + b.h - 4) / H,
  }
}
