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
  // #generation_capacity_exempt_users: 신규 admin 면제 표 게이트용 supabaseAdmin.from 체인 mock.
  //   (2026-09-09 오너 승인 — 혼합 영상 동시 한도 3, 기존 admin 예외 보존)
  from: vi.fn(),
  upsertExempt: vi.fn(),
  deleteEqExempt: vi.fn(),
}))

vi.mock('@/lib/generation-jobs', () => ({
  countQueuedJobsByUser: mocks.countByUser,
  countQueuedJobsGlobal: mocks.countGlobal,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: mocks.getUserById } },
    from: mocks.from,
  },
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
  // generation_capacity_exempt_users 체인 기본값 — 일반 흐름(기존 7개 검사 포함)은 항상 성공.
  mocks.from.mockReturnValue({
    upsert: mocks.upsertExempt,
    delete: () => ({ eq: mocks.deleteEqExempt }),
  })
  mocks.upsertExempt.mockResolvedValue({ data: null, error: null })
  mocks.deleteEqExempt.mockResolvedValue({ data: null, error: null })
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

// 신규 게이트(2026-09-09 오너 승인): admin 면제 여부를
//   public.generation_capacity_exempt_users(user_id uuid pk, updated_at timestamptz) 로
//   DB 에 동기화한다. 캐시 충돌 방지를 위해 이 describe 의 모든 테스트는 다른 곳에서
//   쓰지 않는 고유 userId 를 쓴다. video 검사마다 sync 하므로(캐시 히트 여부와 무관) 조회
//   1개가 추가되지만 관리자 명단이 오래된 캐시로 정확성이 깨지는 것보다 낫다는 선택이다.
describe('checkGenerationCapacity — admin 면제 표 동기화 (신규 게이트)', () => {
  it('관리자 video 검사는 면제 표에 user_id 를 upsert 한다', async () => {
    mocks.isAdminEmail.mockReturnValue(true)
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'admin@x.test' } }, error: null })

    await checkGenerationCapacity('exempt-admin-1', 'video')

    expect(mocks.from).toHaveBeenCalledWith('generation_capacity_exempt_users')
    expect(mocks.upsertExempt).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'exempt-admin-1' }),
    )
  })

  it('일반 사용자 video 검사는 기존 면제 행을 삭제한다', async () => {
    mocks.isAdminEmail.mockReturnValue(false)

    await checkGenerationCapacity('exempt-user-1', 'video')

    expect(mocks.from).toHaveBeenCalledWith('generation_capacity_exempt_users')
    expect(mocks.deleteEqExempt).toHaveBeenCalledWith('user_id', 'exempt-user-1')
  })

  it('영상 면제 동기화 실패는 안전하게 throw 하고, image 검사는 면제 표를 건드리지 않는다', async () => {
    mocks.isAdminEmail.mockReturnValue(false)
    mocks.deleteEqExempt.mockRejectedValueOnce(new Error('exempt sync down'))

    // 정확한 권한 확인이 안 됐으므로 기존 쿼터 집계의 fail-open 과 달리 fail-closed 로 전파.
    await expect(checkGenerationCapacity('exempt-fail-1', 'video')).rejects.toThrow()

    // image 경로는 이 신규 표를 아예 건드리지 않아 기존 fail-open 정책이 그대로 유지된다.
    mocks.from.mockClear()
    const image = await checkGenerationCapacity('exempt-fail-1', 'image')
    expect(image.ok).toBe(true)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('작업 수 조회가 실패해도 일반 사용자의 오래된 관리자 면제를 남기지 않는다', async () => {
    mocks.countByUser.mockRejectedValueOnce(new Error('count unavailable'))
    const check = await checkGenerationCapacity('exempt-count-failure', 'video')
    expect(check.ok).toBe(true)
    expect(mocks.deleteEqExempt).toHaveBeenCalledWith('user_id', 'exempt-count-failure')
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
