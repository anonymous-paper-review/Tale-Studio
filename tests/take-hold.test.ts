import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Take hold 서버 래퍼(#payments-phase-2 #gen-quota-atomic-gate) — mode off/admin 스킵,
//   shadow 는 enforce=false 로 RPC 호출, enforce insufficient 전파를 고정한다.
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUserById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { rpc: mocks.rpc, auth: { admin: { getUserById: mocks.getUserById } } },
}))
vi.mock('@/lib/admin', () => ({ isAdminEmail: (email: string | null | undefined) => email === 'admin@tale.studio' }))

import { holdTakesForVideoJob, releaseTakesForJob, takeBillingMode } from '@/lib/billing/take-hold'

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('takeBillingMode', () => {
  it('미설정이면 off', () => {
    vi.stubEnv('TAKE_BILLING_MODE', '')
    delete process.env.TAKE_BILLING_MODE
    expect(takeBillingMode()).toBe('off')
  })

  it('미지 값도 off로 폴백한다', () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'bogus')
    expect(takeBillingMode()).toBe('off')
  })

  it('shadow/enforce 를 그대로 인식한다', () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'shadow')
    expect(takeBillingMode()).toBe('shadow')
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    expect(takeBillingMode()).toBe('enforce')
  })
})

describe('holdTakesForVideoJob', () => {
  // 각 테스트마다 userId 를 달리한다 — admin 판별 캠시(모듈 스코프 Map)가 테스트 간 공유되어
  //   같은 userId 재사용 시 이전 테스트의 admin 판정이 그대로 살아있는 오염을 막는다.

  it('mode=off 는 RPC 를 타지 않고 통과시킨다', async () => {
    delete process.env.TAKE_BILLING_MODE
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-off', jobId: 'job-1', amount: 5 })
    expect(result).toEqual({ ok: true, insufficient: false, held: 0, balance: 0, skipped: 'off' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('admin 워크스페이스는 RPC 를 타지 않고 통과시킨다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'admin@tale.studio' } }, error: null })
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-admin', jobId: 'job-1', amount: 5 })
    expect(result.skipped).toBe('admin')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('shadow 는 enforce=false 로 RPC 를 호출한다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'shadow')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@tale.studio' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: { ok: true, balance: -3, held: 5, insufficient: false }, error: null })
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-shadow', jobId: 'job-1', amount: 5 })
    expect(mocks.rpc).toHaveBeenCalledWith('take_hold', {
      p_workspace: 'ws-1',
      p_amount: 5,
      p_job: 'job-1',
      p_enforce: false,
    })
    expect(result).toEqual({ ok: true, insufficient: false, held: 5, balance: -3, skipped: null })
  })

  it('enforce 는 enforce=true 로 호출하고 insufficient 를 그대로 전파한다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@tale.studio' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: { ok: false, balance: 2, held: 0, insufficient: true }, error: null })
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-enforce', jobId: 'job-1', amount: 5 })
    expect(mocks.rpc).toHaveBeenCalledWith('take_hold', {
      p_workspace: 'ws-1',
      p_amount: 5,
      p_job: 'job-1',
      p_enforce: true,
    })
    expect(result).toEqual({ ok: false, insufficient: true, held: 0, balance: 2, skipped: null })
  })

  it('RPC 에러를 전파한다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@tale.studio' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    await expect(
      holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-error', jobId: 'job-1', amount: 5 }),
    ).rejects.toMatchObject({ message: 'db down' })
  })

  it('admin 판별 실패는 일반 유저로 취급해 RPC 를 타다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockRejectedValue(new Error('auth lookup failed'))
    mocks.rpc.mockResolvedValue({ data: { ok: true, balance: 10, held: 5, insufficient: false }, error: null })
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-lookup-fail', jobId: 'job-1', amount: 5 })
    expect(result.skipped).toBeNull()
    expect(mocks.rpc).toHaveBeenCalled()
  })
})

describe('releaseTakesForJob', () => {
  it('mode=off 여도 RPC 를 호출한다(과거 shadow hold 정리)', async () => {
    delete process.env.TAKE_BILLING_MODE
    mocks.rpc.mockResolvedValue({ data: 5, error: null })
    const result = await releaseTakesForJob('job-1')
    expect(mocks.rpc).toHaveBeenCalledWith('take_release_for_job', { p_job: 'job-1' })
    expect(result).toBe(5)
  })

  it('null 데이터는 0으로 정규화한다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(releaseTakesForJob('job-1')).resolves.toBe(0)
  })

  it('RPC 에러를 전파한다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    await expect(releaseTakesForJob('job-1')).rejects.toMatchObject({ message: 'db down' })
  })
})
