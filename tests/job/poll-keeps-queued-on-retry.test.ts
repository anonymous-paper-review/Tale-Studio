// 저장이 잠깐 실패해 다시 시도하는 중이면 화면은 실패로 보지 않는다
//
// finalize 가 일시적 저장 실패를 만나면 DirectorVideoCompletionPersistenceError 를 던진다 —
// "지금은 안 되니 queued 로 두고 나중에 다시 하자" 는 신호다(reconcile.ts:74-78 주석: retaining
// queued attempt). 그런데 이 라우트가 그 예외를 안 받아 그대로 HTTP 를 건너갔고, 프레임워크가
// 500 을 만들었다. 화면(generation-jobs-client.ts:78-86)은 res.ok 가 아니면 status:'failed' 로
// 굳히고 폴링을 끝낸다 — 서버의 의도("기다려")와 화면 결과("실패")가 정확히 반대가 됐다.
// 나중에 webhook 이 정상 처리해도 그 화면은 갱신되지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getGenerationJobById: vi.fn(),
  userOwnsProject: vi.fn(),
  reconcileJobFromFal: vi.fn(),
  deleteGenerationJobById: vi.fn(),
  releaseTakesForJob: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({
  getGenerationJobById: mocks.getGenerationJobById,
  userOwnsProject: mocks.userOwnsProject,
  deleteGenerationJobById: mocks.deleteGenerationJobById,
}))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcileJobFromFal }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: mocks.releaseTakesForJob }))

import { GET } from '@/app/api/generation-jobs/[id]/route'
import { DirectorVideoCompletionPersistenceError } from '@/lib/fal/finalize'

const params = Promise.resolve({ id: 'job-1' })

function queuedJob() {
  return {
    id: 'job-1',
    project_id: 'project-1',
    status: 'queued',
    kind: 'shot_video',
    result_url: null,
    error: null,
    video_clip_id: 'clip-1',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.getGenerationJobById.mockResolvedValue(queuedJob())
})

describe('작업 상태 조회', () => {
  it('다시 시도할 수 있는 저장 실패면 아직 만드는 중이라고 답한다', async () => {
    mocks.reconcileJobFromFal.mockRejectedValue(
      new DirectorVideoCompletionPersistenceError('storage_retryable', new Error('storage 503')),
    )

    const response = await GET(new Request('http://localhost'), { params })
    const body = (await response.json()) as { ok: boolean; data?: { status: string } }

    // 500 이면 화면이 실패로 굳히고 폴링을 끝낸다 — 서버는 계속할 생각인데.
    expect(response.status).toBe(200)
    expect(body.data?.status).toBe('queued')
  })

  it('정상 완료는 결과를 그대로 돌려준다', async () => {
    mocks.reconcileJobFromFal.mockResolvedValue({
      ...queuedJob(),
      status: 'completed',
      result_url: 'https://cdn/video.mp4',
    })

    const response = await GET(new Request('http://localhost'), { params })
    const body = (await response.json()) as { data?: { status: string; resultUrl: string } }

    expect(response.status).toBe(200)
    expect(body.data?.status).toBe('completed')
    expect(body.data?.resultUrl).toBe('https://cdn/video.mp4')
  })

  it('알 수 없는 오류도 화면을 실패로 굳히지 않는다', async () => {
    // 조회 한 번이 실패했다고 진행 중인 생성을 죽일 이유가 없다. 다음 폴링이 다시 묻는다.
    mocks.reconcileJobFromFal.mockRejectedValue(new Error('unexpected'))

    const response = await GET(new Request('http://localhost'), { params })
    const body = (await response.json()) as { data?: { status: string } }

    expect(response.status).toBe(200)
    expect(body.data?.status).toBe('queued')
  })

  it('이미 끝난 작업은 조회만 하고 다시 확인하지 않는다', async () => {
    mocks.getGenerationJobById.mockResolvedValue({
      ...queuedJob(),
      status: 'completed',
      result_url: 'https://cdn/done.mp4',
    })

    const response = await GET(new Request('http://localhost'), { params })

    expect(response.status).toBe(200)
    expect(mocks.reconcileJobFromFal).not.toHaveBeenCalled()
  })
})
