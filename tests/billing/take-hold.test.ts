// 영상 생성에 필요한 Take를 설정에 맞게 처리하고, 잔액 부족과 실패 때 사용량을 정확히 관리한다 (#payments-phase-2 #gen-quota-atomic-gate)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Take hold 서버 래퍼(#payments-phase-2 #gen-quota-atomic-gate) — mode off/admin 스킵,
//   shadow 는 enforce=false 로 RPC 호출, enforce insufficient 전파를 고정한다.
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUserById: vi.fn(), recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { rpc: mocks.rpc, auth: { admin: { getUserById: mocks.getUserById } } },
}))
vi.mock('@/lib/admin', () => ({ isAdminEmail: (email: string | null | undefined) => email === 'admin@tale.studio' }))
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: (...a: unknown[]) => mocks.recordWriterObservabilityEvent(...a),
}))

import { holdTakesForVideoJob, releaseTakesForJob, takeBillingMode } from '@/lib/billing/take-hold'

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('takeBillingMode', () => {
  it('설정값이 없으면 사용량을 받지 않는다', () => {
    vi.stubEnv('TAKE_BILLING_MODE', '')
    delete process.env.TAKE_BILLING_MODE
    expect(takeBillingMode()).toBe('off')
  })

  it('알 수 없는 설정값이면 사용량을 받지 않는다', () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'bogus')
    expect(takeBillingMode()).toBe('off')
  })

  it('기록만 하는 설정과 실제 차감 설정을 구분한다', () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'shadow')
    expect(takeBillingMode()).toBe('shadow')
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    expect(takeBillingMode()).toBe('enforce')
  })
})

describe('holdTakesForVideoJob', () => {
  // 각 테스트마다 userId 를 달리한다 — admin 판별 캠시(모듈 스코프 Map)가 테스트 간 공유되어
  //   같은 userId 재사용 시 이전 테스트의 admin 판정이 그대로 살아있는 오염을 막는다.

  it('사용량을 받지 않는 설정에서는 차감 없이 통과시킨다', async () => {
    delete process.env.TAKE_BILLING_MODE
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-off', jobId: 'job-1', amount: 5, projectId: 'proj-1' })
    expect(result).toEqual({ ok: true, insufficient: false, held: 0, balance: 0, skipped: 'off' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('관리자 작업 공간은 사용량을 차감하지 않고 통과시킨다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'admin@tale.studio' } }, error: null })
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-admin', jobId: 'job-1', amount: 5, projectId: 'proj-1' })
    expect(result.skipped).toBe('admin')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('기록만 하는 설정은 잔액이 부족해도 통과시킨다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'shadow')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@tale.studio' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: { ok: true, balance: -3, held: 5, insufficient: false }, error: null })
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-shadow', jobId: 'job-1', amount: 5, projectId: 'proj-1' })
    expect(mocks.rpc).toHaveBeenCalledWith('take_hold', {
      p_workspace: 'ws-1',
      p_amount: 5,
      p_job: 'job-1',
      p_enforce: false,
    })
    expect(result).toEqual({ ok: true, insufficient: false, held: 5, balance: -3, skipped: null })
    expect(mocks.recordWriterObservabilityEvent).not.toHaveBeenCalled()
  })

  it('실제로 차감하는 설정에서 잔액이 부족하면 부족 상태를 알린다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@tale.studio' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: { ok: false, balance: 2, held: 0, insufficient: true }, error: null })
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-enforce', jobId: 'job-1', amount: 5, projectId: 'proj-1' })
    expect(mocks.rpc).toHaveBeenCalledWith('take_hold', {
      p_workspace: 'ws-1',
      p_amount: 5,
      p_job: 'job-1',
      p_enforce: true,
    })
    expect(result).toEqual({ ok: false, insufficient: true, held: 0, balance: 2, skipped: null })
  })

  // #D(2026-09-02 observability-audit) — 402 거절 순간 generation_submit_rejected_takes 이벤트가 기록된다.
  it('잔액이 부족하면 생성 거절 기록을 남긴다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@tale.studio' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: { ok: false, balance: 2, held: 0, insufficient: true }, error: null })
    await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-insufficient', jobId: 'job-2', amount: 5, projectId: 'proj-42' })
    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      'proj-42',
      'generation_submit_rejected_takes',
      { required: 5, balance: 2, jobId: 'job-2' },
    )
  })

  it('사용량 처리에 실패하면 오류를 알린다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@tale.studio' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    await expect(
      holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-error', jobId: 'job-1', amount: 5, projectId: 'proj-1' }),
    ).rejects.toMatchObject({ message: 'db down' })
  })

  it('관리자 확인에 실패하면 일반 사용자처럼 사용량을 차감한다', async () => {
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockRejectedValue(new Error('auth lookup failed'))
    mocks.rpc.mockResolvedValue({ data: { ok: true, balance: 10, held: 5, insufficient: false }, error: null })
    const result = await holdTakesForVideoJob({ workspaceId: 'ws-1', userId: 'user-lookup-fail', jobId: 'job-1', amount: 5, projectId: 'proj-1' })
    expect(result.skipped).toBeNull()
    expect(mocks.rpc).toHaveBeenCalled()
  })
})

describe('releaseTakesForJob', () => {
  it('사용량을 받지 않는 설정이어도 이전에 기록한 사용량은 반환한다', async () => {
    delete process.env.TAKE_BILLING_MODE
    mocks.rpc.mockResolvedValue({ data: 5, error: null })
    const result = await releaseTakesForJob('job-1')
    expect(mocks.rpc).toHaveBeenCalledWith('take_release_for_job', { p_job: 'job-1' })
    expect(result).toBe(5)
  })

  it('반환량이 없으면 0으로 처리한다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(releaseTakesForJob('job-1')).resolves.toBe(0)
  })

  it('사용량 반환에 실패하면 오류를 알린다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    await expect(releaseTakesForJob('job-1')).rejects.toMatchObject({ message: 'db down' })
  })
})
