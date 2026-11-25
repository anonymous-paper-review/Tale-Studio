// 학생이 쓸 수 있는 동시 생성 자리는 DB 트리거가 429 로 거절할 때 세는 것과 같은 집계로 보여 준다 (2026-11-25)
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
vi.mock('@/lib/generation-jobs', () => ({
  countQueuedJobsByUser: mocks.countByUser,
  countQueuedJobsGlobal: mocks.countGlobal,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { auth: { admin: { getUserById: mocks.getUserById } }, from: mocks.from },
}))
vi.mock('@/lib/fal/keys', () => ({ totalMaxInflight: () => 68, falKeys: () => [] }))

import {
  IMAGE_JOB_KINDS,
  MAX_QUEUED_IMAGE_JOBS_PER_USER,
  MAX_QUEUED_VIDEO_JOBS_PER_USER,
  VIDEO_JOB_KINDS,
  _resetPersonalCapacitySyncForTests,
  userSlotUsage,
} from '@/lib/generation-quota'

const MIGRATION = 'supabase/migrations/20261027100000_generation_capacity_per_user_limit.sql'
const sql = () => readFileSync(MIGRATION, 'utf8')

/** 종류군으로 갈라 세는 가짜 집계 — countQueuedJobsByUser 가 받은 kinds 를 그대로 본다. */
const countsBy = (by: { image: number; video: number }) =>
  async (_userId: string, kinds?: readonly string[]) =>
    kinds?.includes('shot_video') ? by.video : by.image

beforeEach(() => {
  vi.clearAllMocks()
  _resetPersonalCapacitySyncForTests()
  mocks.from.mockReturnValue({ upsert: mocks.upsertExempt, delete: () => ({ eq: mocks.deleteEqExempt }) })
  mocks.upsertExempt.mockResolvedValue({ data: null, error: null })
  mocks.deleteEqExempt.mockResolvedValue({ data: null, error: null })
  mocks.getUserById.mockResolvedValue({ data: { user: { email: 'student@example.com' } }, error: null })
})

describe('채팅 입력창 위에 보이는 내 자리 숫자', () => {
  it('내 그림 자리는 최근 30분 안의 내 queued 그림 작업 수와 상한 6 으로 센다', async () => {
    // 왜: 화면이 다른 수를 세면 "자리가 남았는데 429" 또는 "꽉 찼는데 눌러도 됨"이 된다 — 트리거와 같은 조건이어야 한다.
    mocks.countByUser.mockImplementation(countsBy({ image: 4, video: 0 }))

    await expect(userSlotUsage('u-slot-image')).resolves.toMatchObject({
      image: { used: 4, limit: MAX_QUEUED_IMAGE_JOBS_PER_USER },
    })

    expect(MAX_QUEUED_IMAGE_JOBS_PER_USER).toBe(6)
    expect(mocks.countByUser).toHaveBeenCalledWith('u-slot-image', IMAGE_JOB_KINDS)
    // 30분 창은 집계 함수가 쥐고 있고(서버), 트리거도 같은 창 · 같은 종류군 · 같은 상한을 쓴다(DB).
    expect(readFileSync('src/lib/generation-jobs.ts', 'utf8')).toMatch(/const QUOTA_COUNT_WINDOW_MIN = 30/)
    expect(sql()).toMatch(/v_cutoff timestamptz := now\(\) - interval '30 minutes'/)
    expect(sql()).toMatch(/kind not in \('shot_video', 'shot_previz_video'\)/)
    expect(sql()).toMatch(/coalesce\(v_user_limit, 6\)/)
  })

  it('내 영상 자리는 shot_video · shot_previz_video 만 세고 상한은 3 이다', async () => {
    // 왜: 영상과 그림은 따로 센다(2026-08-26 오너 결정의 별도 풀) — 한 줄에 두 수를 따로 보여야 어느 자리가 남았는지 안다.
    mocks.countByUser.mockImplementation(countsBy({ image: 1, video: 2 }))

    await expect(userSlotUsage('u-slot-video')).resolves.toMatchObject({
      image: { used: 1, limit: 6 },
      video: { used: 2, limit: MAX_QUEUED_VIDEO_JOBS_PER_USER },
    })

    expect(MAX_QUEUED_VIDEO_JOBS_PER_USER).toBe(3)
    expect(VIDEO_JOB_KINDS).toEqual(['shot_video', 'shot_previz_video'])
    expect(mocks.countByUser).toHaveBeenCalledWith('u-slot-video', VIDEO_JOB_KINDS)
    expect(sql()).toMatch(/kind in \('shot_video', 'shot_previz_video'\)/)
    expect(sql()).toMatch(/coalesce\(v_user_limit, 3\)/)
  })

  it('관리자 예외면 상한이 없다', async () => {
    // 왜: 관리자(운영 · QA)는 개인 상한을 받지 않는다 — 줄에 "6 / 6"을 보이면 꽉 찬 것처럼 읽힌다.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: 'admin@tale.studio' } }, error: null })
    mocks.countByUser.mockImplementation(countsBy({ image: 9, video: 5 }))

    await expect(userSlotUsage('u-slot-admin')).resolves.toEqual({
      image: { used: 9, limit: null },
      video: { used: 5, limit: null },
    })

    // 예외표에 상한 칸을 비워 적는다 — DB 트리거도 같은 표를 읽어 자리를 센다.
    expect(mocks.upsertExempt).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-slot-admin', per_user_limit: null }),
    )
    expect(sql()).toMatch(/from public\.generation_capacity_exempt_users e/)
  })

  it('집계가 실패하면 0 으로 보여 주고 막지 않는다', async () => {
    // 왜: 보여 주기만 하는 줄이다 — 집계 장애가 active 응답 전체를 깨뜨려 진행 표시까지 멈추면 안 된다(checkGenerationCapacity 와 같은 fail-open).
    mocks.countByUser.mockRejectedValue(new Error('count unavailable'))

    await expect(userSlotUsage('u-slot-count-failure')).resolves.toEqual({
      image: { used: 0, limit: 6 },
      video: { used: 0, limit: 3 },
    })
  })
})

describe('혼자 정한 것', () => {
  it('예외표를 적지 못해도 줄은 기본 상한으로 보인다', async () => {
    // 왜: 제출 경로는 예외표 기록 실패를 그대로 올려 막지만(상한 면제를 추측하지 않는다), 이 줄은 보여 주기만 한다 —
    //   기록 실패로 active 응답이 500 이 되면 진행 표시 · 완료 반영이 함께 멈춘다. 기본 상한(영상 3 · 그림 6)으로 보여 준다.
    mocks.upsertExempt.mockResolvedValue({ data: null, error: new Error('exempt table unavailable') })
    mocks.deleteEqExempt.mockResolvedValue({ data: null, error: new Error('exempt table unavailable') })
    mocks.countByUser.mockImplementation(countsBy({ image: 2, video: 1 }))

    await expect(userSlotUsage('u-slot-exempt-failure')).resolves.toEqual({
      image: { used: 2, limit: 6 },
      video: { used: 1, limit: 3 },
    })
  })
})
