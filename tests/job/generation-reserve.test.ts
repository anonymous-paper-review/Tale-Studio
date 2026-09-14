// 생성 자리는 외부 제출 전에 예약하고, 거절되면 제출하지 않으며, 응답을 잃어도 다시 내지 않는다
//
// 감사(2026-09-11): 서버가 "세고 나서 넣는" 두 단계 사이에 다른 요청이 끼어들어 상한 67 이 79 까지
//   넘어갔다. 세기와 넣기를 DB 한 걸음(트리거)으로 합치고, 서버는 그 거절을 읽어 사용자 안내로 바꾼다.
//   자동 재시도는 없다 — 거절이 곧 사용자에게 보이는 문장이므로 어느 축에서 막혔는지 함께 남긴다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  upsertKeyLimits: vi.fn(),
  deleteKeyLimits: vi.fn(),
  deleteKeyLimitsNot: vi.fn(),
  pickFalKey: vi.fn(),
  falImageSubmit: vi.fn(),
  recordObservability: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
// 키 레지스트리는 실제 모듈을 쓴다(FAL_KEYS 파싱까지 같이 잠근다). 배분만 목으로 고정한다.
vi.mock('@/lib/fal/keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fal/keys')>()),
  pickFalKey: mocks.pickFalKey,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.falImageSubmit }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.recordObservability }))

import { falImageSubmit } from '@/lib/writer/llm/fal'
import {
  GenerationCapacityError,
  confirmGenerationJobReceipt,
  rejectGenerationJobReservation,
  reserveGenerationJob,
} from '@/lib/generation-jobs'
import { capacityReservationRejection } from '@/lib/api/quota'

const FAL_KEYS = JSON.stringify([
  { id: 'key-1', key: 'secret-1', maxInflight: 8 },
  { id: 'key-2', key: 'secret-2', maxInflight: 12 },
])

/** supabase-js 체인 흉내 — eq/select 는 자기를 돌려주고, await 하면 결과가 나온다. */
function chain(result: unknown) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'is', 'limit']) q[name] = vi.fn(() => q)
  q.single = vi.fn(async () => result)
  q.maybeSingle = q.single
  ;(q as { then: unknown }).then = (resolve: (value: unknown) => unknown) => resolve(result)
  return q
}

function reserveInput() {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    model: 'pending',
    kind: 'character_view' as const,
    target: {
      workspaceId: 'workspace-1',
      characterId: 'char-1',
      appearanceKey: 'default',
      view: 'main',
    },
  }
}

/** 실제 호출 순서(예약 → 제출 → 접수 번호 기록)를 그대로 흉내 낸 최소 흐름. */
async function reserveThenSubmit() {
  const job = await reserveGenerationJob(reserveInput())
  await falImageSubmit({ prompt: 'a portrait' }, { retry: false, falKeyId: job.fal_key_id })
  return job
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('FAL_KEYS', FAL_KEYS)
  mocks.from.mockImplementation((table: string) => {
    if (table === 'fal_key_limits') return { upsert: mocks.upsertKeyLimits, delete: mocks.deleteKeyLimits }
    if (table === 'generation_jobs') return { insert: mocks.insert, update: mocks.update }
    throw new Error(`unexpected table: ${table}`)
  })
  mocks.insert.mockImplementation((payload: Record<string, unknown>) =>
    chain({ data: { ...payload }, error: null }),
  )
  mocks.update.mockReturnValue(chain({ data: [{ id: 'job-1' }], error: null }))
  mocks.upsertKeyLimits.mockResolvedValue({ data: null, error: null })
  mocks.deleteKeyLimitsNot.mockResolvedValue({ data: null, error: null })
  mocks.deleteKeyLimits.mockReturnValue({ not: mocks.deleteKeyLimitsNot })
  mocks.pickFalKey.mockResolvedValue({ id: 'key-1', maxInflight: 8 })
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'openai/gpt-image-2', fal_key_id: 'key-1' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('생성 자리 예약', () => {
  it('자리 예약이 거절되면 외부 생성 서비스에 제출하지 않는다', async () => {
    // 왜: 자리 판정은 DB 가 원자적으로 한다 — 거절을 무시하고 제출하면 상한이 다시 뚫린다.
    mocks.insert.mockReturnValue(
      chain({ data: null, error: { message: 'image_user_at_capacity', details: '6' } }),
    )

    await expect(reserveThenSubmit()).rejects.toMatchObject({
      axis: 'user_image',
      queued: 6,
      limit: 6,
    })
    await expect(reserveThenSubmit()).rejects.toBeInstanceOf(GenerationCapacityError)
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  it('예약은 접수 번호 없이 자리만 잡고 제출 뒤에 접수 번호를 채운다', async () => {
    // 왜: 접수 번호를 받기 전에 행이 있어야 응답을 잃어도 그 자리를 다시 쓰지 않는다.
    const job = await reserveThenSubmit()

    const payload = mocks.insert.mock.calls[0][0] as Record<string, unknown>
    expect(payload.request_id).toBe(`reserved:${payload.id}`)
    expect(payload.fal_key_id).toBe('key-1')
    expect(payload.submitted_at).toBeNull()
    expect(payload.status).toBe('queued')

    await confirmGenerationJobReceipt(job.id, 'project-1', {
      request_id: 'fal-1',
      model: 'openai/gpt-image-2',
      fal_key_id: 'key-2',
    })

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'fal-1',
        model: 'openai/gpt-image-2',
        fal_key_id: 'key-2',
        submitted_at: expect.any(String),
      }),
    )
    const updateChain = mocks.update.mock.results[0].value as { eq: { mock: { calls: unknown[][] } } }
    expect(updateChain.eq.mock.calls).toContainEqual(['request_id', `reserved:${job.id}`])
  })

  it('접수 번호를 채우려는데 예약이 이미 바뀌었으면 오류로 알린다', async () => {
    // 왜: 조용히 지나가면 같은 자리에 두 접수가 겹쳐 결과가 서로를 덮어쓴다.
    mocks.update.mockReturnValue(chain({ data: [], error: null }))

    await expect(
      confirmGenerationJobReceipt('job-1', 'project-1', {
        request_id: 'fal-1',
        model: 'openai/gpt-image-2',
        fal_key_id: 'key-1',
      }),
    ).rejects.toThrow()
  })

  it('확정 거절된 예약은 실패로 닫는다', async () => {
    // 왜: 접수가 확실히 거절된 자리를 queued 로 두면 상한만 먹고 영원히 끝나지 않는다.
    await rejectGenerationJobReservation('job-1', 'project-1', 'fal submit: 400 bad request')

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('400'),
        last_error: expect.stringContaining('400'),
        completed_at: expect.any(String),
      }),
    )
  })

  it('거절 안내는 어느 축(내 영상·내 이미지·계정·전체)에서 막혔는지 기록한다', async () => {
    // 왜: 자동 재시도가 없어 거절이 그대로 사용자 문장이 된다 — 기다릴 대상이 내 작업인지 서버인지 갈린다.
    const expectations = [
      { message: 'video_user_at_capacity', details: '3', kind: 'shot_previz_video', axis: 'user_video', scope: 'user', queued: 3, limit: 3 },
      { message: 'image_user_at_capacity', details: '6', kind: 'character_view', axis: 'user_image', scope: 'user', queued: 6, limit: 6 },
      { message: 'key_at_capacity', details: '8/8', kind: 'character_view', axis: 'key', scope: 'global', queued: 8, limit: 8 },
      { message: 'global_at_capacity', details: '20/20', kind: 'character_view', axis: 'global', scope: 'global', queued: 20, limit: 20 },
    ]

    for (const expectation of expectations) {
      mocks.recordObservability.mockClear()
      const response = capacityReservationRejection(
        { message: expectation.message, details: expectation.details },
        { projectId: 'project-1', kind: expectation.kind, userId: 'user-1' },
      )

      expect(response?.status).toBe(429)
      expect(await response?.json()).toMatchObject({
        code: 'quota_exceeded',
        axis: expectation.axis,
        scope: expectation.scope,
        queued: expectation.queued,
        limit: expectation.limit,
      })
      expect(mocks.recordObservability).toHaveBeenCalledWith(
        'project-1',
        'generation_submit_rejected_quota',
        expect.objectContaining({ axis: expectation.axis, scope: expectation.scope }),
      )
    }
  })

  it('계정별 최대 칸 수를 DB 에 같은 값으로 적어 둔다', async () => {
    // 왜: 트리거는 환경변수를 읽을 수 없다 — 계정별 상한이 DB 에 없으면 계정 축이 통째로 비활성이다.
    vi.resetModules() // 프로세스당 1회 캐시를 비워 실제 동기화를 관찰한다
    const { syncFalKeyLimits } = await import('@/lib/generation-quota')

    await syncFalKeyLimits()

    expect(mocks.from).toHaveBeenCalledWith('fal_key_limits')
    expect(mocks.upsertKeyLimits).toHaveBeenCalledWith([
      expect.objectContaining({ key_id: 'key-1', max_inflight: 8 }),
      expect.objectContaining({ key_id: 'key-2', max_inflight: 12 }),
    ])
  })

  it('레지스트리에서 뻐 계정은 DB 표에서도 지운다', async () => {
    // 왜: 남은 행이 전체 축 합계(sum(max_inflight))를 부풀려 실제보다 많은 자리를 허용한다 — 키를 븼 날 바로 생기는 구멍이다.
    vi.resetModules()
    const { syncFalKeyLimits } = await import('@/lib/generation-quota')

    await syncFalKeyLimits()

    expect(mocks.deleteKeyLimits).toHaveBeenCalledTimes(1)
    expect(mocks.deleteKeyLimitsNot).toHaveBeenCalledWith('key_id', 'in', '("key-1","key-2")')
  })
})
