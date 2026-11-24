// 회원가입은 로그인 없이 열고, 가입 후 돌아갈 경로와 공유 데모의 인증 상태를 안전하게 처리한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import { sanitizeNextPath } from '@/lib/session-restore'

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}))

beforeEach(() => {
  mocks.getUser.mockReset()
  mocks.getUser.mockResolvedValue({ data: { user: null } })
})

describe('회원가입 진입', () => {
  // 왜: 정상 경로 고정. 계정이 없는 사람도 가입 화면을 열 수 있어야 한다.
  it('로그인하지 않은 방문자이면 회원가입 화면을 연다', async () => {
    for (const path of ['/signup', '/signup/']) {
      const response = await middleware(new NextRequest(`https://tale.test${path}`))
      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
    }
  })

  // 왜: 가입 화면과 이름이 비슷한 내부 주소까지 공개하지 않는다.
  it('회원가입 화면이 아닌 보호 주소이면 로그인을 요구한다', async () => {
    for (const path of ['/signup-private', '/signup/admin', '/account', '/studio/writer']) {
      const response = await middleware(new NextRequest(`https://tale.test${path}`))
      const target = new URL(response.headers.get('location')!)
      expect(response.status).toBe(307)
      expect(target.pathname).toBe('/login')
      expect(target.searchParams.get('next')).toBe(path)
    }
  })

  // 왜: 이미 로그인한 사람이 가입 화면에 머물거나 다시 가입하지 않게 한다.
  it('이미 로그인한 방문자이면 안전한 복귀 주소나 프로젝트 목록으로 이동한다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'account-1' } } })
    for (const [next, destination] of [
      ['', '/projects'],
      ['/studio/writer?projectId=sample', '/studio/writer?projectId=sample'],
      ['https://outside.test', '/projects'],
      ['/signup', '/projects'],
    ]) {
      const response = await middleware(new NextRequest(`https://tale.test/signup?next=${encodeURIComponent(next)}`))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(`https://tale.test${destination}`)
    }
  })

  // 왜: 공유 링크를 본 사람이 가입할 때 읽기 전용 데모 인증을 물려받지 않아야 한다.
  it('공유 데모를 보던 방문자이면 회원가입 화면에서 데모 쿠키를 지운다', async () => {
    const request = new NextRequest('https://tale.test/signup', {
      headers: { cookie: `demo_share=${'a'.repeat(64)}` },
    })
    const response = await middleware(request)
    expect(response.status).toBe(200)
    expect(response.cookies.get('demo_share')?.value).toBe('')
    expect(response.cookies.get('demo_share')?.maxAge).toBe(0)
    expect(request.cookies.has('demo_share')).toBe(false)
  })

  // 왜: next가 가입 화면을 가리키면 로그인 상태에서 되돌아가는 반복이 생긴다.
  it('복귀 주소가 회원가입 화면이면 그 주소를 사용하지 않는다', () => {
    for (const path of ['/signup', '/signup/', '/signup?next=/projects']) {
      expect(sanitizeNextPath(path)).toBeNull()
    }
    expect(sanitizeNextPath('/studio/writer?projectId=sample')).toBe('/studio/writer?projectId=sample')
  })
})
