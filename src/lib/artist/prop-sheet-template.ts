// 소품 시트 양식(m1126 A2, 오너 2026-11-26 "소품 카드의 이미지도 탬플릿에 담아서 만들기 (소품도 인물, 배경처럼 16:9 이미지로 나와야함)").
//   인물 시트 양식(sheet-template.ts)과 같은 캔버스(1536×864) · 바깥 여백 24 · 칸 사이 16 · 흰 바탕 · 둥근 칸 테두리 · 칸 왼쪽 위 작은 이름.
//   칸: 왼쪽 큰 MAIN(3/4 방향 대표 그림) / 오른쪽 위 FRONT · SIDE · BACK / 오른쪽 아래 TOP · DETAIL.
//   이 스펙이 좌표의 단일 진실이다 — 양식 그림 생성기(tests/artist/prop-template-assets.test.ts)가 여기서 그리고,
//   칸 이름은 지시문(prop-image.ts 의 칸 문장)과 한 쌍이다. 칸을 바꾸면 생성기를 다시 돌리고 지시문도 함께 바꾼다.
import type { SheetBox } from '@/lib/artist/sheet-template'

/** public/ 아래 양식 그림 이름 — templateAssetUrl 이 스토리지에 올려 주소를 준다. */
export const PROP_SHEET_FILE = 'prop-template.png'

const W = 1536
const H = 864
const M = 24 // 바깥 여백
const G = 16 // 칸 사이

// 왼쪽 큰 칸 — 폭 708(오른쪽 위 세 칸 폭이 정수로 나뉘게 고른 값).
const MAIN: SheetBox = { x: M, y: M, w: 708, h: H - 2 * M, label: 'MAIN' }
// 오른쪽 영역(x 748..1512 = 764) — 위 줄 세 칸(244) · 아래 줄 두 칸(374), 높이는 둘로 나눔(400).
const R_X = MAIN.x + MAIN.w + G
const R_W = W - M - R_X
const TILE_H = (H - 2 * M - G) / 2
const VIEW_W = (R_W - 2 * G) / 3
const LOWER_W = (R_W - G) / 2
const VIEWS: SheetBox[] = (['FRONT', 'SIDE', 'BACK'] as const).map((label, i) => ({ x: R_X + i * (VIEW_W + G), y: M, w: VIEW_W, h: TILE_H, label }))
const LOWER: SheetBox[] = (['TOP', 'DETAIL'] as const).map((label, i) => ({ x: R_X + i * (LOWER_W + G), y: M + TILE_H + G, w: LOWER_W, h: TILE_H, label }))

export const PROP_SHEET_SPEC = {
  canvas: { width: W, height: H },
  main: MAIN,
  views: VIEWS,
  lower: LOWER,
} as const

/** 양식의 모든 칸 — 그리는 순서(MAIN · FRONT · SIDE · BACK · TOP · DETAIL). */
export function propSheetBoxes(): SheetBox[] {
  return [PROP_SHEET_SPEC.main, ...PROP_SHEET_SPEC.views, ...PROP_SHEET_SPEC.lower]
}
