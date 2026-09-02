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
  sheetGeometry,
  type SheetGeometry,
  type RoughGridVariant,
} from '@/lib/writer/rough-storyboard-grid'
import { resolveWebhookBaseUrl } from '@/lib/fal/webhook-url'
import type { ProjectFormat } from '@/types/project'

/**
 * 실사 시트 캔버스(WxH) — 프로듀서 포맷 파생 (#fal-canvas 2026-08-17, 실측 4/4 수락 →
 * #sheet-formats: 진실은 시트 스펙(sheetGeometry)으로 통합 — 템플릿·좌표·캔버스가 한 표).
 *   그리드는 캔버스 방향이 곧 셀 방향(vertical 실측: 4×3 유지 + 패널 세로 재구도).
 *   스트립 리페인트는 이 함수 대신 composeRoughReferenceStrip 이 고른 지오메트리의
 *   repaintCanvas 를 써야 한다 — 레퍼런스·캔버스·프롬프트·크롭의 정합(아래 주석).
 */
export function realSheetCanvas(format: ProjectFormat | null, variant: RoughGridVariant): string {
  return sheetGeometry(variant, format).repaintCanvas
}

/** 템플릿 바이트 로드 — 로컬 fs 우선(dev), 실패 시 배포 public URL(fal 그리드 경로와 동일 방식). */
async function loadTemplate(templatePath: string): Promise<Buffer> {
  try {
    return await readFile(path.join(process.cwd(), 'public', templatePath.replace(/^\//, '')))
  } catch {
    const base = resolveWebhookBaseUrl()
    if (!base) throw new Error(`template unavailable: no fs asset and no public base URL (${templatePath})`)
    const res = await fetch(`${base}${templatePath}`)
    if (!res.ok) throw new Error(`template fetch failed: ${res.status} (${templatePath})`)
    return Buffer.from(await res.arrayBuffer())
  }
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`rough frame fetch failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** #ref-inset(2026-08-26, 오너 "previz drift 조치"): 러프 프레임 테두리 3% 인셋 후 합성.
 *  러프 크롭은 X_BLEED 로 보더 라인을 일부러 물고 있고 코너 브래킷도 품는다(previz 표시용 트레이드).
 *  이 잔재가 템플릿 셀(자체 보더·브래킷 보유)에 그대로 얹히면 이중 인쇄가 되고, 리페인트 모델이
 *  둘 다 따라 그리며 어긋난 격자를 만든다 — 실사 크롭 띠(9d562ada 14/14)의 상류 원인. 셀 가구는
 *  템플릿 것 하나만 남긴다. 3% = 브래킷(≤14px/400폭)을 대부분 걷되 DIRECTION 하단 캡션 글자는
 *  보존하는 절충. */
const REF_FRAME_INSET = 0.03
async function insetFrame(buf: Buffer): Promise<Buffer> {
  const m = await sharp(buf).metadata()
  const w = m.width ?? 0
  const h = m.height ?? 0
  if (!w || !h) return buf
  const ix = Math.round(w * REF_FRAME_INSET)
  const iy = Math.round(h * REF_FRAME_INSET)
  if (w - ix * 2 < 8 || h - iy * 2 < 8) return buf
  return sharp(buf)
    .extract({ left: ix, top: iy, width: w - ix * 2, height: h - iy * 2 })
    .png()
    .toBuffer()
}

export interface ComposedReferenceSheet {
  buffer: Buffer
  /** 실제로 쓴 지오메트리 — 리페인트 캔버스·프롬프트 축·finalize 크롭이 전부 이걸 따라야 정합. */
  geometry: SheetGeometry
  /** 포맷 스펙 시트를 썼으면 그 포맷, 레거시 시트면 null — inputSnapshot.sheet_format 에 기록. */
  sheetFormat: ProjectFormat | null
}

/**
 * 프레임 종횡비로 시트 지오메트리 선택(#sheet-formats 2026-08-17):
 *   포맷 전용 시트와 레거시 시트 중 **첫 프레임의 실측 AR 에 가까운 셀**을 가진 쪽.
 *   레거시(가로) 러프 프레임을 세로 셀에 fill 하면 스케치가 왜곡돼 리페인트 지침이 망가진다 —
 *   그 경우 레거시 시트에 합성하고 재구도는 출력 캔버스에 맡긴다(T2 실측: 가로 레퍼런스 +
 *   세로 캔버스에서 모델이 패널을 세로로 재프레이밍). 러프를 포맷 템플릿으로 재생성하면
 *   프레임 AR 이 포맷 셀에 가까워져 자연히 포맷 시트로 넘어온다 — 자가 치유 경로.
 */
async function pickGeometryByFrameAr(
  variant: RoughGridVariant,
  format: ProjectFormat | null,
  firstFrame: Buffer,
): Promise<{ geometry: SheetGeometry; sheetFormat: ProjectFormat | null; template: Buffer }> {
  const legacy = sheetGeometry(variant, null)
  const formatGeom = sheetGeometry(variant, format)
  if (formatGeom.templatePath === legacy.templatePath) {
    return { geometry: legacy, sheetFormat: null, template: await loadTemplate(legacy.templatePath) }
  }
  const fm = await sharp(firstFrame).metadata()
  const frameAr = fm.width && fm.height ? fm.width / fm.height : 1
  const cellAr = async (g: SheetGeometry, template: Buffer) => {
    const tm = await sharp(template).metadata()
    const W = tm.width ?? 1
    const H = tm.height ?? 1
    return ((g.cols[0][1] - g.cols[0][0]) * W) / ((g.rows[0][1] - g.rows[0][0]) * H)
  }
  const [legacyTpl, formatTpl] = await Promise.all([
    loadTemplate(legacy.templatePath),
    loadTemplate(formatGeom.templatePath),
  ])
  const [legacyAr, formatAr] = [await cellAr(legacy, legacyTpl), await cellAr(formatGeom, formatTpl)]
  const closerToFormat =
    Math.abs(Math.log(frameAr / formatAr)) <= Math.abs(Math.log(frameAr / legacyAr))
  return closerToFormat
    ? { geometry: formatGeom, sheetFormat: format, template: formatTpl }
    : { geometry: legacy, sheetFormat: null, template: legacyTpl }
}

/**
 * 러프 3프레임을 스트립 시트의 3개 셀에 붙여 레퍼런스 스트립 PNG 를 만든다.
 *   셀 순서 = START / DIRECTION / END — 프레임 축(frameAxis)이 rows 면 위→아래,
 *   cols(세로 포맷 가로 3열)면 좌→우. 반환 지오메트리가 리페인트 계약의 진실이다.
 */
export async function composeRoughReferenceStrip(
  frames: { start: string; direction: string; end: string },
  format: ProjectFormat | null = null,
): Promise<ComposedReferenceSheet> {
  const bufs = [
    await fetchImage(frames.start),
    await fetchImage(frames.direction),
    await fetchImage(frames.end),
  ]
  const { geometry, sheetFormat, template } = await pickGeometryByFrameAr('strip1', format, bufs[0])
  const meta = await sharp(template).metadata()
  const width = meta.width
  const height = meta.height
  if (!width || !height) throw new Error('strip template metadata missing')

  const { cols, rows, frameAxis } = geometry
  // 프레임 i 의 셀 좌표 — 축 배정만 frameAxis 를 따른다 (크롭과 동일 규약).
  const cellOf = (i: number): { x: readonly [number, number]; y: readonly [number, number] } =>
    frameAxis === 'rows' ? { x: cols[0], y: rows[i] } : { x: cols[i], y: rows[0] }

  const overlays: sharp.OverlayOptions[] = []
  for (let i = 0; i < bufs.length; i++) {
    const { x, y } = cellOf(i)
    const left = Math.round(x[0] * width)
    const top = Math.round(y[0] * height)
    const w = Math.max(1, Math.round((x[1] - x[0]) * width))
    const h = Math.max(1, Math.round((y[1] - y[0]) * height))
    // 지오메트리를 프레임 AR 로 골랐으므로 fill 왜곡은 미미(레거시 주석의 전제를 선택으로 보존).
    const resized = await sharp(await insetFrame(bufs[i])).resize(w, h, { fit: 'fill' }).png().toBuffer()
    overlays.push({ input: resized, left, top })
  }
  return {
    buffer: await sharp(template).composite(overlays).png().toBuffer(),
    geometry,
    sheetFormat,
  }
}

/**
 * #real-grid(2026-08-06, 실험 검증: 011fd4bd 4샷 시트 1콜 리페인트 — 시트 계약·정체성·모션 전부 통과):
 *   같은 씬·같은 레퍼런스의 러프 3프레임 세트들을 grid4 시트(4열×3행)에 합성 — 일괄 리페인트 참조 시트.
 *   #sheet-formats: 레퍼런스 시트는 프레임 AR 로 선택(왜곡 방지), 출력 캔버스·크롭은 호출부가
 *   프로젝트 포맷 스펙으로 정한다 — 가로 레퍼런스+세로 캔버스 조합은 T2 실측으로 검증된 경로.
 */
export async function composeRoughReferenceGrid(
  shotFrames: Array<{ start: string; direction: string; end: string }>,
  format: ProjectFormat | null = null,
): Promise<Buffer> {
  if (!shotFrames.length || shotFrames.length > 4) throw new Error(`grid frames 1~4 필요 (${shotFrames.length})`)
  const firstFrame = await fetchImage(shotFrames[0].start)
  const { geometry, template } = await pickGeometryByFrameAr('grid4', format, firstFrame)
  const meta = await sharp(template).metadata()
  const W = meta.width
  const H = meta.height
  if (!W || !H) throw new Error('grid template metadata missing')
  const { cols, rows } = geometry
  const overlays: sharp.OverlayOptions[] = []
  for (let c = 0; c < shotFrames.length; c++) {
    const urls = [shotFrames[c].start, shotFrames[c].direction, shotFrames[c].end]
    for (let r = 0; r < rows.length; r++) {
      const [c0, c1] = cols[c]
      const [r0, r1] = rows[r]
      const w = Math.max(1, Math.round((c1 - c0) * W))
      const h = Math.max(1, Math.round((r1 - r0) * H))
      const buf = await insetFrame(c === 0 && r === 0 ? firstFrame : await fetchImage(urls[r]))
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
    /** #asset-authority: 인물 시트 뒤 배경(로케이션) 레퍼런스 수(배치 라우트가 씬 wide_shot 을 첨부). */
    worldRefCount?: number
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
    /** 칸(그룹) 순서대로 그 칸의 인물 — 문자열(이름) 또는 라벨(이름+러프 위치·포즈, #ref-gate). */
    columnCharacters?: Array<Array<string | CharacterRefLabel>>
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
                names.length ? names.map(describeCharacterRef).join(' and ') : 'no character — keep this column free of people'
              }`,
          ),
          `- Keep each character's identity, design and outfit exactly as in their reference, consistent across that column's three rows.`,
          // #ref-gate(2026-09-02): 같은 인물 두 번 금지 + 배정 없는 인형은 다른 사람 — strip 과 같은 규칙.
          `- Every assigned character appears exactly ONCE per panel — never paint the same character twice in one panel, and never merge two characters into one figure. A mannequin that matches no assignment in its column is a different, unnamed background person, never a copy of an assigned character.`,
          // #asset-authority: 연필 디테일보다 시트가 이긴다 + 환경 불변(그리드는 배경 레퍼런스 미첨부).
          assetAuthorityClause(characterRefs.length, opts.worldRefCount ?? 0, hasStyleRef, opts.styleRefCount === 2),
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
    // #end-fidelity(2026-08-25, 9d562ada 14샷 전수 감사): 스트립 프롬프트의 #tfix-repaint-prompt
    //   END 강화절이 그리드에는 이식돼 있지 않았다 — 실사 END 가 러프 END 를 배신한 5건(카메라
    //   반전 MCU 발명·push-in 2.3×·모션량 감쇠)이 전부 그리드 산이었다. 같은 계약을 행 단위로
    //   못박고, 샷 사이즈 불변(재프레이밍 금지)을 명시한다.
    `- Row 3 of each column = that shot's END: reproduce reference row 3's arrived state faithfully — every element the motion changed (a figure now moved or turned, an object now displaced) must be shown in its completed end state; if a column's motion has two or more movements, show ALL of them completed. Never repeat that column's row 1 state in row 3, and never invent a different composition for it.`,
    `- Every panel keeps its reference panel's exact shot size and camera distance — never push in, pull out or reframe: an extreme close-up stays an extreme close-up, a full shot stays a full shot, and each figure's size within the frame stays the same as in the reference.`,
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
/** #ref-gate(2026-09-02): "reference image N = 이름" 규약에 쓰는 라벨 — 위치·포즈는 러프의 character_blocking. */
export interface CharacterRefLabel {
  name: string
  /** static_spec.character_blocking.position_in_frame (left_third 등). 없으면 이름만. */
  position?: string | null
  /** static_spec.character_blocking.pose — 어느 인형인지 고르는 단서. */
  pose?: string | null
}

const POSITION_PHRASES: Record<string, string> = {
  left_third: 'left third of the frame',
  center_third: 'center of the frame',
  right_third: 'right third of the frame',
  left: 'left of the frame',
  center: 'center of the frame',
  right: 'right of the frame',
  foreground: 'foreground',
  midground: 'midground',
  background: 'background',
}

function positionPhrase(position: string | null | undefined): string | null {
  const token = (position ?? '').trim().toLowerCase()
  if (!token) return null
  return POSITION_PHRASES[token] ?? token.replace(/_/g, ' ')
}

/** "용족 수장 (right third of the frame — standing tall in gold breastplate)" */
export function describeCharacterRef(ref: string | CharacterRefLabel): string {
  if (typeof ref === 'string') return ref
  const where = positionPhrase(ref.position)
  const pose = (ref.pose ?? '').trim()
  const hint = [where, pose ? pose.slice(0, 110) : null].filter(Boolean).join(' — ')
  return hint ? `${ref.name} (${hint})` : ref.name
}

/**
 * 인형↔인물 배정 블록(#ref-gate 2026-09-02, 실측 겨울_4 sh_01_27: 시트 1장 + 인형 셋 → 세 인형이 전부 같은 인물).
 *   옛 "corresponding character(s)"는 대응 관계를 어디에도 정의하지 않아 모델이 자유 추측했다(그리드는
 *   2026-08-12 에 고쳤고 strip 은 안 고친 상태였다). 참조 번호 = 이름, 러프의 위치·포즈로 어느 인형인지
 *   못박고, 같은 인물 두 번 금지 + 배정 없는 인형은 "다른 사람"으로 규정한다.
 */
export function stripIdentityBlock(refs: CharacterRefLabel[]): string[] {
  if (!refs.length) return []
  return [
    `- Character references, in order after the first image: ${refs
      .map((r, i) => `reference image ${i + 2} = ${describeCharacterRef(r)}`)
      .join('; ')}. The words in parentheses say where that figure stands in the pencil frame and what it is doing.`,
    `- Replace each wooden mannequin with the character assigned to its place above. Every assigned character appears exactly ONCE per panel — never paint the same character twice in one panel, and never merge two characters into one figure. A mannequin that matches no assignment is a different, unnamed background person: give it its own plain look, never a copy of an assigned character.`,
    `- Keep each character's identity, design and outfit exactly as in their sheet — the same character(s), consistent across all three panels.`,
  ]
}

/** #asset-authority — 레퍼런스가 서로 다를 때의 권위 서열. 스트립·그리드 공용 문안. */
export function assetAuthorityClause(
  characterRefCount: number,
  worldRefCount: number,
  hasStyleRef: boolean,
  twoStyleRefs: boolean,
  /** #ref-gate: 인물·배경 뒤에 오는 추가 입력(프레임 참조 등) 수 — 인물로 오인되지 않게 역할을 적는다. */
  extraRefCount = 0,
): string {
  const charSpan =
    characterRefCount > 0
      ? characterRefCount === 1
        ? 'reference image 2 is the CHARACTER sheet'
        : `reference images 2 to ${1 + characterRefCount} are the CHARACTER sheets`
      : ''
  const worldSpan =
    worldRefCount > 0
      ? worldRefCount === 1
        ? `reference image ${2 + characterRefCount} is the LOCATION reference (the actual set and terrain)`
        : `reference images ${2 + characterRefCount} to ${1 + characterRefCount + worldRefCount} are the LOCATION references (the actual set and terrain)`
      : ''
  const extraStart = 2 + characterRefCount + worldRefCount
  const extraSpan =
    extraRefCount > 0
      ? extraRefCount === 1
        ? `reference image ${extraStart} is an additional visual input for this shot (framing or prop reference) — not a character and not the set`
        : `reference images ${extraStart} to ${extraStart + extraRefCount - 1} are additional visual inputs for this shot (framing or prop references) — not characters and not the set`
      : ''
  const styleNote = hasStyleRef ? `; the last ${twoStyleRefs ? 'two images are' : 'image is'} style only` : ''
  const roles = [charSpan, worldSpan, extraSpan].filter(Boolean).join('; ')
  return (
    `- Reference roles: ${roles}${styleNote}. AUTHORITY when references disagree — ` +
    (characterRefCount > 0
      ? 'the character sheets decide identity, face, hair, costume, armor and every worn or carried prop: reproduce them exactly as in the sheet, even where the pencil strip shows a different outfit, a missing item or an extra item; '
      : '') +
    (worldRefCount > 0
      ? 'the location reference decides the environment — terrain layout, structures, landmark positions and distances, set dressing: keep this geography identical to the reference and to the other shots of the scene; '
      : 'keep the environment identical across all shots of the scene — never merge, move or invent terrain and structures; ') +
    'the pencil strip decides ONLY framing, composition, poses, blocking and the direction arrows. A pencil-drawn detail never overrides a sheet.'
  )
}

export function buildRealStripPrompt(
  shotPrompt: string,
  opts: {
    characterRefCount: number
    /** #asset-authority: 인물 시트 뒤에 오는 배경(로케이션) 레퍼런스 수. 생략 = 0(종전 문안). */
    worldRefCount?: number
    /** #ref-gate: 배경 뒤의 추가 입력(프레임 참조 등) 수. 생략 = 0. */
    extraRefCount?: number
    /** #ref-gate: 참조 순서(첫 이미지 다음)대로의 인물 라벨. 주면 익명 "corresponding" 문장을 대체한다. */
    characterRefs?: CharacterRefLabel[]
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
    /** #sheet-formats: 레퍼런스 시트의 프레임 축 — composeRoughReferenceStrip 반환 지오메트리와
     *  반드시 같은 값. 'cols' = 세로 포맷 가로 3열(좌→우 = START/DIRECTION/END). 생략 = 적층. */
    frameAxis?: 'rows' | 'cols'
  },
): string {
  const { characterRefCount, hasStyleRef, cineLine } = opts
  const rowLayout = opts.frameAxis === 'cols'
  // 위치어 토큰 — 적층(위/중/아래) vs 가로 3열(왼/중/오른). 문안 구조는 동일하게 유지한다.
  const p1 = rowLayout ? 'Left' : 'Top'
  const p3 = rowLayout ? 'Right' : 'Bottom'
  const sheetDesc = rowLayout
    ? '3-panel horizontal storyboard row (three panels side by side on one wide sheet)'
    : '3-panel vertical storyboard strip'
  const layoutContract = rowLayout
    ? 'the same single wide sheet with exactly three side-by-side panels'
    : 'the same single vertical sheet with exactly three stacked panels'
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
    `The FIRST reference image is a ${sheetDesc} of ONE film shot, drawn as rough pencil previz with wooden mannequin stand-ins. ${p1} panel = START frame. Middle panel = DIRECTION frame — the same drawing as START plus hand-drawn direction arrows and text labels describing the camera and figure movement. ${p3} panel = END frame, after that movement completes.`,
    '',
    `Repaint this exact strip as ${target}:`,
    `- The output MUST be ${layoutContract} — never a single standalone picture, and never add any decorative frame or border outside the sheet.`,
    `- Keep the sheet layout and the three panel borders exactly as they are; draw only inside the panels.`,
    `- ${p1} panel: full-quality repaint of the START frame — same camera setup, framing, composition and poses as reference panel 1.`,
    // #tfix-repaint-prompt 2026-08-11: A1 실측 체계 결함 2건 보강 —
    //   ④ 정지 샷(sh_02_10)에 없던 화살표가 3반복 모두 추가됨 → 원본에 없는 주석 발명 금지.
    //   ③ 2동작 샷(sh_01_09)의 END 패널이 3반복 전부 실패 → 도착 상태 전건 완료 재현 명시.
    `- Middle panel: the exact same image as the ${p1.toLowerCase()} panel, with the SAME direction arrows and labels from reference panel 2 redrawn boldly on top as an annotation overlay, clearly visible. This is the only panel with text. Never invent arrows or labels that are not in reference panel 2 — if the rough sheet has no arrows (a static hold), the middle panel stays clean with no annotation.`,
    `- ${p3} panel: full-quality repaint of the END frame — the same shot after the motion completes, matching reference panel 3's composition exactly. Reproduce panel 3's arrived state faithfully: every element the motion changed (a drawer now open, a figure now moved or turned, an object now displaced) must be shown in its completed end state. If the shot contains two or more movements, show ALL of them completed — never repeat the ${p1.toLowerCase()} panel's state.`,
    // #end-fidelity: 그리드 쪽과 동일 — 샷 사이즈 불변(재프레이밍 금지) 명시.
    `- Every panel keeps its reference panel's exact shot size and camera distance — never push in, pull out or reframe: an extreme close-up stays an extreme close-up, a full shot stays a full shot, and each figure's size within the frame stays the same as in the reference.`,
    ...(opts.characterRefs && opts.characterRefs.length > 0
      ? stripIdentityBlock(opts.characterRefs)
      : characterRefCount > 0
        ? [
            `- Replace every wooden mannequin with the corresponding character(s) from ${charLocation} (character/world references): keep their identity, design and outfit; the same character(s), consistent across all three panels.`,
          ]
        : []),
    // #asset-authority(2026-09-02 오너 실측 bd5da55f: 갑옷·왕관이 샷마다 달라지고 떨어져 있던 바위가
    //   합쳐짐): 연필 previz 가 디테일까지 권위를 갖던 것을 뒤집는다 — 시트/배경이 이기고, 연필은
    //   구도·포즈·카메라만 정한다.
    ...(characterRefCount > 0 || (opts.worldRefCount ?? 0) > 0 || (opts.extraRefCount ?? 0) > 0
      ? [assetAuthorityClause(characterRefCount, opts.worldRefCount ?? 0, hasStyleRef, twoStyleRefs, opts.extraRefCount ?? 0)]
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
