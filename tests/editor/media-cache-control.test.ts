import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { storage: { from: mocks.from } },
}))

import { MEDIA_CACHE_CONTROL, mediaUpload } from '@/lib/storage/media'

const PATH = 'workspace-1/project-1/shots/frame_start.png'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.from.mockReturnValue({ upload: mocks.upload })
  mocks.upload.mockResolvedValue({ data: { path: PATH }, error: null })
})

describe('MEDIA_CACHE_CONTROL 형식', () => {
  // Supabase 는 이 값 앞에 `public, max-age=` 를 붙인다. 지시자를 같이 적어 보내면
  // `max-age=public` 이 되어 브라우저가 캐시를 통째로 버린다 — 안 넣느니만 못한 상태다.
  // 실수하기 쉬운 형태라 상수 자체를 잠근다.
  it('초 숫자로 시작한다', () => {
    expect(MEDIA_CACHE_CONTROL).toMatch(/^\d+(,\s*[a-z-]+(=\d+)?)*$/)
  })

  it.each(['public', 'max-age', 'private', 's-maxage'])(
    "'%s' 를 포함하지 않는다 — Supabase 가 접두사를 이미 붙인다",
    (banned) => {
      expect(MEDIA_CACHE_CONTROL).not.toContain(banned)
    },
  )
})

describe('mediaUpload 의 캐시 기간', () => {
  it('생략하면 기본값을 넘긴다', async () => {
    await mediaUpload(PATH, Buffer.from('bytes'), { contentType: 'image/png' })

    expect(mocks.upload).toHaveBeenCalledWith(
      PATH,
      expect.anything(),
      expect.objectContaining({ cacheControl: MEDIA_CACHE_CONTROL }),
    )
  })

  it('호출부가 준 값이 기본값을 이긴다', async () => {
    await mediaUpload(PATH, Buffer.from('bytes'), {
      contentType: 'image/png',
      cacheControl: '31536000, immutable',
    })

    expect(mocks.upload).toHaveBeenCalledWith(
      PATH,
      expect.anything(),
      expect.objectContaining({ cacheControl: '31536000, immutable' }),
    )
  })

  it('캐시 기간을 넣어도 contentType·upsert 는 그대로 간다', async () => {
    await mediaUpload(PATH, Buffer.from('bytes'), {
      contentType: 'video/mp4',
      upsert: true,
    })

    expect(mocks.upload).toHaveBeenCalledWith(PATH, expect.anything(), {
      contentType: 'video/mp4',
      upsert: true,
      cacheControl: MEDIA_CACHE_CONTROL,
    })
  })
})
