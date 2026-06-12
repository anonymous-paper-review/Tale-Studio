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
}

const PANEL_HEADER = `Create a single rough storyboard panel for film previsualization, drawn FROM THE CAMERA'S POINT OF VIEW — what the lens sees on screen. This is NOT an overhead map.`

const PANEL_STYLE_BASE = `Style: loose, rough, monochrome pencil-sketch storyboard — quick gestural lines, gray shading for depth and mood, plenty of negative space. A rough board, not a finished illustration.`

const MANNEQUIN_RULE = `Figures: draw every character as a featureless wooden mannequin / rough stick figure — no face, no identity — keeping only pose, gesture, and position in frame.`

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

  const layers = s.framing?.layers ?? {}
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
  const motion = spec.dynamicSpec
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

  return joinPanel([
    PANEL_HEADER,
    ``,
    `Frame: one ${aspect} storyboard panel with a thin rectangular border. This is a ${size} from ${angleWords(s.camera_angle)}, ${lens}mm-lens feel, ${dof} focus. Compose using ${rule}.`,
    ``,
    layerLines.length ? `Composition (camera POV, three depth layers):` : null,
    ...layerLines,
    ``,
    `Action this panel captures: ${input.actionDescription}${
      spec.intent?.dramatic_purpose && spec.intent.dramatic_purpose !== input.actionDescription
        ? ` (dramatic purpose: ${spec.intent.dramatic_purpose})`
        : ''
    }`,
    motionNote,
    ``,
    `${MANNEQUIN_RULE}${blocking.length ? ` ${blocking.join(' ')}` : ''} Represent any held prop or key object as a simple line or geometric shape${
      props.length ? `, labeled with a single word if useful: ${props.join(', ')}` : ''
    }.`,
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
  const figures = input.characterNames.length
    ? `${input.characterNames.length} figure(s): ${input.characterNames.join(', ')} — place and pose them according to the action above.`
    : 'No characters — environment only.'
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
    `Action in frame (midground focus): ${input.actionDescription}`,
    setting ? `Setting (background): ${setting}.${input.mood ? ` Mood: ${input.mood}.` : ''}` : '',
    ``,
    `${MANNEQUIN_RULE} ${figures} Represent any held prop or key object as a simple line or geometric shape.`,
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
