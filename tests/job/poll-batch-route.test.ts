// 화면이 여러 작업의 상태를 한 번에 물으면 서버는 로그인 확인 1회·소유 확인은 프로젝트당 1회로 답한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getGenerationJobsByIds: vi.fn(),
  userOwnsProject: vi.fn(),
  reconcileJobFromFal: vi.fn(),
  resolveWebhookUrl: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({
  getGenerationJobsByIds: mocks.getGenerationJobsByIds,
  userOwnsProject: mocks.userOwnsProject,
}))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcileJobFromFal }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: mocks.resolveWebhookUrl }))

import { GET } from '@/app/api/generation-jobs/route'
import { _resetPollReconcileGateForTests } from '@/lib/fal/poll-reconcile-gate'

function job(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'project-1',
    status: 'queued',
    kind: 'shot_image',
    request_id: `req-${id}`,
    result_url: null,
    error: null,
    video_clip_id: null,
    created_at: '2026-11-24T00:00:00.000Z',
    submitted_at: '2026-11-24T00:00:00.000Z',
    ...overrides,
  }
}

function ask(query: string) {
  return GET(new Request(`http://localhost/api/generation-jobs${query}`))
}

type Body = {
  ok: boolean
  data?: { jobs: Record<string, { status: string; resultUrl: string | null }>; missing: string[] }
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetPollReconcileGateForTests()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.resolveWebhookUrl.mockReturnValue(undefined)
  mocks.reconcileJobFromFal.mockImplementation(async (j) => j)
})

describe('작업 상태 한꺼번에 조회', () => {
  it('여러 작업을 한 번에 물으면 작업마다 상태를 돌려준다', async () => {
    mocks.getGenerationJobsByIds.mockResolvedValue([job('a'), job('b', { status: 'completed', result_url: 'https://cdn/b.png' })])

    const response = await ask('?ids=a,b')
    const body = (await response.json()) as Body

    expect(response.status).toBe(200)
    expect(body.data?.jobs.a.status).toBe('queued')
    expect(body.data?.jobs.b.status).toBe('completed')
    expect(body.data?.jobs.b.resultUrl).toBe('https://cdn/b.png')
    expect(body.data?.missing).toEqual([])
    expect(mocks.getGenerationJobsByIds).toHaveBeenCalledTimes(1)
    // 끝난 잡은 생성 서비스에 묻지 않고, 진행 중인 잡만 묻는다.
    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(1)
  })

  it('내 것이 아닌 작업과 없는 작업은 내용 없이 missing 에만 적는다', async () => {
    mocks.getGenerationJobsByIds.mockResolvedValue([job('a'), job('other', { project_id: 'project-2' })])
    mocks.userOwnsProject.mockImplementation(async (projectId: string) => projectId === 'project-1')

    const response = await ask('?ids=a,other,ghost')
    const body = (await response.json()) as Body

    expect(Object.keys(body.data?.jobs ?? {})).toEqual(['a'])
    expect([...(body.data?.missing ?? [])].sort()).toEqual(['ghost', 'other'])
    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(1)
  })

  it('같은 프로젝트의 작업 여러 개는 소유 확인을 한 번만 한다', async () => {
    mocks.getGenerationJobsByIds.mockResolvedValue([job('a'), job('b'), job('c')])

    await ask('?ids=a,b,c')

    expect(mocks.getUser).toHaveBeenCalledTimes(1)
    expect(mocks.userOwnsProject).toHaveBeenCalledTimes(1)
  })

  it('id 가 없거나 50개를 넘으면 잘못된 요청으로 답한다', async () => {
    expect((await ask('')).status).toBe(400)
    expect((await ask('?ids=')).status).toBe(400)
    const many = Array.from({ length: 51 }, (_, i) => `j${i}`).join(',')
    expect((await ask(`?ids=${many}`)).status).toBe(400)
    expect(mocks.getGenerationJobsByIds).not.toHaveBeenCalled()
  })

  it('로그인하지 않았으면 401 로 답한다', async () => {
    mocks.getUser.mockResolvedValue(null)

    const response = await ask('?ids=a')

    expect(response.status).toBe(401)
    expect(mocks.getGenerationJobsByIds).not.toHaveBeenCalled()
  })
})
