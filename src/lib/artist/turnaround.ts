// 캐릭터 뷰 프롬프트 빌더 (순수 함수).
//
// 전략 (crop 폐기, 2026-06-05 / front 통합, 2026-06-05): 1×4 스트립 생성·sharp 4등분을 폐기하고,
//   - main = 풀바디·정면·중립배경 대표 포트레이트 1장 (T2I). 핸드오프 파이프라인의
//     'assetImages' step 이 fal webhook 으로 미리 생성해 characters.view_main 에 저장.
//     이 정면 대표 이미지가 곧 "front" 역할을 겸한다 (별도 front 뷰 폐기).
//   - back/sideLeft/sideRight = main 을 reference 로 한 image-to-image(edit 모델) 재생성.
//     각 방향을 개별 호출로 생성해 crop 오정합 문제를 제거하고 일관성을 높인다.
//
// ⚠️ source-agnostic: 프롬프트 입력 토큰을 "인자로" 받는다. 토큰이 writer 로그/DB 어디서 오든
//    호출자가 채우면 된다 → 데이터 출처와 무관.

/** main(정면) 을 제외한 방향 뷰 (개별 i2i 생성 대상) */
export const CHARACTER_DIRECTIONAL_VIEWS = ['back', 'sideLeft', 'sideRight'] as const

export type DirectionalView = (typeof CHARACTER_DIRECTIONAL_VIEWS)[number]

/** 각 방향 뷰의 각도 지시문 */
const VIEW_ANGLE: Record<DirectionalView, string> = {
  back: 'back view, the character seen from directly behind',
  sideLeft: 'left-side profile view, the character facing left at 90 degrees',
  sideRight: 'right-side profile view, the character facing right at 90 degrees',
}

export interface CharacterPromptInput {
  /** 캐릭터 이름 */
  name: string
  /** 외형 묘사 (DB characters.appearance) */
  appearance: string
  age?: string
  role?: string
  costumes?: string[]
  /** 디자인 토큰 (projects.design_tokens.l1) */
  artStyle?: string
  shapeLanguage?: string
  /** 글로벌 팔레트 색상들 */
  palette?: string[]
  /** 재생성 시 유저 요청 델타(merge) — 룩 토대 위에 덮어쓰는 명시 지시(AC13). 룩(스타일/팔레트/의상)은 토대로 유지. */
  delta?: string
}

function styleTokens(input: CharacterPromptInput): string[] {
  const palette = input.palette?.filter(Boolean).join(', ')
  return [
    input.artStyle ? `art style: ${input.artStyle}` : '',
    input.shapeLanguage ? `shape language: ${input.shapeLanguage}` : '',
    palette ? `palette: ${palette}` : '',
  ].filter(Boolean)
}

// 유저 델타(재생성 요청) — 룩 토대 뒤에 두어 충돌 시 우선 적용되게 한다(AC13 merge: 룩 토대 + 델타 덮음).
function deltaClause(input: CharacterPromptInput): string[] {
  const d = input.delta?.trim()
  return d ? [`apply requested changes (override defaults where conflicting): ${d}`] : []
}

function describe(input: CharacterPromptInput): string[] {
  const costumes = input.costumes?.length
    ? `wearing ${input.costumes.join(', ')}`
    : ''
  return [
    input.age ? `age ${input.age}` : '',
    input.role,
    input.appearance,
    costumes,
  ].filter((x): x is string => !!x)
}

/**
 * main(대표 포트레이트) 프롬프트 — 풀바디·정면·중립배경·단일 캐릭터.
 * reference 없이 깨끗하게 생성하는 T2I 용.
 */
export function buildCharacterMainPrompt(input: CharacterPromptInput): string {
  return [
    `Character reference portrait of ${input.name}`,
    ...describe(input),
    ...styleTokens(input),
    ...deltaClause(input),
    'full body, single character, front view, neutral grey background, even studio lighting, clean composition, no text, no logo',
  ]
    .filter(Boolean)
    .join('. ')
    .slice(0, 900)
}

/**
 * 방향 뷰 프롬프트 — main 이미지를 reference 로 넘긴 image-to-image(edit) 용.
 * "동일 캐릭터/의상을 이 각도에서" 를 강하게 지시해 일관성을 유지한다.
 */
export function buildCharacterViewPrompt(
  input: CharacterPromptInput,
  view: DirectionalView,
): string {
  return [
    `The same character as the reference image, ${input.name}`,
    VIEW_ANGLE[view],
    ...describe(input),
    ...styleTokens(input),
    ...deltaClause(input),
    'identical character, identical outfit and proportions to the reference, full body, single character, neutral grey background, even studio lighting, no text, no logo',
  ]
    .filter(Boolean)
    .join('. ')
    .slice(0, 900)
}
