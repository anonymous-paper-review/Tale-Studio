// 멈춘 영상 작업을 큐 화면에서 지우면 잡아둔 Take 가 돌아온다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getGenerationJobById: vi.fn(),
  userOwnsProject: vi.fn(),
  deleteGenerationJobById: vi.fn(),
  releaseTakesForJob: vi.fn(),
  reconcileJobFromFal: vi.fn(),
  order: [] as string[],
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({
  getGenerationJobById: mocks.getGenerationJobById,
  userOwnsProject: mocks.userOwnsProject,
  deleteGenerationJobById: mocks.deleteGenerationJobById,
}))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: mocks.releaseTakesForJob }))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcileJobFromFal }))

import { DELETE, GET } from '@/app/api/generation-jobs/[id]/route'

const params = Promise.resolve({ id: 'job-1' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order = []
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.getGenerationJobById.mockResolvedValue({
    id: 'job-1',
    project_id: 'project-1',
    status: 'queued',
    kind: 'shot_video',
  })
  mocks.releaseTakesForJob.mockImplementation(async () => {
    mocks.order.push('release')
    return 5
  })
  mocks.deleteGenerationJobById.mockImplementation(async () => {
    mocks.order.push('delete')
  })
})

describe('큐 화면에서 작업을 지울 때의 Take 처리', () => {
  it('러프 상태를 다시 조회해도 접수 확인 대기 안내가 사라지지 않는다', async () => {
    const job = { id: 'job-1', project_id: 'project-1', status: 'queued', kind: 'shot_rough_storyboard', request_id: 'reserved:job-1' }
    mocks.getGenerationJobById.mockResolvedValue(job)
    mocks.reconcileJobFromFal.mockResolvedValue(job)
    const response = await GET(new Request('http://localhost'), { params })
    expect((await response.json()).data.confirmationPending).toBe(true)
  })
  it.each(['reserved:job-1', 'provider-request-1'])('접수 중인 러프는 정리 버튼으로 예약을 풀어 중복 주문하지 않는다 (%s)', async (request_id) => {
    mocks.getGenerationJobById.mockResolvedValue({ id: 'job-1', project_id: 'project-1', status: 'queued', kind: 'shot_rough_storyboard', request_id })
    const response = await DELETE(new Request('http://localhost'), { params })
    expect(response.status).toBe(409)
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.deleteGenerationJobById).not.toHaveBeenCalled()
  })

  it('멈춘 영상 작업을 지우면 잡아둔 Take 를 먼저 돌려준다', async () => {
    const response = await DELETE(new Request('http://localhost'), { params })

    expect(response.status).toBe(200)
    expect(mocks.releaseTakesForJob).toHaveBeenCalledWith('job-1')
    // 지우기 전에 돌려줘야 한다 — 행이 사라지면 되돌릴 근거가 없어진다.
    expect(mocks.order).toEqual(['release', 'delete'])
  })

  it('Take 를 안 쓴 작업을 지워도 오류 없이 지워진다', async () => {
    mocks.getGenerationJobById.mockResolvedValue({
      id: 'job-1',
      project_id: 'project-1',
      status: 'failed',
      kind: 'shot_storyboard',
    })
    mocks.releaseTakesForJob.mockImplementation(async () => {
      mocks.order.push('release')
      return 0
    })

    const response = await DELETE(new Request('http://localhost'), { params })

    expect(response.status).toBe(200)
    expect(mocks.deleteGenerationJobById).toHaveBeenCalledWith('job-1')
  })

  it('돌려주기가 실패하면 작업을 지우지 않는다', async () => {
    mocks.releaseTakesForJob.mockRejectedValue(new Error('release failed'))

    const response = await DELETE(new Request('http://localhost'), { params })

    expect(response.status).toBe(500)
    expect(mocks.deleteGenerationJobById).not.toHaveBeenCalled()
  })

  it('끝난 작업은 기록으로 남기고 지우지 않는다', async () => {
    mocks.getGenerationJobById.mockResolvedValue({
      id: 'job-1',
      project_id: 'project-1',
      status: 'completed',
      kind: 'shot_video',
    })

    const response = await DELETE(new Request('http://localhost'), { params })

    expect(response.status).toBe(409)
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.deleteGenerationJobById).not.toHaveBeenCalled()
  })
})
