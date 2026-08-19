import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isOwnMediaUrl,
  mediaPathFromUrl,
  mediaPublicPrefixes,
  mediaPublicUrl,
} from '@/lib/storage/media-url'

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const CDN_BASE = 'https://cdn.test'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('mediaPublicUrl', () => {
  it('경로를 붙여 절대 주소를 만든다', () => {
    expect(mediaPublicUrl('ws/proj/shots/a.png')).toBe(
      `${SUPABASE_BASE}/storage/v1/object/public/media/ws/proj/shots/a.png`,
    )
  })

  it('앞의 슬래시는 중복되지 않게 떨어낸다', () => {
    expect(mediaPublicUrl('/ws/a.png')).toBe(mediaPublicUrl('ws/a.png'))
  })

  it('다른 회사로 옮기면 접두사만 바뀐다', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL', CDN_BASE)
    expect(mediaPublicUrl('ws/proj/shots/a.png')).toBe(`${CDN_BASE}/ws/proj/shots/a.png`)
  })
})

describe('mediaPathFromUrl', () => {
  it('주소를 경로로 되짚는다 (왕복)', () => {
    const path = 'ws/proj/shots/v1-abc_storyboard.png'
    expect(mediaPathFromUrl(mediaPublicUrl(path))).toBe(path)
  })

  it('캐시버스트 쿼리(?v=)를 무시한다', () => {
    const path = 'ws/proj/shots/a.png'
    expect(mediaPathFromUrl(`${mediaPublicUrl(path)}?v=1720000000000`)).toBe(path)
  })

  it('이전 기간에는 옛 주소와 새 주소를 둘 다 인식한다', () => {
    // DB 에 남은 9,871개는 Supabase 주소다. 새로 만드는 것만 CDN 주소가 된다.
    // 둘 중 하나만 인식하면 이전 도중 화면 절반이 깨진다.
    vi.stubEnv('NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL', CDN_BASE)
    expect(mediaPublicPrefixes()).toHaveLength(2)

    const legacy = `${SUPABASE_BASE}/storage/v1/object/public/media/ws/old.png`
    expect(mediaPathFromUrl(legacy)).toBe('ws/old.png')
    expect(mediaPathFromUrl(`${CDN_BASE}/ws/new.png`)).toBe('ws/new.png')
  })

  it('우리 주소가 아니면 null', () => {
    expect(mediaPathFromUrl('https://fal.media/files/x.png')).toBeNull()
    expect(mediaPathFromUrl('https://other.supabase.co/storage/v1/object/public/media/a.png')).toBeNull()
    expect(mediaPathFromUrl('blob:http://localhost/abc')).toBeNull()
    expect(mediaPathFromUrl('not a url')).toBeNull()
  })

  it('다른 버킷은 우리 것이 아니다', () => {
    expect(mediaPathFromUrl(`${SUPABASE_BASE}/storage/v1/object/public/avatars/a.png`)).toBeNull()
  })

  it('경로가 비면 null', () => {
    expect(mediaPathFromUrl(`${SUPABASE_BASE}/storage/v1/object/public/media/`)).toBeNull()
  })
})

describe('isOwnMediaUrl — 모델에게 넘길 주소의 화이트리스트', () => {
  it('우리 보관함 주소만 통과시킨다', () => {
    expect(isOwnMediaUrl(mediaPublicUrl('ws/a.png'))).toBe(true)
    expect(isOwnMediaUrl('https://evil.test/a.png')).toBe(false)
  })

  it('문자열이 아니면 거부', () => {
    expect(isOwnMediaUrl(null)).toBe(false)
    expect(isOwnMediaUrl(undefined)).toBe(false)
    expect(isOwnMediaUrl(42)).toBe(false)
    expect(isOwnMediaUrl({ url: 'x' })).toBe(false)
  })

  it('지나치게 긴 주소는 거부', () => {
    expect(isOwnMediaUrl(mediaPublicUrl(`ws/${'a'.repeat(2100)}.png`))).toBe(false)
  })

  it('경로 조작으로 접두사를 빠져나가려 하면 거부', () => {
    // 평문 `..` 는 URL 파싱이 정규화하므로 접두사 검사에서 먼저 걸린다.
    expect(isOwnMediaUrl(`${SUPABASE_BASE}/storage/v1/object/public/media/../../../etc/passwd`)).toBe(false)
    // 인코딩된 `..` 는 정규화를 통과하므로 디코딩 후에 잡아야 한다.
    expect(isOwnMediaUrl(`${SUPABASE_BASE}/storage/v1/object/public/media/a/%2e%2e/%2e%2e/secret`)).toBe(false)
  })

  it('내부망 주소를 우리 주소로 위장해도 거부', () => {
    expect(isOwnMediaUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(isOwnMediaUrl(`http://localhost/storage/v1/object/public/media/a.png`)).toBe(false)
  })
})
