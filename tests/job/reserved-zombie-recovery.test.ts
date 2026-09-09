// 제출되지 못한 영상 작업은 10분 뒤 실패로 정리되고 잡아둔 Take 가 돌아온다
//
// 영상 생성은 "작업 행 예약 + Take 잡기" 를 먼저 하고 그다음 fal 에 제출한다. 그 사이에 요청이
// 죽으면(함수 시간 초과·인스턴스 종료) 잡이 request_id='reserved:<id>' 인 채 queued 로 남는다.
// fal 은 이 작업을 모르므로 조회할 대상이 없고, 그래서 회수 함수가 첫 줄에서 그냥 지나쳤다.
// 결과: Take 는 잡힌 채 영원히 묶이고 사용자에게 탈출구가 없었다.
//
// fal 이 모른다는 것 자체가 답이다 — 제출이 안 됐으니 물어볼 필요 없이 실패로 확정하면 된다.
// 다만 아직 제출 중일 수 있으므로 유령 기준(10분)을 넘긴 것만 정리한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  markDirectorVideoAttemptFailed: vi.fn(),
  failGenerationJob: vi.fn(),
  releaseTakesForJob: vi.fn(),
  falVideoFetch: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  failGenerationJob: mocks.failGenerationJob,
}))
vi.mock('@/lib/fal/finalize', () => ({
  finalizeGenerationJob: vi.fn(),
  DirectorVideoCompletionPersistenceError: class extends Error {},
}))
vi.mock('@/lib/writer/llm/fal', () => ({
  falImageFetch: vi.fn(),
  falVideoFetch: mocks.falVideoFetch,
}))
vi.mock('@/lib/director-video-takes', () => ({
  markDirectorVideoAttemptFailed: mocks.markDirectorVideoAttemptFailed,
}))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: mocks.releaseTakesForJob }))

import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { type GenerationJob } from '@/lib/generation-jobs'

function reservedJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: 'job-1',
    project_id: 'project-1',
    kind: 'shot_video',
    status: 'queued',
    provider: 'fal',
    model: 'seedance',
    request_id: 'reserved:job-1',
    fal_key_id: null,
    video_clip_id: 'clip-1',
    result_url: null,
    error: null,
    ...overrides,
  } as GenerationJob
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('제출되지 못한 영상 작업 정리', () => {
  it('유령 청소부가 정리를 맡기면 실패로 끝내고 Take 를 돌려준다', async () => {
    const job = reservedJob()

    const after = await reconcileJobFromFal(job, { settleStaleReserved: true })

    expect(after.status).toBe('failed')
    // markDirectorVideoAttemptFailed 가 Take 반환까지 맡는다(director-video-takes.ts:257).
    expect(mocks.markDirectorVideoAttemptFailed).toHaveBeenCalledWith(
      'project-1',
      'job-1',
      expect.stringContaining('never submitted'),
    )
  })

  it('화면 폴링은 제출 중일 수 있는 작업을 건드리지 않는다', async () => {
    // 폴링은 방금 만든 작업도 본다. 성급하게 끝내면 곧 성공할 생성을 죽인다.
    //   나이 판정은 유령 청소부가 한다(10분 넘은 것만 목록에 담는다).
    const job = reservedJob()

    const after = await reconcileJobFromFal(job)

    expect(after.status).toBe('queued')
    expect(mocks.markDirectorVideoAttemptFailed).not.toHaveBeenCalled()
  })

  it('일괄의 제출 결과를 모르면 시간만으로 실패와 환급을 확정하지 않는다', async () => {
    // #batch-resume: provider 접수 직후 연결 저장 전에 끊겼을 수도 있어 재제출·자동 환급은 위험하다.
    const job = reservedJob({ batch_id: 'batch-1', batch_total: 1 })
    const after = await reconcileJobFromFal(job, { settleStaleReserved: true })
    expect(after.status).toBe('queued')
    expect(mocks.markDirectorVideoAttemptFailed).not.toHaveBeenCalled()
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.falVideoFetch).not.toHaveBeenCalled()
  })

  it('영상 카드에 연결되지 않은 작업도 Take 를 돌려준다', async () => {
    // previz 처럼 video_clips 를 쓰지 않는 영상도 Take 를 잡는다.
    const job = reservedJob({ kind: 'shot_previz_video', video_clip_id: null })

    const after = await reconcileJobFromFal(job, { settleStaleReserved: true })

    expect(after.status).toBe('failed')
    expect(mocks.releaseTakesForJob).toHaveBeenCalledWith('job-1')
  })

  it('제출된 작업은 예전처럼 서비스에 물어본다', async () => {
    // reserved: 가 아닌 정상 작업은 이 변경의 영향을 받으면 안 된다.
    const job = reservedJob({ request_id: 'fal-request-1', fal_key_id: 'key-1' })
    mocks.falVideoFetch.mockResolvedValue({ status: 'IN_PROGRESS' })

    const after = await reconcileJobFromFal(job)

    expect(mocks.falVideoFetch).toHaveBeenCalled()
    expect(after.status).toBe('queued')
  })
})
