// 공통 큐 응답에 내가 쓸 수 있는 동시 생성 자리를 실어 보낸다 — 화면은 추가 폴링 없이 그 수를 본다 (2026-11-25)
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  active: vi.fn(),
  recent: vi.fn(),
  completed: vi.fn(),
  owner: vi.fn(),
  slots: vi.fn(),
  countVideo: vi.fn(),
}))
vi.mock('@/lib/generation-jobs', () => ({
  listActiveGenerationJobs: mocks.active, listRecentGenerationJobRows: mocks.recent,
  listGenerationCompletionRows: mocks.completed, userOwnsProject: mocks.owner,
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: 'user' }) }))
// 프로젝트 영상 총량(videoUsage)과 내 동시 자리(slots)는 다른 집계다 — 둘 다 이 라우트가 모아 보낸다.
vi.mock('@/lib/generation-quota', () => ({
  countProjectVideoGenerations: mocks.countVideo,
  userSlotUsage: mocks.slots,
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ gte: async () => ({ data: [], error: null }) }) }) }) }),
} }))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileGhostQueuedJobs: async () => {} }))
import { GET } from '@/app/api/generation/active/route'
import { PROJECT_VIDEO_GENERATION_LIMIT } from '@/lib/plan-limits'

const SLOTS = { image: { used: 2, limit: 6 }, video: { used: 1, limit: 3 } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.active.mockResolvedValue([])
  mocks.recent.mockResolvedValue([])
  mocks.completed.mockResolvedValue([])
  mocks.owner.mockResolvedValue(true)
  mocks.countVideo.mockResolvedValue(7)
  mocks.slots.mockResolvedValue(SLOTS)
})

it('active 응답에 내 자리 수가 들어 있다', async () => {
  const result = await GET(new Request('http://local/api/generation/active?projectId=project'))

  expect(result.status).toBe(200)
  expect((await result.json()).data).toMatchObject({
    slots: SLOTS,
    // 프로젝트 영상 총량 게이지는 그대로다 — 같은 응답의 다른 숫자다.
    videoUsage: { used: 7, limit: PROJECT_VIDEO_GENERATION_LIMIT },
  })
  expect(mocks.slots).toHaveBeenCalledWith('user')
})

it('스테이지로 돌아올 때 받는 응답에도 내 자리 수가 들어 있다', async () => {
  // 왜: 복귀 마운트는 다른 응답 분기를 탄다 — 한쪽에만 실으면 돌아온 직후 줄이 사라진다.
  const result = await GET(
    new Request('http://local/api/generation/active?projectId=project&includeUnreflected=1'),
  )

  expect(result.status).toBe(200)
  expect((await result.json()).data).toMatchObject({ slots: SLOTS, unreflected: [] })
})
