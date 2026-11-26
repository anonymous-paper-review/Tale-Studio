// Writer 샷 시트를 Nano Banana 2 로 다시 칠할 때는 시트 크기에 가장 가까운 비율로 그리고 받은 칸을 칸 모양으로 맞춰 자르며, 맞는 비율이 없는 프로젝트(정사각)에서는 고를 수 없다 — 시트가 아닌 Nano Banana 2 요청은 지금 그대로다 (오너 2026-11-26 D5 · 리드 Q2 길 a)
import { describe, expect, it } from 'vitest'
import { buildFalImageInput } from '@/lib/writer/llm/fal'
import { computeIgnoredFields } from '@/lib/fal/model-schemas'
import sharp from 'sharp'
import { imageModelSupportsSheetCanvas, resolveSheetImageModel } from '@/lib/image-models'
import { WRITER_SHEET_CANVAS, detailImageModel, detailImageModels } from '@/lib/director/shot-detail'
import { sheetGeometry } from '@/lib/writer/rough-storyboard-grid'
import { fitStripFramesToCells } from '@/lib/director/sheet-fit'

const EDIT = 'fal-ai/nano-banana-2/edit'
const REFS = ['https://example.test/strip.png', 'https://example.test/sheet.png']

describe('Nano Banana 2 로 시트 다시 칠하기', () => {
  it('Writer 샷 시트를 Nano Banana 2 로 다시 칠할 때는 시트 크기에 가장 가까운 Nano Banana 2 비율로 그리게 한다', () => {
    // 왜: 리드 Q2 길 a — Nano Banana 2 는 정확한 크기(image_size)를 받지 않고 비율만 받는다. 예전에는 비율도 보내지 않아 정사각(1024²)이 와서 시트 칸이 어긋났다(3e0169eb 18/18).
    const ratio = (size: string) => buildFalImageInput({ prompt: 'p', image_size: size, reference_image_urls: REFS }, EDIT).aspect_ratio
    expect(ratio('1536x896')).toBe('16:9') // 세로 9:16 프로젝트의 가로 세 칸 시트(1.71)
    expect(ratio('1024x1712')).toBe('9:16') // 가로 16:9 프로젝트의 세로 세 칸 시트(0.60)
    expect(ratio('1024x1296')).toBe('4:5') // 시네마 2.39:1 프로젝트(0.79)
    expect(ratio('1024x1536')).toBe('2:3') // 화면비를 모르는 예전 프로젝트(0.67)
  })

  it('시트를 다시 칠하는 Nano Banana 2 요청에는 모델이 받지 않는 칸이 없다', () => {
    // 왜: Nano Banana 2 는 image_size 칸이 없다 — 시트 크기는 비율로 바꿔 보내고 크기 칸은 보내지 않는다.
    const input = buildFalImageInput({ prompt: 'p', image_size: '1024x1712', reference_image_urls: REFS }, EDIT)
    expect(input).toEqual({ prompt: 'p', image_urls: REFS, aspect_ratio: '9:16' })
    expect(computeIgnoredFields(input, EDIT)).toEqual([])
  })

  it('시트가 아닌 Nano Banana 2 편집(에셋 · Artist)은 지금처럼 비율을 보내지 않고 첫 그림을 따른다', () => {
    // 왜: 정상 경로 고정 — 에셋 노드 · Artist 시트는 정한 크기 없이 고치는 그림의 비율을 따른다. 시트(정한 가로 × 세로)일 때만 비율을 싣는다.
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: '16:9', reference_image_urls: REFS }, EDIT)).toEqual({ prompt: 'p', image_urls: REFS })
    expect(buildFalImageInput({ prompt: 'p', image_size: 'landscape_16_9', reference_image_urls: REFS }, EDIT)).toEqual({ prompt: 'p', image_urls: REFS })
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: '16:9' }, 'fal-ai/nano-banana-2')).toEqual({ prompt: 'p', aspect_ratio: '16:9' })
  })
})

const FORMATS = ['horizontal_16:9', 'vertical_9:16', 'cinema_2.39:1', 'square_1:1'] as const

describe('Nano Banana 2 를 고를 수 있는 Writer 샷', () => {
  it('가로 · 세로 · 시네마 · 화면비를 모르는 프로젝트의 Writer 샷 이미지 모델 칸에는 Nano Banana 2 가 보이고 그대로 그린다', () => {
    // 왜: 리드 Q2 — "나노바나나" = Nano Banana 2, 시트 모양에 가까운 비율이 있으면(어긋남 6.3% · 3.7% · 1.3% · 0%) 그 비율로 그린 뒤 맞춰 자른다.
    for (const format of ['horizontal_16:9', 'vertical_9:16', 'cinema_2.39:1', null] as const) {
      expect(detailImageModels({ writerShotId: 'sh_01_01' }, format), String(format)).toContain('nano-banana-2')
      expect(detailImageModel({ writerShotId: 'sh_01_01', imageModel: 'nano-banana-2' }, format), String(format)).toBe('nano-banana-2')
      expect(resolveSheetImageModel('nano-banana-2', WRITER_SHEET_CANVAS[format ?? 'legacy']), String(format)).toBe('nano-banana-2')
    }
  })

  it('정사각 프로젝트처럼 시트 모양에 가까운 Nano Banana 2 비율이 없으면 그 프로젝트의 Writer 샷에서는 고를 수 없고, 고른 적이 있어도 GPT Image 2 로 그린다', () => {
    // 왜: 리드 Q2 "정사각처럼 안 맞는 비율이 있으면 그 비율에서만 고르지 못하게" — 정사각 프로젝트의 세 칸 시트(640×1792, 0.36)에 가장 가까운 비율 1:4 도 43% 어긋난다.
    expect(detailImageModels({ writerShotId: 'sh_01_01' }, 'square_1:1')).not.toContain('nano-banana-2')
    expect(detailImageModel({ writerShotId: 'sh_01_01', imageModel: 'nano-banana-2' }, 'square_1:1')).toBe('gpt-image-2')
    expect(resolveSheetImageModel('nano-banana-2', '640x1792')).toBe('gpt-image-2')
    expect(imageModelSupportsSheetCanvas('nano-banana-2', '640x1792')).toBe(false)
  })

  it('시트 크기를 모르면 Nano Banana 2 로 시트를 그리지 않는다', () => {
    // 왜: 맞는 비율인지 알 수 없으면 안전한 쪽(정한 크기를 지키는 GPT Image 2) — 예전 약속(시트 크기를 모르는 1세대 · 2세대 나노바나나는 GPT Image 2)과 같다.
    expect(resolveSheetImageModel('nano-banana-2')).toBe('gpt-image-2')
    expect(resolveSheetImageModel('nano-banana')).toBe('gpt-image-2')
    expect(imageModelSupportsSheetCanvas('nano-banana', '1536x896')).toBe(false)
  })

  it('포맷별 Writer 샷 시트 크기 표는 시트 스펙(sheetGeometry)과 같다', () => {
    // 왜: 화면의 모델 칸과 서버의 모델 판정이 같은 시트 크기를 보아야 한다 — 화면은 시트 스펙 모듈(Writer 파이프라인)을 불러오지 않고 이 표를 쓴다.
    for (const format of FORMATS) expect(WRITER_SHEET_CANVAS[format], format).toBe(sheetGeometry('strip1', format).repaintCanvas)
    expect(WRITER_SHEET_CANVAS.legacy).toBe(sheetGeometry('strip1', null).repaintCanvas)
  })
})

describe('Nano Banana 2 가 돌려준 시트 맞추기', () => {
  const frame = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 90, g: 90, b: 90 } } }).png().toBuffer()
  const size = async (buf: Buffer) => { const m = await sharp(buf).metadata(); return `${m.width}x${m.height}` }

  it('시트가 정한 모양과 다르게 오면 세 칸을 칸 모양으로 가운데를 남기고 맞춰 자른다', async () => {
    // 왜: 실측(개발 DB 2장) — Nano Banana 2 는 칸을 같은 비례 자리에 그려 칸 찾기는 맞지만, 한 칸의 모양이 시트 비율만큼 어긋난다(16:9 칸이 1.66).
    //   늘리면 얼굴이 그만큼 넓어져서 늘리지 않고 가운데를 잘라 칸 모양(16:9)을 맞춘다.
    const sheet = { width: 768, height: 1376 }
    const expected = { width: 1024, height: 1712 }
    const raw = { start: await frame(714, 431), direction: await frame(714, 431), end: await frame(714, 431) }
    const fitted = await fitStripFramesToCells(raw, sheet, expected, 16 / 9)
    for (const key of ['start', 'direction', 'end'] as const) expect(await size(fitted[key]), key).toBe('714x402')
  })

  it('정한 크기 그대로 온 시트(GPT Image 2 · Seedream 4 · H3 Image)의 칸은 지금 그대로다', async () => {
    // 왜: 정상 경로 고정 — 시트 모양이 2% 안이면 손대지 않는다.
    const raw = { start: await frame(946, 530), direction: await frame(946, 530), end: await frame(946, 530) }
    const same = await fitStripFramesToCells(raw, { width: 1024, height: 1712 }, { width: 1024, height: 1712 }, 16 / 9)
    expect(same).toBe(raw)
  })
})
