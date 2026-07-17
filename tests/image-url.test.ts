import { describe, it, expect } from 'vitest'
import { buildRenderUrl, thumbUrl } from '@/lib/image-url'

const PUBLIC =
  'https://abc.supabase.co/storage/v1/object/public/media/proj/shot_1_storyboard.png'

describe('buildRenderUrl', () => {
  it('rewrites a Supabase public URL to the render endpoint with sizing params', () => {
    const out = buildRenderUrl(PUBLIC, 512)
    expect(out).toContain('/storage/v1/render/image/public/media/proj/shot_1_storyboard.png')
    expect(out).not.toContain('/object/public/')
    const q = new URL(out).searchParams
    expect(q.get('width')).toBe('512')
    expect(q.get('quality')).toBe('70')
    expect(q.get('resize')).toBe('contain')
  })

  it('preserves an existing version query (?v=)', () => {
    const out = buildRenderUrl(`${PUBLIC}?v=1720000000000`, 384, 60)
    const q = new URL(out).searchParams
    expect(q.get('v')).toBe('1720000000000')
    expect(q.get('width')).toBe('384')
    expect(q.get('quality')).toBe('60')
  })

  it('returns non-Supabase URLs unchanged (fal/blob/external)', () => {
    expect(buildRenderUrl('https://fal.media/files/x.png', 512)).toBe(
      'https://fal.media/files/x.png',
    )
    expect(buildRenderUrl('blob:http://localhost/abc', 512)).toBe(
      'blob:http://localhost/abc',
    )
  })
})

describe('thumbUrl', () => {
  it('normalizes null/undefined/empty to undefined', () => {
    expect(thumbUrl(null)).toBeUndefined()
    expect(thumbUrl(undefined)).toBeUndefined()
    expect(thumbUrl('')).toBeUndefined()
  })

  it('returns the original URL when the transform flag is disabled (test env default)', () => {
    // NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM is unset in tests → passthrough (no breakage).
    expect(thumbUrl(PUBLIC, 384)).toBe(PUBLIC)
  })
})
