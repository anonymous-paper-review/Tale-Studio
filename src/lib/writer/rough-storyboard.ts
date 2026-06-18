// 러프 스토리보드(pre-concept previz) 프롬프트 빌더 — writer 탭.
//
// 컨셉 아트 이전에 샷의 연출(구도·포즈·배치)만 확인하는 패널:
// 인물은 전부 목각 인형/스틱 피겨, 흑백 연필 스케치, 카메라 POV 고정.
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

/** ShotType 코드 → 프롬프트용 영문 샷 사이즈 (L4 static_spec.shot_type 과 동일 코드 공간). */
const SHOT_SIZE_WORDS: Record<string, string> = {
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

const FRAMING_RULE_WORDS: Record<string, string> = {
  thirds: 'the rule of thirds',
  center: 'a centered composition',
  symmetry: 'a symmetrical composition',
  diagonal: 'a diagonal composition',
  frame_in_frame: 'a frame-within-frame composition',
  asymmetric: 'an asymmetric composition',
}

/** snake_case enum 값(eye_level, left_third, off_screen_left …) → 읽히는 영문. */
function words(v: string | null | undefined): string {
  return (v ?? '').replace(/_/g, ' ').trim()
}

function angleWords(angleRaw: string | null | undefined): string {
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
   * 직전 잡이 실패한 샷에만 라우트가 자동 적용 — 1차 시도는 항상 원문.
   */
  safeMode?: boolean
}

// 모델(fal flux-2 klein)은 text-encoder 확산(instruction LLM 아님) — 직설 단어 나열·긍정문·앞쪽 토큰에
//   강하게 반응하고 문장형 서사·부정문은 약하다. 그래서 템플릿을 단어 나열·긍정문 위주로 압축한다.
const PANEL_HEADER = `Rough storyboard previsualization panel, single frame, camera POV, lens-eye view.`

const PANEL_STYLE_BASE = `Style: loose rough monochrome pencil-sketch, quick gestural lines, gray shading, ample negative space, unfinished rough board.`

// "rough stick figure" 제거(featureless wooden mannequin 으로 통일), "no face/no identity"→"anonymous"(긍정).
const MANNEQUIN_RULE = `Figures: draw every character as a featureless wooden mannequin, anonymous — pose, gesture, and position only.`

// 인물 0인 샷(설정/환경샷) 전용 — MANNEQUIN_RULE 대신. 인물 토큰을 아예 빼고 "빈 풍경만"을 긍정형 직설 지시
//   (klein 은 부정문이 약해 "no people" 류는 비효율 → 긍정문 + 인물 명령어 미포함이 robust).
const ENV_ONLY_RULE = `Environment-only shot: draw the empty landscape and setting above — terrain, sky, structures, and objects.`

function joinPanel(lines: Array<string | null | undefined>): string {
  return lines
    .filter((l): l is string => typeof l === 'string')
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')
}

/** rich 경로 — L4 static_spec 이 템플릿 슬롯과 1:1 이므로 원본 facet 을 그대로 치환. */
function buildFromSpec(input: RoughStoryboardPromptInput, spec: RoughStoryboardSpec): string {
  const s = spec.staticSpec
  const sizeCode = String(s.shot_type ?? '').toUpperCase()
  const size = SHOT_SIZE_WORDS[sizeCode] ?? (words(s.shot_type) || 'medium shot')
  const lens = s.lens_mm || input.focalLength || 35
  const dof = s.depth_of_field ?? 'deep'
  // 카메라 intrinsic 은 단어 나열로 — 앞 관사 제거(angleWords/FRAMING_RULE_WORDS 의 'a/an/the').
  const angle = angleWords(s.camera_angle).replace(/^an? /, '')
  const rule = (FRAMING_RULE_WORDS[s.framing?.rule ?? ''] ?? 'the rule of thirds').replace(
    /^(an?|the) /,
    '',
  )

  const nameOf = (id: string) => input.characterNameById?.get(id) ?? id

  // safe mode: 서사 동사·감정어가 실리는 구도 레이어/모션을 제외 (모더레이션 우회)
  const layers = input.safeMode ? {} : (s.framing?.layers ?? {})
  const layerLines = [
    layers.foreground ? `- Foreground: ${layers.foreground}.` : null,
    layers.midground ? `- Midground: ${layers.midground}.` : null,
    layers.background ? `- Background: ${layers.background}.` : null,
  ].filter(Boolean) as string[]

  const blocking = (s.character_blocking ?? []).map(
    (b) =>
      `${nameOf(b.character_id)}: ${words(b.position_in_frame)}, ${words(b.pose)}, gaze ${words(b.gaze)}.`,
  )
  // 앞쪽 배치할 주제 = 인물 수·이름 / 빈 풍경.
  const subjectNames = (s.character_blocking ?? []).map((b) => nameOf(b.character_id))
  const subject = subjectNames.length
    ? `${subjectNames.length} figure${subjectNames.length > 1 ? 's' : ''}: ${subjectNames.join(', ')}`
    : 'empty landscape'

  // 동적 스펙은 "어느 순간을 얼릴지" 가이드로만 — 패널은 정지화.
  const motion = input.safeMode ? undefined : spec.dynamicSpec
  const motionNote = motion
    ? `Freeze the most readable instant of: ${
        (motion.character_motion ?? [])
          .map((m) => `${nameOf(m.character_id)} ${words(m.verb)} (${m.magnitude})`)
          .join(', ') || words(motion.camera_motion?.type ?? '')
      }.`
    : null

  // 곁다듬음: "side_right" 등 값이 " side" 접미사와 겹쳐 "side right side"가 되던 중복 제거.
  const light = s.lighting?.key_direction
    ? ` Lighting: key from the ${words(s.lighting.key_direction)}${
        s.lighting.quality ? `, ${s.lighting.quality}` : ''
      }.`
    : ''

  // 인물(blocking)이 있을 때만 mannequin 규칙 — 비면 ENV_ONLY_RULE 로 교체(빈 풍경에 인형 생성 방지).
  // 무자막: prop 이름을 프롬프트에 넣으면 모델이 그 텍스트를 라벨로 그려 넣음 → 이름 빼고 "단순 도형"으로만.
  const figureBlock = blocking.length
    ? `${MANNEQUIN_RULE} ${blocking.join(' ')} Props as simple lines or geometric shapes.`
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
    `Focal point: ${s.framing?.focal_point || spec.intent?.audience_focus || 'the main action'}.`,
    ``,
    `${PANEL_STYLE_BASE}${light} Wordless panel: no text, letters, captions, or labels anywhere.`,
  ])
}

// fallback action(서사 문장)은 현재 비활성화 — rich가 action을 뺀 것과 parity(klein은 서사문이 약함).
//   코드는 보존: 재활성화하려면 true. 켜면 1차 시도에만 출력(safeMode 재시도엔 모더레이션 회피로 미출력).
const FALLBACK_EMIT_ACTION: boolean = false

/** fallback 경로 — DB shots/scenes 평탄화 필드 근사 (rich 미보유 프로젝트). */
function buildFromDbRow(input: RoughStoryboardPromptInput): string {
  const size = SHOT_SIZE_WORDS[input.shotType] ?? 'medium shot'
  const angle = angleFromPitch(input.cameraPitch).replace(/^an? /, '')
  const lens = input.focalLength ?? 35
  const focus =
    typeof input.aperture === 'number' && input.aperture <= 2.8 ? 'shallow' : 'deep'

  const setting = [input.location, input.timeOfDay].filter(Boolean).join(', ')
  // 앞쪽 배치할 주제 = 인물 수·이름 / 빈 풍경.
  const subject = input.characterNames.length
    ? `${input.characterNames.length} figure${input.characterNames.length > 1 ? 's' : ''}: ${input.characterNames.join(', ')}`
    : 'empty landscape'
  // 인물 있을 때만 mannequin 규칙 — 비면 ENV_ONLY_RULE (모순된 "draw mannequin … No characters" 제거).
  const figureBlock = input.characterNames.length
    ? `${MANNEQUIN_RULE} ${
        input.safeMode ? 'Neutral standing poses, composed naturally.' : 'Place and pose them naturally in frame.'
      } Props as simple lines or geometric shapes.`
    : `${ENV_ONLY_RULE} Key objects as simple lines or geometric shapes.`
  const focal = input.characterNames[0]
    ? `${input.characterNames[0]} and the main action`
    : 'the main action'
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
    // fallback action: FALLBACK_EMIT_ACTION 으로 토글(현재 off). 켜면 1차 시도에만(safeMode 제외) 출력.
    FALLBACK_EMIT_ACTION && !input.safeMode ? `Action: ${input.actionDescription}.` : null,
    setting ? `Setting: ${setting}.${!input.safeMode && input.mood ? ` Mood: ${input.mood}.` : ''}` : '',
    ``,
    figureBlock,
    ``,
    `Focal point: ${focal}.`,
    ``,
    `${PANEL_STYLE_BASE}${light} Wordless panel: no text, letters, captions, or labels anywhere.`,
  ])
}

export function buildRoughStoryboardPrompt(input: RoughStoryboardPromptInput): string {
  if (input.spec?.staticSpec) return buildFromSpec(input, input.spec)
  return buildFromDbRow(input)
}
