// 실사 3프레임 SHOT 이미지(#real-strip 2026-07-22) — 러프 3프레임을 스트립 템플릿에 합성해
// gpt-image-2/edit 의 1번 레퍼런스로 주고, 같은 3패널 스트립을 최종 화풍으로 리페인트시킨다.
// (Phase B 실측 검증 2026-07-22: shot_9 — 구도·모션 라벨·캐릭터·스타일 앵커 전부 상속 확인)
//
// server-only (sharp). 크롭은 기존 cropRoughGridFrames('strip1') 재사용 — 합성 지오메트리와
// 크롭 지오메트리가 같은 STRIP_COLS/GRID_ROWS 비례에서 나오므로 왕복이 정합.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  STRIP_TEMPLATE_PATH,
  GRID_TEMPLATE_PATH,
  gridGeometry,
  type RoughGridVariant,
} from '@/lib/writer/rough-storyboard-grid'
import { resolveWebhookBaseUrl } from '@/lib/fal/webhook-url'
import type { ProjectFormat } from '@/types/project'

/**
 * 실사 시트 캔버스(WxH) — 프로듀서 포맷 파생 (#fal-canvas 2026-08-17, 실측 4/4 수락).
 *   그리드는 캔버스 방향이 곧 셀 방향: vertical 은 세로 시트(셀 ~9:16 근접, 4×3 레이아웃 유지
 *   실측), cinema 는 2.4:1(1536x643 요청 시 64배수 스냅 1536x640 실측). 스트립은 3행 적층
 *   레이아웃이 지배해 포맷 불문 세로 고정(셀 ~2:1) — 세로 프로젝트용 가로 3열 스트립 템플릿은
 *   미보유(deferred-vertical-strip-template). 러프 레퍼런스 시트는 가로 템플릿 그대로여도
 *   모델이 패널을 캔버스 방향으로 재구도한다(실측 T2).
 */
export function realSheetCanvas(format: ProjectFormat | null, variant: RoughGridVariant): string {
  if (variant === 'strip1') return '1024x1536'
  switch (format) {
    case 'vertical_9:16':
      return '1024x1536'
    case 'square_1:1':
      return '1024x1024'
    case 'cinema_2.39:1':
      return '1536x640'
    default:
      return '1536x1024' // horizontal_16:9 · 포맷 미상(구 프로젝트)
  }
}

/** 스트립 템플릿 바이트 로드 — 로컬 fs 우선(dev), 실패 시 배포 public URL(fal 그리드 경로와 동일 방식). */
async function loadStripTemplate(): Promise<Buffer> {
  try {
    return await readFile(path.join(process.cwd(), 'public', STRIP_TEMPLATE_PATH))
  } catch {
    const base = resolveWebhookBaseUrl()
    if (!base) throw new Error('strip template unavailable: no fs asset and no public base URL')
    const res = await fetch(`${base}${STRIP_TEMPLATE_PATH}`)
    if (!res.ok) throw new Error(`strip template fetch failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`rough frame fetch failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * 러프 3프레임을 스트립 템플릿의 3개 셀에 붙여 레퍼런스 스트립 PNG 를 만든다.
 *   행 순서 = START / DIRECTION / END (크롭과 동일한 GRID_ROWS 비례).
 */
export async function composeRoughReferenceStrip(frames: {
  start: string
  direction: string
  end: string
}): Promise<Buffer> {
  const template = await loadStripTemplate()
  const meta = await sharp(template).metadata()
  const width = meta.width
  const height = meta.height
  if (!width || !height) throw new Error('strip template metadata missing')

  const { cols, rows } = gridGeometry('strip1')
  const [c0, c1] = cols[0]
  const urls = [frames.start, frames.direction, frames.end]

  const overlays: sharp.OverlayOptions[] = []
  for (let r = 0; r < rows.length; r++) {
    const [r0, r1] = rows[r]
    const left = Math.round(c0 * width)
    const top = Math.round(r0 * height)
    const w = Math.max(1, Math.round((c1 - c0) * width))
    const h = Math.max(1, Math.round((r1 - r0) * height))
    const buf = await fetchImage(urls[r])
    // 프레임은 같은 비례 셀에서 잘려 나온 것 — 종횡비가 이미 일치하므로 fill 왜곡은 미미.
    const resized = await sharp(buf).resize(w, h, { fit: 'fill' }).png().toBuffer()
    overlays.push({ input: resized, left, top })
  }
  return sharp(template).composite(overlays).png().toBuffer()
}

/**
 * #real-grid(2026-08-06, 실험 검증: 011fd4bd 4샷 시트 1콜 리페인트 — 시트 계약·정체성·모션 전부 통과):
 *   같은 씬·같은 레퍼런스의 러프 3프레임 세트들을 grid4 템플릿(4열×3행)에 합성 — 일괄 리페인트 참조 시트.
 */
export async function composeRoughReferenceGrid(
  shotFrames: Array<{ start: string; direction: string; end: string }>,
): Promise<Buffer> {
  if (!shotFrames.length || shotFrames.length > 4) throw new Error(`grid frames 1~4 필요 (${shotFrames.length})`)
  const base = resolveWebhookBaseUrl()
  const template = await (async () => {
    try {
      return await readFile(path.join(process.cwd(), 'public', GRID_TEMPLATE_PATH))
    } catch {
      if (!base) throw new Error('grid template unavailable')
      const res = await fetch(`${base}${GRID_TEMPLATE_PATH}`)
      if (!res.ok) throw new Error(`grid template fetch failed: ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    }
  })()
  const meta = await sharp(template).metadata()
  const W = meta.width
  const H = meta.height
  if (!W || !H) throw new Error('grid template metadata missing')
  const { cols, rows } = gridGeometry('grid4')
  const overlays: sharp.OverlayOptions[] = []
  for (let c = 0; c < shotFrames.length; c++) {
    const urls = [shotFrames[c].start, shotFrames[c].direction, shotFrames[c].end]
    for (let r = 0; r < rows.length; r++) {
      const [c0, c1] = cols[c]
      const [r0, r1] = rows[r]
      const w = Math.max(1, Math.round((c1 - c0) * W))
      const h = Math.max(1, Math.round((r1 - r0) * H))
      const buf = await fetchImage(urls[r])
      overlays.push({
        input: await sharp(buf).resize(w, h, { fit: 'fill' }).png().toBuffer(),
        left: Math.round(c0 * W),
        top: Math.round(r0 * H),
      })
    }
  }
  return sharp(template).composite(overlays).png().toBuffer()
}

/** 4샷 그리드 일괄 리페인트 프롬프트 — strip 문안의 grid 일반화 (#real-grid 실험 문안 그대로). */
export function buildRealGridPrompt(
  shotCount: number,
  opts: {
    characterRefCount: number
    hasStyleRef: boolean
    /** #viz-gap 실험 arm: 컬럼(=샷) 순서대로의 시네 라인. 연필이 못 옮기는 조명/초점/DoF/렌즈/색만.
     *  생략(기본)이면 현행 프롬프트 그대로 — 라이브 라우트 무변경. renderRepaintCineLine 산출물. */
    cineLines?: (string | null | undefined)[]
    /** #real-grid-identity(2026-08-12, 실측 a5cb2cae sh_04_18): 레퍼런스 순서와 칸별 배정.
     *  옛 프롬프트의 "corresponding character(s)"는 대응 관계가 어디에도 정의돼 있지 않아
     *  모델이 자유 추측했고, 소수 인물이 다수 인물에 흡수되는 바꿔치기가 실측됐다.
     *  characterRefs 는 reference_image_urls[1..] 과 같은 순서의 표시명,
     *  columnCharacters 는 칸(그룹) 순서대로 그 칸에 나오는 인물 표시명들. */
    characterRefs?: { name: string }[]
    columnCharacters?: string[][]
    /** #F-006(2026-08-13, 실측 1e166e55 sc_04): 시트 프롬프트에 씬 정보가 전무해 시트(=생성 콜)마다
     *  시간대를 지어냈다 — Night 씬이 시트 경계(21~24/25~27)에서 갈라진 실측. scenes.time_of_day 가
     *  진실인데 이 경로로 배선된 적이 없었다. 시트는 1콜 1이미지라 그레이드는 시트 전역 속성이고,
     *  같은 씬의 모든 시트가 같은 문장을 받아야 시트 간 일관성이 생긴다. 값이 오면 앵커 절에서
     *  조명·그레이드 문구를 빼고 이 줄이 지배한다(§6D 실측: 텍스트 그레이드 권위 > 앵커 이미지). */
    sceneLighting?: string | null
    /** #anchor-wiring(2026-08-14, 오너 확정): 앵커별 실측 검증 절 — 스타일 절 바로 뒤에 얹는다. */
    styleClause?: string | null
    /** #anchor-wiring Rule 6: 서브룩(그레이드=상품)은 씬 조명이 있어도 그레이드·팔레트 권위를
     *  앵커에 남긴다 — 종전 문구("do NOT copy its ... lighting")가 서브룩 상품을 지우던 실측
     *  (psy_horror §8.2·desert §8-3 독립 2건). true = 서브룩. */
    anchorKeepsGrade?: boolean
    /** #anchor-wiring watercolor A안: 스타일 레퍼런스가 마지막 1장인가 2장인가. 기본 1. */
    styleRefCount?: 1 | 2
  },
): string {
  const { characterRefCount, hasStyleRef, cineLines, characterRefs, columnCharacters } = opts
  const sceneLine = (opts.sceneLighting ?? '').trim()
  const styleClause = (opts.styleClause ?? '').trim()
  const twoStyleRefs = opts.styleRefCount === 2
  const styleRefName = twoStyleRefs
    ? 'the LAST TWO reference images (style references)'
    : 'the LAST reference image (style reference)'
  const styleRefPronoun = twoStyleRefs ? 'their' : 'its'
  const target = hasStyleRef
    ? 'finished, final-quality film frames'
    : 'finished photorealistic live-action cinematic film frames'
  const charLocation = hasStyleRef
    ? 'the reference images between the first and the last'
    : 'the remaining reference images'
  // 칸별 배정 블록 — characterRefs 가 오면 익명 "corresponding" 문장을 대체한다.
  const identityBlock =
    characterRefs && characterRefs.length > 0
      ? [
          `- Character references, in order after the first image: ${characterRefs
            .map((c, i) => `reference image ${i + 2} = ${c.name}`)
            .join('; ')}.`,
          `- Replace every wooden mannequin with the character assigned to ITS OWN column below — never carry a character into a column they are not assigned to:`,
          ...(columnCharacters ?? []).map(
            (names, i) =>
              `    * Column ${i + 1}: ${
                names.length ? names.join(' and ') : 'no character — keep this column free of people'
              }`,
          ),
          `- Keep each character's identity, design and outfit exactly as in their reference, consistent across that column's three rows.`,
        ]
      : characterRefCount > 0
        ? [
            `- Replace every wooden mannequin with the corresponding character(s) from ${charLocation} (character/world references): keep their identity, design and outfit, consistent across all panels.`,
          ]
        : []
  return [
    `The FIRST reference image is a 4-column x 3-row storyboard sheet. Each COLUMN is ONE film shot, read top to bottom: row 1 = START frame, row 2 = DIRECTION frame (the same drawing as START plus hand-drawn arrows and labels), row 3 = END frame after the movement completes. The drawings are rough pencil previz with wooden mannequin stand-ins.${shotCount < 4 ? ` Only the first ${shotCount} column(s) contain shots — keep the remaining column(s) as empty blank panels.` : ''}`,
    '',
    `Repaint this exact sheet as ${target}:`,
    `- The output MUST be the same single 4x3 sheet — keep the sheet layout and every panel border exactly where they are; draw only inside the panels; never add any decoration outside the sheet.`,
    `- Each column stays the same shot: same camera setup, framing, composition and poses as its reference column. Rows keep their START/DIRECTION/END roles — arrows and labels redrawn boldly only in row 2.`,
    ...identityBlock,
    ...(hasStyleRef
      ? [
          sceneLine
            ? opts.anchorKeepsGrade
              ? `- Match the exact visual style of ${styleRefName}: art medium, rendering technique, linework, color grade and palette. Do NOT reproduce ${styleRefPronoun} subjects or objects. Take the time of day from the scene lighting line below, but KEEP the style reference's color grade and palette on top of it.`
              : `- Match the exact visual style of ${styleRefName}: art medium, rendering technique, linework. Do NOT reproduce ${styleRefPronoun} subjects or objects, and do NOT copy ${styleRefPronoun} time of day or lighting — the scene lighting line below governs those.`
            : `- Match the exact visual style of ${styleRefName}: art medium, rendering technique, linework, lighting mood and color grade. Do NOT reproduce ${styleRefPronoun} subjects or objects.`,
        ]
      : []),
    ...(hasStyleRef && styleClause ? [`- ${styleClause}`] : []),
    ...(sceneLine
      ? [
          `- Scene lighting — the whole sheet is ONE scene, time of day: ${sceneLine}. Render that time of day's light${opts.anchorKeepsGrade ? '' : ' and color grade'} in every panel, identical across all columns; never drift to a different time of day in any column.`,
        ]
      : []),
    ...renderGridCineBlock(cineLines),
    `- No text anywhere except row 2's arrow labels.`,
  ].join('\n')
}

/** 컬럼별 시네 라인 블록(#viz-gap) — 연필 시트가 못 보여주는 빛/초점/렌즈/색만 실현하라고 지시.
 *  구도·포즈는 위의 "레퍼런스 컬럼 그대로" 지시가 지배하므로 여기선 손대지 말라고 못박는다. */
function renderGridCineBlock(cineLines?: (string | null | undefined)[]): string[] {
  const entries = (cineLines ?? [])
    .map((line, i) => ({ i, line: (line ?? '').trim() }))
    .filter((e) => e.line.length > 0)
  if (!entries.length) return []
  return [
    `- Per-column cinematography — realize these lighting, focus, lens and color intents that the pencil sheet cannot show. Apply ONLY light/shadow, depth-of-field, focus, lens perspective and color grade; do NOT change each column's framing, composition or figure poses:`,
    ...entries.map((e) => `    · Column ${e.i + 1}: ${e.line}`),
  ]
}

/**
 * 실사 리페인트 프롬프트 — Phase B 검증 문안의 일반화.
 *   레퍼런스 순서 계약: [러프 스트립, ...캐릭터/월드 시트(characterRefCount), 스타일 앵커(hasStyleRef)].
 */
export function buildRealStripPrompt(
  shotPrompt: string,
  opts: {
    characterRefCount: number
    hasStyleRef: boolean
    /** #viz-gap 실험 arm: 이 샷의 시네 라인(비운반 채널만). 생략 시 현행 프롬프트 그대로. */
    cineLine?: string | null
    /** #F-006: 씬 시간대(scenes.time_of_day). 샷 산문의 시간대 단어는 확률적(실측 4/7 샷에만
     *  존재)이라 씬 진실로 고정한다. 그리드 쪽 주석 참조 — 앵커 절과의 권위 관계 동일. */
    sceneLighting?: string | null
    /** #anchor-wiring — 그리드 쪽과 동일 계약 3종. */
    styleClause?: string | null
    anchorKeepsGrade?: boolean
    styleRefCount?: 1 | 2
  },
): string {
  const { characterRefCount, hasStyleRef, cineLine } = opts
  const sceneLine = (opts.sceneLighting ?? '').trim()
  const styleClause = (opts.styleClause ?? '').trim()
  const twoStyleRefs = opts.styleRefCount === 2
  const styleRefName = twoStyleRefs
    ? 'the LAST TWO reference images (style references)'
    : 'the LAST reference image (style reference)'
  const styleRefPronoun = twoStyleRefs ? 'their' : 'its'
  const target = hasStyleRef
    ? 'finished, final-quality film frames'
    : 'finished photorealistic live-action cinematic film frames'
  // #anchor-wiring: 2-ref 시 캐릭터 구간이 "first~last" 그대로면 preview 가 캐릭터로 오인된다
  //   (2ref-test §5.3 실측 경고) — 위치 문구를 함께 옮긴다.
  const charLocation = hasStyleRef
    ? twoStyleRefs
      ? 'the reference images between the first and the last two'
      : 'the reference images between the first and the last'
    : 'the remaining reference images'
  const lines = [
    `The FIRST reference image is a 3-panel vertical storyboard strip of ONE film shot, drawn as rough pencil previz with wooden mannequin stand-ins. Top panel = START frame. Middle panel = DIRECTION frame — the same drawing as START plus hand-drawn direction arrows and text labels describing the camera and figure movement. Bottom panel = END frame, after that movement completes.`,
    '',
    `Repaint this exact strip as ${target}:`,
    `- The output MUST be the same single vertical sheet with exactly three stacked panels — never a single standalone picture, and never add any decorative frame or border outside the sheet.`,
    `- Keep the sheet layout and the three panel borders exactly as they are; draw only inside the panels.`,
    `- Top panel: full-quality repaint of the START frame — same camera setup, framing, composition and poses as reference panel 1.`,
    // #tfix-repaint-prompt 2026-08-11: A1 실측 체계 결함 2건 보강 —
    //   ④ 정지 샷(sh_02_10)에 없던 화살표가 3반복 모두 추가됨 → 원본에 없는 주석 발명 금지.
    //   ③ 2동작 샷(sh_01_09)의 END 패널이 3반복 전부 실패 → 도착 상태 전건 완료 재현 명시.
    `- Middle panel: the exact same image as the top panel, with the SAME direction arrows and labels from reference panel 2 redrawn boldly on top as an annotation overlay, clearly visible. This is the only panel with text. Never invent arrows or labels that are not in reference panel 2 — if the rough sheet has no arrows (a static hold), the middle panel stays clean with no annotation.`,
    `- Bottom panel: full-quality repaint of the END frame — the same shot after the motion completes, matching reference panel 3's composition exactly. Reproduce panel 3's arrived state faithfully: every element the motion changed (a drawer now open, a figure now moved or turned, an object now displaced) must be shown in its completed end state. If the shot contains two or more movements, show ALL of them completed — never repeat the top panel's state.`,
    ...(characterRefCount > 0
      ? [
          `- Replace every wooden mannequin with the corresponding character(s) from ${charLocation} (character/world references): keep their identity, design and outfit; the same character(s), consistent across all three panels.`,
        ]
      : []),
    ...(hasStyleRef
      ? [
          sceneLine
            ? opts.anchorKeepsGrade
              ? `- Match the exact visual style of ${styleRefName}: match ${styleRefPronoun} art medium, rendering technique, linework, color grade and palette. Do NOT reproduce ${styleRefPronoun} subjects or objects. Take the time of day from the scene lighting line below, but KEEP the style reference's color grade and palette on top of it.`
              : `- Match the exact visual style of ${styleRefName}: match ${styleRefPronoun} art medium, rendering technique and linework. Do NOT reproduce ${styleRefPronoun} subjects or objects, and do NOT copy ${styleRefPronoun} time of day or lighting — the scene lighting line below governs those.`
            : `- Match the exact visual style of ${styleRefName}: match ${styleRefPronoun} art medium, rendering technique, linework, lighting mood and color grade. Do NOT reproduce ${styleRefPronoun} subjects or objects.`,
        ]
      : []),
    ...(hasStyleRef && styleClause ? [`- ${styleClause}`] : []),
    ...(sceneLine
      ? [
          `- Scene lighting — time of day: ${sceneLine}. Render that time of day's light${opts.anchorKeepsGrade ? '' : ' and color grade'} consistently in all three panels.`,
        ]
      : []),
    `- Shot description: ${shotPrompt}`,
    ...(cineLine && cineLine.trim()
      ? [
          `- Cinematography — realize these lighting, focus, lens and color intents the pencil cannot show; apply them WITHOUT changing framing, composition or poses: ${cineLine.trim()}`,
        ]
      : []),
    `- No text anywhere except the middle panel's arrow labels.`,
  ]
  return lines.join('\n')
}
