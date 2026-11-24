// 접수 번호 기록이 DB 오류로 실패하면 짧게 두 번 더 시도하고, 예약이 바뀐 경우는 바로 알린다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ update: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => ({ update: mocks.update }) },
}))

import { confirmGenerationJobReceipt } from '@/lib/generation-jobs'

function chain(result: unknown) {
  const q: Record<string, unknown> = {}
  for (const name of ['eq', 'select']) q[name] = vi.fn(() => q)
  ;(q as { then: unknown }).then = (resolve: (value: unknown) => unknown) => resolve(result)
  return q
}

const receipt = { request_id: 'fal-1', model: 'm', fal_key_id: 'key-1' }
const dbError = (message: string) => ({ data: null, error: new Error(message) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('접수 번호 기록 재시도', () => {
  it('DB 오류면 300ms·900ms 뒤 다시 시도해 성공하면 기록을 남긴다', async () => {
    mocks.update
      .mockReturnValueOnce(chain(dbError('first')))
      .mockReturnValueOnce(chain(dbError('second')))
      .mockReturnValueOnce(chain({ data: [{ id: 'job-1' }], error: null }))
    const sleep = vi.fn(async () => {})

    await confirmGenerationJobReceipt('job-1', 'project-1', receipt, { sleep })

    expect(mocks.update).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[300], [900]])
  })

  it('세 번 다 실패하면 마지막 오류로 끝낸다', async () => {
    mocks.update
      .mockReturnValueOnce(chain(dbError('first')))
      .mockReturnValueOnce(chain(dbError('second')))
      .mockReturnValueOnce(chain(dbError('third')))
    const sleep = vi.fn(async () => {})

    await expect(confirmGenerationJobReceipt('job-1', 'project-1', receipt, { sleep })).rejects.toThrow('third')
    expect(mocks.update).toHaveBeenCalledTimes(3)
  })

  it('예약이 이미 바뀌어 0행이면 다시 시도하지 않고 바로 알린다', async () => {
    mocks.update.mockReturnValue(chain({ data: [], error: null }))
    const sleep = vi.fn(async () => {})

    await expect(confirmGenerationJobReceipt('job-1', 'project-1', receipt, { sleep })).rejects.toThrow(
      /reservation changed/,
    )
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
