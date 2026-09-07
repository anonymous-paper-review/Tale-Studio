// 미디어 주소를 만들고 되짚을 때 우리 파일만 알아보며, 다른 주소나 잘못된 입력은 막는다
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
  it('파일 위치를 넣으면 어디서나 열 수 있는 주소가 된다', () => {
    expect(mediaPublicUrl('ws/proj/shots/a.png')).toBe(
      `${SUPABASE_BASE}/storage/v1/object/public/media/ws/proj/shots/a.png`,
    )
  })

  it('파일 위치 앞에 슬래시가 있어도 주소가 하나로 이어진다', () => {
    expect(mediaPublicUrl('/ws/a.png')).toBe(mediaPublicUrl('ws/a.png'))
  })

  it('다른 주소를 지정하면 파일 위치는 그대로 두고 앞부분만 바뀐다', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL', CDN_BASE)
    expect(mediaPublicUrl('ws/proj/shots/a.png')).toBe(`${CDN_BASE}/ws/proj/shots/a.png`)
  })
})

describe('mediaPathFromUrl', () => {
  it('만든 주소를 다시 넣으면 원래 파일 위치를 찾는다 (왕복)', () => {
    const path = 'ws/proj/shots/v1-abc_storyboard.png'
    expect(mediaPathFromUrl(mediaPublicUrl(path))).toBe(path)
  })

  it('주소 뒤에 붙은 임시 표시는 무시하고 원래 파일 위치를 찾는다', () => {
    const path = 'ws/proj/shots/a.png'
    expect(mediaPathFromUrl(`${mediaPublicUrl(path)}?v=1720000000000`)).toBe(path)
  })

  it('주소 형식이 바뀌어도 예전 주소와 새 주소를 모두 알아본다', () => {
    // DB 에 남은 9,871개는 Supabase 주소다. 새로 만드는 것만 CDN 주소가 된다.
    // 둘 중 하나만 인식하면 이전 도중 화면 절반이 깨진다.
    vi.stubEnv('NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL', CDN_BASE)
    expect(mediaPublicPrefixes()).toHaveLength(2)

    const legacy = `${SUPABASE_BASE}/storage/v1/object/public/media/ws/old.png`
    expect(mediaPathFromUrl(legacy)).toBe('ws/old.png')
    expect(mediaPathFromUrl(`${CDN_BASE}/ws/new.png`)).toBe('ws/new.png')
  })

  it('우리 파일 주소가 아니면 사용하지 않는다', () => {
    expect(mediaPathFromUrl('https://fal.media/files/x.png')).toBeNull()
    expect(mediaPathFromUrl('https://other.supabase.co/storage/v1/object/public/media/a.png')).toBeNull()
    expect(mediaPathFromUrl('blob:http://localhost/abc')).toBeNull()
    expect(mediaPathFromUrl('not a url')).toBeNull()
  })

  it('다른 보관 공간의 주소는 우리 파일로 보지 않는다', () => {
    expect(mediaPathFromUrl(`${SUPABASE_BASE}/storage/v1/object/public/avatars/a.png`)).toBeNull()
  })

  it('파일 위치가 비어 있으면 사용하지 않는다', () => {
    expect(mediaPathFromUrl(`${SUPABASE_BASE}/storage/v1/object/public/media/`)).toBeNull()
  })
})

describe('isOwnMediaUrl — 우리 미디어 주소만 안전하게 사용한다', () => {
  it('우리 파일 주소만 사용한다', () => {
    expect(isOwnMediaUrl(mediaPublicUrl('ws/a.png'))).toBe(true)
    expect(isOwnMediaUrl('https://evil.test/a.png')).toBe(false)
  })

  it('주소가 글자로 적히지 않았으면 사용하지 않는다', () => {
    expect(isOwnMediaUrl(null)).toBe(false)
    expect(isOwnMediaUrl(undefined)).toBe(false)
    expect(isOwnMediaUrl(42)).toBe(false)
    expect(isOwnMediaUrl({ url: 'x' })).toBe(false)
  })

  it('주소가 지나치게 길면 사용하지 않는다', () => {
    expect(isOwnMediaUrl(mediaPublicUrl(`ws/${'a'.repeat(2100)}.png`))).toBe(false)
  })

  it('파일 위치를 속여 다른 곳으로 빠져나가려 하면 사용하지 않는다', () => {
    // 평문 `..` 는 URL 파싱이 정규화하므로 접두사 검사에서 먼저 걸린다.
    expect(isOwnMediaUrl(`${SUPABASE_BASE}/storage/v1/object/public/media/../../../etc/passwd`)).toBe(false)
    // 인코딩된 `..` 는 정규화를 통과하므로 디코딩 후에 잡아야 한다.
    expect(isOwnMediaUrl(`${SUPABASE_BASE}/storage/v1/object/public/media/a/%2e%2e/%2e%2e/secret`)).toBe(false)
  })

  it('내부 전용 주소를 우리 파일 주소처럼 꾸며도 사용하지 않는다', () => {
    expect(isOwnMediaUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(isOwnMediaUrl(`http://localhost/storage/v1/object/public/media/a.png`)).toBe(false)
  })
})
