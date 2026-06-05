// 캐릭터 턴어라운드 시트 — 프롬프트 빌더 + crop 유틸 (순수 함수).
//
// decisions #37: A-style 구조화 프롬프트로 1×4 가로 스트립(front|side-L|side-R|back)을
// 한 장 생성한 뒤, 균등 4등분 고정좌표로 crop 해 개별 뷰에 분배한다.
//
// ⚠️ source-agnostic: 프롬프트 입력 토큰을 "인자로" 받는다. 토큰이 svc 로그에서 오든
//    DB(unify-svc-writer-pipeline 이후)에서 오든 호출자가 채우면 된다 → 데이터 출처와 무관.
import sharp from 'sharp'

/** 시트의 셀 순서 (좌→우). crop 인덱스와 1:1 대응. */
export const TURNAROUND_VIEW_ORDER = [
  'front',
  'sideLeft',
  'sideRight',
  'back',
] as const

export type TurnaroundView = (typeof TURNAROUND_VIEW_ORDER)[number]

/** 각 셀의 각도 지시문 (프롬프트 + 사람이 읽는 라벨) */
export const TURNAROUND_VIEW_SPEC: Record<
  TurnaroundView,
  { label: string; angle: string }
> = {
  front: { label: 'Front', angle: 'front view facing camera' },
  sideLeft: { label: 'Side (L)', angle: 'left side profile, 90 degrees' },
  sideRight: { label: 'Side (R)', angle: 'right side profile, 90 degrees' },
  back: { label: 'Back', angle: 'back view from behind' },
}

export interface TurnaroundPromptInput {
  /** 캐릭터 이름 */
  name: string
  /** 외형 묘사 (svc appearance_description 또는 DB fixed_prompt) */
  appearance: string
  age?: string
  role?: string
  costumes?: string[]
  /** svc L1 — 폴백(fixed_prompt) 시엔 없을 수 있음 */
  artStyle?: string
  shapeLanguage?: string
  /** svc L2 global_palette 색상들 */
  palette?: string[]
}

/**
 * 1×4 가로 스트립 턴어라운드 시트 프롬프트 조립.
 * 셀 순서(좌→우)는 TURNAROUND_VIEW_ORDER 와 일치 — crop 좌표와 맞추기 위해 프롬프트에서
 * "4 equal panels, evenly spaced" 를 강하게 지시한다.
 */
export function buildTurnaroundSheetPrompt(input: TurnaroundPromptInput): string {
  const palette = input.palette?.filter(Boolean).join(', ')
  const costumes = input.costumes?.length
    ? `wearing ${input.costumes.join(', ')}`
    : ''

  const panelOrder = TURNAROUND_VIEW_ORDER.map(
    (v, i) => `(${i + 1}) ${TURNAROUND_VIEW_SPEC[v].angle}`,
  ).join(', ')

  return [
    `Character turnaround model sheet of ${input.name}`,
    input.age ? `age ${input.age}` : '',
    input.role,
    input.appearance,
    costumes,
    input.artStyle ? `art style: ${input.artStyle}` : '',
    input.shapeLanguage ? `shape language: ${input.shapeLanguage}` : '',
    palette ? `palette: ${palette}` : '',
    // 레이아웃 지시 — crop 정합을 위해 균등 4패널을 강제
    `Exactly 4 full-body views of the SAME character in one horizontal row, evenly spaced across 4 equal-width panels, left to right: ${panelOrder}`,
    `identical character, identical outfit and proportions in every panel`,
    `neutral grey background, even studio lighting, thin vertical gridlines separating the 4 panels, no text, no logo`,
  ]
    .filter(Boolean)
    .join('. ')
    .slice(0, 1000)
}

export interface TurnaroundCrops {
  front: Buffer
  sideLeft: Buffer
  sideRight: Buffer
  back: Buffer
}

/**
 * 1×4 스트립 이미지를 균등 4등분(고정좌표)으로 crop.
 * 마지막 셀은 반올림 잔차를 흡수하도록 남은 폭 전체를 사용.
 * ⚠️ 모델이 패널을 정확히 4등분에 안 맞추면 일부 잘릴 수 있음 (MVP 한계, decisions #37).
 */
export async function cropTurnaroundStrip(
  strip: Buffer,
): Promise<TurnaroundCrops> {
  const meta = await sharp(strip).metadata()
  const w = meta.width
  const h = meta.height
  if (!w || !h) throw new Error('cropTurnaroundStrip: 이미지 크기를 읽지 못함')

  const cellW = Math.floor(w / 4)
  const extractCell = (index: number): Promise<Buffer> => {
    const left = index * cellW
    const width = index === 3 ? w - left : cellW // 마지막 셀은 잔차 흡수
    return sharp(strip)
      .extract({ left, top: 0, width, height: h })
      .png()
      .toBuffer()
  }

  const [front, sideLeft, sideRight, back] = await Promise.all([
    extractCell(0),
    extractCell(1),
    extractCell(2),
    extractCell(3),
  ])
  return { front, sideLeft, sideRight, back }
}
