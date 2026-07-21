import { describe, it, expect, vi } from 'vitest'
import { toThumbUrl, thumbUrl } from '@/lib/image-url'

const PUBLIC =
  'https://abc.supabase.co/storage/v1/object/public/media/proj/shot_1_storyboard.png'
const THUMB =
  'https://abc.supabase.co/storage/v1/object/public/media/proj/shot_1_storyboard_thumb.webp'

describe('toThumbUrl', () => {
  it('swaps a Supabase public image URL to its _thumb.webp sibling', () => {
    expect(toThumbUrl(PUBLIC)).toBe(THUMB)
  })

  it('preserves the version query (?v=)', () => {
    expect(toThumbUrl(`${PUBLIC}?v=1720000000000`)).toBe(`${THUMB}?v=1720000000000`)
  })

  it('leaves non-Supabase URLs unchanged (fal/blob/external)', () => {
    expect(toThumbUrl('https://fal.media/files/x.png')).toBe('https://fal.media/files/x.png')
    expect(toThumbUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
  })

  it('leaves extension-less paths unchanged', () => {
    const u = 'https://abc.supabase.co/storage/v1/object/public/media/proj/folder'
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
