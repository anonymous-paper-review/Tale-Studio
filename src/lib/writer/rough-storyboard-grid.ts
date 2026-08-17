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
import type { ProjectFormat } from '@/types/project'

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
/** variant → (열 수, 셀 좌표). 그리드당 최대 샷 수 = 열 수. 레거시(horizontal) 좌표 전용 별칭. */
export function gridGeometry(variant: RoughGridVariant): {
  cols: ReadonlyArray<readonly [number, number]>
  rows: ReadonlyArray<readonly [number, number]>
} {
  return variant === 'grid4'
    ? { cols: GRID_COLS, rows: GRID_ROWS }
    : { cols: STRIP_COLS, rows: STRIP_ROWS }
}
export const GRID_MAX_SHOTS = GRID_COLS.length // 4

/** 템플릿 public 경로 (fal 이 fetch — template-asset 이 스토리지로 승격). */
export const GRID_TEMPLATE_PATH = '/rough-storyboard-grid.png'
export const STRIP_TEMPLATE_PATH = '/rough-storyboard-strip.png'

// ── 포맷별 시트 스펙 (#sheet-formats 2026-08-17, 2차 개정: 오너 육안 피드백 반영) ──
// 4포맷 전부(horizontal 포함) 셀이 포맷 종횡비를 **정확히** 갖는 전용 템플릿.
// 신규 템플릿 PNG 는 이 스펙에서 **그려서 생성**한다(tests/rough-template-assets.test.ts 의
// 게이트 생성기 — 레거시 시트에서 추출한 종이 질감 + 스펙 좌표 보더) — 좌표와 그림의 진실이
// 이 표 하나라서 "템플릿 교체 시 재실측" 함정이 없고, 같은 테스트가 커밋된 PNG 치수를 스펙과
// 대조해 드리프트를 CI 에서 잡는다. 레거시 실측 좌표·구 템플릿은 포맷 미상(null) 구 프로젝트와
// 구 잡 크롭 호환 전용으로 강등 — 파일은 유지한다.
//
// 수치 원리(2차 실측·스키마 기반):
//   ① 셀 AR = 포맷 정확값. 레거시 16:9 시트의 셀은 실측 1.544(-13.2%)로 처음부터 부정확했다 —
//     4×3 셀을 시트 AR 에 욱여넣은 기하적 필연. 데드밴드 없는 캔버스 AR ≈ (열수/행수)×셀AR.
//   ② gpt-image-2/edit 공식 스키마: 16배수 / 최대 변 3840 / AR ≤3:1 / 총 0.66~8.29MP.
//     캔버스는 전부 이 안에서 현행 화소대(±20%)를 유지하며 셀 면적을 레거시 이상으로 보존.
//   ③ 세로(9:16) 스트립만 frameAxis 'cols' — 적층이면 좌우 여백 극단(≈370px)이라 가로 3열
//     (좌→우 = START/DIRECTION/END)로 셀을 키운다(474×842).

export interface SheetSpec {
  /** 템플릿 치수 = 생성 캔버스. 전부 16배수 — gpt-image-2/edit 공식 스키마(최대 변 3840·AR≤3:1·0.66~8.29MP). */
  canvas: { width: number; height: number }
  /** 셀 박스 [x0,x1] px (2px 보더 포함). 비례 좌표·생성기가 모두 여기서 파생. */
  colBoxes: ReadonlyArray<readonly [number, number]>
  rowBoxes: ReadonlyArray<readonly [number, number]>
  /** START/DIRECTION/END 프레임이 놓이는 축 — 그리드·적층 스트립 'rows', 가로 스트립 'cols'. */
  frameAxis: 'rows' | 'cols'
  templatePath: string
}

const boxes = (start: number, size: number, n: number, gap = 20): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [start + i * (size + gap), start + i * (size + gap) + size])

const SHEET_SPECS: Partial<Record<`${ProjectFormat}:${RoughGridVariant}`, SheetSpec>> = {
  // 16:9 — 셀 400×225(정확 1.778, 면적 90k ≈ 레거시 372×241 의 89.7k 보존)
  'horizontal_16:9:grid4': {
    canvas: { width: 1728, height: 768 },
    colBoxes: boxes(34, 400, 4),
    rowBoxes: boxes(26, 225, 3),
    frameAxis: 'rows',
    templatePath: '/rough-storyboard-grid-horizontal.png',
  },
  'horizontal_16:9:strip1': {
    canvas: { width: 1024, height: 1712 },
    colBoxes: boxes(36, 952, 1),
    rowBoxes: boxes(32, 536, 3),
    frameAxis: 'rows',
    templatePath: '/rough-storyboard-strip-horizontal.png',
  },
  // 9:16 — 셀 255×453(정확 0.563). 캔버스 3:4 = 콘텐츠 AR 정합(1차 1024×1536 의 상하 154px
  //   데드밴드가 오너 육안 지적의 절반이었다 — 나머지 절반은 9:16 이 원래 그만큼 길쭉하다는 것)
  'vertical_9:16:grid4': {
    canvas: { width: 1152, height: 1536 },
    colBoxes: boxes(36, 255, 4),
    rowBoxes: boxes(68, 453, 3),
    frameAxis: 'rows',
    templatePath: '/rough-storyboard-grid-vertical.png',
  },
  'vertical_9:16:strip1': {
    canvas: { width: 1536, height: 896 },
    colBoxes: boxes(37, 474, 3),
    rowBoxes: boxes(27, 842, 1),
    frameAxis: 'cols',
    templatePath: '/rough-storyboard-strip-vertical.png',
  },
  'square_1:1:grid4': {
    canvas: { width: 1344, height: 1024 },
    colBoxes: boxes(36, 303, 4),
    rowBoxes: boxes(37, 303, 3),
    frameAxis: 'rows',
    templatePath: '/rough-storyboard-grid-square.png',
  },
  'square_1:1:strip1': {
    canvas: { width: 640, height: 1792 },
    colBoxes: boxes(36, 568, 1),
    rowBoxes: boxes(24, 568, 3),
    frameAxis: 'rows',
    templatePath: '/rough-storyboard-strip-square.png',
  },
  'cinema_2.39:1:grid4': {
    canvas: { width: 1920, height: 704 },
    colBoxes: boxes(36, 447, 4),
    rowBoxes: boxes(51, 187, 3),
    frameAxis: 'rows',
    templatePath: '/rough-storyboard-grid-cinema.png',
  },
  'cinema_2.39:1:strip1': {
    canvas: { width: 1024, height: 1296 },
    colBoxes: boxes(36, 952, 1),
    rowBoxes: boxes(31, 398, 3),
    frameAxis: 'rows',
    templatePath: '/rough-storyboard-strip-cinema.png',
  },
}

export interface SheetGeometry {
  /** 비례 셀 좌표(보더 3px 인셋 — 레거시 관행과 동일). 크롭·레퍼런스 합성 공용. */
  cols: ReadonlyArray<readonly [number, number]>
  rows: ReadonlyArray<readonly [number, number]>
  frameAxis: 'rows' | 'cols'
  templatePath: string
  /** 러프 생성 캔버스 'WxH'. null = 레거시 — 'auto'(템플릿 비율 추종, 검증된 종전 동작) 유지. */
  roughImageSize: string | null
  /** 실사 리페인트 캔버스 'WxH' (#fal-canvas — 레거시는 실측 확정값). */
  repaintCanvas: string
}

const CELL_INSET_FRAC = 3 // 격자선 인셋 px — 레거시 실측 좌표와 같은 규약

export function sheetSpecOf(
  variant: RoughGridVariant,
  format: ProjectFormat | null,
): SheetSpec | null {
  // null(포맷 미상 구 프로젝트)만 레거시 — horizontal 포함 4포맷 전부 스펙 시트를 쓴다(2차 개정).
  if (!format) return null
  return SHEET_SPECS[`${format}:${variant}`] ?? null
}

export function sheetGeometry(
  variant: RoughGridVariant,
  format: ProjectFormat | null,
): SheetGeometry {
  const spec = sheetSpecOf(variant, format)
  if (!spec) {
    // 레거시(포맷 미상 null 전용 — 2차 개정으로 horizontal 도 스펙 시트로 이동):
    //   실측 비례 좌표 + 기존 템플릿. 리페인트 캔버스는 #fal-canvas 확정값.
    return variant === 'grid4'
      ? {
          cols: GRID_COLS,
          rows: GRID_ROWS,
          frameAxis: 'rows',
          templatePath: GRID_TEMPLATE_PATH,
          roughImageSize: null,
          repaintCanvas: '1536x1024',
        }
      : {
          cols: STRIP_COLS,
          rows: STRIP_ROWS,
          frameAxis: 'rows',
          templatePath: STRIP_TEMPLATE_PATH,
          roughImageSize: null,
          repaintCanvas: '1024x1536',
        }
  }
  const { width, height } = spec.canvas
  const canvasStr = `${width}x${height}`
  return {
    cols: spec.colBoxes.map(([a, b]) => [(a + CELL_INSET_FRAC) / width, (b - CELL_INSET_FRAC) / width] as const),
    rows: spec.rowBoxes.map(([a, b]) => [(a + CELL_INSET_FRAC) / height, (b - CELL_INSET_FRAC) / height] as const),
    frameAxis: spec.frameAxis,
    templatePath: spec.templatePath,
    roughImageSize: canvasStr,
    repaintCanvas: canvasStr,
  }
}

// ── 셀 서술 (샷 1개 → START/MOTION/END 3문단) ────────────────────────────────

export interface RoughGridCell {
  shotId: string
  start: string
  motion: string
  end: string
}

// ── previz 정보 강화(#previz-enrich 2026-08-07 ①+③ — lab/viz-gap previz A/B 로 검증 후 이관) ──
// previz↔viz 갭의 뿌리는 러프가 조명·초점·색 의도를 안 실어 viz 리페인트가 붙잡을 앵커가 없던 것.
// ③ 스케치 자체에 빛(방향성 해칭)·초점(디테일 밀도)을 그리게 하고,
// ① DIRECTION 행(유일한 텍스트 허용 행)에 손글씨 기술 라벨(KEY/카메라/FOCUS/색온도)을 얹는다.
//   색온도는 흑백 previz 에 그림으로 못 실리므로 라벨이 유일한 운반 통로.
// rich(staticSpec) 경로 전용 — fallback(DB) 은 재료가 없어 기존 그대로(실험과 동일 스코프).

// key_direction → 그림자가 떨어지는 반대 방향(해칭 지시용)
const SHADOW_OPPOSITE: Record<string, string> = {
  left: 'the right', right: 'the left', top: 'below', bottom: 'above',
  front: 'backward', back: 'forward',
  top_left: 'the lower-right', top_right: 'the lower-left',
  bottom_left: 'the upper-right', bottom_right: 'the upper-left',
  side_left: 'the right', side_right: 'the left',
  top_down: 'outward', overhead: 'outward', backlight: 'toward camera',
}
function shadowTarget(dir: string): string {
  return SHADOW_OPPOSITE[dir.toLowerCase().trim().replace(/\s+/g, '_')] ?? 'the opposite side'
}
function colorTempWord(kelvin: unknown): string | null {
  if (typeof kelvin !== 'number' || !Number.isFinite(kelvin)) return null
  return kelvin < 4000 ? 'WARM' : kelvin <= 5500 ? 'NEUTRAL' : 'COOL'
}
function clipText(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
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
      // #split-spec: blocking 없는(스펙 미보유 — 분할 자식 등) 셀은 서술이 빈약해 이웃 셀의
      //   인물(추적자 등)이 스며들기 쉽다 — 인원수를 못박고 추가 인물을 명시적으로 금지.
      ? `exactly ${figureCount} figure${figureCount > 1 ? 's' : ''} placed naturally for the action — do not draw any other people in this panel`
      : ''

  const layers = s?.framing?.layers ?? {}
  const layerLine = [
    layers.foreground ? `fg: ${stripColor(layers.foreground)}` : null,
    layers.midground ? `mg: ${stripColor(layers.midground)}` : null,
    layers.background ? `bg: ${stripColor(layers.background)}` : null,
  ]
    .filter(Boolean)
    .join(' / ')

  // #figure-dedup(2026-08-10, 실측 e1a9fd08 sh_03_17): blocking 은 "figure 1"(익명 목각)로,
  //   레이어는 같은 대상을 "갑옷 추적자들"로 따로 서술 → 모델이 별개 존재로 해석해 맨몸 인형
  //   1 + 무리를 이중으로 그렸다(맨몸 인형이 주인공으로 읽힘). 두 서술이 같은 대상임을 못박고,
  //   moment 에만 언급되는 인물(예: "캐릭터를 향해")은 화면 밖임을 명시한다.
  const figureGuard =
    blocking.length && layerLine
      ? 'the numbered figure(s) above and any people described in the fg/mg/bg layers are the SAME subjects — draw each subject only once (no plain duplicate mannequin alongside them); anyone mentioned in the moment but not listed as a figure here is OFF-SCREEN, do not draw them'
      : blocking.length
        ? 'anyone mentioned in the moment but not listed as a figure here is OFF-SCREEN, do not draw them'
        : null
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

  // ③ 스케치에 그릴 빛·초점(#previz-enrich) — 연필 해칭 = 그림자 방향, 디테일 밀도 = 초점/심도.
  //   START 와 END 양쪽에 동일 적용(같은 조명 셋업) — viz 리페인트가 이 음영을 앵커로 보존한다.
  const L = s?.lighting
  const dof = s?.depth_of_field
  const drawParts: string[] = []
  if (L?.key_direction) {
    drawParts.push(
      `lit from ${words(L.key_direction)} — shade figures and ground with directional pencil hatching, cast shadows toward ${shadowTarget(L.key_direction)}${L.quality ? `, ${L.quality === 'hard' ? 'crisp hard-edged' : 'soft feathered'} shadow edges` : ''}`,
    )
  }
  if (s?.framing?.focal_point) {
    drawParts.push(
      `draw ${clipText(focal, 60)} with the densest, sharpest line detail as the focal point${dof === 'shallow' ? '; keep the background loosely and vaguely indicated (shallow focus)' : dof === 'deep' ? '; keep foreground to background evenly detailed (deep focus)' : ''}`,
    )
  }
  const drawLine = drawParts.length
    ? `lighting and focus (draw these into the sketch): ${drawParts.join('; ')}`
    : null

  // 비-rich 엔진(writer-v2)의 샷별 연출 주입 (#v2-cell-dedup): rich spec 이 없으면 셀 입력이
  //   유닛 공통값뿐이라 같은 유닛의 샷들이 문자 그대로 동일한 셀 서술이 되고, 모델은 같은
  //   그림을 그린다. 구도·동선은 START 서술에, 카메라 무브는 MOTION 기본값에 반영한다.
  const pvz = !s && input.previzDirection ? input.previzDirection : null
  const pvzStartLine = pvz
    ? [
        pvz.composition ? `composition for THIS shot: ${stripColor(pvz.composition)}` : null,
        pvz.blocking ? `staging: ${stripColor(pvz.blocking)}` : null,
      ]
        .filter(Boolean)
        .join('; ') || null
    : null

  const startParts = [
    `${size}, ${angle}, ${lens}mm, ${rule}`,
    figures || 'empty landscape, no figures',
    cuGuard,
    layerLine || (setting ? `setting: ${setting}` : null),
    input.actionDescription ? `moment: ${stripColor(input.actionDescription)}` : null,
    pvzStartLine,
    figureGuard,
    `focal point: ${focal}`,
    drawLine,
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
  // #v2-cell-dedup: rich dynamicSpec 이 없으면 previz 카메라 자유서술이 MOTION 재료 —
  //   이게 없으면 V2 샷 전부가 'static hold' 로 균질화된다.
  const pvzCam = !dyn && pvz?.camera ? `camera: ${stripColor(pvz.camera)}` : null
  const motionParts = [camMove, pvzCam, ...charMoves, ...gazeMoves].filter(Boolean) as string[]
  // 샷 길이(초) 상속(#rough-grid duration, 2026-07-22): START↔END 변화량의 기준 —
  //   없으면 모델이 미세한 변화만 그리는 경향(실측). rich(intent) 우선, DB 폴백.
  const dur = input.spec?.intent?.duration_seconds ?? input.durationSeconds ?? null
  const durNote = typeof dur === 'number' && dur > 0 ? `${Math.round(dur)}` : null
  const motionBase = motionParts.length
    ? `${durNote ? `over this shot's full ${durNote}-second duration: ` : ''}${motionParts.join('; ')}`
    : 'static hold — no camera or figure movement'

  // ① DIRECTION 여백의 손글씨 기술 라벨(#previz-enrich) — 조명 방향/질·카메라·초점·색온도.
  //   DIRECTION 은 텍스트 허용 유일 행이라 의도의 "확인 표면"이자 색의 유일한 운반 통로.
  // #fixed-crop 라벨 다이어트: 스트립은 유한(셀 20%) — 좁은 셀에서 랩 줄 수가 넘치지 않게
  //   각도어의 ' angle' 접미 제거 + FOCUS 24자 클립 (실측 sh_02_04: 5줄 랩이 스트립을 넘침).
  const labels: string[] = []
  if (L?.key_direction) labels.push(`KEY: ${words(L.key_direction)}${L.quality ? `, ${L.quality}` : ''}`)
  const camLabel = [sizeCode, s?.lens_mm ? `${s.lens_mm}mm` : '', angle.replace(/ angle$/, ''), dof ? `${dof} focus` : '']
    .filter(Boolean)
    .join(' ')
  if (s && camLabel) labels.push(camLabel)
  if (s?.framing?.focal_point) labels.push(`FOCUS: ${clipText(focal, 24)}`)
  const kelvin = L?.color_temp_kelvin
  const tempW = colorTempWord(kelvin)
  if (tempW) labels.push(`${tempW} ${kelvin}K`)
  // #label-invasion → #fixed-crop(2026-08-17): 자유 배치 라벨이 그림을 잠식하거나 패널 밖
  //   밴드를 만들어 레이아웃을 밀었다(실측 a219b9f3). 템플릿이 DIRECTION 패널 하단에 캡션
  //   스트립(괘선 칸)을 내장하므로 라벨은 그 안에만 — 고정 좌표 크롭과 한 몸의 계약.
  const motion = labels.length
    ? `${motionBase}. In addition to the motion arrows, letter these technical labels in small handwriting INSIDE the ruled caption strip at the bottom of the DIRECTION panel (the template already draws that strip — fill it, shrink the handwriting so EVERY label fits fully inside the strip, never write over the drawing above it, never write outside the panel): ${labels.map((l) => `"${l}"`).join(', ')}`
    : motionBase

  const endBase = motionParts.length
    ? `the same shot after ${durNote ? `the full ${durNote} seconds of` : ''} the movement completes — ${motionParts.join('; ')} has fully finished. END must be clearly and visibly different from START: show how far ${durNote ? `${durNote} seconds` : 'the shot'} of this movement actually carries the figures and camera (changed poses, positions and framing), not a subtle variation`
    : 'nearly identical to START (static shot) — only a subtle natural settling'
  const end = drawLine ? `${endBase}. Same ${drawLine}` : endBase

  return { shotId, start: startParts.join('. '), motion, end }
}

/**
 * 이전 샷 종료 상태의 연속성 줄(#n-1 2026-08-05) — 그리드 경계(4샷)를 넘는 샷 간 연속성.
 *   "그리지 말라"를 명시해 이전 순간이 셀에 그려지는 오염을 막고, 인물·소품·조명 일관만 계약한다.
 */
export function buildCellContinuityLine(prevText: string | null | undefined): string | null {
  const t = (prevText ?? '').trim()
  if (!t) return null
  const clipped = t.length > 110 ? `${t.slice(0, 110)}…` : t
  // FIX-A(#space-anchor): 배경까지 계약. #grid-shift(2026-08-05) 재작성: 부정 지시("do NOT
  //   draw")는 현재 순간이 직전 순간과 시각적으로 비슷할 때 모델이 현재 순간까지 건너뛰게
  //   만들어 칸 밀림 연쇄를 유발했다(실측 9ef0af50 — 시트 전체가 한 칸씩 밀림). 긍정 참조형으로.
  return `continuity: moments earlier the previous shot ended with "${clipped}" — carry over the same figures, props, lighting and surrounding environment from it, while drawing this shot's own moment described above`
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
 *   opts.frameAxis 'cols' = 가로 3열 스트립(#sheet-formats — 세로 포맷 전용): 위치어만 좌/중/우로.
 */
export function buildRoughGridPrompt(
  cells: RoughGridCell[],
  variant: RoughGridVariant,
  opts?: { frameAxis?: 'rows' | 'cols' },
): string {
  const colCount = variant === 'grid4' ? GRID_COLS.length : 1
  const stripRow = variant === 'strip1' && opts?.frameAxis === 'cols'
  const head =
    variant === 'grid4'
      ? `The reference image is a paper storyboard sheet with 12 empty panels in a 4-column × 3-row grid. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels, never across panel borders.

Each COLUMN is one shot of a film, read top to bottom as three frames:
- Row 1 (top) = START: the composition at the beginning of the shot.
- Row 2 (middle) = DIRECTION: an EXACT identical copy of Row 1 — trace the very same drawing with the same poses, positions, framing and props, frozen at the same instant. Do NOT advance the motion; do NOT draw an in-between moment; nothing in the scene may change from Row 1. Then overlay bold hand-drawn direction arrows for the camera and figure movement described below, with short handwritten English labels (e.g. "DOLLY IN", "PAN →", "TURNS"). The ONLY difference between Row 1 and Row 2 is the arrows and labels drawn on top. Row 2 is the ONLY place where text is allowed. The DIRECTION panels each have a thin ruled caption strip along their bottom edge — put every technical label inside that strip and keep the drawing above it.
- Row 3 (bottom) = END: the composition at the end of the shot, after the movement completes. Row 3 is the only frame where the motion has visibly progressed — and when a shot has movement, its END must differ clearly and unmistakably from its START (full extent of the motion over the shot's stated duration), never a barely-changed copy.`
      : stripRow
        ? `The reference image is a wide paper storyboard sheet with 3 empty panels side by side in a row. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The row is ONE shot of a film, read left to right as three frames:
- Panel 1 (LEFT) = START: the composition at the beginning of the shot.
- Panel 2 (MIDDLE) = DIRECTION: an EXACT identical copy of Panel 1 — trace the very same drawing with the same poses, positions, framing and props, frozen at the same instant. Do NOT advance the motion; do NOT draw an in-between moment; nothing in the scene may change from Panel 1. Then overlay bold hand-drawn direction arrows for the camera and figure movement described below, with short handwritten English labels (e.g. "DOLLY IN", "PAN →", "TURNS"). The ONLY difference between Panel 1 and Panel 2 is the arrows and labels drawn on top. Panel 2 is the ONLY place where text is allowed. The DIRECTION panels each have a thin ruled caption strip along their bottom edge — put every technical label inside that strip and keep the drawing above it.
- Panel 3 (RIGHT) = END: the composition at the end of the shot, after the movement completes. Panel 3 is the only frame where the motion has visibly progressed — and when the shot has movement, END must differ clearly and unmistakably from START (full extent of the motion over the shot's stated duration), never a barely-changed copy.`
        : `The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: an EXACT identical copy of Panel 1 — trace the very same drawing with the same poses, positions, framing and props, frozen at the same instant. Do NOT advance the motion; do NOT draw an in-between moment; nothing in the scene may change from Panel 1. Then overlay bold hand-drawn direction arrows for the camera and figure movement described below, with short handwritten English labels (e.g. "DOLLY IN", "PAN →", "TURNS"). The ONLY difference between Panel 1 and Panel 2 is the arrows and labels drawn on top. Panel 2 is the ONLY place where text is allowed. The DIRECTION panels each have a thin ruled caption strip along their bottom edge — put every technical label inside that strip and keep the drawing above it.
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

Within each column, the three frames depict the SAME camera setup, location, figures and props — continuity between START, DIRECTION and END must be obvious. START and DIRECTION are the same frozen instant (annotations are the only difference); motion progresses ONLY in END. Different columns are different shots and may differ. No text, captions or labels anywhere except the DIRECTION row's annotations (motion arrow labels and the small handwritten technical margin labels requested per column).`
}
