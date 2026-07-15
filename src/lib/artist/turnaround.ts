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
  /** l1.line_quality — 선 스타일(예: sharp_defined). 옛 하드코딩 "clean line art"(애니 토큰) 대체(#B). */
  lineQuality?: string
  /** l1.texture_philosophy — 질감 방향(예: weathered_industrial). 애니 디폴트 견제(#B). */
  texturePhilosophy?: string
  /** l1.character_proportion — 두신 비율(예: 8:1). 애니 등신 견제(#B). */
  characterProportion?: string
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
    input.lineQuality ? `line quality: ${input.lineQuality}` : '',
    input.shapeLanguage ? `shape language: ${input.shapeLanguage}` : '',
    input.texturePhilosophy ? `texture: ${input.texturePhilosophy}` : '',
    input.characterProportion
      ? `character proportions: ${input.characterProportion} head-to-body ratio`
      : '',
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
  // 캐릭터 레퍼런스(정체성 앵커)는 "기본 착장"만 앵커한다 (A, 2026-07-15).
  //   costume 목록엔 스토리상 씬별 대체 의상(잠옷 등)이 섞일 수 있는데, 이런 대체 착장이
  //   레퍼런스 이미지에 잡히면 그 옷이 그 레퍼런스를 참조하는 전 샷에 전파된다(사무실인데 잠옷).
  //   넥타이·시계·안경·터틀넥처럼 같이 입는 상시 아이템은 보존하고, 명백한 취침/대체 착장만 제외한다.
  //   씬별 올바른 의상은 이미 샷 프롬프트(first_frame_prompt)가 텍스트로 지정한다.
  //   TODO(B, open_questions Q-ART-1): 아티스트 단계에서 씬/타임라인별 의상 스냅샷을
  //     별도 레퍼런스로 추가하면 의상 변화까지 이미지로 고정 가능(현재는 기본 착장만 앵커).
  const ALT_OUTFIT = /pajama|pyjama|nightwear|nightgown|nightdress|sleepwear|loungewear|잠옷|파자마|나이트가운/i
  const anchorCostumes = costumeList.filter((c) => !ALT_OUTFIT.test(c))
  const finalCostumes = anchorCostumes.length ? anchorCostumes : costumeList
  const costumes = finalCostumes.length ? `wearing ${finalCostumes.join(', ')}` : ''
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
 * 턴어라운드 시트 프롬프트 — "한 장에 모든 뷰"(정면·3/4·측면·3/4 후면·후면) 모델시트.
 *   기본 경로는 캐릭터 템플릿(public/character-template.png)을 reference 로 넣은 I2I(edit) — 그 레이아웃에
 *   캐릭터를 채운다. 템플릿 URL 을 못 구하면 같은 프롬프트로 T2I 폴백. 동일 캐릭터/의상/비율을 뷰마다
 *   강하게 고정해 director 단계의 뷰 참조 일관성을 확보(#7). 개별 방향 뷰(i2i) 생성 대체 — 캐릭터당 1장(#9, 2026-07-11).
 */
export function buildCharacterTurnaroundPrompt(input: CharacterPromptInput): string {
  return [
    `Fill in this character reference-sheet template with ${input.name}`,
    ...describe(input),
    ...styleTokens(input),
    ...deltaClause(input),
    ...(input.safeMode ? [SAFE_TOKENS] : []),
    'keep the template EXACTLY as-is — all of its section boxes, dividers, labels and headings stay in place (character concept, color palette, size guide, turnaround, detail notes, sketch style, face expression guide)',
    // 템플릿 v2(스타일 중립 마네킹판): 마네킹은 "포즈 자리표시"임을 명시 — 마네킹 질감/형태를 계승하지 않게.
    'the gray mannequin figures are pose placeholders ONLY — replace every one of them with the SAME character in that exact pose: the full-body turnaround row (front, three-quarter front, side profile, three-quarter back, and back), the concept portrait, the size-guide figure, the sketch-style row, the action pose, and the face-expression variations',
    'identical character design, outfit, colors and proportions across every view, consistent art style',
    // #B: 옛 "clean line art"(애니 토큰) 삭제 + 애니 디폴트 차단. "declared art style"을 따르라는 조건부
    //   표현이라 아트 스타일 자체가 애니인 프로젝트와는 충돌하지 않는다(디폴트 회귀만 금지).
    'follow the declared art style exactly — never fall back to a generic anime, chibi or mascot look, and never inherit any art style from the template mannequins',
  ]
    .filter(Boolean)
    .join('. ')
    .slice(0, 1500)
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
