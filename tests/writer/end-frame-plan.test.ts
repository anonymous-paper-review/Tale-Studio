// 끝 장을 다시 그리는 방식이 서버 한 곳에서 정해지고, 샷 설계의 옛 움직임 글을 싣지 않는지 검사한다(D10 · 2026-11-22)
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateReservedImage: vi.fn(),
  upload: vi.fn(),
  thumb: vi.fn(),
  deriveEnBatch: vi.fn(),
  assertUserTextAllowed: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', '').split('?')[0],
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.thumb }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/moderation/creem', () => ({ assertUserTextAllowed: mocks.assertUserTextAllowed }))

import { END_FRAME_METHOD, endFramePlan, regenerateEndFrame, regenerateRoughFrame } from '@/lib/writer/directing-edit'

// 이 시험을 위해 지은 샷 — 행동 글(이름 · 대사 · 카메라 문장)과 샷 설계의 카메라 무브가 있다. 가운데 장은 사람이 화살표를 고친 것이다.
const FRAMES = { start: 'https://media.test/r/start.png', direction: 'https://media.test/r/direction-edited.png', end: 'https://media.test/r/end.png' }
let row: Record<string, unknown> = {}
const selected: string[] = []

beforeEach(async () => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  selected.length = 0
  row = {
    rough_storyboard: { status: 'completed', generatedAt: 100, frames: { ...FRAMES } },
    action_description: "도윤이 '마지막이야'라고 중얼거리며 앞으로 걸어간다. 카메라가 천천히 다가간다.",
    dynamic_spec: { camera_motion: { type: 'dolly_in', direction: 'forward', speed: 'slow' } },
  }
  const q: Record<string, unknown> = {}
  q.select = (cols: string) => { selected.push(cols); return q }
  q.eq = () => q
  q.update = () => q
  q.maybeSingle = async () => ({ data: structuredClone(row), error: null })
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'row' }], error: null }).then(resolve)
  mocks.from.mockReturnValue(q)
  mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/out.png' })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.assertUserTextAllowed.mockResolvedValue({ receipt: 'ok' })
  mocks.deriveEnBatch.mockImplementation(async (items: Array<{ id: string }>) => new Map(items.map((item) => [item.id, 'Doyun walks forward. The camera slowly moves in.'])))
  const raw = Buffer.alloc(255 * 447 * 3)
  let seed = 1
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[i] = (seed >> 16) & 255
  }
  const png = await sharp(raw, { raw: { width: 255, height: 447, channels: 3 } }).png().toBuffer()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } })))
})

const sent = (i = 0) => mocks.generateReservedImage.mock.calls[i][0] as { model: string; prompt: string; reference_image_urls: string[] }

describe('끝 장 다시 그리기의 재료', () => {
  // 왜: 끝 장은 고친 화살표를 따라야 한다 — 샷 설계의 옛 움직임 글(행동 글 · 카메라 무브)을 함께 실으면 고친 화살표와 다툰다(D10 피드백 7의 뿌리).
  it('끝 장을 다시 그릴 때 샷 설계의 옛 움직임 글(행동 글 · 카메라 무브)은 넣지 않는다', async () => {
    await regenerateRoughFrame('p1', 'sh_1', 'end')
    const { prompt } = sent()
    expect(prompt).not.toMatch(/Doyun|도윤|dolly|slowly moves in/i)
    expect(mocks.deriveEnBatch).not.toHaveBeenCalled()
    expect(selected.some((cols) => /action_description|dynamic_spec/.test(cols))).toBe(false)
    // 실리는 사용자 글이 없다 — 검사에도 빈 것만 간다.
    expect((mocks.assertUserTextAllowed.mock.calls[0][0] as unknown[]).every((part) => part == null || part === '')).toBe(true)
  })

  // 왜: 옛 [저장 후 END 재생성] 요청과 [이 장만 다시 만들기](끝)가 다른 재료로 그리면 같은 단추 이름에 다른 그림이 나온다.
  it('옛 [저장 후 END 재생성] 요청과 끝 장 [이 장만 다시 만들기]는 같은 그림 AI · 같은 문장 · 같은 참고 그림으로 그린다', async () => {
    await regenerateEndFrame('p1', 'sh_1')
    await regenerateRoughFrame('p1', 'sh_1', 'end')
    const [a, b] = [sent(0), sent(1)]
    expect(a.model).toBe(b.model)
    expect(a.prompt).toBe(b.prompt)
    expect(a.reference_image_urls).toEqual(b.reference_image_urls)
  })

  // 왜(혼자 정한 것 · 쉬움): 끝 장 그리는 방식은 오너가 비교 보드(지금 · ① · ② · ②′)를 보고 고른다 — 고를 때까지 지금 방식 그대로이고,
  //   바꿀 때는 이 한 곳만 바꾸면 물음의 [다시 그리기] · [이 장만 다시 만들기] · 옛 요청이 함께 바뀐다.
  it('끝 장을 그리는 방식은 서버 한 곳에서 정하고, 오너가 고르기 전까지는 고친 가운데 장 한 장과 정해진 문장으로 그린다', async () => {
    expect(END_FRAME_METHOD).toBe('direction-only')
    const plan = endFramePlan(FRAMES)
    expect(plan.model).toBe('xai/grok-imagine-image/edit')
    expect(plan.refs).toEqual([FRAMES.direction])
    expect(plan.userText).toBeNull()
    expect(plan.prompt).toMatch(/Redraw the same scene just after that movement has fully completed/)
    await regenerateRoughFrame('p1', 'sh_1', 'end')
    expect(sent()).toMatchObject({ model: plan.model, prompt: plan.prompt, reference_image_urls: plan.refs })
  })
})
