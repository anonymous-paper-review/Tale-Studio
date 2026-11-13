// 이미 보낸 생성 작업을 화면에서 멈추면 멈춘 것으로 적고, 뒤늦게 끝난 결과는 기록에만 남는다 (디자이너 11/13 · 오너 2026-11-14 7번 · 리드 C · c · d)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), owns: vi.fn(), rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }))
vi.mock('@/lib/generation-jobs', async (original) => ({
  ...await original<typeof import('@/lib/generation-jobs')>(),
  userOwnsProject: mocks.owns,
}))

import { POST } from '@/app/api/director/jobs/cancel/route'
import { selectHandoffTake } from '@/lib/director-video-take-selection'
import { listActiveGenerationJobs } from '@/lib/generation-jobs'
import { activeShotIds } from '@/lib/generation-queue'
import { listLiveDirectorVideoTakes } from '@/lib/director-video-takes'

const post = (body: unknown) => POST(new Request('http://test/api/director/jobs/cancel', { method: 'POST', body: JSON.stringify(body) }))
const JOB = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
})

describe('진행 중 작업 멈추기', () => {
  it('진행 중인 작업을 멈추면 그 작업을 멈춘 것으로 적고, 함께 멈춘 샷을 돌려준다', async () => {
    // 왜: 오너 7번 "이미 생성이 진행 중인 것들은 UI로는 취소된걸로" — 4샷 한 장이면 넷이 함께 멈춘다(set 이 그렇게 알린다).
    mocks.rpc.mockResolvedValue({ data: [{ job_id: JOB, kind: 'storyboard_real_grid', writer_shot_ids: ['sh_01_01', 'sh_01_02'], video_clip_id: null, cancelled_at: '2026-11-14T03:00:00Z' }], error: null })
    const res = await post({ projectId: PROJECT, jobIds: [JOB] })
    expect(res.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('cancel_director_jobs', { p_project_id: PROJECT, p_job_ids: [JOB], p_user_id: 'user-1' })
    expect(await res.json()).toEqual({ ok: true, data: { cancelled: [{ jobId: JOB, kind: 'storyboard_real_grid', writerShotIds: ['sh_01_01', 'sh_01_02'], videoClipId: null, cancelledAt: '2026-11-14T03:00:00Z' }] } })
  })

  it('남의 프로젝트 작업은 멈출 수 없다', async () => {
    // 왜: 정상 경로 고정 — 다른 생성 라우트와 같은 주인 확인.
    mocks.owns.mockResolvedValue(false)
    expect((await post({ projectId: PROJECT, jobIds: [JOB] })).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('화면에서 멈춘 Take 는 ★ 로 고르지 않은 한 Editor 로 가는 Take 가 되지 않고, ★ 로 고르면 간다', () => {
    // 왜: 오너 7번 "백그라운드에서 끝나면 히스토리로" — 늦게 끝난 Take 가 Editor 로 가는 영상을 저절로 바꾸지 않는다. 사람이 고르면 그것이 먼저다.
    const takes = [
      { id: 'old', url: 'https://media.test/old.mp4', status: 'completed', take_number: 1, created_at: '2026-11-14T00:00:00Z', is_final: false },
      { id: 'late', url: 'https://media.test/late.mp4', status: 'completed', take_number: 2, created_at: '2026-11-14T01:00:00Z', is_final: false, cancelled_at: '2026-11-14T01:01:00Z' },
    ]
    expect(selectHandoffTake(takes)?.id).toBe('old')
    expect(selectHandoffTake([takes[0]!, { ...takes[1]!, is_final: true }])?.id).toBe('late')
  })

  it('지금 도는 작업 목록은 화면에서 멈춘 작업에 멈춘 때를 붙인다', async () => {
    // 왜: 멈춘 작업도 fal 에서는 끝날 때까지 돈다(리드 c) — 화면은 그 샷을 "멈췄어요"로 보이고 다시 만들기를 연다(set 갈래가 읽는 칸).
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), gte: vi.fn(() => chain),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [
        { id: JOB, kind: 'shot_video', target: { writerShotId: 'sh_01_01' }, submitted_at: null, created_at: '2026-11-14T00:00:00Z', cancellation: { cancelled_at: '2026-11-14T00:05:00Z' } },
        { id: 'job-2', kind: 'shot_storyboard', target: { writerShotId: 'sh_01_02' }, submitted_at: null, created_at: '2026-11-14T00:00:00Z', cancellation: null },
      ], error: null }).then(resolve),
    }
    mocks.from.mockReturnValue(chain)
    const jobs = await listActiveGenerationJobs(PROJECT)
    expect(jobs.map((job) => [job.id, job.cancelledAt ?? null])).toEqual([[JOB, '2026-11-14T00:05:00Z'], ['job-2', null]])
  })

  it('멈춘 작업은 샷 카드 · 상세 · 단추가 만드는 중으로 세지 않는다', () => {
    // 왜: 오너 7번 "UI로는 취소된걸로 보이게 해서 유저가 수정해서 다시 생성 요청할 수 있게" — 만드는 중으로 세면 다시 만들기 단추가 잠긴다.
    const jobs = [
      { id: 'a', kind: 'shot_storyboard' as const, target: { writerShotId: 'sh_01_01' }, cancelledAt: '2026-11-14T00:05:00Z' },
      { id: 'b', kind: 'shot_storyboard' as const, target: { writerShotId: 'sh_01_02' } },
    ]
    expect([...activeShotIds(jobs, ['shot_storyboard'])]).toEqual(['sh_01_02'])
  })

  it('영상 Take 목록은 화면에서 멈춘 Take 에 멈춘 때를 붙인다', async () => {
    // 왜: 상세 · Editor 가 그 Take 를 "멈춤"으로 보이고 저절로 고르지 않게 — 멈춤은 그 Take 의 마지막 작업에 적혀 있다.
    const clipQuery = {
      select: vi.fn(() => clipQuery), eq: vi.fn(() => clipQuery), is: vi.fn(() => clipQuery), order: vi.fn(() => clipQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [
        { id: 'clip-a', shot_id: 'sh_01_01', take_number: 1, url: null, storage_path: null, last_attempt_job_id: JOB, last_attempt_job: { id: JOB, status: 'queued', model: 'm', result_url: null, resolution: null } },
        { id: 'clip-b', shot_id: 'sh_01_01', take_number: 2, url: null, storage_path: null, last_attempt_job_id: 'job-b', last_attempt_job: { id: 'job-b', status: 'queued', model: 'm', result_url: null, resolution: null } },
      ], error: null }).then(resolve),
    }
    const cancelQuery = {
      select: vi.fn(() => cancelQuery), in: vi.fn(() => cancelQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ job_id: JOB, cancelled_at: '2026-11-14T00:05:00Z' }], error: null }).then(resolve),
    }
    mocks.from.mockImplementation((table: string) => (table === 'director_job_cancellations' ? cancelQuery : clipQuery))
    const takes = await listLiveDirectorVideoTakes(PROJECT)
    expect(takes.map((take) => [take.id, take.cancelled_at ?? null])).toEqual([['clip-a', '2026-11-14T00:05:00Z'], ['clip-b', null]])
  })
})
