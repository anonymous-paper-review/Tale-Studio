// 러프 한 장(시작 · 연출 · 끝) 다시 그리기가 시트와 같은 규칙(얼굴 없는 목각 · 글자 없음)으로 그리고, 나머지 두 장과 같은 크기로 저장하는지 검사한다(2026-11-14)
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), generateReservedImage: vi.fn(), upload: vi.fn(), thumb: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', '').split('?')[0],
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.thumb }))

import { regenerateRoughFrame } from '@/lib/writer/directing-edit'

// 이 시험을 위해 지은 러프 — 시트에서 자른 세 장은 255×447, Grok 은 720×1280 으로 돌려준다(2026-11-14 개발 실측과 같은 크기).
const ROUGH = {
  status: 'completed',
  generatedAt: 100,
  frames: { start: 'https://media.test/r/start.png', direction: 'https://media.test/r/direction.png', end: 'https://media.test/r/end.png' },
}
const noisy = (width: number, height: number) => {
  const raw = Buffer.alloc(width * height * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()
}
let actionDescription: string | null = 'The girl points at the open notebook and laughs.'

beforeEach(async () => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  const q: Record<string, unknown> = {}
  let selected = ''
  q.select = (columns: string) => {
    selected = columns
    return q
  }
  q.eq = () => q
  q.update = () => q
  q.maybeSingle = async () => ({ data: selected === 'action_description' ? { action_description: actionDescription } : { rough_storyboard: structuredClone(ROUGH) }, error: null })
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'row' }], error: null }).then(resolve)
  mocks.from.mockReturnValue(q)
  mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/out.png' })
  mocks.upload.mockResolvedValue({ error: null })
  const generated = await noisy(720, 1280)
  const sibling = await noisy(255, 447)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(new Uint8Array(String(url).startsWith('https://fal.test/') ? generated : sibling), { status: 200, headers: { 'content-type': 'image/png' } })))
})

const promptOf = () => String(mocks.generateReservedImage.mock.calls[0][0].prompt)

describe('러프 한 장 다시 그리기', () => {
  // 왜: 한 장 다시 그리기 프롬프트에는 시트의 인물 · 글자 규칙이 없어, 연출 칸을 다시 만들면 얼굴 있는 만화 소녀 · 말풍선 "YOU'RE WASTING TIME!" ·
  //   "DIRECTING" · "DIR. FRAME 1" 상자가 그려졌다(2026-11-14 개발 실측 914165c8). 시작 · 끝 다시 그리기도 같은 규칙을 지킨다.
  it('러프 한 장을 다시 그려도, 인물은 얼굴 없는 같은 목각 인형이고 말풍선 · 대사 · 장면/샷 번호 · 프레임 이름 글씨를 넣지 않는다', async () => {
    for (const frame of ['start', 'direction', 'end'] as const) {
      mocks.generateReservedImage.mockClear()
      await regenerateRoughFrame('p1', 'sh_1', frame)
      const prompt = promptOf()
      expect(prompt).toMatch(/same classic wooden artist's drawing mannequin/)
      expect(prompt).toMatch(/absolutely no face/)
      expect(prompt).toMatch(/No speech bubbles/)
      expect(prompt).toMatch(/no scene or shot numbers/)
      expect(prompt).toMatch(/no frame names/)
      expect(prompt).not.toMatch(/\bSTART frame\b|\bstoryboard\b/i)
    }
  })

  // 왜: 시트에서 시작 칸과 연출 칸은 같은 순간이고 화살표 · 메모만 다르다(rough-storyboard-grid 규칙). 다시 그린 연출 칸이 다른 그림이 되면
  //   시작 · 끝과 이야기가 어긋난다.
  it('연출 한 장을 다시 그리면, 시작 그림과 같은 순간을 그대로 두고 화살표 · 움직임 선 · 짧은 메모만 더한다', async () => {
    await regenerateRoughFrame('p1', 'sh_1', 'direction')
    const prompt = promptOf()
    expect(mocks.generateReservedImage.mock.calls[0][0].reference_image_urls).toEqual([ROUGH.frames.start])
    expect(prompt).toMatch(/same frozen instant/)
    expect(prompt).toMatch(/add only arrows, motion lines and a few short handwritten motion notes/)
  })

  // 왜: Grok 은 720×1280 으로 돌려주는데 시트에서 자른 다른 두 장은 255×447 이다 — 세 장 크기가 달라 카드 순환 · 편집기 그림 크기가 어긋났다.
  it('다시 그린 한 장은 나머지 두 장과 같은 크기로 저장한다', async () => {
    await regenerateRoughFrame('p1', 'sh_1', 'direction')
    const saved = mocks.upload.mock.calls[0][1] as Buffer
    const meta = await sharp(saved).metadata()
    expect(`${meta.width}x${meta.height}`).toBe('255x447')
  })
})
