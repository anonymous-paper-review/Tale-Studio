// 서버가 요청마다 로그인 서버에 묻지 않고 토큰 서명을 직접 확인한다
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaims = vi.fn()
const getUserRemote = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims, getUser: getUserRemote },
  })),
}))

import { getUser } from '@/lib/supabase/auth'

describe('getUser 로컬 토큰 검증', () => {
  beforeEach(() => {
    getClaims.mockReset()
    getUserRemote.mockReset()
  })

  it('로그인 토큰이 유효하면 로그인 서버에 묻지 않고 사용자 id·이메일·설정을 돌려준다', async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'u1',
          email: 'a@b.com',
          user_metadata: { name: '가' },
          app_metadata: { provider: 'email' },
        },
      },
      error: null,
    })
    const user = await getUser()
    expect(user).toEqual({
      id: 'u1',
      email: 'a@b.com',
      user_metadata: { name: '가' },
      app_metadata: { provider: 'email' },
    })
    expect(getUserRemote).not.toHaveBeenCalled()
  })

  it('토큰이 없거나 서명이 틀리면 로그인하지 않은 것으로 본다', async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: 'bad jwt' } })
    expect(await getUser()).toBeNull()
  })

  it('토큰에 설정이 없어도 빈 설정으로 돌려준다', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'u2', email: 'c@d.com' } },
      error: null,
    })
    const user = await getUser()
    expect(user?.user_metadata).toEqual({})
    expect(user?.app_metadata).toEqual({})
  })
})
