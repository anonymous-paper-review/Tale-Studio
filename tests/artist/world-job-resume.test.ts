// 배경 진행 작업 조회는 현재 프로젝트의 모습과 작업 번호를 돌려주며 권한 밖 요청은 막는다
import { beforeEach, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/artist/generation-status/route'

const mocks = vi.hoisted(() => ({ from: vi.fn(), owns: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: 'owner' }) }))
vi.mock('@/lib/generation-jobs', async (original) => ({
  ...await original<typeof import('@/lib/generation-jobs')>(),
  userOwnsProject: mocks.owns,
  listFailedCharacterViewJobs: async () => [],
  listFailedWorldShotJobs: async () => [],
  listQueuedMainJobs: async () => [],
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.owns.mockResolvedValue(true)
  mocks.from.mockImplementation(() => {
    const filters: Array<[string, unknown]> = []
    const data = [
      { project_id: 'p', kind: 'world_shot', status: 'queued', id: 'night-job', target: { locationId: 'roof', column: 'wide_shot', appearanceKey: 'night' } },
      { project_id: 'p', kind: 'world_shot', status: 'queued', id: 'base-job', target: { locationId: 'hall', column: 'wide_shot' } },
      { project_id: 'p', kind: 'world_shot', status: 'completed', id: 'old-job', target: { locationId: 'roof', column: 'wide_shot' } },
      { project_id: 'other', kind: 'world_shot', status: 'queued', id: 'other-job', target: { locationId: 'roof', column: 'wide_shot' } },
    ]
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (key: string, value: unknown) => { filters.push([key, value]); return q }
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: data.filter((row) => filters.every(([key, value]) => row[key as keyof typeof row] === value)), error: null,
    }).then(resolve)
    return q
  })
})

it('새로고침 때 현재 프로젝트에서 진행 중인 배경의 모습과 작업 번호를 확인한다', async () => {
  const res = await GET(new Request('http://localhost/api/artist/generation-status?projectId=p'))
  expect(res.status).toBe(200)
  expect((await res.json()).queuedWorld).toEqual([
    { locationId: 'roof', appearanceKey: 'night', jobId: 'night-job' },
    { locationId: 'hall', appearanceKey: null, jobId: 'base-job' },
  ])
})

it('다른 사람의 프로젝트에서는 배경 작업 목록을 보여주지 않는다', async () => {
  mocks.owns.mockResolvedValue(false)
  const res = await GET(new Request('http://localhost/api/artist/generation-status?projectId=p'))
  expect(res.status).toBe(403)
  expect(mocks.from).not.toHaveBeenCalled()
})
