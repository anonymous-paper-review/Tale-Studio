// 시연 계정도 동시 생성 자리(개인 상한)는 다른 고객과 똑같이 받는다 — 외부와 비밀번호를 나누는 계정이 모두의 자리를 차지하지 않게 (2026-10-27 오너 시연 계정 · 검토)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  countByUser: vi.fn(),
  countGlobal: vi.fn(),
  getUserById: vi.fn(),
  from: vi.fn(),
  upsertExempt: vi.fn(),
  deleteEqExempt: vi.fn(),
}))
vi.mock('@/lib/generation-jobs', () => ({ countQueuedJobsByUser: mocks.countByUser, countQueuedJobsGlobal: mocks.countGlobal }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { auth: { admin: { getUserById: mocks.getUserById } }, from: mocks.from } }))
vi.mock('@/lib/fal/keys', () => ({ totalMaxInflight: () => 68 }))

import { checkGenerationCapacity, MAX_QUEUED_IMAGE_JOBS_PER_USER } from '@/lib/generation-quota'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.countGlobal.mockResolvedValue(0)
  mocks.from.mockReturnValue({ upsert: mocks.upsertExempt, delete: () => ({ eq: mocks.deleteEqExempt }) })
  mocks.upsertExempt.mockResolvedValue({ data: null, error: null })
  mocks.deleteEqExempt.mockResolvedValue({ data: null, error: null })
})

describe('시연 계정의 동시 생성 자리', () => {
  it('시연 계정도 동시 생성 자리(개인 상한)는 다른 고객과 똑같이 받는다', async () => {
    // 왜: 비밀번호를 외부와 나누는 계정이 개인 상한 없이 돌면 모든 고객의 생성 자리를 차지하고 비용 상한도 없다(검토 지적).
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'promotion@talestudio.art' } }, error: null })
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_IMAGE_JOBS_PER_USER)

    const check = await checkGenerationCapacity('u-promo-capacity', 'image')

    expect(check).toMatchObject({ ok: false, scope: 'user' })
    expect(mocks.upsertExempt).not.toHaveBeenCalled()
  })

  it('관리자는 지금처럼 개인 상한을 받지 않는다', async () => {
    // 왜: 정상 경로 고정 — 시연 계정을 개인 상한에 넣어도 관리자 면제는 그대로다.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'admin@tale.studio' } }, error: null })
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_IMAGE_JOBS_PER_USER + 3)

    const check = await checkGenerationCapacity('u-admin-capacity', 'image')

    expect(check.ok).toBe(true)
    expect(mocks.upsertExempt).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u-admin-capacity' }))
  })
})
