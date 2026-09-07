import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOwnMediaUrl, mediaPathFromUrl, mediaPublicUrl } from '@/lib/storage/media-url'

// #env-newline — 자기가 만든 주소는 자기가 반드시 인정해야 한다는 회귀 계약.
//   실사고(2026-08-24): Vercel env 값 끝 개행이 생성 주소에 박혔고, 판정은 new URL() 정규화
//   값과 비교하니 전 첨부가 400 으로 죽고 채팅 썸네일이 생 URL 텍스트로 깨졌다.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('media-url — env 위생', () => {
  it('env 에 개행·공백이 붙어도 생성 주소는 한 줄이고, 자가 판정을 통과한다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co\n')
    const url = mediaPublicUrl('ws/proj/uploads/v1-abc/s000.jpg')
    expect(url).toBe('https://x.supabase.co/storage/v1/object/public/media/ws/proj/uploads/v1-abc/s000.jpg')
    expect(/\s/.test(url)).toBe(false)
    expect(isOwnMediaUrl(url)).toBe(true)
    expect(mediaPathFromUrl(`${url}?v=123`)).toBe('ws/proj/uploads/v1-abc/s000.jpg')
  })

  it('override env 도 동일 — 끝 공백·개행·슬래시 전부 무해', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL', ' https://cdn.example.com/ \n')
    const url = mediaPublicUrl('templates/grid.png')
    expect(url).toBe('https://cdn.example.com/templates/grid.png')
    expect(isOwnMediaUrl(url)).toBe(true)
    // 이전 기간 — 옛(Supabase 형태) 주소도 계속 인정한다.
    expect(isOwnMediaUrl('https://x.supabase.co/storage/v1/object/public/media/a/b.png')).toBe(true)
  })

  it('개행이 이미 박힌 저장분 주소도 판정은 인정한다 (new URL 정규화 경유)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    // 오염기(8/24 오전)에 DB 로 들어간 형태 — 브라우저·fetch 는 개행을 벗겨 처리한다.
    expect(isOwnMediaUrl('https://x.supabase.co\n/storage/v1/object/public/media/a/b.png')).toBe(true)
  })
})
