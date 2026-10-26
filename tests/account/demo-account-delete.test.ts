// 시연 계정(할당량만 무제한, 비밀번호를 외부와 나눔)은 계정 지우기를 할 수 없다 — 한 사람이 지우면 다음 시연 자료가 사라진다 (2026-10-27 오너 시연 계정 · 검토)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), deleteUser: vi.fn(), deleteProject: vi.fn(), cancelSubscription: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, auth: { admin: { deleteUser: mocks.deleteUser } } } }))
vi.mock('@/lib/project/delete-project', () => ({ deleteProjectDeep: mocks.deleteProject }))
vi.mock('@/lib/billing/cancel-subscription', () => ({ cancelSubscriptionNow: mocks.cancelSubscription }))

import { POST } from '@/app/api/account/delete/route'

beforeEach(() => vi.clearAllMocks())

describe('시연 계정 지우기', () => {
  it('시연 계정은 계정 지우기를 할 수 없다', async () => {
    // 왜: 비밀번호를 아는 누구나 [계정 삭제]로 시연 프로젝트 · 파일 · 로그인 계정을 되돌릴 수 없게 지울 수 있었다(검토 지적).
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-promo', email: 'promotion@talestudio.art' } } })

    const response = await POST(new Request('http://localhost/api/account/delete', { method: 'POST' }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'demo_account_locked' })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })
})
