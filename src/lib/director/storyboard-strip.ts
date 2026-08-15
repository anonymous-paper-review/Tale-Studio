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
} from '@/lib/writer/rough-storyboard-grid'
import { resolveWebhookBaseUrl } from '@/lib/fal/webhook-url'

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
  },
): string {
  const { characterRefCount, hasStyleRef, cineLines } = opts
  const target = hasStyleRef
    ? 'finished, final-quality film frames'
    : 'finished photorealistic live-action cinematic film frames'
  const charLocation = hasStyleRef
    ? 'the reference images between the first and the last'
    : 'the remaining reference images'
  return [
    `The FIRST reference image is a 4-column x 3-row storyboard sheet. Each COLUMN is ONE film shot, read top to bottom: row 1 = START frame, row 2 = DIRECTION frame (the same drawing as START plus hand-drawn arrows and labels), row 3 = END frame after the movement completes. The drawings are rough pencil previz with wooden mannequin stand-ins.${shotCount < 4 ? ` Only the first ${shotCount} column(s) contain shots — keep the remaining column(s) as empty blank panels.` : ''}`,
    '',
    `Repaint this exact sheet as ${target}:`,
    `- The output MUST be the same single 4x3 sheet — keep the sheet layout and every panel border exactly where they are; draw only inside the panels; never add any decoration outside the sheet.`,
    `- Each column stays the same shot: same camera setup, framing, composition and poses as its reference column. Rows keep their START/DIRECTION/END roles — arrows and labels redrawn boldly only in row 2.`,
    ...(characterRefCount > 0
      ? [
          `- Replace every wooden mannequin with the corresponding character(s) from ${charLocation} (character/world references): keep their identity, design and outfit, consistent across all panels.`,
        ]
      : []),
    ...(hasStyleRef
      ? [
          `- Match the exact visual style of the LAST reference image (style reference): art medium, rendering technique, linework, lighting mood and color grade. Do NOT reproduce its subject or objects.`,
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
  },
): string {
  const { characterRefCount, hasStyleRef, cineLine } = opts
  const target = hasStyleRef
    ? 'finished, final-quality film frames'
    : 'finished photorealistic live-action cinematic film frames'
  const charLocation = hasStyleRef
    ? 'the reference images between the first and the last'
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
          `- Match the exact visual style of the LAST reference image (style reference): match its art medium, rendering technique, linework, lighting mood and color grade. Do NOT reproduce its subject or objects.`,
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
