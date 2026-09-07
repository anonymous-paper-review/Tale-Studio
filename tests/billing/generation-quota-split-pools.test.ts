import { beforeEach, describe, expect, it, vi } from 'vitest'

// 영상/이미지 분리 풀 + admin 면제 (2026-08-26 오너 결정, tale_pricing v4 정합).
//   실측 근거(C1): 합산 상한에서 영상 배치가 슬롯을 다 먹어 이미지 생성이 429 로 막혔다.
//   Take 는 영상 전용 과금이므로 영상 상한(3)은 과금 통제, 이미지 상한(6)은 처리량 유지.

const mocks = vi.hoisted(() => ({
  countByUser: vi.fn(),
  countGlobal: vi.fn(),
  getUserById: vi.fn(),
  isAdminEmail: vi.fn(),
  totalMaxInflight: vi.fn(),
}))

vi.mock('@/lib/generation-jobs', () => ({
  countQueuedJobsByUser: mocks.countByUser,
  countQueuedJobsGlobal: mocks.countGlobal,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { auth: { admin: { getUserById: mocks.getUserById } } },
}))
vi.mock('@/lib/admin', () => ({ isAdminEmail: mocks.isAdminEmail }))
// #fal-key-pool: 전역 상한은 이제 키 레지스트리 합산(totalMaxInflight)이다 — 단일 상수 대신 mock 값 사용.
vi.mock('@/lib/fal/keys', () => ({ totalMaxInflight: mocks.totalMaxInflight }))

import {
  checkGenerationCapacity,
  quotaExceededBody,
  MAX_QUEUED_VIDEO_JOBS_PER_USER,
  MAX_QUEUED_IMAGE_JOBS_PER_USER,
  VIDEO_JOB_KINDS,
  IMAGE_JOB_KINDS,
} from '@/lib/generation-quota'

const MAX_GLOBAL_INFLIGHT_JOBS = 34

beforeEach(() => {
  vi.clearAllMocks()
  mocks.countByUser.mockResolvedValue(0)
  mocks.countGlobal.mockResolvedValue(0)
  mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@x.test' } }, error: null })
  mocks.isAdminEmail.mockReturnValue(false)
  mocks.totalMaxInflight.mockReturnValue(MAX_GLOBAL_INFLIGHT_JOBS)
})

describe('checkGenerationCapacity — 분리 풀', () => {
  it('counts only video kinds against the video cap (3)', async () => {
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_VIDEO_JOBS_PER_USER)
    const check = await checkGenerationCapacity('u-1', 'video')
    expect(mocks.countByUser).toHaveBeenCalledWith('u-1', VIDEO_JOB_KINDS)
    expect(check).toMatchObject({ ok: false, scope: 'user', category: 'video', limit: 3 })
  })

  it('counts only image kinds against the image cap (6)', async () => {
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_IMAGE_JOBS_PER_USER)
    const check = await checkGenerationCapacity('u-1', 'image')
    expect(mocks.countByUser).toHaveBeenCalledWith('u-1', IMAGE_JOB_KINDS)
    expect(check).toMatchObject({ ok: false, scope: 'user', category: 'image', limit: 6 })
  })

  it('lets video run while the image pool is saturated — the C1 regression', async () => {
    // image 풀이 6/6 이어도 video 검사는 video kind 만 세므로 통과해야 한다.
    mocks.countByUser.mockImplementation(async (_u: string, kinds: readonly string[]) =>
      kinds.includes('shot_video') ? 0 : 6,
    )
    const video = await checkGenerationCapacity('u-1', 'video')
    const image = await checkGenerationCapacity('u-1', 'image')
    expect(video.ok).toBe(true)
    expect(image.ok).toBe(false)
  })
})

describe('checkGenerationCapacity — admin 면제', () => {
  it('exempts admin accounts from the per-user cap', async () => {
    mocks.isAdminEmail.mockReturnValue(true)
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_VIDEO_JOBS_PER_USER + 5)
    const check = await checkGenerationCapacity('admin-1', 'video')
    expect(check.ok).toBe(true)
  })

  it('still applies the global fal-slot semaphore to admins', async () => {
    mocks.isAdminEmail.mockReturnValue(true)
    mocks.countGlobal.mockResolvedValue(MAX_GLOBAL_INFLIGHT_JOBS)
    const check = await checkGenerationCapacity('admin-1', 'video')
    expect(check).toMatchObject({ ok: false, scope: 'global' })
  })

  it('treats admin-lookup failure as a normal user (quota still applies)', async () => {
    mocks.getUserById.mockRejectedValue(new Error('auth down'))
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_IMAGE_JOBS_PER_USER)
    const check = await checkGenerationCapacity('u-1', 'image')
    expect(check.ok).toBe(false)
  })
})

describe('quotaExceededBody — 카테고리 문구 계약', () => {
  it('names the saturated pool so the client toast can distinguish video vs image', () => {
    const video = quotaExceededBody({ ok: false, queued: 3, limit: 3, scope: 'user', category: 'video' })
    const image = quotaExceededBody({ ok: false, queued: 6, limit: 6, scope: 'user', category: 'image' })
    expect(video.error).toContain('video')
    expect(video.category).toBe('video')
    expect(image.error).toContain('image')
    expect(image.category).toBe('image')
  })
})
