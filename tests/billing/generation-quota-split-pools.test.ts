// 영상과 이미지 생성 한도를 따로 관리해 서로의 작업을 막지 않고, 영상 크레딧 사용량을 통제한다 (오너 결정 2026-08-26, tale_pricing v4 정합)
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

describe('checkGenerationCapacity — 영상·이미지 한도 분리', () => {
  it('영상 작업은 영상 한도 3개만 계산한다', async () => {
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_VIDEO_JOBS_PER_USER)
    const check = await checkGenerationCapacity('u-1', 'video')
    expect(mocks.countByUser).toHaveBeenCalledWith('u-1', VIDEO_JOB_KINDS)
    expect(check).toMatchObject({ ok: false, scope: 'user', category: 'video', limit: 3 })
  })

  it('이미지 작업은 이미지 한도 6개만 계산한다', async () => {
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_IMAGE_JOBS_PER_USER)
    const check = await checkGenerationCapacity('u-1', 'image')
    expect(mocks.countByUser).toHaveBeenCalledWith('u-1', IMAGE_JOB_KINDS)
    expect(check).toMatchObject({ ok: false, scope: 'user', category: 'image', limit: 6 })
  })

  it('이미지 한도가 가득 차도 영상 작업은 계속할 수 있다 (C1 회귀)', async () => {
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

describe('checkGenerationCapacity — 관리자 개인 한도 면제', () => {
  it('관리자는 개인별 생성 한도에 걸리지 않는다', async () => {
    mocks.isAdminEmail.mockReturnValue(true)
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_VIDEO_JOBS_PER_USER + 5)
    const check = await checkGenerationCapacity('admin-1', 'video')
    expect(check.ok).toBe(true)
  })

  it('관리자도 전체 동시 작업 한도는 지킨다', async () => {
    mocks.isAdminEmail.mockReturnValue(true)
    mocks.countGlobal.mockResolvedValue(MAX_GLOBAL_INFLIGHT_JOBS)
    const check = await checkGenerationCapacity('admin-1', 'video')
    expect(check).toMatchObject({ ok: false, scope: 'global' })
  })

  it('관리자 확인에 실패하면 일반 사용자 한도를 적용한다', async () => {
    mocks.getUserById.mockRejectedValue(new Error('auth down'))
    mocks.countByUser.mockResolvedValue(MAX_QUEUED_IMAGE_JOBS_PER_USER)
    const check = await checkGenerationCapacity('u-1', 'image')
    expect(check.ok).toBe(false)
  })
})

describe('quotaExceededBody — 종류별 한도 안내', () => {
  it('가득 찬 종류를 알려 영상과 이미지를 구분해 안내한다', () => {
    const video = quotaExceededBody({ ok: false, queued: 3, limit: 3, scope: 'user', category: 'video' })
    const image = quotaExceededBody({ ok: false, queued: 6, limit: 6, scope: 'user', category: 'image' })
    expect(video.error).toContain('video')
    expect(video.category).toBe('video')
    expect(image.error).toContain('image')
    expect(image.category).toBe('image')
  })
})
