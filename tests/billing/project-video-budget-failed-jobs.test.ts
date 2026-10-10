// 결과물이 없는 실패한 영상 생성은 프로젝트당 영상 100회 한도를 깎지 않고, 진행 중·완료는 깎는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  countByUser: vi.fn(),
  countGlobal: vi.fn(),
  getUserById: vi.fn(),
  isAdminEmail: vi.fn(),
  totalMaxInflight: vi.fn(),
  from: vi.fn(),
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
vi.mock('@/lib/fal/keys', () => ({ totalMaxInflight: mocks.totalMaxInflight, falKeys: () => [] }))

import { checkProjectVideoBudget } from '@/lib/generation-quota'
import { PROJECT_VIDEO_GENERATION_LIMIT } from '@/lib/plan-limits'

const PROJECT_ID = 'project-1'

type JobRow = { project_id: string; kind: string; status: string }

const videoJob = (status: string, project = PROJECT_ID): JobRow => ({
  project_id: project,
  kind: 'shot_video',
  status,
})

/** 집계 쿼리의 필터를 실제로 적용하는 가짜 테이블 — 호출 모양이 아니라 세어진 행 수를 검사한다. */
function stubGenerationJobs(rows: JobRow[]): void {
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'generation_jobs') throw new Error(`unexpected table: ${table}`)
    const predicates: Array<(row: JobRow) => boolean> = []
    const query = {
      select: () => query,
      eq(column: keyof JobRow, value: string) {
        predicates.push((row) => row[column] === value)
        return query
      },
      in(column: keyof JobRow, values: string[]) {
        predicates.push((row) => values.includes(row[column]))
        return query
      },
      neq(column: keyof JobRow, value: string) {
        predicates.push((row) => row[column] !== value)
        return query
      },
      then<T>(onFulfilled: (value: { count: number; error: null }) => T) {
        const count = rows.filter((row) => predicates.every((predicate) => predicate(row))).length
        return Promise.resolve({ count, error: null }).then(onFulfilled)
      },
    }
    return query
  })
}

let userSeq = 0
/** adminUserCache 는 모듈 수명이라 테스트마다 다른 계정을 쓴다. */
function freshUserId(): string {
  userSeq += 1
  return `user-${userSeq}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserById.mockResolvedValue({ data: { user: { email: 'user@x.test' } }, error: null })
  mocks.isAdminEmail.mockReturnValue(false)
  mocks.totalMaxInflight.mockReturnValue(34)
})

describe('checkProjectVideoBudget — 프로젝트당 영상 생성 한도 집계', () => {
  // 왜: 환불 정책 §5 ② — 모델 필터 거절·시스템 오류로 결과물이 없으면 Take 와 함께 플랜 한도도 돌려준다.
  //     결과물이 없는 실패를 계속 세면 "100회 다 썼다"로 막혀 돌려준 적이 없는 것과 같다.
  it('결과물 없이 실패한 영상 작업은 프로젝트 영상 한도를 깎지 않는다', async () => {
    stubGenerationJobs([videoJob('failed'), videoJob('failed'), videoJob('completed')])

    const budget = await checkProjectVideoBudget(PROJECT_ID, freshUserId())

    expect(budget.used).toBe(1)
    expect(budget.limit).toBe(PROJECT_VIDEO_GENERATION_LIMIT)
    expect(budget.ok).toBe(true)
  })

  // 왜: 동시에 여러 건을 제출해 한도를 넘기는 경로를 막는다 — 진행 중은 아직 결과물이 없지만 곧 생긴다.
  it('진행 중인 영상 작업은 결과물이 나오기 전에도 프로젝트 영상 한도를 깎는다', async () => {
    stubGenerationJobs([videoJob('queued'), videoJob('queued')])

    const budget = await checkProjectVideoBudget(PROJECT_ID, freshUserId())

    expect(budget.used).toBe(2)
  })

  // 왜: 정상 경로 고정 — 결과물이 나온 생성은 환불 대상이 아니다(환불 정책 §5 ③).
  it('완료된 영상 작업은 프로젝트 영상 한도를 깎는다', async () => {
    stubGenerationJobs([videoJob('completed'), videoJob('completed'), videoJob('completed')])

    const budget = await checkProjectVideoBudget(PROJECT_ID, freshUserId())

    expect(budget.used).toBe(3)
  })

  // 왜: 실패가 쌓인 프로젝트가 한도에 걸려 더 못 만드는 것이 사용자가 겪는 실제 증상이다.
  it('실패한 작업을 빼면 한도가 남아 있으면 새 영상 생성을 허용한다', async () => {
    const rows = [
      ...Array.from({ length: PROJECT_VIDEO_GENERATION_LIMIT - 5 }, () => videoJob('completed')),
      ...Array.from({ length: 20 }, () => videoJob('failed')),
    ]
    stubGenerationJobs(rows)

    const budget = await checkProjectVideoBudget(PROJECT_ID, freshUserId())

    expect(budget.used).toBe(PROJECT_VIDEO_GENERATION_LIMIT - 5)
    expect(budget.ok).toBe(true)
  })

  // 왜: 실패를 빼고도 한도에 닿으면 막아야 한다 — 한도 자체가 사라지면 요금표가 거짓이 된다.
  it('결과물이 있는 작업만으로 한도에 닿으면 새 영상 생성을 막는다', async () => {
    const rows = Array.from({ length: PROJECT_VIDEO_GENERATION_LIMIT }, () => videoJob('completed'))
    stubGenerationJobs(rows)

    const budget = await checkProjectVideoBudget(PROJECT_ID, freshUserId())

    expect(budget.used).toBe(PROJECT_VIDEO_GENERATION_LIMIT)
    expect(budget.ok).toBe(false)
  })

  // 왜: 이미지는 무과금이고 영상 한도와 무관하다 — kind 필터가 빠지면 이미지 한 장이 영상 한도를 깎는다.
  it('이미지 생성 작업은 프로젝트 영상 한도를 깎지 않는다', async () => {
    stubGenerationJobs([
      { project_id: PROJECT_ID, kind: 'shot_storyboard', status: 'completed' },
      videoJob('completed'),
    ])

    const budget = await checkProjectVideoBudget(PROJECT_ID, freshUserId())

    expect(budget.used).toBe(1)
  })

  // 왜: 다른 프로젝트의 생성이 섞이면 한도가 계정 단위로 둔갑한다.
  it('다른 프로젝트의 영상 작업은 이 프로젝트 한도를 깎지 않는다', async () => {
    stubGenerationJobs([videoJob('completed'), videoJob('completed', 'project-2')])

    const budget = await checkProjectVideoBudget(PROJECT_ID, freshUserId())

    expect(budget.used).toBe(1)
  })
})
