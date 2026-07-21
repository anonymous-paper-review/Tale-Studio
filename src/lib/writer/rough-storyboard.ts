// 러프 스토리보드(pre-concept previz) 프롬프트 빌더 — writer 탭.
//
// 컨셉 아트 이전에 샷의 연출(구도·포즈·배치)만 확인하는 패널:
// 인물은 느슨한 제스처 스케치(연출·블로킹 우선), 흑백 연필 스케치, 카메라 POV 고정.
// 템플릿 원본: 사용자 제공 previz 프롬프트 (2026-06-12).
//
// 입력 2계층 (증발 우회 — dev/PIPELINE_IO_MAP 참조):
//   ① rich: writer_runs.state 의 shotDesign(ShotStaticSpec/ShotIntent/ShotDynamicSpec).
//      L4 산출물이 DB persist 에서 평탄화되며 버려지므로, 라우트가 state 에서 직접 꺼내 전달.
//      템플릿 슬롯과 1:1 — framing.layers(fg/mg/bg)·focal_point·character_blocking·prop_placement·
//      camera_angle·lens_mm·depth_of_field·lighting.key_direction.
//   ② fallback: rich 가 없을 때(state 유실/구버전 run) DB shots/scenes 평탄화 필드로 근사.
// LLM 경유 없이 기계 치환 (호출당 LLM 비용 0).
import type {
  ShotStaticSpec,
  ShotIntent,
  ShotDynamicSpec,
} from '@/lib/writer/types/pipeline'

/** ShotType 코드 → 프롬프트용 영문 샷 사이즈 (L4 static_spec.shot_type 과 동일 코드 공간).
 *  (grid 빌더 rough-storyboard-grid.ts 가 재사용 — export, #rough-grid 2026-07-22) */
export const SHOT_SIZE_WORDS: Record<string, string> = {
  ECU: 'extreme close-up',
  CU: 'close-up',
  MCU: 'medium close-up',
  MS: 'medium shot',
  MFS: 'medium full shot',
  FS: 'full shot',
  WS: 'wide shot',
  EWS: 'extreme wide establishing shot',
  OTS: 'over-the-shoulder shot',
  POV: 'point-of-view shot',
  TRACK: 'tracking shot (render one representative frame)',
  '2S': 'two shot',
  INSERT: 'insert detail shot',
}

export const FRAMING_RULE_WORDS: Record<string, string> = {
  thirds: 'the rule of thirds',
  center: 'a centered composition',
  symmetry: 'a symmetrical composition',
  diagonal: 'a diagonal composition',
  frame_in_frame: 'a frame-within-frame composition',
  asymmetric: 'an asymmetric composition',
}

/** snake_case enum 값(eye_level, left_third, off_screen_left …) → 읽히는 영문. */
export function words(v: string | null | undefined): string {
  return (v ?? '').replace(/_/g, ' ').trim()
}

// 색상(채도) 단어만 제거 — 흑백 previz 보장 (2026-06-18). 명암어(dark/black/검은/어두운)는 흑백 스케치의
//   음영 정보라 보존; shotDesign(LLM)이 자유 텍스트에 섞어 넣는 색조(붉은 암석·crimson sun·오렌지빛 하늘 등)만 스트립.
const COLOR_WORD_EN =
  /\b(crimson|scarlet|vermilion|reddish|red|orange|amber|golden|gold|yellow|bluish|blue|azure|cyan|teal|green|emerald|verdant|purple|violet|magenta|pink|brown|tan|ochre|sepia|rusty|fiery)\b/gi
const COLOR_WORD_KO =
  /(붉은|불그스름한|빨간|빨강|적색|적갈색|주황빛?|주황색?|오렌지빛?|오렌지색?|노란|노랑|황금빛?|금빛|황톳빛?|푸른|파란|파랑|청색|초록빛?|초록색?|녹색|보랏빛?|보라색?|분홍빛?|갈색)/g
export function stripColor(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(COLOR_WORD_EN, '')
    .replace(COLOR_WORD_KO, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/^[\s,]+/, '')
    .trim()
}

// 렌더/스타일 어휘 — 로케이션 visual_description(아트디렉션 텍스트)을 흑백 스케치 배경으로 빌릴 때, 채색·렌더
//   계열 단어가 klein 의 흑백/스케치 지시를 흔들지 않도록 제거(네거티브와 이중 방어). 지오메트리·설정은 보존.
const STYLE_WORD =
  /\b(cinematic|painterly|photo-?real\w*|hyper-?real\w*|pbr|render(?:ed|ing)?|digital painting|concept art|high[- ]fantasy|volumetric|octane|unreal engine|4k|8k)\b/gi

/** 로케이션 visual_description(asset) → 배경 한 줄. 색·스타일어 제거 후 앞 1~2문장(~200자)으로 압축. */
function conciseEnvDescription(desc: string | null | undefined): string {
  const s = stripColor((desc ?? '').replace(STYLE_WORD, '')).replace(/\s{2,}/g, ' ').trim()
  if (!s) return ''
  const sentences = s.split(/(?<=[.!?])\s+/)
  let out = sentences[0] ?? s
  if (out.length < 110 && sentences[1]) out = `${out} ${sentences[1]}`
  // 끝 구두점/생략부호 제거 — 호출부가 "Background: ${bg}." 로 마침표를 붙이므로 ".." 중복 방지.
  return out.slice(0, 200).replace(/[.…\s]+$/, '').trim()
}

// ⚠️ 네거티브 프롬프트 폐기(2026-07-13): flux-2 klein 은 증류 모델로 CFG 가 없고 API 스키마에
//   negative_prompt 필드 자체가 없다(fal 은 미지원 필드를 조용히 무시) — 옛 40여 개 차단어 리스트는
//   klein 전환 이후 줄곧 no-op 이었다. 차단 의도는 전부 긍정문으로 이관됨:
//   얼굴/의상 → FIGURE_RULE(blank egg head·bare doll body), 흑백·단일패널·무텍스트 → PANEL_STYLE_BASE,
//   클로즈업 얼굴 prior → CU_FRONT(최앞단), 잉여 인물 → SINGLE_FRONT. (3샷 A/B 실측으로 검증)

export function angleWords(angleRaw: string | null | undefined): string {
  // 실데이터는 'low'/'low_angle' 혼용 (enum 비강제) — 접미사 정규화 후 매핑
  const angle = (angleRaw ?? '').replace(/_angle$/, '')
  switch (angle) {
    case 'eye_level':
      return 'an eye-level angle'
    case 'low':
      return 'a low angle (camera looking up)'
    case 'high':
      return 'a high angle (camera looking down)'
    case 'overhead':
      return 'an overhead angle'
    case 'dutch':
      return 'a dutch tilt'
    case '':
      return 'an eye-level angle'
    default:
      return `a ${words(angle)} angle`
  }
}

/** camera pitch(-10~+10)를 앵글 단어로 — fallback 경로 전용 (셋 중 하나만, 과해석 금지). */
function angleFromPitch(pitch: number | null | undefined): string {
  if (typeof pitch !== 'number') return 'an eye-level angle'
  if (pitch >= 3) return 'a low angle (camera looking up)'
  if (pitch <= -3) return 'a high angle (camera looking down)'
  return 'an eye-level angle'
}

/** L4 산출물 묶음 — 라우트가 writer_runs.state.shotDesign 에서 추출해 전달. */
export interface RoughStoryboardSpec {
  staticSpec: ShotStaticSpec
  intent?: ShotIntent
  dynamicSpec?: ShotDynamicSpec
}

export interface RoughStoryboardPromptInput {
  shotType: string
  actionDescription: string
  /** 표시용 캐릭터 이름 (characters.name — id 아님). blocking의 character_id 치환에도 사용 */
  characterNames: string[]
  /** character_id → name (rich 경로의 blocking 치환용. 없으면 id 그대로 노출) */
  characterNameById?: Map<string, string>
  location?: string | null
  /** 로케이션 visual_description (asset) — db_fallback 배경 묘사용. rich 경로는 framing.layers 사용(미사용). */
  locationDescription?: string | null
  timeOfDay?: string | null
  mood?: string | null
  /** camera_config.pan = pitch(상하 회전, -10~+10) — fallback 전용 */
  cameraPitch?: number | null
  focalLength?: number | null
  aperture?: number | null
  /** lighting_config.position: 'left' | 'top' | 'right' | 'front' — fallback 전용 */
  lightPosition?: string | null
  aspectRatio?: string
  /** L4(shotDesign) 원본 — 있으면 rich 경로, 없으면 DB fallback */
  spec?: RoughStoryboardSpec | null
  /**
   * 콘텐츠 체커 우회 모드 — fal 입력 모더레이션(content_policy_violation, 토글 불가)에
   * 걸린 샷의 재시도용. 서사 동사·감정어(액션문/무드/모션/구도 레이어)를 빼고
   * 기계적 스테이징(샷 사이즈·blocking·포즈·소품·focal point)만 남긴다.
   *   (모더레이션 트리거는 구도 레이어/모션 서사에 있음 — blocking 포즈는 무해함이 실측 확인됨,
   *    shot_9 2026-06-26: 레이어·모션만 제거하면 정상 생성. 그래서 포즈는 보존해 가독성 유지.)
   * 직전 잡이 실패한 샷에만 라우트가 자동 적용 — 1차 시도는 항상 원문.
   */
  safeMode?: boolean
  /** 방향 칩 — 사용자가 누른 상대적 연출 방향(영문 수식어). 프롬프트 끝 Emphasis 절로 주입(2026-06-25). */
  styleHints?: string[]
}

// 모델(fal flux-2 klein)은 text-encoder 확산(instruction LLM 아님) — 직설 단어 나열·긍정문·앞쪽 토큰에
//   강하게 반응하고 문장형 서사·부정문은 약하다. 그래서 템플릿을 단어 나열·긍정문 위주로 압축한다.
const PANEL_HEADER = `Rough storyboard previsualization panel, single frame, camera POV, lens-eye view.`

// strictly black-and-white·grayscale only → klein 의 채색 폭주 억제(긍정문이 유일 방어 — negative 미지원).
//   single uninterrupted panel → 이중 패널/프레임-인-프레임(가로 거터) 방지.
const PANEL_STYLE_BASE = `Style: loose rough monochrome pencil-sketch, strictly black and white, grayscale only, no color, quick gestural lines, gray shading, ample negative space, unfinished rough board. Single uninterrupted full-bleed panel, no internal frames or dividing lines.`

// 인물 = 모든 샷·모든 인물이 "동일한 featureless 마네킹"(L1). 샷 간 이질감의 근본 원인은 패널마다 독립
//   T2I 라 특징이 있으면 klein 이 매번 다르게 상상하는 것 → 특징을 없애 변할 게 없게 만들어 일관성 확보
//   (2026-07-09, 이질감 대응).
// v2(2026-07-13, 얼굴 누출 대응): "no face/no clothing"(부재의 부정) → "blank egg-like oval head/bare
//   doll body"(존재의 서술)로 재작성. klein 은 부정문에 약하고 negative_prompt 는 아예 미지원(스키마
//   확인)이라, 그려야 할 것을 직접 묘사하는 긍정문이 유일하게 작동하는 얼굴 억제였다(3샷 A/B 실측).
const FIGURE_RULE = `Figures: draw every character as the same identical artist mannequin — smooth uniform matte-gray body, a completely blank smooth egg-like oval head with a uniform featureless surface, bare simple doll body, consistent simple proportions. Every figure is the same blank mannequin; only pose and position differ.`

// 인물 0인 샷(설정/환경샷) 전용 — FIGURE_RULE 대신. 인물 토큰을 아예 빼고 "빈 풍경만"을 긍정형 직설 지시
//   (klein 은 부정문이 약해 "no people" 류는 비효율 → 긍정문 + 인물 명령어 미포함이 robust).
const ENV_ONLY_RULE = `Environment-only shot: draw the empty landscape and setting above — terrain, sky, structures, and objects.`

function joinPanel(lines: Array<string | null | undefined>): string {
  return lines
    .filter((l): l is string => typeof l === 'string')
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')
}

/** 방향 칩(styleHints) → 프롬프트 끝에 붙일 Emphasis 절. 없으면 빈 문자열. */
function emphasisClause(hints?: string[]): string {
  return hints?.length ? ` Emphasis: ${hints.join(', ')}.` : ''
}

/** rich 경로 — L4 static_spec 이 템플릿 슬롯과 1:1 이므로 원본 facet 을 그대로 치환. */
function buildFromSpec(input: RoughStoryboardPromptInput, spec: RoughStoryboardSpec): string {
  const s = spec.staticSpec
  // shot_type 은 DB(shots.shot_type, 영속 진실 — UI·director·video 가 참조)를 우선.
  //   static_spec.shot_type 은 writer 실행 state(증발) 산출이라 DB 와 어긋날 수 있음(12/19 불일치, 2026-06-18).
  const sizeCode = String(input.shotType || s.shot_type || '').toUpperCase()
  const size = SHOT_SIZE_WORDS[sizeCode] ?? (words(input.shotType || s.shot_type) || 'medium shot')
  const lens = s.lens_mm || input.focalLength || 35
  const dof = s.depth_of_field ?? 'deep'
  // 카메라 intrinsic 은 단어 나열로 — 앞 관사 제거(angleWords/FRAMING_RULE_WORDS 의 'a/an/the').
  const angle = angleWords(s.camera_angle).replace(/^an? /, '')
  const rule = (FRAMING_RULE_WORDS[s.framing?.rule ?? ''] ?? 'the rule of thirds').replace(
    /^(an?|the) /,
    '',
  )

  // L2(샷 간 일관성): 프롬프트에서 캐릭터 이름 제거 — 이름은 klein 이 "특정 인물"을 매번 다르게 상상하게 함.
  //   blocking 순서 기반 "figure N" 위치 라벨로 대체(모션도 같은 인덱스를 참조해 정합).
  const blockingIds = (s.character_blocking ?? []).map((b) => b.character_id)
  const figLabel = (id: string) => {
    const i = blockingIds.indexOf(id)
    return i >= 0 ? `figure ${i + 1}` : 'a figure'
  }

  // safe mode: 서사 동사·감정어가 실리는 구도 레이어/모션을 제외 (모더레이션 우회)
  const layers = input.safeMode ? {} : (s.framing?.layers ?? {})
  const layerLines = [
    layers.foreground ? `- Foreground: ${stripColor(layers.foreground)}.` : null,
    layers.midground ? `- Midground: ${stripColor(layers.midground)}.` : null,
    layers.background ? `- Background: ${stripColor(layers.background)}.` : null,
  ].filter(Boolean) as string[]

  const blocking = (s.character_blocking ?? []).map(
    (b, i) =>
      `Figure ${i + 1}: ${words(b.position_in_frame)}, ${stripColor(words(b.pose))}, gaze ${words(b.gaze)}.`,
  )
  // 앞쪽 배치할 주제 = 인물 수(이름 없음 — L2) / 빈 풍경.
  const figureCount = (s.character_blocking ?? []).length
  const subject = figureCount
    ? `${figureCount} identical mannequin figure${figureCount > 1 ? 's' : ''}`
    : 'empty landscape'

  // 동적 스펙은 "어느 순간을 얼릴지" 가이드로만 — 패널은 정지화.
  const motion = input.safeMode ? undefined : spec.dynamicSpec
  const motionNote = motion
    ? `Freeze the most readable instant of: ${
        (motion.character_motion ?? [])
          .map((m) => `${figLabel(m.character_id)} ${words(m.verb)} (${m.magnitude})`)
          .join(', ') || words(motion.camera_motion?.type ?? '')
      }.`
    : null

  // 곁다듬음: "side_right" 등 값이 " side" 접미사와 겹쳐 "side right side"가 되던 중복 제거.
  const light = s.lighting?.key_direction
    ? ` Lighting: key from the ${words(s.lighting.key_direction)}${
        s.lighting.quality ? `, ${s.lighting.quality}` : ''
      }.`
    : ''

  // 인물(blocking)이 있을 때만 figure 규칙 — 비면 ENV_ONLY_RULE 로 교체(빈 풍경에 인물 생성 방지).
  // 무자막: prop 이름을 프롬프트에 넣으면 모델이 그 텍스트를 라벨로 그려 넣음 → 이름 빼고 "단순 도형"으로만.
  const figureBlock = blocking.length
    ? `${FIGURE_RULE} ${blocking.join(' ')} Props as simple lines or geometric shapes.`
    : `${ENV_ONLY_RULE} Key objects as simple lines or geometric shapes.`

  return joinPanel([
    PANEL_HEADER,
    ``,
    `${size[0].toUpperCase()}${size.slice(1)} — ${subject}.`,
    `Camera: ${angle}, ${lens}mm, ${dof} focus, ${rule}.`,
    ``,
    layerLines.length ? `Composition, three depth layers:` : null,
    ...layerLines,
    ``,
    motionNote,
    ``,
    figureBlock,
    ``,
    `Focal point: ${stripColor(s.framing?.focal_point) || stripColor(spec.intent?.audience_focus) || 'the main action'}.`,
    ``,
    `${PANEL_STYLE_BASE}${light}${emphasisClause(input.styleHints)} Wordless panel: no text, letters, captions, or labels anywhere.`,
  ])
}

// fallback action(서사 문장)은 현재 비활성화 — rich가 action을 뺀 것과 parity(klein은 서사문이 약함).
//   코드는 보존: 재활성화하려면 true. 켜면 1차 시도에만 출력(safeMode 재시도엔 모더레이션 회피로 미출력).
// db_fallback(shotDesign 없는 샷 — 예: writer 탭에서 사용자가 추가한 샷)은 rich spec 이 없어
//   action_description 이 유일한 서사 단서다. 켜야 스토리 수정이 프롬프트에 반영된다(2026-06-24).
//   (rich 경로는 framing/blocking 이 풍부해 action 없이도 충분 — parity 우려는 rich 한정.)
const FALLBACK_EMIT_ACTION: boolean = true

/** fallback 경로 — DB shots/scenes 평탄화 필드 근사 (rich 미보유 프로젝트). */
function buildFromDbRow(input: RoughStoryboardPromptInput): string {
  const size = SHOT_SIZE_WORDS[input.shotType] ?? 'medium shot'
  const angle = angleFromPitch(input.cameraPitch).replace(/^an? /, '')
  const lens = input.focalLength ?? 35
  const focus =
    typeof input.aperture === 'number' && input.aperture <= 2.8 ? 'shallow' : 'deep'

  const setting = [stripColor(input.location), input.timeOfDay].filter(Boolean).join(', ')
  // rich 경로는 framing.layers 로 배경을 그리지만 db_fallback 은 로케이션 이름만 있어 배경이 비어 나온다
  //   (수동 추가 샷 배경 누락, 2026-06-26). shot→scene→location 이 이미 연결돼 있으므로 그 asset 의
  //   visual_description 을 끌어와 배경 한 줄로 준다(선택 UI 불필요 — 데이터는 이미 결정됨).
  const bg = conciseEnvDescription(input.locationDescription)

  const hasChars = input.characterNames.length > 0
  // 액션문은 인물을 함의한다("용사가 …"). characters 가 비어도 action 을 내보내면 그 인물이 그려지는데,
  //   ENV_ONLY(빈 풍경, figure 규칙 없음) 경로로 가면 "Action: 용사가 …"가 무제약 실사 인물로 그려진다
  //   (수동 추가 샷의 figure 미출력 버그, 2026-06-26). → 액션을 내보내면 인물 유무와 무관하게 figure 규칙 적용.
  const emitAction =
    FALLBACK_EMIT_ACTION && !input.safeMode && !!input.actionDescription?.trim()
  const drawsFigures = hasChars || emitAction

  // 앞쪽 배치할 주제 = 인물 수(이름 없음 — L2) / (액션이 함의한) 익명 인물 / 빈 풍경.
  const subject = hasChars
    ? `${input.characterNames.length} identical mannequin figure${input.characterNames.length > 1 ? 's' : ''}`
    : drawsFigures
      ? 'anonymous mannequin figure(s)'
      : 'empty landscape'

  // 인물(명시 or 액션 함의)이 있으면 figure 규칙 — 완전히 비면 ENV_ONLY_RULE.
  const poseLine = hasChars
    ? input.safeMode
      ? 'Neutral standing poses, composed naturally.'
      : 'Place and pose them naturally in frame.'
    : 'Sketch the figures loosely to depict the action above.'
  const figureBlock = drawsFigures
    ? `${FIGURE_RULE} ${poseLine} Props as simple lines or geometric shapes.`
    : `${ENV_ONLY_RULE} Key objects as simple lines or geometric shapes.`
  const focal = hasChars ? 'the figures and the main action' : 'the main action'
  const light =
    input.lightPosition && input.lightPosition !== 'front'
      ? ` Lighting: key from the ${input.lightPosition}.`
      : ''

  return joinPanel([
    PANEL_HEADER,
    ``,
    `${size[0].toUpperCase()}${size.slice(1)} — ${subject}.`,
    `Camera: ${angle}, ${lens}mm, ${focus} focus, rule of thirds.`,
    ``,
    // fallback action: FALLBACK_EMIT_ACTION 으로 토글. 켜면 1차 시도에만(safeMode 제외) 출력.
    emitAction ? `Action: ${input.actionDescription}.` : null,
    setting ? `Setting: ${setting}.${!input.safeMode && input.mood ? ` Mood: ${input.mood}.` : ''}` : '',
    bg ? `Background: ${bg}.` : null,
    ``,
    figureBlock,
    ``,
    `Focal point: ${focal}.`,
    ``,
    `${PANEL_STYLE_BASE}${light}${emphasisClause(input.styleHints)} Wordless panel: no text, letters, captions, or labels anywhere.`,
  ])
}

// 앞토큰 강조절(v2, 2026-07-13): klein 은 프롬프트 맨 앞 토큰에 가장 강하게 반응한다(실측).
//   CU 계열은 "블랭크 계란 두상"을 최앞단에 — "클로즈업=얼굴" prior 를 이기는 유일한 방법이었다
//   (negative 미지원 + 본문 중간의 FIGURE_RULE 만으로는 CU 거리에서 뚫림). 인물 1인 샷은 단독·빈
//   배경을 앞단 강조해 군중 발생 억제(옛 negative 'crowd' 가 no-op 이었어서 필요).
const CU_FRONT = `Close-up of a blank featureless artist mannequin head — a smooth egg-shaped oval with a perfectly uniform blank surface, matte gray. `
// 문구 튜닝 이력(실측, 2026-07-13): "vast empty surroundings" → 배경(로케이션)까지 소거(shot_5) /
//   "single lone … only figure" 절충안 → 개선 없음. 채택안은 MS 거리에서 1인+환경 보존이 가장 안정.
//   ⚠️ 알려진 한계: EWS(원경)에선 어떤 문구로도 인원 과다(7~9인)를 못 잡음 — klein(4-step 증류)의
//   카운트 준수 한계. 개선하려면 프롬프트가 아니라 모델/LoRA 축(후속 과제).
const SINGLE_FRONT = `Exactly one mannequin figure, alone in the scene. `
const CU_TYPES = new Set(['CU', 'ECU', 'MCU'])

export function buildRoughStoryboardPrompt(input: RoughStoryboardPromptInput): string {
  const base = input.spec?.staticSpec ? buildFromSpec(input, input.spec) : buildFromDbRow(input)
  // 인물 수 — rich 경로는 blocking, fallback 은 characterNames 기준(각 빌더의 subject 계산과 동일 출처).
  const figureCount = input.spec?.staticSpec
    ? (input.spec.staticSpec.character_blocking ?? []).length
    : input.characterNames.length
  if (figureCount === 0) return base // 환경샷 — 인물 절을 아예 넣지 않는다(ENV_ONLY_RULE 경로와 정합)
  const cu = CU_TYPES.has(String(input.shotType ?? '').toUpperCase()) ? CU_FRONT : ''
  // 군집 엔티티 가드: '추적자들'처럼 캐릭터 1행이 다수 인물을 뜻하는 경우(복수 표지 '들') 단독절을
  //   붙이면 배경까지 소거된 1인 화면으로 붕괴한다(shot_5 실측, 2026-07-13). 복수 표지면 생략.
  const groupish = input.characterNames.some((n) => /들\s*$/.test(n))
  const single = figureCount === 1 && !groupish ? SINGLE_FRONT : ''
  return cu + single + base
}
