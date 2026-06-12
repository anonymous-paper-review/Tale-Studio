// 러프 스토리보드(pre-concept previz) 프롬프트 빌더 — writer 탭.
//
// 컨셉 아트 이전에 샷의 연출(구도·포즈·배치)만 확인하는 패널:
// 인물은 전부 목각 인형/스틱 피겨, 흑백 연필 스케치, 카메라 POV 고정.
// LLM 경유 없이 DB shots/scenes 필드를 템플릿에 기계 치환한다 (호출당 LLM 비용 0).
// 템플릿 원본: 사용자 제공 previz 프롬프트 (2026-06-12).

/** ShotType 코드 → 프롬프트용 영문 샷 사이즈 (src/types/shot.ts ShotType과 1:1). */
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
}

export interface RoughStoryboardPromptInput {
  shotType: string
  actionDescription: string
  /** 표시용 캐릭터 이름 (characters.name — id 아님) */
  characterNames: string[]
  location?: string | null
  timeOfDay?: string | null
  mood?: string | null
  /** camera_config.pan = pitch(상하 회전, -10~+10) → high/low angle 유도 */
  cameraPitch?: number | null
  focalLength?: number | null
  aperture?: number | null
  /** lighting_config.position: 'left' | 'top' | 'right' | 'front' */
  lightPosition?: string | null
  aspectRatio?: string
}

/** camera pitch(-10~+10)를 스토리보드 앵글 단어로 — 셋 중 하나만 (과해석 금지). */
function angleWord(pitch: number | null | undefined): string {
  if (typeof pitch !== 'number') return 'eye-level angle'
  if (pitch >= 3) return 'low angle (camera looking up)'
  if (pitch <= -3) return 'high angle (camera looking down)'
  return 'eye-level angle'
}

export function buildRoughStoryboardPrompt(input: RoughStoryboardPromptInput): string {
  const size = SHOT_SIZE_WORDS[input.shotType] ?? 'medium shot'
  const angle = angleWord(input.cameraPitch)
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

  return [
    `Create a single rough storyboard panel for film previsualization, drawn FROM THE CAMERA'S POINT OF VIEW — what the lens sees on screen. This is NOT an overhead map.`,
    ``,
    `Frame: one ${aspect} storyboard panel with a thin rectangular border. This is a ${size} from an ${angle}, ${lens}mm-lens feel, ${focus} focus. Compose using the rule of thirds.`,
    ``,
    `Action in frame (midground focus): ${input.actionDescription}`,
    setting ? `Setting (background): ${setting}.${input.mood ? ` Mood: ${input.mood}.` : ''}` : '',
    ``,
    `Figures: draw every character as a featureless wooden mannequin / rough stick figure — no face, no identity — keeping only pose, gesture, and position in frame. ${figures} Represent any held prop or key object as a simple line or geometric shape.`,
    ``,
    `Focal point: ${focal} — lead the eye there.`,
    ``,
    `Style: loose, rough, monochrome pencil-sketch storyboard — quick gestural lines, gray shading for depth and mood, plenty of negative space. A rough board, not a finished illustration.${light} Do not write any story text, captions, or labels inside the panel.`,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')
}
