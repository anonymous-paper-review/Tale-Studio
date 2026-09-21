// 묶음 기록은 요청한 항목과 실제 작업으로 집계하고, 조회 한도 때문에 다른 묶음을 빈 것으로 표시하지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: vi.fn().mockResolvedValue(true) }))
import { getVideoBatchSummary, listVideoBatchSummaries, reserveVideoBatchItem } from '@/lib/director/batch-store'

type Row = Record<string, unknown>
let tables: Record<string, Row[]>

function query(table: string) {
  let rows = tables[table] ?? []
  let limit = 1000 // PostgREST의 기본 응답 한도.
  const result = () => ({ data: rows.slice(0, limit), error: null })
  const q = {
    select: () => q,
    order: () => q,
    eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return q },
    neq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] !== value); return q },
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return q },
    limit: (value: number) => { limit = Math.min(limit, value); return q },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  }
  return q
}

const batch = { id: 'batch-1', project_id: 'project-1', status: 'running', stop_reason: null }
beforeEach(() => {
  vi.clearAllMocks()
  tables = { director_video_batches: [batch], director_video_batch_items: [], generation_jobs: [] }
  mocks.from.mockImplementation(query)
})

describe('처음 묶음과 실제 완료를 함께 읽는다', () => {
  it('예약 한도에 걸리면 실제 대기 수를 잃지 않고 전달한다', async () => {
    const error = { message: 'video_user_at_capacity', details: '3', code: 'P0001' }
    mocks.rpc.mockResolvedValueOnce({ data: null, error })
    await expect(reserveVideoBatchItem('item-1', 'lease-1', {
      projectId: batch.project_id, shotId: 'shot-1', model: 'model-1',
      target: {}, idempotencyKey: 'item-1',
    })).rejects.toBe(error)
  })

  it('기다리는 샷과 실패한 샷, 이미 완성돼 건너뛴 샷을 구분한다', async () => {
    tables.director_video_batch_items = [
      { id: 'pending', status: 'pending', job_id: null },
      { id: 'done', status: 'submitted', job_id: 'done-job', submission_response: { jobId: 'done-job', status: 'generating' } },
      { id: 'failed', status: 'submitted', job_id: 'failed-job', submission_response: { jobId: 'failed-job', status: 'generating' } },
      { id: 'already-done', status: 'skipped', job_id: null, error: 'batch_shot_already_completed' },
      { id: 'invalid', status: 'failed', job_id: null, error: 'invalid input' },
    ].map((item) => ({ ...item, batch_id: batch.id }))
    tables.generation_jobs = [
      { id: 'done-job', status: 'completed', result_url: 'https://media.test/video.mp4', error: null },
      { id: 'failed-job', status: 'failed', result_url: null, error: 'provider rejected' },
    ]
    const summary = await getVideoBatchSummary(batch.id, batch.project_id)
    expect(summary).toMatchObject({ total: 5, done: 2, failed: 2, pending: 1, active: 0 })
    expect(summary).toMatchObject({ started: 2, failedToStart: 1 })
    expect(summary?.jobs).toHaveLength(2)
  })

  it('접수 뒤의 실패와 접수 전 잔액 부족, 접수 여부 불명을 구분한다', async () => {
    tables.director_video_batch_items = [
      { id: 'rejected', job_id: 'rejected-job', submission_response: { error: 'insufficient_takes' } },
      { id: 'unknown', job_id: 'unknown-job', submission_response: { jobId: 'unknown-job', status: 'queued', unresolved: true } },
      { id: 'accepted', job_id: 'accepted-job', submission_response: null },
    ].map((item) => ({ ...item, batch_id: batch.id, status: 'submitted' }))
    tables.generation_jobs = [
      { id: 'rejected-job', request_id: 'reserved:rejected-job', status: 'failed', error: 'insufficient_takes' },
      { id: 'unknown-job', request_id: 'reserved:unknown-job', status: 'queued' },
      { id: 'accepted-job', request_id: 'fal-accepted', status: 'failed', error: 'provider failed later' },
    ]
    expect(await getVideoBatchSummary(batch.id, batch.project_id)).toMatchObject({
      total: 3, started: 1, failedToStart: 1, done: 0, failed: 2, active: 1,
    })
  })

  it('묶음이 많아도 조회 한도 때문에 뒤의 묶음을 빈 것으로 표시하지 않는다', async () => {
    tables.director_video_batches = Array.from({ length: 11 }, (_, index) => ({
      ...batch, id: `batch-${index}`,
    }))
    tables.director_video_batch_items = tables.director_video_batches.flatMap((record) =>
      Array.from({ length: 100 }, (_, index) => ({
        id: `${record.id}-item-${index}`, batch_id: record.id, status: 'pending', job_id: null,
      })),
    )
    const summaries = await listVideoBatchSummaries(batch.project_id)
    expect(summaries).toHaveLength(11)
    expect(summaries.map((summary) => summary.total)).toEqual(Array(11).fill(100))
    expect(summaries.map((summary) => summary.pending)).toEqual(Array(11).fill(100))
  })
})
