// #batch-resume: 시작 때 확정한 순서는 저장된 position이다. 이후 화면 재정렬로 바꾸지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), submit: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/director/video-submit', () => ({ submitPreparedDirectorVideo: mocks.submit }))
import { continueVideoBatch } from '@/lib/director/batch-continue'

type OrderCall = [string, Record<string, unknown> | undefined]
function builder(data: unknown, calls?: OrderCall[]) {
  const result = { data, error: null }
  const self: Record<string, unknown> = {
    select: () => self, eq: () => self, in: () => self, gt: () => self, update: () => self,
    order: (field: string, options?: Record<string, unknown>) => {
      calls?.push([field, options])
      if (Array.isArray(result.data)) {
        result.data = [...result.data].sort((a, b) => Number(a[field]) - Number(b[field]))
      }
      return self
    },
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  return self
}

describe('일괄 이어가기가 저장한 항목을 읽는 순서', () => {
  let itemOrderCalls: OrderCall[]
  beforeEach(() => {
    vi.clearAllMocks()
    itemOrderCalls = []
    const batch = {
      id: 'batch-1', project_id: 'project-1', user_id: 'user-1', status: 'running',
      lease_token: 'lease-1', lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    }
    const items = [
      { id: 'item-3', shot_id: 'sh_02', position: 2 },
      { id: 'item-1', shot_id: 'sh_01', position: 0 },
      { id: 'item-2', shot_id: 'sh_03', position: 1 },
    ].map((item) => ({
      ...item, batch_id: batch.id, status: 'pending', job_id: null,
      prepared: { projectId: batch.project_id, ownerId: batch.user_id, writerShotId: item.shot_id, idempotencyKey: item.id },
    }))
    mocks.from.mockImplementation((table: string) => {
      if (table === 'director_video_batches') return builder(batch)
      if (table === 'director_video_batch_items') return builder(items, itemOrderCalls)
      if (table === 'generation_jobs') return builder([])
      throw new Error(`Unexpected live input query: ${table}`)
    })
    mocks.rpc.mockResolvedValue({ data: [batch], error: null })
    mocks.submit.mockImplementation(async (prepared: { idempotencyKey: string }) =>
      Response.json({ jobId: `job-${prepared.idempotencyKey}`, status: 'generating' }))
  })

  it('일괄은 앞에서부터 낸다', async () => {
    await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(itemOrderCalls).toEqual([['position', { ascending: true }]])
    expect(mocks.submit.mock.calls.map(([prepared]) => prepared.writerShotId)).toEqual(['sh_01', 'sh_03', 'sh_02'])
    expect(mocks.from).not.toHaveBeenCalledWith('shots')
  })
})
