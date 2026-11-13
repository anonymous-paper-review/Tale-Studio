// 영상 묶음의 마지막 영상을 카드 [멈추기]로 멈추면 그 묶음도 바로 끝나고, 보낼 샷이나 멈추지 않은 영상이 남았으면 묶음은 이어진다 (오너 7번 · 리드 11/14)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  owns: vi.fn(),
  rpc: vi.fn(),
  summary: vi.fn(),
  cancelBatch: vi.fn(),
  // 작업 → 묶음, 멈춤 기록 — 서버가 읽는 두 표.
  jobs: [] as Array<{ id: string; batch_id: string | null }>,
  stopped: [] as string[],
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', async (original) => ({
  ...await original<typeof import('@/lib/generation-jobs')>(),
  userOwnsProject: mocks.owns,
}))
vi.mock('@/lib/director/batch-store', () => ({ getVideoBatchSummary: mocks.summary, cancelVideoBatch: mocks.cancelBatch }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters[column] = value; return query },
        in: (column: string, values: unknown[]) => { filters[column] = values; return query },
        then: (resolve: (value: unknown) => unknown) => {
          if (table === 'generation_jobs') {
            return Promise.resolve({ data: mocks.jobs.filter((job) => (filters.id as string[]).includes(job.id)), error: null }).then(resolve)
          }
          if (table === 'director_job_cancellations') {
            const rows = mocks.stopped.filter((id) => (filters.job_id as string[]).includes(id)).map((id) => ({ job_id: id, cancelled_at: '2026-11-14T03:00:00Z' }))
            return Promise.resolve({ data: rows, error: null }).then(resolve)
          }
          throw new Error(`unexpected table ${table}`)
        },
      }
      return query
    },
  },
}))
// 화면 쪽(director-store) — 브라우저 저장 · 큐 조회는 막는다.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chain = { from: () => chain, update: () => chain, eq: () => chain, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
    return chain
  },
}))
vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  refreshGenerationQueue: vi.fn(),
  markJobsCancelled: vi.fn(),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: () => Promise.resolve() }))

import { POST } from '@/app/api/director/jobs/cancel/route'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { videoBatchLive } from '@/lib/director/stop-work'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

const PROJECT = '22222222-2222-4222-8222-222222222222'
const JOB = '11111111-1111-4111-8111-111111111111'
const OTHER_JOB = '44444444-4444-4444-8444-444444444444'
const BATCH = '55555555-5555-4555-8555-555555555555'
const api = () => useDirectorCanvasStore.getState()

function batch(overrides: Partial<VideoBatchSummary>): VideoBatchSummary {
  return {
    id: BATCH, projectId: PROJECT, status: 'running', total: 2, started: 1, failedToStart: 0, done: 1, failed: 0, pending: 0, active: 1,
    stopReason: null, jobs: [{ jobId: JOB, status: 'queued', resultUrl: null, error: null }], ...overrides,
  }
}
const live = () => {
  const state = api()
  return videoBatchLive({ busy: state.videoBatchBusy, cancelled: state.videoBatchCancelled, jobIds: [JOB] }, [])
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({
    data: [{ job_id: JOB, kind: 'shot_video', writer_shot_ids: ['sh_01_02'], video_clip_id: 'clip-2', cancelled_at: '2026-11-14T03:00:00Z' }],
    error: null,
  })
  mocks.cancelBatch.mockResolvedValue(batch({ status: 'cancelled' }))
  mocks.jobs = [{ id: JOB, batch_id: BATCH }]
  mocks.stopped = [JOB]
  api().reset()
  // 묶음이 돌고 있다 — 이 화면이 그 묶음을 지켜보는 중.
  useDirectorCanvasStore.setState({ projectId: PROJECT, videoBatchBusy: true, videoBatchCancelled: false, videoBatchRunId: BATCH })
  // 카드 [멈추기]의 요청은 멈추기 API 로 바로 간다.
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => POST(new Request(new URL(String(input), 'http://test'), init)))
})
afterEach(() => vi.unstubAllGlobals())

describe('같이 정한 것', () => {
  it('카드 [멈추기]로 영상 묶음에 남은 마지막 영상을 멈추면(아직 보내지 않은 샷도 없으면) 그 묶음도 바로 끝난다 — 툴바 [영상 만들기] · 상세 [새 Take 만들기] · 넘기기 창 · Lumi 가 기다리지 않고 그 샷을 다시 만들 수 있다', async () => {
    // 왜: 오너 7번 "취소된 걸로 보이게 해서 수정해서 다시 생성 요청할 수 있게" — 운영에서도 멈춘 영상이 생성처에서 끝날 때까지(몇 분)
    //   묶음이 돌아 넷 다 꺼져 있었다(영어 재점검 P2 · 리드 11/14).
    mocks.summary.mockResolvedValue(batch({}))

    await api().cancelRunningJobs([JOB])

    // [모두 멈추기]가 쓰는 묶음 닫기와 같은 길.
    expect(mocks.cancelBatch).toHaveBeenCalledWith(BATCH, PROJECT, 'user-1')
    // 상세 [새 Take 만들기] · 넘기기 창 · Lumi 는 묶음이 도는지(videoBatchBusy), 툴바 [영상 만들기]는 멈추지 않은 묶음이 사는지(videoBatchLive)를 본다.
    expect(api().videoBatchBusy).toBe(false)
    expect(live()).toBe(false)
  })

  it('묶음에 아직 보내지 않은 샷이 남아 있으면 카드 [멈추기]는 그 샷만 멈추고 묶음은 이어진다(지금 그대로)', async () => {
    // 왜: 정상 경로 고정 — 남은 샷은 서버가 자리가 나면 이어서 낸다. 묶음을 닫으면 그 샷들이 나가지 않는다.
    mocks.summary.mockResolvedValue(batch({ pending: 1, pendingShotIds: ['sh_01_03'] }))

    const stopped = await api().cancelRunningJobs([JOB])

    expect(stopped).toEqual([JOB])
    expect(mocks.cancelBatch).not.toHaveBeenCalled()
    expect(api().videoBatchBusy).toBe(true)
    expect(live()).toBe(true)
  })
})

describe('혼자 정한 것', () => {
  it('묶음에 멈추지 않고 도는 영상이 남아 있으면 카드 [멈추기]는 그 샷만 멈추고 묶음은 이어진다', async () => {
    // 왜: "남은 마지막 영상"일 때만 묶음이 끝난다 — 다른 샷 영상이 아직 만들어지는 중이면 묶음은 그 영상을 끝까지 거둔다.
    mocks.summary.mockResolvedValue(batch({ active: 2, jobs: [
      { jobId: JOB, status: 'queued', resultUrl: null, error: null },
      { jobId: OTHER_JOB, status: 'queued', resultUrl: null, error: null },
    ] }))

    await api().cancelRunningJobs([JOB])

    expect(mocks.cancelBatch).not.toHaveBeenCalled()
    expect(api().videoBatchBusy).toBe(true)
  })

  it('묶음을 닫지 못해도(저장소 오류) 카드 [멈추기]는 그대로 멈추고, 묶음은 지금처럼 그 영상이 끝나면 닫힌다', async () => {
    // 왜: 멈추기가 먼저다 — 묶음 닫기는 덤이라 그 실패로 멈춤까지 실패로 보이면 안 된다.
    mocks.summary.mockRejectedValue(new Error('read failed'))

    const stopped = await api().cancelRunningJobs([JOB])

    expect(stopped).toEqual([JOB])
    expect(mocks.cancelBatch).not.toHaveBeenCalled()
    expect(api().videoBatchBusy).toBe(true)
  })
})
