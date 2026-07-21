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
//   ⚠️ 템플릿 교체 시 재실측 (dev/Rough_Storyboard_Template 분석 스크립트로 격자 검출).
//   edit 모델 출력이 리샘플돼도 종횡비가 유지되면 비례 좌표는 유효하다.
export const GRID_COLS: ReadonlyArray<readonly [number, number]> = [
  [0.0377, 0.259],
  [0.2715, 0.4928],
  [0.506, 0.7273],
  [0.7404, 0.9617],
]
export const GRID_ROWS: ReadonlyArray<readonly [number, number]> = [
  [0.0744, 0.3316],
  [0.3549, 0.6121],
  [0.6355, 0.8927],
]
// 스트립 템플릿(420×941) — 열 1개, 행은 grid 와 동일.
export const STRIP_COLS: ReadonlyArray<readonly [number, number]> = [[0.0595, 0.9405]]
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
          (b, i) =>
            `figure ${i + 1} at ${words(b.position_in_frame) || 'center'}, ${stripColor(words(b.pose)) || 'standing'}, gaze ${words(b.gaze) || 'ahead'}`,
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

  const startParts = [
    `${size}, ${angle}, ${lens}mm, ${rule}`,
    figures || 'empty landscape, no figures',
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
    .map((g) => `gaze ${words(g.from)} → ${words(g.to)}`)
  const motionParts = [camMove, ...charMoves, ...gazeMoves].filter(Boolean) as string[]
  const motion = motionParts.length ? motionParts.join('; ') : 'static hold — no camera or figure movement'

  const end = motionParts.length
    ? `the same shot after the motion completes — ${motionParts.join('; ')} has finished; show the resulting poses, positions and framing`
    : 'nearly identical to START (static shot) — only a subtle natural settling'

  return { shotId, start: startParts.join('. '), motion, end }
}

// ── 그리드 프롬프트 ──────────────────────────────────────────────────────────

const GRID_STYLE = `Global style for every panel: loose rough monochrome pencil previz sketch, strictly black-and-white grayscale, quick gestural lines, light gray shading, ample white space, unfinished rough-board feel. Every human figure is the same identical blank artist mannequin — matte gray, smooth egg-like featureless oval head with no face, bare simple doll body; only pose and position differ between figures. Props and objects as simple lines and geometric shapes. No color anywhere.`

/**
 * 템플릿 12칸(또는 스트립 3칸)을 채우는 edit 지시문.
 *   cells.length ≤ 열 수. 남는 열은 빈 종이로 두라고 명시.
 */
export function buildRoughGridPrompt(cells: RoughGridCell[], variant: RoughGridVariant): string {
  const colCount = variant === 'grid4' ? GRID_COLS.length : 1
  const head =
    variant === 'grid4'
      ? `The reference image is a paper storyboard sheet with 12 empty panels in a 4-column × 3-row grid. Keep the sheet, panel borders, margins and corner marks exactly as they are — draw only INSIDE the panels, never across panel borders.

Each COLUMN is one shot of a film, read top to bottom as three frames:
- Row 1 (top) = START: the composition at the beginning of the shot.
- Row 2 (middle) = DIRECTION: redraw the exact same drawing as Row 1, then overlay bold hand-drawn direction arrows for the camera and figure movement described below, with short handwritten English labels (e.g. "DOLLY IN", "PAN →", "TURNS"). Row 2 is the ONLY place where text is allowed.
- Row 3 (bottom) = END: the composition at the end of the shot, after the movement completes.`
      : `The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and corner marks exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: redraw the exact same drawing as Panel 1, then overlay bold hand-drawn direction arrows for the camera and figure movement described below, with short handwritten English labels (e.g. "DOLLY IN", "PAN →", "TURNS"). Panel 2 is the ONLY place where text is allowed.
- Panel 3 (bottom) = END: the composition at the end of the shot, after the movement completes.`

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

Within each column, the three frames depict the SAME camera setup, location, figures and props — continuity between START, DIRECTION and END must be obvious. Different columns are different shots and may differ. No text, captions or labels anywhere except the DIRECTION row's arrow labels.`
}
