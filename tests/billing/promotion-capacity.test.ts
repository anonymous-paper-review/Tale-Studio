// 시연 계정의 동시 생성 자리(개인 상한)는 영상 · 그림 각각 10개다 — 관리자처럼 상한이 없지는 않다 (2026-10-27 오너 "시연 계정은 동시 생성 제한 10개로 늘려줘")
import { readFileSync } from 'node:fs'
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

import {
  checkGenerationCapacity,
  MAX_QUEUED_IMAGE_JOBS_PER_USER,
  MAX_QUEUED_VIDEO_JOBS_PER_USER,
  QUOTA_EXEMPT_MAX_QUEUED_JOBS_PER_USER,
} from '@/lib/generation-quota'

const PROMO = 'promotion@talestudio.art'
const MIGRATION = 'supabase/migrations/20261027100000_generation_capacity_per_user_limit.sql'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.countGlobal.mockResolvedValue(0)
  mocks.from.mockReturnValue({ upsert: mocks.upsertExempt, delete: () => ({ eq: mocks.deleteEqExempt }) })
  mocks.upsertExempt.mockResolvedValue({ data: null, error: null })
  mocks.deleteEqExempt.mockResolvedValue({ data: null, error: null })
})

describe('시연 계정의 동시 생성 자리', () => {
  it('시연 계정은 그림을 동시에 10개까지 만들고 11번째에서 막힌다', async () => {
    // 왜: 2026-10-27 오너 — 홍콩 스튜디오 시연 프로젝트(1분 · 10분)를 만들 때 동시 3 · 6개로는 10분짜리 영상이 몇 시간 걸린다.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: PROMO } }, error: null })
    expect(QUOTA_EXEMPT_MAX_QUEUED_JOBS_PER_USER).toBe(10)

    mocks.countByUser.mockResolvedValueOnce(9)
    await expect(checkGenerationCapacity('u-promo-capacity', 'image')).resolves.toMatchObject({ ok: true, limit: 10 })

    mocks.countByUser.mockResolvedValueOnce(10)
    await expect(checkGenerationCapacity('u-promo-capacity', 'image')).resolves.toMatchObject({ ok: false, scope: 'user', limit: 10 })
  })

  it('시연 계정은 영상도 동시에 10개까지 만든다', async () => {
    // 왜: 영상과 그림은 따로 센다(2026-08-26 오너 결정의 별도 풀) — 시연 계정은 두 풀 모두 10개다.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: PROMO } }, error: null })

    mocks.countByUser.mockResolvedValueOnce(MAX_QUEUED_VIDEO_JOBS_PER_USER)
    await expect(checkGenerationCapacity('u-promo-video', 'video')).resolves.toMatchObject({ ok: true, limit: 10 })

    mocks.countByUser.mockResolvedValueOnce(10)
    await expect(checkGenerationCapacity('u-promo-video', 'video')).resolves.toMatchObject({ ok: false, scope: 'user', limit: 10, axis: 'user_video' })
  })

  it('시연 계정의 한도 10은 DB 자리 표에도 적혀 DB 가 자리를 셀 때도 10을 쓴다', async () => {
    // 왜: 진짜 자리 판정은 DB 가 한 번에 한다(2026-09-11 결정) — 서버 검사만 10이면 DB 가 3 · 6에서 거절한다.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: PROMO } }, error: null })
    mocks.countByUser.mockResolvedValue(0)

    await checkGenerationCapacity('u-promo-sync', 'image')

    expect(mocks.upsertExempt).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u-promo-sync', per_user_limit: 10 }))
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toMatch(/add column if not exists per_user_limit integer/)
    // 생성 예약 트리거와 영상 일괄 예약 둘 다 표의 한도를 읽고, 비면 지금 값(영상 3 · 그림 6)을 쓴다.
    expect(sql).toMatch(/create or replace function public\.enforce_generation_capacity\(\)/)
    expect(sql).toMatch(/coalesce\(v_user_limit, 3\)/)
    expect(sql).toMatch(/coalesce\(v_user_limit, 6\)/)
    expect(sql).toMatch(/create or replace function public\.reserve_director_video_batch_item\(/)
    expect(sql).toMatch(/coalesce\(v_batch_limit, 3\)/)
  })

  it('보통 계정은 지금처럼 영상 3개 · 그림 6개에서 막힌다', async () => {
    // 왜: 정상 경로 고정 — 시연 계정의 한도를 올려도 다른 고객의 개인 상한은 그대로다.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'someone@example.com' } }, error: null })

    mocks.countByUser.mockResolvedValueOnce(MAX_QUEUED_VIDEO_JOBS_PER_USER)
    await expect(checkGenerationCapacity('u-normal', 'video')).resolves.toMatchObject({ ok: false, scope: 'user', limit: 3 })
    mocks.countByUser.mockResolvedValueOnce(MAX_QUEUED_IMAGE_JOBS_PER_USER)
    await expect(checkGenerationCapacity('u-normal', 'image')).resolves.toMatchObject({ ok: false, scope: 'user', limit: 6 })

    expect(mocks.upsertExempt).not.toHaveBeenCalled()
    expect(mocks.deleteEqExempt).toHaveBeenCalledWith('user_id', 'u-normal')
  })

  it('관리자는 지금처럼 개인 상한을 받지 않는다', async () => {
    // 왜: 정상 경로 고정 — 시연 계정에 한도 10을 주어도 관리자 면제(상한 없음)는 그대로다.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'admin@tale.studio' } }, error: null })
    mocks.countByUser.mockResolvedValue(QUOTA_EXEMPT_MAX_QUEUED_JOBS_PER_USER + 3)

    const check = await checkGenerationCapacity('u-admin-capacity', 'image')

    expect(check.ok).toBe(true)
    expect(mocks.upsertExempt).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u-admin-capacity', per_user_limit: null }))
  })

  it('시연 계정도 모두의 자리(전체 한도)는 넘지 못한다', async () => {
    // 왜: 정상 경로 고정 — 전체 한도는 fal 계정 슬롯 합계라는 물리 한도다(관리자도 받는다). 한도 10이 이것까지 풀지 않는다.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: PROMO } }, error: null })
    mocks.countByUser.mockResolvedValue(1)
    mocks.countGlobal.mockResolvedValue(68)

    await expect(checkGenerationCapacity('u-promo-global', 'video')).resolves.toMatchObject({ ok: false, scope: 'global' })
  })
})
