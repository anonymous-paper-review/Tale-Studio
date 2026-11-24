// 화면이 상태를 물을 때 서버는 완료 알림 주소가 있으면 생성 서비스에 바로 다시 묻지 않고 잠시 기다린다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getGenerationJobById: vi.fn(),
  userOwnsProject: vi.fn(),
  reconcileJobFromFal: vi.fn(),
  deleteGenerationJobById: vi.fn(),
  releaseTakesForJob: vi.fn(),
  resolveWebhookUrl: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({
  getGenerationJobById: mocks.getGenerationJobById,
  userOwnsProject: mocks.userOwnsProject,
  deleteGenerationJobById: mocks.deleteGenerationJobById,
}))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: mocks.reconcileJobFromFal }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: mocks.resolveWebhookUrl }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: mocks.releaseTakesForJob }))

import { GET } from '@/app/api/generation-jobs/[id]/route'
import { _resetPollReconcileGateForTests } from '@/lib/fal/poll-reconcile-gate'

const NOW = Date.parse('2026-11-24T12:00:00.000Z')
const params = Promise.resolve({ id: 'job-1' })

function queuedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    project_id: 'project-1',
    status: 'queued',
    kind: 'shot_image',
    request_id: 'req-1',
    result_url: null,
    error: null,
    video_clip_id: null,
    created_at: new Date(NOW - 120_000).toISOString(),
    submitted_at: new Date(NOW - 120_000).toISOString(),
    ...overrides,
  }
}

function ask() {
  return GET(new Request('http://localhost'), { params })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  _resetPollReconcileGateForTests()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.getGenerationJobById.mockResolvedValue(queuedJob())
  mocks.reconcileJobFromFal.mockImplementation(async (job) => job)
  mocks.resolveWebhookUrl.mockReturnValue('https://app.test/api/fal/webhook')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('폴링 라우트의 생성 서비스 확인', () => {
  it('완료 알림 주소가 없으면 물을 때마다 생성 서비스에 확인한다', async () => {
    mocks.resolveWebhookUrl.mockReturnValue(undefined)
    mocks.getGenerationJobById.mockResolvedValue(queuedJob({ submitted_at: new Date(NOW - 1_000).toISOString() }))

    await ask()
    await ask()

    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(2)
  })

  it('완료 알림 주소가 있으면 제출 뒤 45초 안에는 생성 서비스에 묻지 않는다', async () => {
    mocks.getGenerationJobById.mockResolvedValue(queuedJob({ submitted_at: new Date(NOW - 44_000).toISOString() }))

    const response = await ask()
    const body = (await response.json()) as { data?: { status: string } }

    expect(mocks.reconcileJobFromFal).not.toHaveBeenCalled()
    expect(body.data?.status).toBe('queued')
  })

  it('45초가 지난 잡은 30초에 한 번만 생성 서비스에 묻는다', async () => {
    await ask()
    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(1)

    vi.setSystemTime(NOW + 29_000)
    await ask()
    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(1)

    vi.setSystemTime(NOW + 31_000)
    await ask()
    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(2)
  })

  it('접수 번호가 아직 없는 예약은 생성 서비스에 묻지 않는다', async () => {
    mocks.resolveWebhookUrl.mockReturnValue(undefined)
    mocks.getGenerationJobById.mockResolvedValue(queuedJob({ request_id: 'reserved:job-1', submitted_at: null }))

    await ask()

    expect(mocks.reconcileJobFromFal).not.toHaveBeenCalled()
  })

  it('잡이 끝나면 그 잡의 질문 기록을 지운다', async () => {
    await ask()
    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(1)

    mocks.reconcileJobFromFal.mockResolvedValueOnce(queuedJob({ status: 'completed', result_url: 'https://cdn/a.png' }))
    vi.setSystemTime(NOW + 31_000)
    await ask()
    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(2)

    // 기록이 지워졌으면 30초 안이어도(같은 id 로 다시 queued 가 되면) 곧바로 다시 물을 수 있다.
    vi.setSystemTime(NOW + 32_000)
    await ask()
    expect(mocks.reconcileJobFromFal).toHaveBeenCalledTimes(3)
  })
})
