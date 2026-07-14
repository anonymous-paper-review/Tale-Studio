import { beforeEach, describe, expect, it, vi } from 'vitest'

const { STALE_QUEUED_MS } = vi.hoisted(() => ({ STALE_QUEUED_MS: 10 * 60 * 1000 }))

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  triggerAssetDrafts: vi.fn(),
  userOwnsProject: vi.fn(),
  countQueuedJobsByUser: vi.fn(),
  from: vi.fn(),
  projectQueuedCount: 0,
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: mocks.triggerAssetDrafts }))
vi.mock('@/lib/generation-jobs', () => ({
  STALE_QUEUED_MS,
  countQueuedJobsByUser: mocks.countQueuedJobsByUser,
  userOwnsProject: mocks.userOwnsProject,
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
    mocks.projectQueuedCount = 0
    mocks.from.mockReset()
    mocks.from.mockImplementation(() => queuedCountQuery())
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.getUser.mockResolvedValue(null)

    const response = await POST(postRequest({ projectId: PROJECT_ID }))

    expect(response.status).toBe(401)
    expect(mocks.userOwnsProject).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid body', async () => {
    const response = await POST(postRequest({}))

    expect(response.status).toBe(400)
    expect(mocks.userOwnsProject).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('returns 403 when the user does not own the project', async () => {
    mocks.userOwnsProject.mockResolvedValue(false)

    const response = await POST(postRequest({ projectId: PROJECT_ID }))

    expect(response.status).toBe(403)
    expect(mocks.userOwnsProject).toHaveBeenCalledWith(PROJECT_ID, USER.id)
    expect(mocks.countQueuedJobsByUser).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('returns quota-exceeded 4xx before checking project queued drafts', async () => {
    mocks.countQueuedJobsByUser.mockResolvedValue(8)

    const response = await POST(postRequest({ projectId: PROJECT_ID }))
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body).toMatchObject({ code: 'quota_exceeded', queued: 8, limit: 8 })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('rejects when the project already has queued draft jobs', async () => {
    mocks.projectQueuedCount = 2

    const response = await POST(postRequest({ projectId: PROJECT_ID }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ code: 'drafts_already_queued', queued_count: 2 })
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('calls triggerAssetDrafts and returns idempotent skip counts on the happy path', async () => {
    const result = triggerResultFixture({
      characters: { submitted: 0, skipped: 2, failed: 0 },
      worlds: { submitted: 0, skipped: 1, failed: 0 },
    })
    mocks.triggerAssetDrafts.mockResolvedValue(result)

    const response = await POST(postRequest({ projectId: PROJECT_ID }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.countQueuedJobsByUser).toHaveBeenCalledWith(USER.id)
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
