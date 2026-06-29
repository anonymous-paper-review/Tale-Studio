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
  /** safe-mode(모더레이션 우회 재시도, #A): 명시 미성년 나이/그래픽 묘사를 제거하고 adult·stylized·non-graphic 토큰을 더한다.
   *   합법 픽션 false-positive 회피용. safeMode 미지정/false면 출력은 기존과 byte-identical. */
  safeMode?: boolean
}


// safe-mode 스크럽(순수): 명시적 미성년 나이 마커 + 그래픽/유혈 묘사만 제거. 보수적 — 성별 명사(소녀/girl)는
//   유지(adult 토큰이 연령 상향), "피부(skin)" 등 오삭제 방지로 bare "피"는 제외.
const SAFE_MINOR_AGE_RE =
  /(\d{1,2}\s*(?:살|세)|(?:1[0-9]|십)\s*대(?:\s*(?:초반|중반|후반))?|어린(?=\s|$)|유아|미성년자?|초등학생|\b\d{1,2}[-\s]?year[-\s]?old\b|\bchild(?:ren)?\b|\bkids?\b|\btoddlers?\b|\binfants?\b|\bminors?\b|\bunderage\b)/gi
const SAFE_GRAPHIC_RE =
  /(유혈|혈흔|선혈|피범벅|피투성이|낭자|상처|훼손|시체|시신|사체|고문|학살|절단|\bblood(?:y|stained|ied)?\b|\bgore\b|\bgory\b|\bwounds?\b|\bwounded\b|\bmutilat\w*|\bcorpses?\b|\bdismember\w*|\bgruesome\b|\bviscera\w*)/gi
const SAFE_TOKENS =
  'depicted as an adult, age-ambiguous, stylized non-graphic illustration, tasteful, safe-for-work'

function safeScrub(s: string): string {
  return s.replace(SAFE_MINOR_AGE_RE, ' ').replace(SAFE_GRAPHIC_RE, ' ').replace(/\s{2,}/g, ' ').trim()
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
  const safe = input.safeMode === true
  const appearance = safe ? safeScrub(input.appearance) : input.appearance
  const costumeList = safe
    ? (input.costumes ?? []).map(safeScrub).filter(Boolean)
    : (input.costumes ?? [])
  const costumes = costumeList.length ? `wearing ${costumeList.join(', ')}` : ''
  return [
    // safe-mode: 명시 나이 토큰 제거(age-ambiguous 로 대체).
    safe ? '' : input.age ? `age ${input.age}` : '',
    input.role,
    appearance,
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
    ...(input.safeMode ? [SAFE_TOKENS] : []),
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
    ...(input.safeMode ? [SAFE_TOKENS] : []),
    'identical character, identical outfit and proportions to the reference, full body, single character, neutral grey background, even studio lighting, no text, no logo',
  ]
    .filter(Boolean)
    .join('. ')
    .slice(0, 900)
}
