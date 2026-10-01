// Writer 마스터 시트 캔버스 렌더러(클라이언트 전용, React 없음).
//   순수 모델(src/lib/writer/master-sheet.ts)의 페이지 하나를 <canvas>에 그린다. 미리보기(화면 썸네일)와
//   내보내기(PNG)가 같은 함수를 쓰므로 둘이 어긋나지 않는다(WYSIWYG).
import type { AppLocale } from '@/lib/locale'
import { translate } from '@/lib/i18n/translate'
import type { MasterSheetPage, MasterSheetRow } from '@/lib/writer/master-sheet'

// 고정 인쇄 색 — 이 캔버스는 테마가 있는 화면 UI 가 아니라 클라이언트에게 보내는 고정된 종이 문서라
//   globals.css 토큰 대신 상수로 둔다(design.md §17은 React Flow 캔버스 전용, 이 문서엔 적용 대상 아님).
const PRINT = {
  paper: '#ffffff',
  ink: '#1a1a1a',
  inkMuted: '#666666',
  line: '#d9d9d9',
  boxBg: '#eeeeee',
  boxBorder: '#bbbbbb',
} as const

// 캔버스 폰트는 의도적으로 시스템 제네릭(sans-serif) — 이 문서는 테마 UI가 아니라 내보내기 산출물이라
//   Geist/Pretendard 웹폰트 로드(document.fonts.ready) 대기 없이 OS 기본 CJK 폰트로 바로 그린다.
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'

const PAGE_WIDTH = 800 // CSS px 기준 — A4 세로 비율로 높이는 내용에 맞춰 가변(아래 측정 패스).
const MARGIN = 40
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const RENDER_SCALE = 2 // 2x — 다운로드한 PNG가 화면 미리보기보다 선명하게.
const FRAME_GAP = 10
const FRAME_LABEL_HEIGHT = 18
const ROW_GAP = 18
const HEADER_HEIGHT = 92
const FOOTER_HEIGHT = 40

export interface MasterSheetRenderContext {
  projectTitle: string
  frameAspectRatio: string // 'W:H', 예: '16:9' · '9:16'
  totalRuntimeSeconds: number
  locale: AppLocale
}

function frameBoxHeight(width: number, aspectRatio: string): number {
  const [w, h] = aspectRatio.split(':').map(Number)
  if (!w || !h) return (width * 9) / 16
  return (width * h) / w
}

function formatTimecode(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 공백 기준으로 줄바꿈하고, 공백 없는 긴 덩어리(한글 등)는 글자 단위로 끊는다. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text.trim()) return []
  const breakByChar = (word: string): string[] => {
    const parts: string[] = []
    let chunk = ''
    for (const ch of word) {
      const next = chunk + ch
      if (chunk && ctx.measureText(next).width > maxWidth) {
        parts.push(chunk)
        chunk = ch
      } else {
        chunk = next
      }
    }
    if (chunk) parts.push(chunk)
    return parts
  }
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word
    if (ctx.measureText(attempt).width <= maxWidth) {
      current = attempt
      continue
    }
    if (current) lines.push(current)
    if (ctx.measureText(word).width <= maxWidth) {
      current = word
    } else {
      const broken = breakByChar(word)
      lines.push(...broken.slice(0, -1))
      current = broken.at(-1) ?? ''
    }
  }
  if (current) lines.push(current)
  return lines
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  const attempt = (src: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous' // CORS 통과 못 하면 깨끗이 onerror(캔버스 오염 방지).
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = src
    })
  return attempt(url).then((img) => {
    if (img) return img
    const bust = url + (url.includes('?') ? '&' : '?') + `cb=${Date.now()}`
    return attempt(bust)
  })
}

async function loadFramesOf(pages: readonly MasterSheetPage[]): Promise<Map<string, HTMLImageElement | null>> {
  const urls = new Set<string>()
  for (const page of pages) {
    for (const row of page.rows) {
      for (const url of [row.frames.start, row.frames.direction, row.frames.end]) if (url) urls.add(url)
    }
  }
  const entries = await Promise.all([...urls].map(async (url) => [url, await loadImage(url)] as const))
  return new Map(entries)
}

function drawFrameBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  url: string | null,
  images: ReadonlyMap<string, HTMLImageElement | null>,
  locale: AppLocale,
) {
  const img = url ? images.get(url) : null
  ctx.fillStyle = PRINT.boxBg
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = PRINT.boxBorder
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  if (img) {
    // object-fit: cover — 박스를 채우고 중앙 기준으로 넘치는 부분만 자른다.
    const scale = Math.max(w / img.width, h / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    ctx.restore()
  } else {
    ctx.fillStyle = PRINT.inkMuted
    ctx.font = `12px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(translate(locale, 'No image'), x + w / 2, y + h / 2)
  }
  // 라벨(START/DIRECTION/END) — 오너 지시대로 번역하지 않고 영문 대문자 그대로.
  ctx.fillStyle = PRINT.inkMuted
  ctx.font = `600 11px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(label, x + w / 2, y + h + 4)
}

/**
 * 측정과 실제 그리기를 한 함수로 — draw=false 면 높이만 계산하고(이미지 불필요, 박스 높이는 폭×비율로 정해짐),
 * draw=true 면 실제로 그린다. 레이아웃 로직이 두 곳에서 갈라지면 미리보기·내보내기가 어긋날 수 있어 하나로 묶는다.
 */
function layoutPage(
  ctx: CanvasRenderingContext2D,
  page: MasterSheetPage,
  render: MasterSheetRenderContext,
  images: ReadonlyMap<string, HTMLImageElement | null>,
  draw: boolean,
): number {
  const { locale } = render
  let y = MARGIN

  // ── 헤더 ──────────────────────────────────────────────────────────
  if (draw) {
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = PRINT.ink
    ctx.font = `700 20px ${FONT_FAMILY}`
    ctx.textAlign = 'left'
    ctx.fillText(render.projectTitle, MARGIN, y + 20)

    ctx.font = `13px ${FONT_FAMILY}`
    ctx.fillStyle = PRINT.inkMuted
    ctx.textAlign = 'right'
    ctx.fillText(
      translate(locale, 'Page {page} / {total}', { page: page.pageIndex, total: page.totalPages }),
      MARGIN + CONTENT_WIDTH,
      y + 20,
    )

    const sceneNumber = String(page.sceneNumber).padStart(2, '0')
    const sceneLabel =
      page.scenePart.total > 1
        ? translate(locale, 'Scene {number} ({part}/{parts})', {
            number: sceneNumber,
            part: page.scenePart.index,
            parts: page.scenePart.total,
          })
        : translate(locale, 'Scene {number}', { number: sceneNumber })
    ctx.font = `600 14px ${FONT_FAMILY}`
    ctx.fillStyle = PRINT.ink
    ctx.textAlign = 'left'
    ctx.fillText(sceneLabel, MARGIN, y + 44)

    const metaParts = [
      `${translate(locale, 'Location')}: ${page.locationName || '-'}`,
      `${translate(locale, 'Time')}: ${page.timeOfDay || '-'}`,
      `${translate(locale, 'Characters')}: ${page.characters.length ? page.characters.join(', ') : translate(locale, 'None')}`,
      `${translate(locale, 'Scene length')}: ${formatTimecode(page.sceneDurationSeconds)}`,
    ]
    ctx.font = `12px ${FONT_FAMILY}`
    ctx.fillStyle = PRINT.inkMuted
    ctx.fillText(metaParts.join('   ·   '), MARGIN, y + 64)

    ctx.strokeStyle = PRINT.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(MARGIN, y + HEADER_HEIGHT - 8)
    ctx.lineTo(MARGIN + CONTENT_WIDTH, y + HEADER_HEIGHT - 8)
    ctx.stroke()
  }
  y += HEADER_HEIGHT

  // ── 샷 행 ─────────────────────────────────────────────────────────
  const frameWidth = (CONTENT_WIDTH - FRAME_GAP * 2) / 3
  const frameHeight = frameBoxHeight(frameWidth, render.frameAspectRatio)

  for (const row of page.rows) {
    if (draw) {
      ctx.font = `700 14px ${FONT_FAMILY}`
      ctx.fillStyle = PRINT.ink
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(row.code, MARGIN, y + 14)
    }
    y += 22

    if (draw) {
      const frames: Array<[string, string | null]> = [
        ['START', row.frames.start],
        ['DIRECTION', row.frames.direction],
        ['END', row.frames.end],
      ]
      frames.forEach(([label, url], i) => {
        const x = MARGIN + i * (frameWidth + FRAME_GAP)
        drawFrameBox(ctx, x, y, frameWidth, frameHeight, label, url, images, locale)
      })
    }
    y += frameHeight + FRAME_LABEL_HEIGHT + 12

    y = layoutDescription(ctx, row, y, draw, locale)
    y += ROW_GAP

    if (draw) {
      ctx.strokeStyle = PRINT.line
      ctx.beginPath()
      ctx.moveTo(MARGIN, y - ROW_GAP / 2)
      ctx.lineTo(MARGIN + CONTENT_WIDTH, y - ROW_GAP / 2)
      ctx.stroke()
    }
  }

  // ── 푸터 ──────────────────────────────────────────────────────────
  if (draw) {
    ctx.strokeStyle = PRINT.line
    ctx.beginPath()
    ctx.moveTo(MARGIN, y)
    ctx.lineTo(MARGIN + CONTENT_WIDTH, y)
    ctx.stroke()
    ctx.font = `12px ${FONT_FAMILY}`
    ctx.fillStyle = PRINT.inkMuted
    ctx.textAlign = 'left'
    ctx.fillText(
      `${render.frameAspectRatio}   ·   ${formatTimecode(render.totalRuntimeSeconds)}   ·   Tale Studio`,
      MARGIN,
      y + 22,
    )
  }
  y += FOOTER_HEIGHT

  return y
}

function layoutDescription(
  ctx: CanvasRenderingContext2D,
  row: MasterSheetRow,
  startY: number,
  draw: boolean,
  locale: AppLocale,
): number {
  let y = startY
  const lineHeight = 18
  const writeLine = (text: string, bold = false) => {
    if (draw) {
      ctx.font = `${bold ? '600 ' : ''}13px ${FONT_FAMILY}`
      ctx.fillStyle = PRINT.ink
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(text, MARGIN, y + 13)
    }
    y += lineHeight
  }
  const writeWrapped = (text: string) => {
    ctx.font = `13px ${FONT_FAMILY}` // measureText 는 draw 여부와 무관하게 폰트가 맞아야 한다.
    for (const line of wrapText(ctx, text, CONTENT_WIDTH)) writeLine(line)
  }

  writeLine(`${translate(locale, 'Shot size')}: ${translate(locale, row.shotSizeLabel)}`)
  writeLine(`${translate(locale, 'Characters')}: ${row.characters.length ? row.characters.join(', ') : translate(locale, 'None')}`)
  writeWrapped(row.action)
  if (row.dialogueLines.length > 0) {
    for (const line of row.dialogueLines) writeWrapped(line)
  } else {
    writeLine(translate(locale, 'No dialogue'))
  }
  // 대시 대신 물결(~) — 화면 문구에 대시를 쓰지 않는다(copy-style.md 약속 A).
  writeLine(
    `${translate(locale, 'Duration')}: ${translate(locale, '{sec}s', { sec: row.durationSeconds })} (${formatTimecode(row.timecodeStart)} ~ ${formatTimecode(row.timecodeEnd)})`,
  )
  return y
}

/** 페이지 높이를 재는 전용 2D 컨텍스트 — 실제 화면에 붙이지 않는다. */
function measuringContext(): CanvasRenderingContext2D {
  const probe = document.createElement('canvas')
  probe.width = PAGE_WIDTH
  probe.height = 10
  const ctx = probe.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  return ctx
}

/** 마스터 시트 페이지 하나를 캔버스에 그린다. 미리보기·PNG 내보내기가 공유하는 단일 경로(WYSIWYG). */
export async function renderMasterSheetPageCanvas(
  page: MasterSheetPage,
  render: MasterSheetRenderContext,
): Promise<HTMLCanvasElement> {
  const imagesPromise = loadFramesOf([page])
  const measureCtx = measuringContext()
  const contentHeight = layoutPage(measureCtx, page, render, new Map(), false)

  const canvas = document.createElement('canvas')
  canvas.width = PAGE_WIDTH * RENDER_SCALE
  canvas.height = contentHeight * RENDER_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.scale(RENDER_SCALE, RENDER_SCALE)
  ctx.fillStyle = PRINT.paper
  ctx.fillRect(0, 0, PAGE_WIDTH, contentHeight)

  const images = await imagesPromise
  layoutPage(ctx, page, render, images, true)
  return canvas
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob returned no data'))
    }, 'image/png')
  })
}
