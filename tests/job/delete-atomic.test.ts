// 작업 삭제는 마지막 차감 반환과 함께 처리하며 완료된 작업이나 DB 오류를 삭제 성공으로 알리지 않는다.
import { beforeEach, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: db }))

import { deleteGenerationJobById } from '@/lib/generation-jobs'

beforeEach(() => { vi.clearAllMocks() })

it('작업을 삭제하면 마지막 차감 확인과 기록 삭제를 함께 처리한다', async () => {
  db.rpc.mockResolvedValue({ data: true, error: null })
  const deleted = await deleteGenerationJobById('job-atomic')
  expect(deleted).toBe(true)
  expect(db.rpc).toHaveBeenCalledExactlyOnceWith('delete_generation_job_with_release', { p_job: 'job-atomic' })
  expect(db.from).not.toHaveBeenCalled()
})

it('삭제 직전 작업이 완료되면 삭제하지 않았다는 결과를 그대로 돌려준다', async () => {
  db.rpc.mockResolvedValue({ data: false, error: null })
  await expect(deleteGenerationJobById('job-completed')).resolves.toBe(false)
})

it('마지막 차감 확인이나 기록 삭제에 실패하면 삭제 성공으로 알리지 않는다', async () => {
  const error = new Error('atomic deletion failed')
  db.rpc.mockResolvedValue({ data: null, error })
  await expect(deleteGenerationJobById('job-failed')).rejects.toBe(error)
})
