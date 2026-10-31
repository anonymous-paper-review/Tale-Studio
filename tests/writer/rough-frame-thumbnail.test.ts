// 러프 한 장을 다시 그리거나 연출 그림을 저장하면 카드 · 팝업에 보이는 작은 미리보기도 새 그림으로 바뀌는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT = '11111111-2222-4333-8444-555555555555'
const SHOT = 'sh_01_03'
const ROUGH = {
  status: 'completed',
  generatedAt: 100,
  frames: {
    start: 'https://media.test/ws/p/shots/v1-x_rough_start.png?v=1',
    direction: 'https://media.test/ws/p/shots/v1-x_rough_direction.png?v=1',
    end: 'https://media.test/ws/p/shots/v1-x_rough_end.png?v=1',
  },
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateReservedImage: vi.fn(),
  upload: vi.fn(),
  thumbnail: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => new URL(url).pathname.replace(/^\//, ''),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.thumbnail }))

import { regenerateRoughFrame, saveDirectingFrame } from '@/lib/writer/directing-edit'

let rough: Record<string, unknown>

function query() {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.update = (value: Record<string, unknown>) => {
    rough = value.rough_storyboard as Record<string, unknown>
    return q
  }
  q.maybeSingle = async () => ({ data: { rough_storyboard: rough, action_description: 'She pushes the coin in' }, error: null })
  q.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
  return q
}

const drawn = Buffer.alloc(20_000, 7)

beforeEach(() => {
  vi.clearAllMocks()
  rough = structuredClone(ROUGH)
  mocks.from.mockImplementation(() => query())
  mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/result.jpg' })
  mocks.upload.mockResolvedValue({ data: { path: 'saved' }, error: null })
  mocks.thumbnail.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(drawn, { status: 200, headers: { 'content-type': 'image/jpeg' } })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('러프 한 장 고치기 뒤 작은 미리보기', () => {
  // 왜: 운영 화면(카드 · 팝업의 세 장)은 원본 대신 작은 미리보기(_thumb.webp)를 보여 준다. 한 장 다시 그리기는 원본만 바꾸고 미리보기는 처음 그린 그림
  //   그대로 둬서, "다시 그렸어요" 알림이 떠도 화면에는 옛 그림이 남았다(2026-10-31 개발 DB 실측: 원본 10/31 · 미리보기 10/20).
  it('러프 한 장(시작 · 연출 · 끝)을 다시 그리면 그 장의 작은 미리보기도 새 그림으로 다시 만든다', async () => {
    await regenerateRoughFrame(PROJECT, SHOT, 'start')

    const [framePath, frameBuf] = mocks.upload.mock.calls[0]
    expect(framePath).toBe('ws/p/shots/v1-x_rough_start.jpg')
    expect(mocks.thumbnail).toHaveBeenCalledWith(framePath, frameBuf)
    expect(Buffer.compare(frameBuf as Buffer, drawn)).toBe(0)
  })

  // 왜: 연출 그림에 화살표를 그려 [저장]하면 카드와 팝업 세 장이 그 그림으로 바뀌어야 한다 — 미리보기가 옛 그림이면 저장이 안 된 것처럼 보인다.
  it('연출 그림에 화살표를 그려 저장하면 연출 장의 작은 미리보기도 저장한 그림으로 다시 만든다', async () => {
    const png = Buffer.alloc(20_000, 9)
    await saveDirectingFrame(PROJECT, SHOT, `data:image/png;base64,${png.toString('base64')}`)

    expect(mocks.upload).toHaveBeenCalledTimes(1)
    const [framePath, frameBuf] = mocks.upload.mock.calls[0]
    expect(framePath).toBe('ws/p/shots/v1-x_rough_direction.png')
    expect(mocks.thumbnail).toHaveBeenCalledWith(framePath, frameBuf)
    expect(Buffer.compare(frameBuf as Buffer, png)).toBe(0)
  })
})
