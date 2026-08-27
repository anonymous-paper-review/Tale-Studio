// 캐릭터 시트 템플릿 v3 스펙 (#f8 2026-08-27 오너 지시 — 반복·바이어스 제거, 정형 타일).
//
// v2 의 문제(오너 실측): ① 서 있는 전신 라인업이 3번 반복(TURN AROUND 5뷰 + SKETCH STYLE
//   4체형 + SIZE GUIDE 입상) ② SIZE GUIDE(키 cm 눈금)는 파이프라인에서 무의미 ③ 빈 DETAIL
//   NOTES 텍스트 칸은 모델이 가짜 글자로 채우는 바이어스 ④ 회색 마네킹은 포즈 자리표시로
//   넣었지만 스타일 계승 바이어스의 원천이라 프롬프트가 따로 싸워야 했다.
// v3: 업계 컨셉 시트 문법의 핵심만 정형 타일로 — 대표 포트레이트 / 표정 4(기쁨·슬픔·분노·
//   놀람) / 팔레트 5칸 / 턴어라운드 4뷰(front·¾front·side·back — ¾back 제거) / 개성 포즈 2 /
//   디테일 클로즈업 2. 마네킹·긴 제목·빈 노트 칸 없음(최소 라벨만) — 포즈·내용 지시는 프롬프트가
//   전담한다(src/lib/artist/turnaround.ts 의 v3 절과 한 쌍).
//
// 이 스펙이 좌표의 단일 진실이다: 템플릿 PNG 생성기(tests/character-template-assets.test.ts)와
//   포트레이트 크롭(src/lib/artist/portrait.ts)이 전부 여기서 파생된다 — 레이아웃을 바꾸면
//   generator 재실행 + 그 테스트가 PNG 치수 드리프트를 CI 에서 잡는다.
//   ⚠️ v2 시트(기존 생성분)와 좌표가 다르다 — v2 시트에 v3 크롭을 돌리면 엉뚱한 부분이 잘린다.

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

// ── 좌측 컬럼(360px): 포트레이트 + 표정 2×2 + 팔레트 ──
const COL_A_W = 360
const PORTRAIT: SheetBox = { x: M, y: M, w: COL_A_W, h: 360, label: 'PORTRAIT' }
const EXPR_TILE = (COL_A_W - G) / 2 // 172
const EXPRESSION_LABELS = ['JOY', 'SORROW', 'ANGER', 'SURPRISE'] as const
const EXPRESSIONS: SheetBox[] = EXPRESSION_LABELS.map((label, i) => ({
  x: M + (i % 2) * (EXPR_TILE + G),
  y: 400 + Math.floor(i / 2) * (EXPR_TILE + G),
  w: EXPR_TILE,
  h: EXPR_TILE,
  label,
}))
const PALETTE: SheetBox = { x: M, y: 776, w: COL_A_W, h: H - 776 - M, label: 'PALETTE' } // h=64
export const PALETTE_SWATCHES = 5

// ── 우측 영역(x 408..1512 = 1104px): 턴어라운드(상) + 포즈·디테일(하) ──
const R_X = M + COL_A_W + M // 408
const R_W = W - R_X - M // 1104
const TURNAROUND: SheetBox = { x: R_X, y: M, w: R_W, h: 424, label: 'TURNAROUND' }
export const TURNAROUND_VIEW_LABELS = ['FRONT', '3/4 FRONT', 'SIDE', 'BACK'] as const
/** 턴어라운드 내부 뷰 슬롯(라벨 밴드 아래) — 4등분, 슬롯 사이 얇은 구분선용 좌표. */
export function turnaroundSlots(): SheetBox[] {
  const innerX = TURNAROUND.x + 12
  const innerW = TURNAROUND.w - 24
  const slotW = (innerW - 3 * G) / 4
  return TURNAROUND_VIEW_LABELS.map((label, i) => ({
    x: innerX + i * (slotW + G),
    y: TURNAROUND.y + 40,
    w: slotW,
    h: TURNAROUND.h - 52,
    label,
  }))
}

const ROW2_Y = TURNAROUND.y + TURNAROUND.h + M // 472
const ROW2_H = H - ROW2_Y - M // 368
const DETAIL_W = 176
// 포즈 2칸이 남는 폭을 균등하게 가져간다: R_W - 디테일 - 거터 2개를 2등분.
const POSE_W = (R_W - DETAIL_W - 2 * G) / 2 // 448
const POSES: SheetBox[] = [0, 1].map((i) => ({
  x: R_X + i * (POSE_W + G),
  y: ROW2_Y,
  w: POSE_W,
  h: ROW2_H,
  label: `POSE ${i + 1}`,
}))
const DETAILS: SheetBox[] = [0, 1].map((i) => ({
  x: R_X + 2 * (POSE_W + G),
  y: ROW2_Y + i * ((ROW2_H - G) / 2 + G),
  w: DETAIL_W,
  h: (ROW2_H - G) / 2, // 176
  label: `DETAIL ${i + 1}`,
}))

export const CHARACTER_SHEET_SPEC = {
  canvas: { width: W, height: H },
  portrait: PORTRAIT,
  expressions: EXPRESSIONS,
  palette: PALETTE,
  turnaround: TURNAROUND,
  poses: POSES,
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
