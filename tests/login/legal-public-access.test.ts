// 약관·환불·개인정보 페이지는 로그인 없이 열고, 다른 보호 페이지의 로그인 요구는 유지한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}))

beforeEach(() => {
  mocks.getUser.mockReset()
  mocks.getUser.mockResolvedValue({ data: { user: null } })
})

describe.each(['/terms', '/refund', '/privacy'])('공개 정책 페이지 %s', (path) => {
  // 왜: 정상 경로 고정. 가입·결제 전에 고객과 심사 담당자가 정책을 읽을 수 있어야 한다.
  it('로그인하지 않은 방문자이면 정책 페이지를 그대로 연다', async () => {
    const response = await middleware(new NextRequest(`https://example.test${path}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  // 왜: 외부 문서나 메시지에서 주소 끝에 /를 붙여도 같은 정책을 읽을 수 있어야 한다.
  it('정책 주소 끝에 슬래시가 있는 방문자이면 로그인 없이 정책 페이지를 연다', async () => {
    const response = await middleware(new NextRequest(`https://example.test${path}/?source=pricing`))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  // 왜: 정상 경로 고정. 이미 로그인한 고객도 계정 화면으로 옮겨지지 않고 정책을 읽는다.
  it('이미 로그인한 방문자이면 정책 페이지를 그대로 연다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'signed-in-user' } } })
    const response = await middleware(new NextRequest(`https://example.test${path}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })
})

describe.each(['/refunds', '/refunds/'])('원문 환불 정책 주소 %s', (path) => {
  // 왜: 전달받은 푸터의 /refunds 링크도 로그인 요구 없이 같은 환불 정책으로 연결되어야 한다.
  it('원문에 적힌 환불 주소로 들어온 방문자이면 로그인 없이 정책 연결을 허용한다', async () => {
    const response = await middleware(new NextRequest(`https://example.test${path}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})

describe.each([
  '/terms-private',
  '/terms/admin',
  '/refund-private',
  '/refund/admin',
  '/refunds-private',
  '/refunds/admin',
  '/privacy-private',
  '/privacy/admin',
  '/account',
])('보호 페이지 %s', (path) => {
  // 왜: 정책 주소와 이름이 비슷한 내부 페이지나 계정 정보까지 공개되는 일을 막는다.
  it('정책 페이지가 아닌 보호 주소의 방문자이면 로그인 뒤 원래 주소로 돌아가도록 안내한다', async () => {
    const response = await middleware(new NextRequest(`https://example.test${path}?tab=billing`))

    expect(response.status).toBe(307)
    const redirect = new URL(response.headers.get('location')!)
    expect(redirect.pathname).toBe('/login')
    expect(redirect.searchParams.get('next')).toBe(`${path}?tab=billing`)
  })
})
