// 주소 끝에 붙은 공백이나 줄바꿈이 있어도 내 파일 주소를 올바르게 알아본다 (#env-newline, 2026-08-24)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOwnMediaUrl, mediaPathFromUrl, mediaPublicUrl } from '@/lib/storage/media-url'

// #env-newline — 자기가 만든 주소는 자기가 반드시 인정해야 한다는 회귀 계약.
//   실사고(2026-08-24): Vercel env 값 끝 개행이 생성 주소에 박혔고, 판정은 new URL() 정규화
//   값과 비교하니 전 첨부가 400 으로 죽고 채팅 썸네일이 생 URL 텍스트로 깨졌다.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('미디어 주소에 설정값의 공백과 줄바꿈이 섞여도 안전하게 다룬다', () => {
  it('주소 설정에 줄바꿈이나 공백이 붙어도 정상 주소로 만들고 내 파일로 알아본다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co\n')
    const url = mediaPublicUrl('ws/proj/uploads/v1-abc/s000.jpg')
    expect(url).toBe('https://x.supabase.co/storage/v1/object/public/media/ws/proj/uploads/v1-abc/s000.jpg')
    expect(/\s/.test(url)).toBe(false)
    expect(isOwnMediaUrl(url)).toBe(true)
    expect(mediaPathFromUrl(`${url}?v=123`)).toBe('ws/proj/uploads/v1-abc/s000.jpg')
  })

  it('다른 주소를 지정해도 끝의 공백·줄바꿈·슬래시를 안전하게 정리한다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL', ' https://cdn.example.com/ \n')
    const url = mediaPublicUrl('templates/grid.png')
    expect(url).toBe('https://cdn.example.com/templates/grid.png')
    expect(isOwnMediaUrl(url)).toBe(true)
    // 이전 기간 — 옛(Supabase 형태) 주소도 계속 인정한다.
    expect(isOwnMediaUrl('https://x.supabase.co/storage/v1/object/public/media/a/b.png')).toBe(true)
  })

  it('저장된 주소에 줄바꿈이 끼어 있어도 내 파일로 알아본다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    // 오염기(8/24 오전)에 DB 로 들어간 형태 — 브라우저·fetch 는 개행을 벗겨 처리한다.
    expect(isOwnMediaUrl('https://x.supabase.co\n/storage/v1/object/public/media/a/b.png')).toBe(true)
  })
})
