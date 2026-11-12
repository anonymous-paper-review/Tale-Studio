// 운영 시험 계정(devtest@talestudio.art)은 관리자처럼 Take 를 묶지 않고 동시 생성 상한도 없지만, 관리자 권한은 없다 (2026-11-12 오너 "devtest도 admin과 같은 설정해놔줘")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
  getUser: vi.fn(),
  countByUser: vi.fn(),
  countGlobal: vi.fn(),
  upsertExempt: vi.fn(),
  deleteEqExempt: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from, auth: { admin: { getUserById: mocks.getUserById, deleteUser: mocks.deleteUser } } },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/generation-jobs', () => ({ countQueuedJobsByUser: mocks.countByUser, countQueuedJobsGlobal: mocks.countGlobal }))
vi.mock('@/lib/fal/keys', () => ({ totalMaxInflight: () => 68 }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/project/delete-project', () => ({ deleteProjectDeep: vi.fn() }))
vi.mock('@/lib/billing/cancel-subscription', () => ({ cancelSubscriptionNow: vi.fn() }))

import { isAdminEmail } from '@/lib/admin'
import { isQuotaExemptEmail, isQuotaExemptWorkspaceOwner } from '@/lib/quota-exempt'
import { isAdminUserId } from '@/lib/quota-exempt-server'
import { holdTakesForVideoJob } from '@/lib/billing/take-hold'
import { checkGenerationCapacity, checkProjectVideoBudget, QUOTA_EXEMPT_MAX_QUEUED_JOBS_PER_USER } from '@/lib/generation-quota'
import { POST as deleteAccount } from '@/app/api/account/delete/route'

const DEVTEST = 'devtest@talestudio.art'
// 계정 이메일은 사용자당 한 번만 읽어 둔다(quota-exempt-server) — 시험마다 다른 사용자 id 를 쓴다.
const asDevtest = () => mocks.getUserById.mockResolvedValue({ data: { user: { email: DEVTEST } }, error: null })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.countGlobal.mockResolvedValue(0)
  mocks.from.mockReturnValue({ upsert: mocks.upsertExempt, delete: () => ({ eq: mocks.deleteEqExempt }) })
  mocks.upsertExempt.mockResolvedValue({ data: null, error: null })
  mocks.deleteEqExempt.mockResolvedValue({ data: null, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('운영 시험 계정(devtest@talestudio.art)', () => {
  it('devtest@talestudio.art 는 관리자처럼 영상을 만들 때 Take 를 묶지 않는다', async () => {
    // 왜: 오너 2026-11-12 "테이크 무한" — Take 를 실제로 받는 설정(enforce)에서도 운영 시험이 잔액 때문에 막히지 않게.
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    asDevtest()

    const result = await holdTakesForVideoJob({ workspaceId: 'ws-devtest', userId: 'u-devtest-hold', jobId: 'job-1', amount: 5, projectId: 'p-1' })

    expect(result.ok).toBe(true)
    expect(result.insufficient).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('devtest@talestudio.art 는 관리자처럼 동시 생성 자리 상한이 없고, DB 자리 표에도 한도 칸을 비워 적는다', async () => {
    // 왜: 오너 "관리자처럼 무제한" — 진짜 자리 판정은 DB 가 한 번에 한다(2026-09-11 결정). 서버 검사만 풀면 DB 가 그대로 막는다.
    asDevtest()
    mocks.countByUser.mockResolvedValue(QUOTA_EXEMPT_MAX_QUEUED_JOBS_PER_USER + 5)

    await expect(checkGenerationCapacity('u-devtest-capacity', 'image')).resolves.toMatchObject({ ok: true })
    await expect(checkGenerationCapacity('u-devtest-capacity', 'video')).resolves.toMatchObject({ ok: true })
    expect(mocks.upsertExempt).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u-devtest-capacity', per_user_limit: null }))
  })

  it('devtest@talestudio.art 는 관리자 결제 창구 · 디버그 · 내부 엔진 · 연출 점검 같은 관리자 권한을 받지 않는다', async () => {
    // 왜: 오너는 설정 셋(Take · 자동 로그아웃 · 동시 생성)만 말했다 — 관리자 판정을 쓰는 곳이 따라 열리지 않게(혼자 정한 것).
    asDevtest()
    expect(isAdminEmail(DEVTEST)).toBe(false)
    await expect(isAdminUserId('u-devtest-admin')).resolves.toBe(false)
  })

  it('devtest@talestudio.art 는 프로젝트 칸 · 프로젝트당 영상 100회 · 앞 화 가져오기 제한도 받지 않는다', async () => {
    // 왜: Take 무한과 같은 스위치(할당량 면제)가 함께 푼다 — 운영 시험에서 칸 · 한도로 멈추지 않게(혼자 정한 것).
    expect(isQuotaExemptEmail(DEVTEST)).toBe(true)
    expect(isQuotaExemptEmail('  DevTest@TaleStudio.art ')).toBe(true)
    expect(isQuotaExemptWorkspaceOwner({ id: 'u-devtest', email: DEVTEST }, 'u-devtest')).toBe(true)
    asDevtest()
    await expect(checkProjectVideoBudget('p-1', 'u-devtest-video')).resolves.toMatchObject({ ok: true, used: 0 })
  })

  it('devtest@talestudio.art 는 앱에서 계정 지우기를 할 수 없다', async () => {
    // 왜: 운영 시험 데이터를 지킨다 — 시연 계정과 같은 목록을 쓰면 같이 잠긴다(혼자 정한 것).
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-devtest-delete', email: DEVTEST } } })

    const response = await deleteAccount(new Request('http://localhost/api/account/delete', { method: 'POST' }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'demo_account_locked' })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })
})
