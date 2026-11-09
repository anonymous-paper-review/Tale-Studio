// 영상 묶음 조회 응답이 아직 안 낸 샷을 낼 순서대로 알려 준다 (11/5 시안 DG "다음 차례", 리드 2026-11-09)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: vi.fn().mockResolvedValue(true) }))
import { getVideoBatchSummary } from '@/lib/director/batch-store'

type Row = Record<string, unknown>
let tables: Record<string, Row[]>

// supabase 읽기 체인만 흉내낸다. order() 는 아무것도 하지 않는다. 순서는 응답을 만드는 쪽이 지켜야 한다.
function query(table: string) {
  let rows = tables[table] ?? []
  const result = () => ({ data: rows, error: null })
  const q = {
    select: () => q,
    order: () => q,
    eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return q },
    neq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] !== value); return q },
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return q },
    limit: () => q,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  }
  return q
}

const batch = { id: 'batch-1', project_id: 'project-1', status: 'running', stop_reason: null }
const item = (row: Row) => ({ batch_id: batch.id, job_id: null, error: null, submission_response: null, ...row })

beforeEach(() => {
  vi.clearAllMocks()
  tables = { director_video_batches: [batch], director_video_batch_items: [], generation_jobs: [] }
  mocks.from.mockImplementation(query)
})

describe('혼자 정한 것', () => {
  // 왜: 묶음이 도는 동안 기다리는 카드에 "다음 차례"를 보이려면 화면이 순서를 알아야 한다. 서버는 묶음 목록에 순서를 갖고 있었지만
  //   조회 응답에는 개수만 있었다. 생성 경로는 건드리지 않고 조회 응답에만 더한다.
  it('영상 묶음 조회 응답에는 아직 안 낸 샷이 낼 순서대로 담긴다', async () => {
    tables.director_video_batch_items = [
      item({ id: 'i3', shot_id: 'shot-c', position: 2, status: 'pending' }),
      item({ id: 'i1', shot_id: 'shot-a', position: 0, status: 'submitted', job_id: 'job-a', submission_response: { jobId: 'job-a', status: 'generating' } }),
      item({ id: 'i4', shot_id: 'shot-d', position: 3, status: 'pending' }),
      item({ id: 'i2', shot_id: 'shot-b', position: 1, status: 'pending' }),
    ]
    tables.generation_jobs = [{ id: 'job-a', status: 'queued', result_url: null, error: null, request_id: 'req-a' }]

    const summary = await getVideoBatchSummary(batch.id, batch.project_id)

    expect(summary?.pendingShotIds).toEqual(['shot-b', 'shot-c', 'shot-d'])
  })

  // 왜: 다음 차례는 아직 차례를 기다리는 샷뿐이다. 이미 낸 것 · 끝난 것 · 실패한 것 · 건너뛴 것을 넣으면 다시 만드는 것처럼 보인다.
  it('이미 낸 샷 · 끝난 샷 · 실패한 샷 · 건너뛴 샷은 다음 차례에 넣지 않는다', async () => {
    tables.director_video_batch_items = [
      item({ id: 'running', shot_id: 'shot-running', position: 0, status: 'submitted', job_id: 'job-running', submission_response: { jobId: 'job-running', status: 'generating' } }),
      item({ id: 'done', shot_id: 'shot-done', position: 1, status: 'submitted', job_id: 'job-done', submission_response: { jobId: 'job-done', status: 'generating' } }),
      item({ id: 'failed', shot_id: 'shot-failed', position: 2, status: 'submitted', job_id: 'job-failed', submission_response: { jobId: 'job-failed', status: 'generating' } }),
      item({ id: 'skipped', shot_id: 'shot-skipped', position: 3, status: 'skipped', error: 'batch_shot_already_completed' }),
      item({ id: 'invalid', shot_id: 'shot-invalid', position: 4, status: 'failed', error: 'invalid input' }),
      item({ id: 'wait', shot_id: 'shot-wait', position: 5, status: 'pending' }),
    ]
    tables.generation_jobs = [
      { id: 'job-running', status: 'queued', result_url: null, error: null, request_id: 'req-1' },
      { id: 'job-done', status: 'completed', result_url: 'https://media.test/v.mp4', error: null, request_id: 'req-2' },
      { id: 'job-failed', status: 'failed', result_url: null, error: 'provider rejected', request_id: 'req-3' },
    ]

    const summary = await getVideoBatchSummary(batch.id, batch.project_id)

    expect(summary?.pendingShotIds).toEqual(['shot-wait'])
  })
})
