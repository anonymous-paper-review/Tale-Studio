// #ghost-reconcile (2026-08-17) 회귀 가드.
//
// STALE_QUEUED_MS 를 넘긴 queued 잡(유령)은 active 목록에서 숨겨지기만 했고, 제출 탭의
// 폴링이 죽으면 아무도 fal 진실을 회수하지 않았다 — 과금이 끝난 결과가 fal 큐에 있는데
// 화면은 영영 무반응(실측: rough 잡 b6654f02 가 5시간 queued 방치). 이 스윕은 active
// 라우트에서 돌며 유령을 종결시킨다. 여기서 지키는 계약:
//   ① 완료된 유령은 finalize 로 회수된다 ② 프로젝트당 스로틀로 폴링 경로를 fal 호출
//   폭주로부터 지킨다 ③ 조회/개별 회수 실패는 삼켜 목록 조회를 절대 막지 않는다.
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

import {
  reconcileGhostQueuedJobs,
  _resetGhostSweepThrottleForTest,
} from '@/lib/fal/reconcile'

/** 유령 스윕이 쓰는 select→eq→eq→lt→order→limit 체인 스텁. limit 이 결과를 resolve 한다. */
function ghostQuery(rows: unknown[], error: { message: string } | null = null) {
  const value = {
    select: vi.fn(),
    eq: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.lt.mockReturnValue(value)
  value.order.mockReturnValue(value)
  value.limit.mockResolvedValue({ data: rows, error })
  return value
}

const GHOST_ROW = {
  id: 'job-ghost-1',
  project_id: 'project-1',
  request_id: 'fal-request-ghost',
  model: 'openai/gpt-image-2/edit',
  kind: 'shot_rough_storyboard',
  status: 'queued',
  target: { workspaceId: 'ws-1', writerShotIds: ['sh_01_01'], gridVariant: 'grid4' },
  video_clip_id: null,
  provider: 'fal',
  result_url: null,
  error: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetGhostSweepThrottleForTest()
})

describe('reconcileGhostQueuedJobs', () => {
  it('완료된 유령 잡을 finalize 로 회수한다', async () => {
    mocks.from.mockReturnValue(ghostQuery([GHOST_ROW]))
    mocks.falImageFetch.mockResolvedValue({
      status: 'COMPLETED',
      url: 'https://storage/sheet.png',
      raw: {},
    })
    mocks.finalizeGenerationJob.mockResolvedValue('https://storage/sheet.png')

    const settled = await reconcileGhostQueuedJobs('project-1')

    expect(settled).toBe(1)
    expect(mocks.falImageFetch).toHaveBeenCalledWith(
      'openai/gpt-image-2/edit',
      'fal-request-ghost',
    )
    expect(mocks.finalizeGenerationJob).toHaveBeenCalledTimes(1)
  })

  it('아직 진행 중(IN_PROGRESS)인 잡은 건드리지 않는다', async () => {
    mocks.from.mockReturnValue(ghostQuery([GHOST_ROW]))
    mocks.falImageFetch.mockResolvedValue({ status: 'IN_PROGRESS' })

    const settled = await reconcileGhostQueuedJobs('project-1')

    expect(settled).toBe(0)
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
  })

  it('같은 프로젝트 연속 호출은 스로틀돼 fal 을 재조회하지 않는다', async () => {
    mocks.from.mockReturnValue(ghostQuery([GHOST_ROW]))
    mocks.falImageFetch.mockResolvedValue({
      status: 'COMPLETED',
      url: 'https://storage/sheet.png',
      raw: {},
    })
    mocks.finalizeGenerationJob.mockResolvedValue('https://storage/sheet.png')

    await reconcileGhostQueuedJobs('project-1')
    const second = await reconcileGhostQueuedJobs('project-1')

    expect(second).toBe(0)
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it('조회 실패는 삼키고 0 을 돌려준다 (목록 조회를 막지 않는다)', async () => {
    mocks.from.mockReturnValue(ghostQuery([], { message: 'db down' }))

    await expect(reconcileGhostQueuedJobs('project-1')).resolves.toBe(0)
  })

  it('잡 하나의 회수 예외가 스윕 전체를 죽이지 않는다', async () => {
    const second = { ...GHOST_ROW, id: 'job-ghost-2', request_id: 'fal-request-2' }
    mocks.from.mockReturnValue(ghostQuery([GHOST_ROW, second]))
    // 첫 잡은 finalize 내부의 CAS 경합 재조회까지 실패해 스윕의 try/catch 로 던져진다.
    mocks.falImageFetch
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 404 }))
      .mockResolvedValueOnce({ status: 'COMPLETED', url: 'https://storage/2.png', raw: {} })
    mocks.finalizeGenerationJob.mockResolvedValue('https://storage/2.png')

    const settled = await reconcileGhostQueuedJobs('project-1')

    // 404(영구 조회 실패)는 terminalize(failed) → settled, 두 번째는 finalize → settled.
    expect(settled).toBeGreaterThanOrEqual(1)
    expect(mocks.finalizeGenerationJob).toHaveBeenCalledTimes(1)
  })
})
