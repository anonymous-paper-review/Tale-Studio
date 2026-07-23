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
 * 실사 리페인트 프롬프트 — Phase B 검증 문안의 일반화.
 *   레퍼런스 순서 계약: [러프 스트립, ...캐릭터/월드 시트(characterRefCount), 스타일 앵커(hasStyleRef)].
 */
export function buildRealStripPrompt(
  shotPrompt: string,
  opts: { characterRefCount: number; hasStyleRef: boolean },
): string {
  const { characterRefCount, hasStyleRef } = opts
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
    `- Keep the sheet layout and the three panel borders exactly as they are; draw only inside the panels.`,
    `- Top panel: full-quality repaint of the START frame — same camera setup, framing, composition and poses as reference panel 1.`,
    `- Middle panel: the exact same image as the top panel, with the SAME direction arrows and labels from reference panel 2 redrawn boldly on top as an annotation overlay, clearly visible. This is the only panel with text.`,
    `- Bottom panel: full-quality repaint of the END frame — the same shot after the motion completes, matching reference panel 3's composition exactly.`,
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
    `- No text anywhere except the middle panel's arrow labels.`,
  ]
  return lines.join('\n')
}
