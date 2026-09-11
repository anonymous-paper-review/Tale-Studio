// 공통 큐 응답은 현재 진행과 아직 확인하지 않은 전체 완료를 구분하여 Writer 숫자의 근거를 빠뜨리지 않는다.
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ active: vi.fn(), recent: vi.fn(), completed: vi.fn(), owner: vi.fn() }))
vi.mock('@/lib/generation-jobs', () => ({
  listActiveGenerationJobs: mocks.active, listRecentGenerationJobRows: mocks.recent,
  listGenerationCompletionRows: mocks.completed, userOwnsProject: mocks.owner,
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: 'user' }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ count: 0 }) }) }) }),
} }))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileGhostQueuedJobs: async () => {} }))
import { GET } from '@/app/api/generation/active/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.active.mockResolvedValue([])
  mocks.recent.mockResolvedValue([])
  mocks.completed.mockResolvedValue([])
  mocks.owner.mockResolvedValue(true)
})

it('현재 큐가 비어 있어도 사흘 전 저장한 Writer 이미지 완료를 공통 응답에 포함한다.', async () => {
  const completedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  mocks.completed.mockResolvedValue([{
    id: 'old-result', kind: 'shot_rough_storyboard', status: 'completed',
    target: { writerShotIds: ['one', 'two'] }, created_at: completedAt, completed_at: completedAt,
  }])
  const result = await GET(new Request('http://local/api/generation/active?projectId=project'))
  expect(result.status).toBe(200)
  expect((await result.json()).data).toMatchObject({
    jobs: [], batches: [], completions: [{ stage: 'writer', lane: 'writer-rough', at: Date.parse(completedAt), units: 2 }],
  })
  expect(mocks.completed).toHaveBeenCalledWith('project')
})

it('프로젝트를 볼 권한이 없으면 진행 작업과 과거 완료를 조회하지 않는다.', async () => {
  mocks.owner.mockResolvedValue(false)
  const result = await GET(new Request('http://local/api/generation/active?projectId=forbidden'))
  expect(result.status).toBe(403)
  expect(mocks.active).not.toHaveBeenCalled()
  expect(mocks.completed).not.toHaveBeenCalled()
})
