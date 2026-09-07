// 로그인한 사용자가 초안을 다시 만들 때 권한과 사용 한도를 확인하고 처리 결과를 알려준다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { STALE_QUEUED_MS } = vi.hoisted(() => ({ STALE_QUEUED_MS: 10 * 60 * 1000 }))

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  triggerAssetDrafts: vi.fn(),
  userOwnsProject: vi.fn(),
  countQueuedJobsByUser: vi.fn(),
  countQueuedJobsGlobal: vi.fn(),
  from: vi.fn(),
  projectQueuedCount: 0,
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: mocks.triggerAssetDrafts }))
vi.mock('@/lib/generation-jobs', () => ({
  STALE_QUEUED_MS,
  countQueuedJobsByUser: mocks.countQueuedJobsByUser,
  countQueuedJobsGlobal: mocks.countQueuedJobsGlobal,
  userOwnsProject: mocks.userOwnsProject,
}))
// quota rejection observability (#a2-observability) writes via service-role - mock it out so
// the "from was never called" assertions keep meaning "no project queued-draft lookup ran".
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { POST } from '@/app/api/artist/retry-drafts/route'

const USER = { id: 'user-1' }
const PROJECT_ID = 'project-1'

describe('POST /api/artist/retry-drafts', () => {
  beforeEach(() => {
    mocks.getUser.mockReset()
    mocks.getUser.mockResolvedValue(USER)
    mocks.triggerAssetDrafts.mockReset()
    mocks.triggerAssetDrafts.mockResolvedValue(triggerResultFixture())
    mocks.userOwnsProject.mockReset()
    mocks.userOwnsProject.mockResolvedValue(true)
    mocks.countQueuedJobsByUser.mockReset()
    mocks.countQueuedJobsByUser.mockResolvedValue(0)
    mocks.countQueuedJobsGlobal.mockReset()
    mocks.countQueuedJobsGlobal.mockResolvedValue(0)
    mocks.projectQueuedCount = 0
    mocks.from.mockReset()
    mocks.from.mockImplementation(() => queuedCountQuery())
  })

  it('로그인하지 않으면 접근을 막는다', async () => {
    mocks.getUser.mockResolvedValue(null)

    const response = await POST(postRequest({ projectId: PROJECT_ID }))

    expect(response.status).toBe(401)
    expect(mocks.userOwnsProject).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('요청 내용이 올바르지 않으면 거절한다', async () => {
    const response = await POST(postRequest({}))

    expect(response.status).toBe(400)
    expect(mocks.userOwnsProject).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('프로젝트를 맡은 사람이 아니면 접근을 막는다', async () => {
    mocks.userOwnsProject.mockResolvedValue(false)

    const response = await POST(postRequest({ projectId: PROJECT_ID }))

    expect(response.status).toBe(403)
    expect(mocks.userOwnsProject).toHaveBeenCalledWith(PROJECT_ID, USER.id)
    expect(mocks.countQueuedJobsByUser).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('사용 한도를 넘으면 초안을 다시 만들지 않고 거절한다', async () => {
    mocks.countQueuedJobsByUser.mockResolvedValue(8)

    const response = await POST(postRequest({ projectId: PROJECT_ID }))
    const body = await response.json()

    expect(response.status).toBe(429)
    // limit 6 since 2026-08-25 (#global-semaphore: per-user cap 8 -> 6)
    expect(body).toMatchObject({ code: 'quota_exceeded', queued: 8, limit: 6 })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('프로젝트에 이미 다시 만들 초안이 대기 중이면 거절한다', async () => {
    mocks.projectQueuedCount = 2

    const response = await POST(postRequest({ projectId: PROJECT_ID }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ code: 'drafts_already_queued', queued_count: 2 })
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('초안 다시 만들기가 정상 처리되면 항목별 결과와 건너뛴 수를 알려준다', async () => {
    const result = triggerResultFixture({
      characters: { submitted: 0, skipped: 2, failed: 0 },
      worlds: { submitted: 0, skipped: 1, failed: 0 },
    })
    mocks.triggerAssetDrafts.mockResolvedValue(result)

    const response = await POST(postRequest({ projectId: PROJECT_ID }))
    const body = await response.json()

    expect(response.status).toBe(200)
    // split pools (2026-08-26): retry-drafts counts against the image pool kinds
    expect(mocks.countQueuedJobsByUser).toHaveBeenCalledWith(USER.id, [
      'character_view',
      'world_shot',
      'shot_storyboard',
      'storyboard_real_grid',
      'shot_rough_storyboard',
    ])
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledTimes(1)
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledWith(PROJECT_ID)
    expect(body).toEqual(result)
  })
})

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/artist/retry-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function triggerResultFixture(
  overrides: Partial<{
    skipped_no_look: true
    characters: { submitted: number; skipped: number; failed: number }
    worlds: { submitted: number; skipped: number; failed: number }
  }> = {},
) {
  return {
    characters: { submitted: 1, skipped: 0, failed: 0 },
    worlds: { submitted: 1, skipped: 0, failed: 0 },
    ...overrides,
  }
}

function queuedCountQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    gte: vi.fn(() => query),
    then: (
      resolve: (value: { count: number; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ count: mocks.projectQueuedCount, error: null }).then(resolve, reject),
  }
  return query
}
