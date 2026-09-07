// #dup-finalize-null-url (2026-07-31) 회귀 가드.
//
// webhook 과 폴링(GET /api/generation-jobs/[id])이 같은 잡을 동시에 finalize 하면 CAS 패자가
// GenerationJobTerminalTransitionError 를 받는다. 패자가 폴링 쪽이면 reconcile 이 무엇을
// 돌려주느냐가 화면을 가른다 — 요청 시작 시점의 queued 스냅샷(result_url=null)을 그대로
// completed 로 돌려주면 pollGenerationJob 이 '완료됐지만 결과 URL이 없음'을 던져, 서버에선
// 성공한 생성이 Director 캔버스에서 "생성 실패"로 굳는다. 반드시 DB 진실을 다시 읽어야 한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  finalizeGenerationJob: vi.fn(),
  falImageFetch: vi.fn(),
  falVideoFetch: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: vi.fn() },
}))
vi.mock('@/lib/fal/finalize', () => ({
  finalizeGenerationJob: mocks.finalizeGenerationJob,
  DirectorVideoCompletionPersistenceError: class extends Error {},
}))
vi.mock('@/lib/writer/llm/fal', () => ({
  falImageFetch: mocks.falImageFetch,
  falVideoFetch: mocks.falVideoFetch,
}))
vi.mock('@/lib/director-video-takes', () => ({
  markDirectorVideoAttemptFailed: vi.fn(),
}))

import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { GenerationJobTerminalTransitionError, type GenerationJob } from '@/lib/generation-jobs'

/** getGenerationJobById 가 쓰는 select→eq→maybeSingle 체인 스텁. */
function jobRowQuery(row: unknown) {
  const value = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  }
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.maybeSingle.mockResolvedValue({ data: row, error: null })
  return value
}

const QUEUED_SNAPSHOT = {
  id: 'job-1',
  project_id: 'project-1',
  request_id: 'fal-request-1',
  model: 'fal-ai/some-image-model',
  kind: 'shot_storyboard',
  status: 'queued',
  target: { workspaceId: 'ws-1', writerShotId: 'shot_1', gridVariant: 'strip1' },
  video_clip_id: null,
  provider: 'fal',
  result_url: null,
  error: null,
  fal_key_id: 'prod-2000',
} as unknown as GenerationJob

const WINNER_URL = 'https://cdn.example/media/shot_1_storyboard_start.png?v=1785489691388'

describe('reconcileJobFromFal — 중복 finalize 경쟁', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.falImageFetch.mockResolvedValue({
      status: 'COMPLETED',
      url: 'https://fal.media/files/out.png',
      raw: {},
    })
  })

  it('경쟁에 져도 DB 의 result_url 을 돌려준다 (queued 스냅샷의 null 을 흘리지 않음)', async () => {
    mocks.finalizeGenerationJob.mockRejectedValue(
      new GenerationJobTerminalTransitionError('job-1', 'completed'),
    )
    // 승자(webhook)가 이미 써 둔 행 — 같은 객체를 가리키되 ?v 만 다른 URL.
    mocks.from.mockReturnValue(
      jobRowQuery({ ...QUEUED_SNAPSHOT, status: 'completed', result_url: WINNER_URL }),
    )

    const out = await reconcileJobFromFal(QUEUED_SNAPSHOT)

    expect(out.status).toBe('completed')
    expect(out.result_url).toBe(WINNER_URL)
  })

  it('승자가 실패로 종결했으면 실패를 그대로 보고한다', async () => {
    mocks.finalizeGenerationJob.mockRejectedValue(
      new GenerationJobTerminalTransitionError('job-1', 'failed'),
    )
    mocks.from.mockReturnValue(
      jobRowQuery({ ...QUEUED_SNAPSHOT, status: 'failed', result_url: null, error: 'content policy' }),
    )

    const out = await reconcileJobFromFal(QUEUED_SNAPSHOT)

    expect(out.status).toBe('failed')
    expect(out.error).toBe('content policy')
  })

  it('경쟁이 없으면 finalize 결과 URL 을 그대로 쓴다', async () => {
    mocks.finalizeGenerationJob.mockResolvedValue(WINNER_URL)

    const out = await reconcileJobFromFal(QUEUED_SNAPSHOT)

    expect(out.status).toBe('completed')
    expect(out.result_url).toBe(WINNER_URL)
    expect(mocks.from).not.toHaveBeenCalled() // 경쟁 없으면 재조회도 없다
  })
})
