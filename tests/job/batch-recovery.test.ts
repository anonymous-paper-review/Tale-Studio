// 완료 알림이 빠져도 서버가 일괄을 다시 확인하고, 이미 접수한 영상은 중단 후에도 수집한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), getJob: vi.fn(), reconcile: vi.fn(), continue: vi.fn(),
  submit: vi.fn(), reserve: vi.fn(), updates: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/generation-jobs', () => ({ getGenerationJobById: mocks.getJob }))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcile }))
vi.mock('@/lib/director/batch-continue', () => ({ continueVideoBatch: mocks.continue }))
vi.mock('@/lib/director/video-submit', () => ({ submitPreparedDirectorVideo: mocks.submit }))
vi.mock('@/lib/director/batch-store', () => ({ reserveVideoBatchItem: mocks.reserve }))

import { recoverVideoBatches } from '@/lib/director/batch-recovery'
import { GET } from '@/app/api/cron/video-batches/route'

function query(data: unknown) {
  let selected = data
  let offset = 0
  let limit = 1000
  const result = () => ({ data: Array.isArray(selected) ? selected.slice(offset, offset + limit) : selected, error: null })
  const filter = (key: string, match: (value: unknown) => boolean) => {
    if (Array.isArray(selected)) selected = selected.filter((row) => match(row[key]))
    return q
  }
  const q = {
    select: vi.fn(() => q),
    eq: (key: string, value: unknown) => filter(key, (actual) => actual === value),
    in: (key: string, values: unknown[]) => filter(key, (actual) => values.includes(actual)),
    not: (key: string, _operator: string, value: unknown) => filter(key, (actual) => actual !== value),
    order: (key: string) => {
      if (Array.isArray(selected)) selected = [...selected].sort((a, b) => String(a[key]).localeCompare(String(b[key])))
      return q
    },
    limit: (value: number) => { limit = Math.min(1000, value); return q },
    range: (start: number, end: number) => { offset = start; limit = Math.min(1000, end - start + 1); return q },
    update: vi.fn((patch) => { mocks.updates(patch); return q }),
    maybeSingle: () => Promise.resolve({ data: Array.isArray(selected) ? selected[0] ?? null : selected, error: null }),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  }
  return q
}

const running = { id: 'batch-a', project_id: 'project-a', user_id: 'user-a', status: 'running', updated_at: '2026-09-09T00:00:00Z' }
const cancelled = { id: 'batch-b', project_id: 'project-b', user_id: 'user-b', status: 'cancelled', updated_at: '2026-09-09T00:00:00Z' }
function job(id: string, batchId: string, projectId: string) {
  return { id, batch_id: batchId, project_id: projectId, kind: 'shot_video', status: 'queued', request_id: `fal-${id}` }
}

let batches: Record<string, unknown>[]
let jobs: Record<string, unknown>[]
let items: Record<string, unknown>[]
beforeEach(() => {
  vi.resetAllMocks()
  batches = [running]
  jobs = []
  items = []
  mocks.from.mockImplementation((table: string) => query(
    table === 'director_video_batches' ? batches
      : table === 'generation_jobs' ? jobs : items,
  ))
  mocks.getJob.mockImplementation(async (id: string) => jobs.find((row) => row.id === id) ?? null)
  mocks.reconcile.mockImplementation(async (row: Record<string, unknown>) => ({ ...row, status: 'completed' }))
  mocks.continue.mockResolvedValue({ submitted: 1 })
  mocks.reserve.mockResolvedValue({ job_id: 'job-a', video_clip_id: 'clip-a', take_number: 1, replayed: true })
})
afterEach(() => vi.unstubAllEnvs())

describe('서버가 놓친 일괄을 다시 확인한다', () => {
  it('첫 작업이 아직 없어도 저장한 일괄을 이어간다', async () => {
    await recoverVideoBatches()
    expect(mocks.continue).toHaveBeenCalledWith({ batchId: 'batch-a', projectId: 'project-a' })
  })

  it('중단한 일괄의 접수된 영상도 완료를 수집하되 남은 샷은 제출하지 않는다', async () => {
    batches = [cancelled]
    jobs = [job('job-b', 'batch-b', 'project-b')]
    await recoverVideoBatches()
    expect(mocks.reconcile).toHaveBeenCalledWith(jobs[0], { settleStaleReserved: false })
    expect(mocks.continue).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('한 작업의 복구 오류가 다른 작업의 수집을 막지 않는다', async () => {
    batches = [running, cancelled]
    jobs = [job('job-a', 'batch-a', 'project-a'), job('job-b', 'batch-b', 'project-b')]
    mocks.getJob.mockRejectedValueOnce(new Error('temporary database failure'))
    const result = await recoverVideoBatches()
    expect(result.failed).toBe(1)
    expect(mocks.reconcile).toHaveBeenCalledWith(jobs[1], { settleStaleReserved: false })
  })

  it('저장한 복구 증표로 기존 작업을 연결한 뒤 완료를 확인한다', async () => {
    const reserved = { ...job('job-a', 'batch-a', 'project-a'), request_id: 'reserved:job-a' }
    jobs = [reserved]
    const prepared = { projectId: 'project-a', ownerId: 'user-a', idempotencyKey: 'item-a' }
    items = [{ id: 'item-a', job_id: 'job-a', batch_id: 'batch-a', status: 'submitted', prepared, submission_response: { recoveryReceipt: 'signed-receipt' } }]
    mocks.getJob.mockResolvedValueOnce(reserved).mockResolvedValueOnce({ ...reserved, request_id: 'fal-recovered' })
    mocks.submit.mockResolvedValue(new Response('{}', { status: 200 }))

    await recoverVideoBatches()

    expect(mocks.submit).toHaveBeenCalledWith(prepared, {
      recoveryReceipt: 'signed-receipt', batchRecoveryId: 'batch-a', reserve: expect.any(Function),
    })
    expect(mocks.reconcile.mock.calls[0][0].request_id).toBe('fal-recovered')
  })

  it('연결 저장을 다시 실패해도 새 복구 증표를 잃지 않는다', async () => {
    jobs = [{ ...job('job-a', 'batch-a', 'project-a'), request_id: 'reserved:job-a' }]
    items = [{
      id: 'item-a', job_id: 'job-a', batch_id: 'batch-a', status: 'submitted',
      prepared: { projectId: 'project-a', ownerId: 'user-a', idempotencyKey: 'item-a' },
      submission_response: { jobId: 'job-a', recoveryReceipt: 'old-receipt' },
    }]
    mocks.submit.mockResolvedValue(Response.json({ error: 'attach failed', recoveryReceipt: 'new-receipt' }, { status: 500 }))
    const result = await recoverVideoBatches()
    expect(result.failed).toBe(1)
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({
      submission_response: { jobId: 'job-a', error: 'attach failed', recoveryReceipt: 'new-receipt' },
    }))
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('결과를 모르고 복구 증표도 없으면 생성 서비스에 다시 제출하지 않는다', async () => {
    jobs = [{ ...job('job-a', 'batch-a', 'project-a'), request_id: 'reserved:job-a' }]
    await recoverVideoBatches()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.reconcile).toHaveBeenCalledTimes(1)
  })

  it('조회 상한을 넘는 기록이 있어도 가장 오래 기다린 중단 묶음부터 확인한다', async () => {
    batches = Array.from({ length: 1050 }, (_, index) => ({
      ...cancelled, id: `batch-${index}`, project_id: `project-${index}`, user_id: `user-${index}`,
      updated_at: index === 1049 ? '2026-01-01T00:00:00Z' : '2026-09-09T00:00:00Z',
    }))
    jobs = batches.map((batch, index) => job(`job-${index}`, String(batch.id), String(batch.project_id)))
    await recoverVideoBatches()
    expect(mocks.reconcile.mock.calls[0][0].id).toBe('job-1049')
    expect(mocks.reconcile).toHaveBeenCalledTimes(50)
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})

describe('정기 확인은 서버 인증을 거친다', () => {
  it('비밀 값이 없거나 다르면 DB와 생성 서비스를 호출하지 않는다', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(new Request('http://test/api/cron/video-batches'))).status).toBe(401)
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    expect((await GET(new Request('http://test/api/cron/video-batches'))).status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('인증된 정기 확인은 놓친 일괄을 깨운다', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    const response = await GET(new Request('http://test/api/cron/video-batches', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }))
    expect(response.status).toBe(200)
    expect(mocks.continue).toHaveBeenCalledWith({ batchId: 'batch-a', projectId: 'project-a' })
  })
})
