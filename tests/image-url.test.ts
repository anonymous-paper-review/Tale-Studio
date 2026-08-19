import { describe, it, expect, vi } from 'vitest'
import { toThumbUrl, thumbUrl } from '@/lib/image-url'
import { mediaPublicUrl } from '@/lib/storage/media-url'

// 주소를 하드코딩하지 않고 계산한다 — 보관함을 다른 회사로 옮기면 접두사가 바뀌는데,
// 고정 문자열이면 테스트가 옛 주소를 계속 통과시켜 회귀를 놓친다.
const PUBLIC = mediaPublicUrl('proj/shot_1_storyboard.png')
const THUMB = mediaPublicUrl('proj/shot_1_storyboard_thumb.webp')

describe('toThumbUrl', () => {
  it('swaps a media bucket public image URL to its _thumb.webp sibling', () => {
    expect(toThumbUrl(PUBLIC)).toBe(THUMB)
  })

  it('preserves the version query (?v=)', () => {
    expect(toThumbUrl(`${PUBLIC}?v=1720000000000`)).toBe(`${THUMB}?v=1720000000000`)
  })

  it('leaves non-media URLs unchanged (fal/blob/external)', () => {
    expect(toThumbUrl('https://fal.media/files/x.png')).toBe('https://fal.media/files/x.png')
    expect(toThumbUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
  })

  it('다른 Supabase 프로젝트의 주소는 건드리지 않는다', () => {
    // 우리 보관함이 아닌 주소를 _thumb.webp 로 바꾸면 남의 서버에 없는 파일을 요청하게 된다.
    const foreign = 'https://other.supabase.co/storage/v1/object/public/media/proj/a.png'
    expect(toThumbUrl(foreign)).toBe(foreign)
  })

  it('leaves extension-less paths unchanged', () => {
    const u = mediaPublicUrl('proj/folder')
    expect(toThumbUrl(u)).toBe(u)
  })
})

describe('thumbUrl', () => {
  it('normalizes null/undefined/empty to undefined', () => {
    expect(thumbUrl(null)).toBeUndefined()
    expect(thumbUrl(undefined)).toBeUndefined()
    expect(thumbUrl('')).toBeUndefined()
  })

  it('passes through the original when the thumbs flag is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_IMAGE_THUMBS', '0')
    vi.resetModules()
    const disabledModule = await import('@/lib/image-url')
    expect(disabledModule.imageThumbsEnabled).toBe(false)
    expect(disabledModule.thumbUrl(PUBLIC)).toBe(PUBLIC)
    vi.unstubAllEnvs()
  })
})
