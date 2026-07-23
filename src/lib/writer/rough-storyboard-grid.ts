// 러프 스토리보드 그리드(3프레임/샷) 빌더 — writer 탭 previz v2 (#rough-grid 2026-07-22).
//
// v1(klein 단일 패널)의 소형 모델 병목을 우회: LLM 내장 instruction 모델(openai/gpt-image-2/edit)에
// 종이 스토리보드 템플릿(public/rough-storyboard-grid.png, 4열×3행)을 reference 로 주고 12칸을 한 번에
// 채운 뒤, finalize 가 셀을 잘라(shots 당 3프레임) 저장한다.
//   열 = 샷 (한 그리드에 최대 4샷) / 행 = ①START ②DIRECTION(화살표+지시문 — 유일한 텍스트 허용 행) ③END.
//   단일샷 재생성은 1열 스트립 템플릿(public/rough-storyboard-strip.png, 1열×3행)으로 같은 구조.
// 프롬프트는 klein 식 단어나열이 아니라 문장형 지시(GPT Image 2 는 instruction-following).
import {
  SHOT_SIZE_WORDS,
  FRAMING_RULE_WORDS,
  words,
  stripColor,
  angleWords,
  type RoughStoryboardPromptInput,
} from '@/lib/writer/rough-storyboard'

// ── 셀 지오메트리 (finalize crop 이 소비) ─────────────────────────────────────
// 템플릿 실측 비례 좌표(격자선 3px 인셋) — public/rough-storyboard-grid.png 1672×941 기준.
//   2026-07-22 교체: Rough_Storyboard_Template_2(단순판 — 코너 마크·이중 보더 제거, 얇은 단일
//   보더 + 외곽 시트 보더만). 크기·격자 위치는 구판과 거의 동일해 비례 좌표만 수px 재실측.
//   ⚠️ 템플릿 교체 시 재실측 (격자선 dark-ratio 프로파일로 검출).
//   edit 모델 출력이 리샘플돼도 종횡비가 유지되면 비례 좌표는 유효하다.
export const GRID_COLS: ReadonlyArray<readonly [number, number]> = [
  [0.0347, 0.2572],
  [0.2697, 0.4928],
  [0.506, 0.7285],
  [0.7416, 0.9641],
]
export const GRID_ROWS: ReadonlyArray<readonly [number, number]> = [
  [0.0744, 0.3305],
  [0.3549, 0.6132],
  [0.6355, 0.8927],
]
// 스트립 템플릿(488×941, 그리드 1열 크롭 + 좌측 마진 미러) — 열 1개, 행은 grid 와 동일.
export const STRIP_COLS: ReadonlyArray<readonly [number, number]> = [[0.1189, 0.8811]]
export const STRIP_ROWS = GRID_ROWS

export type RoughGridVariant = 'grid4' | 'strip1'
/** variant → (열 수, 셀 좌표). 그리드당 최대 샷 수 = 열 수. */
export function gridGeometry(variant: RoughGridVariant): {
  cols: ReadonlyArray<readonly [number, number]>
  rows: ReadonlyArray<readonly [number, number]>
} {
  return variant === 'grid4'
    ? { cols: GRID_COLS, rows: GRID_ROWS }
    : { cols: STRIP_COLS, rows: STRIP_ROWS }
}
export const GRID_MAX_SHOTS = GRID_COLS.length // 4

/** 템플릿 public 경로 (fal 이 fetch — resolveWebhookBaseUrl 과 조합). */
export const GRID_TEMPLATE_PATH = '/rough-storyboard-grid.png'
export const STRIP_TEMPLATE_PATH = '/rough-storyboard-strip.png'

// ── 셀 서술 (샷 1개 → START/MOTION/END 3문단) ────────────────────────────────

export interface RoughGridCell {
  shotId: string
  start: string
  motion: string
  end: string
}

/** rich(shotDesign)/fallback(DB) 공용 — 기존 RoughStoryboardPromptInput 을 셀 서술로 요약. */
export function buildRoughGridCell(input: RoughStoryboardPromptInput, shotId: string): RoughGridCell {
  const s = input.spec?.staticSpec
  const sizeCode = String(input.shotType || s?.shot_type || 'MS').toUpperCase()
  const size = SHOT_SIZE_WORDS[sizeCode] ?? words(sizeCode) ?? 'medium shot'
  const lens = s?.lens_mm ?? input.focalLength ?? 35
  const angle = angleWords(s?.camera_angle).replace(/^an? /, '')
  const rule = (FRAMING_RULE_WORDS[s?.framing?.rule ?? ''] ?? 'rule of thirds').replace(/^(an?|the) /, '')

  // 인물: 이름 없는 "mannequin figure N" (v1 의 L2 일관성 규칙 유지 — 이름은 모델이 매번 다르게 상상)
  const blocking = s?.character_blocking ?? []
  const figureCount = blocking.length || input.characterNames.length
  const figures = blocking.length
    ? blocking
        .map(
          // 시선은 "머리(얼굴 없음)가 향하는 방향"으로 — gaze 단어는 눈/얼굴을 유발한다(목각 인형 캐논).
          (b, i) =>
            `figure ${i + 1} at ${words(b.position_in_frame) || 'center'}, ${stripColor(words(b.pose)) || 'standing'}, blank head facing ${words(b.gaze) || 'ahead'}`,
        )
        .join('; ')
    : figureCount
      ? `${figureCount} figure${figureCount > 1 ? 's' : ''} placed naturally for the action`
      : ''

  const layers = s?.framing?.layers ?? {}
  const layerLine = [
    layers.foreground ? `fg: ${stripColor(layers.foreground)}` : null,
    layers.midground ? `mg: ${stripColor(layers.midground)}` : null,
    layers.background ? `bg: ${stripColor(layers.background)}` : null,
  ]
    .filter(Boolean)
    .join(' / ')
  const setting = [stripColor(input.location), input.timeOfDay].filter(Boolean).join(', ')
  const focal =
    stripColor(s?.framing?.focal_point) ||
    stripColor(input.spec?.intent?.audience_focus) ||
    'the main action'

  // CU 얼굴 방어(v1 CU_FRONT 교훈): 클로즈업 거리는 "얼굴" prior 가 가장 강한 지점 —
  //   프레임에 잡히는 머리가 '빈 목각 두상'임을 셀 단위로 한 번 더 못박는다.
  const CU_TYPES = new Set(['CU', 'ECU', 'MCU'])
  const cuGuard =
    figureCount > 0 && CU_TYPES.has(sizeCode)
      ? 'the framed head is the blank egg-smooth wooden mannequin head with no face'
      : null

  const startParts = [
    `${size}, ${angle}, ${lens}mm, ${rule}`,
    figures || 'empty landscape, no figures',
    cuGuard,
    layerLine || (setting ? `setting: ${setting}` : null),
    input.actionDescription ? `moment: ${stripColor(input.actionDescription)}` : null,
    `focal point: ${focal}`,
  ].filter(Boolean)

  // MOTION — DIRECTION 행의 화살표·라벨 재료 (camera + character motion).
  const dyn = input.spec?.dynamicSpec
  const cam = dyn?.camera_motion
  const camMove =
    cam && cam.type && cam.type !== 'static'
      ? `camera ${words(cam.type)}${cam.direction && cam.direction !== 'none' ? ` ${words(cam.direction)}` : ''}${cam.speed ? `, ${words(cam.speed)}` : ''}`
      : null
  const charMoves = (dyn?.character_motion ?? [])
    .map((m, i) => `figure ${i + 1}: ${stripColor(words(m.verb))}${m.magnitude ? ` (${m.magnitude})` : ''}`)
    .filter((v) => v.trim().length > 0)
  const gazeMoves = (dyn?.gaze_arc ?? [])
    .filter((g) => g.from !== g.to)
    .map((g) => `blank head turns ${words(g.from)} → ${words(g.to)}`)
  const motionParts = [camMove, ...charMoves, ...gazeMoves].filter(Boolean) as string[]
  // 샷 길이(초) 상속(#rough-grid duration, 2026-07-22): START↔END 변화량의 기준 —
  //   없으면 모델이 미세한 변화만 그리는 경향(실측). rich(intent) 우선, DB 폴백.
  const dur = input.spec?.intent?.duration_seconds ?? input.durationSeconds ?? null
  const durNote = typeof dur === 'number' && dur > 0 ? `${Math.round(dur)}` : null
  const motion = motionParts.length
    ? `${durNote ? `over this shot's full ${durNote}-second duration: ` : ''}${motionParts.join('; ')}`
    : 'static hold — no camera or figure movement'

  const end = motionParts.length
    ? `the same shot after ${durNote ? `the full ${durNote} seconds of` : ''} the movement completes — ${motionParts.join('; ')} has fully finished. END must be clearly and visibly different from START: show how far ${durNote ? `${durNote} seconds` : 'the shot'} of this movement actually carries the figures and camera (changed poses, positions and framing), not a subtle variation`
    : 'nearly identical to START (static shot) — only a subtle natural settling'

  return { shotId, start: startParts.join('. '), motion, end }
}

// ── 그리드 프롬프트 ──────────────────────────────────────────────────────────

// 그림체 통일 + 목각 인형 강제(2026-07-22 피드백): "artist mannequin"(해석 여지)→ 고전 볼조인트
//   목각 데생 인형으로 캐논 고정 — 시각적으로 결정적인 앵커라 그리드 간 스타일 편차도 줄인다.
//   시선(gaze)은 얼굴이 없으므로 "머리가 향하는 방향"으로만 — 셀 빌더의 문구와 짝(head facing/turns).
const GRID_STYLE = `Global style for every panel: loose rough monochrome pencil previz sketch, strictly black-and-white grayscale, quick gestural lines, light gray shading, ample white space, unfinished rough-board feel. Draw the entire sheet in the exact same hand — same line weight, same hatching and shading technique in every panel, as if one artist drew everything in one sitting.

Every human figure — in every panel, every column, every frame — is the same classic wooden artist's drawing mannequin: a ball-jointed wooden pose doll with segmented limbs, visible sphere joints, mitten-like hands without fingers, and a completely smooth egg-shaped wooden head. The head is entirely blank — absolutely no face, no eyes, no nose, no mouth, no hair, no expression. No clothing. All figures are this one identical wooden mannequin; only pose, position and scale differ. Where a figure is looking is shown ONLY by the direction its blank head points. Props and objects as simple lines and geometric shapes. No color anywhere.`

/**
 * 템플릿 12칸(또는 스트립 3칸)을 채우는 edit 지시문.
 *   cells.length ≤ 열 수. 남는 열은 빈 종이로 두라고 명시.
 */
export function buildRoughGridPrompt(cells: RoughGridCell[], variant: RoughGridVariant): string {
  const colCount = variant === 'grid4' ? GRID_COLS.length : 1
  const head =
    variant === 'grid4'
      ? `The reference image is a paper storyboard sheet with 12 empty panels in a 4-column × 3-row grid. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels, never across panel borders.

Each COLUMN is one shot of a film, read top to bottom as three frames:
- Row 1 (top) = START: the composition at the beginning of the shot.
- Row 2 (middle) = DIRECTION: an EXACT identical copy of Row 1 — trace the very same drawing with the same poses, positions, framing and props, frozen at the same instant. Do NOT advance the motion; do NOT draw an in-between moment; nothing in the scene may change from Row 1. Then overlay bold hand-drawn direction arrows for the camera and figure movement described below, with short handwritten English labels (e.g. "DOLLY IN", "PAN →", "TURNS"). The ONLY difference between Row 1 and Row 2 is the arrows and labels drawn on top. Row 2 is the ONLY place where text is allowed.
- Row 3 (bottom) = END: the composition at the end of the shot, after the movement completes. Row 3 is the only frame where the motion has visibly progressed — and when a shot has movement, its END must differ clearly and unmistakably from its START (full extent of the motion over the shot's stated duration), never a barely-changed copy.`
      : `The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: an EXACT identical copy of Panel 1 — trace the very same drawing with the same poses, positions, framing and props, frozen at the same instant. Do NOT advance the motion; do NOT draw an in-between moment; nothing in the scene may change from Panel 1. Then overlay bold hand-drawn direction arrows for the camera and figure movement described below, with short handwritten English labels (e.g. "DOLLY IN", "PAN →", "TURNS"). The ONLY difference between Panel 1 and Panel 2 is the arrows and labels drawn on top. Panel 2 is the ONLY place where text is allowed.
- Panel 3 (bottom) = END: the composition at the end of the shot, after the movement completes. Panel 3 is the only frame where the motion has visibly progressed — and when the shot has movement, END must differ clearly and unmistakably from START (full extent of the motion over the shot's stated duration), never a barely-changed copy.`

  const body = cells
    .map((c, i) => {
      const label = variant === 'grid4' ? `Column ${i + 1}` : 'The shot'
      return `${label}:
- START: ${c.start}.
- MOVEMENT to annotate with arrows in the DIRECTION frame: ${c.motion}.
- END: ${c.end}.`
    })
    .join('\n\n')

  const empties =
    variant === 'grid4' && cells.length < colCount
      ? `\n\nColumns ${cells.length + 1}–${colCount} have no shot: leave those panels completely empty blank paper.`
      : ''

  return `${head}

${GRID_STYLE}

${body}${empties}

Within each column, the three frames depict the SAME camera setup, location, figures and props — continuity between START, DIRECTION and END must be obvious. START and DIRECTION are the same frozen instant (annotations are the only difference); motion progresses ONLY in END. Different columns are different shots and may differ. No text, captions or labels anywhere except the DIRECTION row's arrow labels.`
}
