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

const PANEL_HEADER = `Create a single rough storyboard panel for film previsualization, drawn FROM THE CAMERA'S POINT OF VIEW — what the lens sees on screen. This is NOT an overhead map.`

const PANEL_STYLE_BASE = `Style: loose, rough, monochrome pencil-sketch storyboard — quick gestural lines, gray shading for depth and mood, plenty of negative space. A rough board, not a finished illustration.`

const MANNEQUIN_RULE = `Figures: draw every character as a featureless wooden mannequin / rough stick figure — no face, no identity — keeping only pose, gesture, and position in frame.`

// 인물 0인 샷(설정/환경샷) 전용 — MANNEQUIN_RULE(목각 인형 그리기 명령) 대신 사용.
//   모델(fal flux-2 klein)은 text-encoder 확산이라 부정문("no people") 해석이 약하다 → 긍정문을 앞세워
//   "빈 풍경만 그려라"를 직설적으로 지시하고, 인물 명령 토큰(mannequin/stick figure)을 아예 뺀다.
//   (이전 버그: 인물·blocking이 비어도 MANNEQUIN_RULE이 무조건 들어가 빈 풍경에 인형이 생성됨.)
const ENV_ONLY_RULE = `Environment-only shot: draw the empty landscape and setting described above — terrain, sky, structures, and objects, with no people or figures in the frame.`

function joinPanel(lines: Array<string | null | undefined>): string {
  return lines
    .filter((l): l is string => typeof l === 'string')
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')
}

/** rich 경로 — L4 static_spec 이 템플릿 슬롯과 1:1 이므로 원본 facet 을 그대로 치환. */
function buildFromSpec(input: RoughStoryboardPromptInput, spec: RoughStoryboardSpec): string {
  const s = spec.staticSpec
  const aspect = input.aspectRatio ?? '16:9'
  const sizeCode = String(s.shot_type ?? '').toUpperCase()
  const size = SHOT_SIZE_WORDS[sizeCode] ?? (words(s.shot_type) || 'medium shot')
  const lens = s.lens_mm || input.focalLength || 35
  const dof = s.depth_of_field ?? 'deep'
  const rule = FRAMING_RULE_WORDS[s.framing?.rule ?? ''] ?? 'the rule of thirds'

  // safe mode: 서사 동사·감정어가 실리는 구도 레이어/액션문/모션을 제외 (모더레이션 우회)
  const layers = input.safeMode ? {} : (s.framing?.layers ?? {})
  const layerLines = [
    layers.foreground ? `- Foreground: ${layers.foreground}.` : null,
    layers.midground ? `- Midground: ${layers.midground}.` : null,
    layers.background ? `- Background: ${layers.background}.` : null,
  ].filter(Boolean) as string[]

  const nameOf = (id: string) => input.characterNameById?.get(id) ?? id
  const blocking = (s.character_blocking ?? []).map(
    (b) =>
      `${nameOf(b.character_id)}: ${words(b.position_in_frame)}, ${words(b.pose)}, gaze ${words(b.gaze)}.`,
  )
  const props = (s.prop_placement ?? []).map(
    (p) => `${p.prop} (${words(p.position_in_frame)})`,
  )

  // 동적 스펙은 "어느 순간을 얼릴지" 가이드로만 — 패널은 정지화.
  const motion = input.safeMode ? undefined : spec.dynamicSpec
  const motionNote = motion
    ? `Freeze the most readable instant of: ${
        (motion.character_motion ?? [])
          .map((m) => `${nameOf(m.character_id)} ${words(m.verb)} (${m.magnitude})`)
          .join(', ') || words(motion.camera_motion?.type ?? '')
      }.`
    : null

  const light = s.lighting?.key_direction
    ? ` Keep light and shadow weighted toward the ${words(s.lighting.key_direction)} side${
        s.lighting.quality ? ` (${s.lighting.quality} light)` : ''
      }.`
    : ''

  // 인물(blocking)이 있을 때만 mannequin 규칙 — 비면 ENV_ONLY_RULE 로 교체(빈 풍경에 인형 생성 방지).
  const figureBlock = blocking.length
    ? `${MANNEQUIN_RULE} ${blocking.join(' ')} Represent any held prop or key object as a simple line or geometric shape${
        props.length ? `, labeled with a single word if useful: ${props.join(', ')}` : ''
      }.`
    : `${ENV_ONLY_RULE}${
        props.length
          ? ` Show any key objects as simple lines or geometric shapes, labeled with a single word if useful: ${props.join(', ')}.`
          : ''
      }`

  return joinPanel([
    PANEL_HEADER,
    ``,
    `Frame: one ${aspect} storyboard panel with a thin rectangular border. This is a ${size} from ${angleWords(s.camera_angle)}, ${lens}mm-lens feel, ${dof} focus. Compose using ${rule}.`,
    ``,
    layerLines.length ? `Composition (camera POV, three depth layers):` : null,
    ...layerLines,
    ``,
    input.safeMode
      ? `Neutral staging panel — place the figures exactly as specified below; no dramatic action.`
      : `Action this panel captures: ${input.actionDescription}${
          spec.intent?.dramatic_purpose && spec.intent.dramatic_purpose !== input.actionDescription
            ? ` (dramatic purpose: ${spec.intent.dramatic_purpose})`
            : ''
        }`,
    motionNote,
    ``,
    figureBlock,
    ``,
    `Focal point: ${s.framing?.focal_point || spec.intent?.audience_focus || 'the main action'} — lead the eye there.`,
    ``,
    `${PANEL_STYLE_BASE}${light} Do not write any story text or captions inside the panel.`,
  ])
}

/** fallback 경로 — DB shots/scenes 평탄화 필드 근사 (rich 미보유 프로젝트). */
function buildFromDbRow(input: RoughStoryboardPromptInput): string {
  const size = SHOT_SIZE_WORDS[input.shotType] ?? 'medium shot'
  const angle = angleFromPitch(input.cameraPitch)
  const lens = input.focalLength ?? 35
  const focus =
    typeof input.aperture === 'number' && input.aperture <= 2.8 ? 'shallow' : 'deep'
  const aspect = input.aspectRatio ?? '16:9'

  const setting = [input.location, input.timeOfDay].filter(Boolean).join(', ')
  // 인물 있을 때만 mannequin 규칙 — 비면 ENV_ONLY_RULE (모순된 "draw mannequin … No characters" 제거).
  const figureBlock = input.characterNames.length
    ? `${MANNEQUIN_RULE} ${input.characterNames.length} figure(s): ${input.characterNames.join(', ')} — ${
        input.safeMode
          ? 'neutral standing poses, composed naturally in the frame.'
          : 'place and pose them according to the action above.'
      } Represent any held prop or key object as a simple line or geometric shape.`
    : `${ENV_ONLY_RULE} Show any key objects as simple lines or geometric shapes.`
  const focal = input.characterNames[0]
    ? `${input.characterNames[0]} and the main action`
    : 'the main action'
  const light =
    input.lightPosition && input.lightPosition !== 'front'
      ? ` Keep light and shadow weighted toward the ${input.lightPosition} side.`
      : ''

  return joinPanel([
    PANEL_HEADER,
    ``,
    `Frame: one ${aspect} storyboard panel with a thin rectangular border. This is a ${size} from ${angle}, ${lens}mm-lens feel, ${focus} focus. Compose using the rule of thirds.`,
    ``,
    input.safeMode
      ? `Neutral staging panel — no dramatic action.`
      : `Action in frame (midground focus): ${input.actionDescription}`,
    setting
      ? `Setting (background): ${setting}.${!input.safeMode && input.mood ? ` Mood: ${input.mood}.` : ''}`
      : '',
    ``,
    figureBlock,
    ``,
    `Focal point: ${focal} — lead the eye there.`,
    ``,
    `${PANEL_STYLE_BASE}${light} Do not write any story text, captions, or labels inside the panel.`,
  ])
}

export function buildRoughStoryboardPrompt(input: RoughStoryboardPromptInput): string {
  if (input.spec?.staticSpec) return buildFromSpec(input, input.spec)
  return buildFromDbRow(input)
}
