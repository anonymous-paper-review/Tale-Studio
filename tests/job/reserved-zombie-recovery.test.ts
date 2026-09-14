// 접수 여부가 확인될 때까지 예약과 사용량을 유지한다
//
// 영상 생성은 "작업 행 예약 + Take 잡기" 를 먼저 하고 그다음 fal 에 제출한다. 그 사이에 요청이
// 죽으면(함수 시간 초과·인스턴스 종료) 잡이 request_id='reserved:<id>' 인 채 queued 로 남는다.
// fal 은 이 작업을 모를 수 있어 조회할 대상이 없다. 접수 여부가 확인되기 전까지는 사용량을
// 묶어 두고, 시간만으로 실패·환급하지 않아 같은 생성의 중복 비용을 막는다.
//
// 접수 여부가 확인될 때까지는 제출 여부를 단정할 수 없다. 중복 비용을 막는 대신 확인이 늦으면
// 사용량이 묶이는 정책이므로, 예약 작업은 종류·일괄 여부와 무관하게 그대로 보존한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  markDirectorVideoAttemptFailed: vi.fn(),
  failGenerationJob: vi.fn(),
  releaseTakesForJob: vi.fn(),
  falImageFetch: vi.fn(),
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
  falImageFetch: mocks.falImageFetch,
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

describe('접수 전 예약 작업 상태 확인', () => {
  it('접수 여부가 확인될 때까지 예약과 사용량을 유지한다', async () => {
    const job = reservedJob()

    const after = await reconcileJobFromFal(job)

    expect(after.status).toBe('queued')
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.markDirectorVideoAttemptFailed).not.toHaveBeenCalled()
    expect(mocks.falVideoFetch).not.toHaveBeenCalled()
    expect(mocks.falImageFetch).not.toHaveBeenCalled()
  })

  it('화면 폴링에서도 접수 전 예약과 사용량을 유지한다', async () => {
    const job = reservedJob()

    const after = await reconcileJobFromFal(job)

    expect(after.status).toBe('queued')
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.falVideoFetch).not.toHaveBeenCalled()
    expect(mocks.falImageFetch).not.toHaveBeenCalled()
    expect(mocks.markDirectorVideoAttemptFailed).not.toHaveBeenCalled()
  })

  it('일괄 여부와 관계없이 접수 전 예약과 사용량을 유지한다', async () => {
    const job = reservedJob({ batch_id: 'batch-1', batch_total: 1 })
    const after = await reconcileJobFromFal(job)
    expect(after.status).toBe('queued')
    expect(mocks.markDirectorVideoAttemptFailed).not.toHaveBeenCalled()
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.falVideoFetch).not.toHaveBeenCalled()
    expect(mocks.falImageFetch).not.toHaveBeenCalled()
  })

  it('러프 작업도 접수 전에는 예약과 사용량을 유지한다', async () => {
    const job = reservedJob({ kind: 'shot_rough_storyboard', video_clip_id: null })
    const after = await reconcileJobFromFal(job)
    expect(after.status).toBe('queued')
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.falVideoFetch).not.toHaveBeenCalled()
    expect(mocks.falImageFetch).not.toHaveBeenCalled()
  })

  it('이미지 작업도 접수 전에는 예약과 사용량을 유지한다', async () => {
    const job = reservedJob({ kind: 'character_view', video_clip_id: null })
    const after = await reconcileJobFromFal(job)
    expect(after.status).toBe('queued')
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.falVideoFetch).not.toHaveBeenCalled()
    expect(mocks.falImageFetch).not.toHaveBeenCalled()
  })

  it('연결되지 않은 previz 작업도 접수 전에는 예약과 사용량을 유지한다', async () => {
    const job = reservedJob({ kind: 'shot_previz_video', video_clip_id: null })

    const after = await reconcileJobFromFal(job)

    expect(after.status).toBe('queued')
    expect(mocks.failGenerationJob).not.toHaveBeenCalled()
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.falVideoFetch).not.toHaveBeenCalled()
    expect(mocks.falImageFetch).not.toHaveBeenCalled()
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
