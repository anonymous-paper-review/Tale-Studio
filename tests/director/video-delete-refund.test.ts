// 영상 삭제 중 새로 접수되어 종료된 작업도 차감액을 반환한다.
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ deleted: false, rpc: vi.fn(), release: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({
          data: mocks.deleted ? [{ id: 'late-job' }] : [], error: null,
        })),
      }
      return query
    },
  },
}))
vi.mock('@/lib/generation-jobs', () => ({ classifyJobError: vi.fn() }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: mocks.release }))
import { softDeleteDirectorVideoTake } from '@/lib/director-video-takes'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleted = false
  mocks.rpc.mockImplementation(async () => { mocks.deleted = true; return { error: null } })
  mocks.release.mockResolvedValue(5)
})
it('영상 삭제 중 새 생성 작업이 접수되면 삭제로 종료된 작업의 차감액도 반환한다', async () => {
  await softDeleteDirectorVideoTake('project', 'clip')
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith('late-job')
})
it('영상 삭제가 실패하면 진행 중 작업의 차감액을 반환하지 않는다', async () => {
  mocks.rpc.mockResolvedValue({ error: new Error('delete failed') })
  await expect(softDeleteDirectorVideoTake('project', 'clip')).rejects.toThrow('delete failed')
  expect(mocks.release).not.toHaveBeenCalled()
})
