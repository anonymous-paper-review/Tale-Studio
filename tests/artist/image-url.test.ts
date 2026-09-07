// 이미지 주소를 안전하게 줄여 쓰고, 원본 주소와 외부 주소는 그대로 보존한다
import { describe, it, expect, vi } from 'vitest'
import { toThumbUrl, thumbUrl } from '@/lib/image-url'
import { mediaPublicUrl } from '@/lib/storage/media-url'

// 주소를 하드코딩하지 않고 계산한다 — 보관함을 다른 회사로 옮기면 접두사가 바뀌는데,
// 고정 문자열이면 테스트가 옛 주소를 계속 통과시켜 회귀를 놓친다.
const PUBLIC = mediaPublicUrl('proj/shot_1_storyboard.png')
const THUMB = mediaPublicUrl('proj/shot_1_storyboard_thumb.webp')

describe('toThumbUrl', () => {
  it('보관함의 이미지 주소는 같은 위치의 작은 이미지 주소로 바꾼다', () => {
    expect(toThumbUrl(PUBLIC)).toBe(THUMB)
  })

  it('주소의 버전 표시(?v=)를 그대로 보존한다', () => {
    expect(toThumbUrl(`${PUBLIC}?v=1720000000000`)).toBe(`${THUMB}?v=1720000000000`)
  })

  it('우리 보관함이 아닌 외부 주소는 그대로 둔다', () => {
    expect(toThumbUrl('https://fal.media/files/x.png')).toBe('https://fal.media/files/x.png')
    expect(toThumbUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc')
  })

  it('다른 Supabase 프로젝트의 주소는 건드리지 않는다', () => {
    // 우리 보관함이 아닌 주소를 _thumb.webp 로 바꾸면 남의 서버에 없는 파일을 요청하게 된다.
    const foreign = 'https://other.supabase.co/storage/v1/object/public/media/proj/a.png'
    expect(toThumbUrl(foreign)).toBe(foreign)
  })

  it('파일 확장자가 없는 주소는 그대로 둔다', () => {
    const u = mediaPublicUrl('proj/folder')
    expect(toThumbUrl(u)).toBe(u)
  })

  it('이미 작은 이미지인 파일은 다시 바꾸지 않는다 (_thumb.webp / 영상 _thumbnail.jpg)', () => {
    // 영상 poster 류를 GeneratedImage(ThumbImage)로 그릴 때, 존재하지 않는
    // *_thumbnail_thumb.webp 를 매번 404 로 두드리는 낭비를 막는다.
    const already = mediaPublicUrl('proj/a_thumb.webp')
    expect(toThumbUrl(already)).toBe(already)
    const video = mediaPublicUrl('proj/clip_thumbnail.jpg')
    expect(toThumbUrl(video)).toBe(video)
    const videoQ = `${mediaPublicUrl('proj/clip_thumbnail.png')}?v=3`
    expect(toThumbUrl(videoQ)).toBe(videoQ)
  })
})

describe('thumbUrl', () => {
  it('주소가 없거나 비어 있으면 주소를 만들지 않는다', () => {
    expect(thumbUrl(null)).toBeUndefined()
    expect(thumbUrl(undefined)).toBeUndefined()
    expect(thumbUrl('')).toBeUndefined()
  })

  it('작은 이미지 기능을 끄면 원본 주소를 그대로 쓴다', async () => {
    vi.stubEnv('NEXT_PUBLIC_IMAGE_THUMBS', '0')
    vi.resetModules()
    const disabledModule = await import('@/lib/image-url')
    expect(disabledModule.imageThumbsEnabled).toBe(false)
    expect(disabledModule.thumbUrl(PUBLIC)).toBe(PUBLIC)
    vi.unstubAllEnvs()
  })
})
