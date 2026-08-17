// #ghost-reconcile (2026-08-17) 회귀 가드 — 리뷰 반영 개정판 (S2·S3·S5·M5·M11).
//
// STALE_QUEUED_MS 를 넘긴 queued 잡(유령)은 active 목록에서 숨겨지기만 했고, 제출 탭의
// 폴링이 죽으면 아무도 fal 진실을 회수하지 않았다(실측: rough 잡 b6654f02 5시간 방치).
// 스윕이 지키는 계약:
//   ① 완료된 유령은 finalize 로 회수  ② 이미 남이 종결한 잡은 재조회 후 건너뜀(M11)
//   ③ 404 등 영구 조회 실패는 failed 로 종결, 401/403(자격증명)은 queued 유지(S2)
//   ④ 프로젝트당 스로틀 + in-flight 가드(S3)  ⑤ 조회/개별 실패는 삼켜 목록 조회를 안 막음
// 스텁은 실제 쿼리 체인 인자까지 검증한다(S5 — .lt→.gte 뒤집힘 같은 회귀가 조용히 통과 금지).
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

function ghostRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'project-1',
    request_id: `fal-req-${id}`,
    model: 'openai/gpt-image-2/edit',
    kind: 'shot_rough_storyboard',
    status: 'queued',
    target: { workspaceId: 'ws-1', writerShotIds: ['sh_01_01'], gridVariant: 'grid4' },
    video_clip_id: null,
    provider: 'fal',
    result_url: null,
    error: null,
    ...overrides,
  }
}

/**
 * generation_jobs 체이너블 스텁 — 세 체인을 실제 모양대로 서빙한다:
 *   목록: select('id').eq('project_id',·).eq('status','queued').lt(...).order(...).limit(N)
 *   행:   select(COLUMNS).eq('id', X).maybeSingle()
 *   실패: update({...}).eq('id', X).eq('status','queued').is(...).select('id').maybeSingle()
 */
function installGenerationJobsStub(opts: {
  ghostIds?: string[]
  listError?: { message: string } | null
  rowsById?: Record<string, unknown>
}) {
  const recorded = {
    listChains: [] as Array<Record<string, unknown[]>>,
    updates: [] as Array<{ payload: unknown; id: string | null }>,
  }
  mocks.from.mockImplementation(() => {
    const chain: Record<string, unknown[]> = {}
    let mode: 'select' | 'update' = 'select'
    let eqId: string | null = null
    let updatePayload: unknown = null
    const b: Record<string, (...args: unknown[]) => unknown> = {}
    const self = (name: string) => (...args: unknown[]) => {
      chain[name] = args
      if (name === 'update') {
        mode = 'update'
        updatePayload = args[0]
      }
      if (name === 'eq' && args[0] === 'id') eqId = args[1] as string
      return b
    }
    for (const m of ['select', 'eq', 'lt', 'order', 'is', 'update']) b[m] = self(m)
    b.limit = (...args: unknown[]) => {
      chain.limit = args
      recorded.listChains.push(chain)
      return Promise.resolve({
        data: opts.listError ? null : (opts.ghostIds ?? []).map((id) => ({ id })),
        error: opts.listError ?? null,
      })
    }
    b.maybeSingle = () => {
      if (mode === 'update') {
        recorded.updates.push({ payload: updatePayload, id: eqId })
        return Promise.resolve({ data: eqId ? { id: eqId } : null, error: null })
      }
      return Promise.resolve({ data: (opts.rowsById ?? {})[eqId ?? ''] ?? null, error: null })
    }
    return b
  })
  return recorded
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetGhostSweepThrottleForTest()
})

describe('reconcileGhostQueuedJobs', () => {
  it('완료된 유령 잡을 finalize 로 회수하고, 스윕 쿼리 인자가 계약대로다 (S5)', async () => {
    const recorded = installGenerationJobsStub({
      ghostIds: ['job-1'],
      rowsById: { 'job-1': ghostRow('job-1') },
    })
    mocks.falImageFetch.mockResolvedValue({ status: 'COMPLETED', url: 'https://s/1.png', raw: {} })
    mocks.finalizeGenerationJob.mockResolvedValue('https://s/1.png')

    const settled = await reconcileGhostQueuedJobs('project-1')

    expect(settled).toBe(1)
    expect(mocks.falImageFetch).toHaveBeenCalledWith('openai/gpt-image-2/edit', 'fal-req-job-1')
    expect(mocks.finalizeGenerationJob).toHaveBeenCalledTimes(1)
    // S5 — 목록 체인 인자 검증: 뒤집히면(.lt→.gte 등) 유령 대신 활성 잡을 쓸어버린다.
    const list = recorded.listChains[0]
    expect(list.select).toEqual(['id'])
    expect(list.eq).toEqual(['status', 'queued'])
    expect(list.lt?.[0]).toBe('created_at')
    expect(typeof list.lt?.[1]).toBe('string')
    expect(list.order).toEqual(['created_at', { ascending: false }])
    expect(list.limit).toEqual([5])
  })

  it('목록 조회 후 남이 먼저 종결한 잡은 재조회에서 건너뛴다 (M11)', async () => {
    installGenerationJobsStub({
      ghostIds: ['job-1'],
      rowsById: { 'job-1': ghostRow('job-1', { status: 'completed' }) },
    })

    const settled = await reconcileGhostQueuedJobs('project-1')

    expect(settled).toBe(0)
    expect(mocks.falImageFetch).not.toHaveBeenCalled()
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
  })

  it('아직 진행 중(IN_PROGRESS)인 잡은 건드리지 않는다', async () => {
    installGenerationJobsStub({
      ghostIds: ['job-1'],
      rowsById: { 'job-1': ghostRow('job-1') },
    })
    mocks.falImageFetch.mockResolvedValue({ status: 'IN_PROGRESS' })

    const settled = await reconcileGhostQueuedJobs('project-1')

    expect(settled).toBe(0)
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
  })

  it('404(영구 조회 실패)는 failed 로 종결한다 — 실제 update 체인 경유 (M5)', async () => {
    const recorded = installGenerationJobsStub({
      ghostIds: ['job-1'],
      rowsById: { 'job-1': ghostRow('job-1') },
    })
    mocks.falImageFetch.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }))

    const settled = await reconcileGhostQueuedJobs('project-1')

    expect(settled).toBe(1)
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
    expect(recorded.updates).toHaveLength(1)
    expect(recorded.updates[0].id).toBe('job-1')
    expect((recorded.updates[0].payload as { status?: string }).status).toBe('failed')
  })

  it('401/403(자격증명 문제)은 잡을 파괴하지 않고 queued 로 남긴다 (S2)', async () => {
    const recorded = installGenerationJobsStub({
      ghostIds: ['job-1'],
      rowsById: { 'job-1': ghostRow('job-1') },
    })
    mocks.falImageFetch.mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }))

    const settled = await reconcileGhostQueuedJobs('project-1')

    expect(settled).toBe(0)
    expect(recorded.updates).toHaveLength(0)
    expect(mocks.finalizeGenerationJob).not.toHaveBeenCalled()
  })

  it('같은 프로젝트 연속 호출은 스로틀돼 재조회하지 않는다', async () => {
    const recorded = installGenerationJobsStub({ ghostIds: [] })

    await reconcileGhostQueuedJobs('project-1')
    const second = await reconcileGhostQueuedJobs('project-1')

    expect(second).toBe(0)
    expect(recorded.listChains).toHaveLength(1)
  })

  it('스윕이 도는 중엔 스로틀 창이 지나도 재진입하지 않는다 (S3)', async () => {
    vi.useFakeTimers()
    try {
      const recorded = installGenerationJobsStub({
        ghostIds: ['job-1'],
        rowsById: { 'job-1': ghostRow('job-1') },
      })
      let release!: (v: { status: string; url: string; raw: object }) => void
      mocks.falImageFetch.mockReturnValue(new Promise((r) => (release = r)))
      mocks.finalizeGenerationJob.mockResolvedValue('https://s/1.png')

      // 첫 스윕이 fal 응답 대기로 60s 를 초과하는 상황: 스로틀 창은 지났지만 in-flight 가드가
      //   두 번째 탭/폴러의 동일 프로젝트 재진입(목록 재조회·중복 회수)을 막아야 한다.
      const first = reconcileGhostQueuedJobs('project-1')
      await vi.advanceTimersByTimeAsync(61_000)
      const second = await reconcileGhostQueuedJobs('project-1')

      release({ status: 'COMPLETED', url: 'https://s/1.png', raw: {} })
      const settledFirst = await first

      expect(settledFirst).toBe(1)
      expect(second).toBe(0)
      expect(recorded.listChains).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('조회 실패는 삼키고 0 을 돌려준다 (목록 조회를 막지 않는다)', async () => {
    installGenerationJobsStub({ listError: { message: 'db down' } })

    await expect(reconcileGhostQueuedJobs('project-1')).resolves.toBe(0)
  })
})
