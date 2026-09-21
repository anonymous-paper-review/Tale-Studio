// 일괄 이어가기는 저장한 입력 그대로, 임대받은 실행만, 끊김 없이 실제 제출로 이어진다
//
// #batch-resume(2026-09-09) 슬라이스 D 앞의 빨강 테스트. 지금 continueVideoBatch 는
//   "무엇을 낼지" 판정만 하고 `console.info` 로만 남긴 뒤 submitted:0 을 돌려준다 — 실제
//   제출은 아직 배선되지 않았다. 후속 구현은 batch-store.ts(신규)에 DB 읽기·요약·취소·생성을
//   맡기고, 여기 batch-continue.ts 에는 (①임대 → ②저장된 pending 항목을 position 순으로
//   읽기 → ③공유 submitPreparedDirectorVideo 로 예약/제출) 을 맡길 예정이다.
//
//   이 파일은 그 계약을 미리 굳혀두는 실패 테스트다:
//     · 처음 저장한 prepared 입력을 그대로 제출한다(제출 시점에 살아있는 shot 값이 달라져도)
//     · 같은 일괄을 겹쳐 깨워도(webhook·cron 동시 진입) 임대(lease)를 받은 실행만 제출한다
//     · 중단(cancelled)된 일괄은 pending 항목이 남아 있어도 내지 않는다
//     · 한 샷의 실패가 다음 샷 제출을 막지 않는다(실패 뒤 두 번째 항목의 결과로 확인)
//
//   video-submit.ts 는 아직 없는 모듈이라 vi.mock 으로만 모양을 준비한다(다른 executor 작업).
//   DB(director_video_batches / director_video_batch_items, claim_director_video_batch /
//   reserve_director_video_batch_item RPC)는 supabaseAdmin.from/rpc 최소 mock 으로만 흉내낸다 —
//   실제 SQL 문자열이나 정확한 체이닝 인자는 검사하지 않는다(그건 batch-store.ts 구현 몫).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreparedVideoSubmitOptions } from '@/lib/director/video-submit'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  takeBalance: vi.fn(),
  submitPrepared: vi.fn(),
  updates: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/billing/take-ledger', () => ({ takeBalance: mocks.takeBalance }))
// 아직 없는 모듈 — 다른 executor 작업(video-submit.ts)의 산출물. 모양만 미리 고정한다.
vi.mock('@/lib/director/video-submit', () => ({ submitPreparedDirectorVideo: mocks.submitPrepared }))

import { continueVideoBatch } from '@/lib/director/batch-continue'

/** 체이닝 가능한 최소 빌더 — select/eq/order/maybeSingle 만 있으면 된다(값 검사는 하지 않는다). */
function builder(data: unknown) {
  const result = { data, error: null }
  const self: Record<string, unknown> = {
    select: vi.fn(() => self),
    eq: vi.fn(() => self),
    in: vi.fn(() => self),
    gt: vi.fn(() => self),
    update: vi.fn((patch: unknown) => { mocks.updates(patch); return self }),
    order: vi.fn(() => self),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  return self
}

function setupFrom(overrides: Record<string, unknown> = {}) {
  const tables: Record<string, unknown> = {
    generation_jobs: [],
    shots: [],
    video_clips: [],
    projects: { workspace_id: 'ws-1' },
    director_video_batches: batchRow(),
    director_video_batch_items: [],
    ...overrides,
  }
  mocks.from.mockImplementation((table: string) => builder(tables[table] ?? []))
}

/** #batch-resume DB 계약: director_video_batches 행 — claim RPC 가 돌려주는 모양. */
function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    project_id: 'project-1',
    user_id: 'user-1',
    workspace_id: 'ws-1',
    status: 'running',
    stop_reason: null,
    lease_token: 'lease-token-1',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  }
}

/** #batch-resume DB 계약: 시작 시점에 고정 저장된 prepared 입력. */
function preparedFor(shotId: string, itemId: string) {
  return {
    ownerId: 'user-1',
    projectId: 'project-1',
    workspaceId: 'ws-1',
    writerShotId: shotId,
    modelKey: 'model-a',
    idempotencyKey: itemId,
    inputSnapshot: { full_prompt: `처음 확정한 프롬프트 - ${shotId}` },
  }
}

/** #batch-resume DB 계약: director_video_batch_items 행. */
function pendingItem(id: string, position: number, shotId: string) {
  return {
    id,
    batch_id: 'batch-1',
    shot_id: shotId,
    position,
    prepared: preparedFor(shotId, id),
    job_id: null,
    status: 'pending' as const,
    error: null,
    submission_response: null,
  }
}

function okResponse(body: Record<string, unknown> = { status: 'generating' }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function reservedRpcRow(overrides: Record<string, unknown> = {}) {
  return { video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.takeBalance.mockResolvedValue(1_000_000)
})

describe('일괄 이어가기의 실제 제출 배선(#batch-resume 빨강 확인)', () => {
  it('저장한 항목의 처음 입력으로 영상을 실제 제출한다', async () => {
    const item = pendingItem('item-1', 0, 'sh_01')
    setupFrom({
      director_video_batch_items: [item],
      // 제출 시점에 살아있는 샷 값은 저장 당시와 다르게 바뀌어 있다 — prepared 는
      //   이 최신 값을 다시 읽지 않고 저장된 그대로 넘어가야 한다(오너 결정: 처음 입력 고정).
      shots: [{ shot_id: 'sh_01', sort_order: 1, prompt: '지금은 다른 프롬프트로 바뀜' }],
    })
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'claim_director_video_batch') return Promise.resolve({ data: [batchRow()], error: null })
      if (name === 'reserve_director_video_batch_item') return Promise.resolve({ data: [reservedRpcRow()], error: null })
      return Promise.resolve({ data: [], error: null })
    })
    mocks.submitPrepared.mockResolvedValue(okResponse())

    await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })

    expect(mocks.submitPrepared).toHaveBeenCalledTimes(1)
    const [passedPrepared] = mocks.submitPrepared.mock.calls[0] as [unknown]
    expect(passedPrepared).toEqual(item.prepared)
  })

  it('같은 일괄을 겹쳐 깨워도 임대받은 실행만 제출한다', async () => {
    // webhook 완료 알림과 cron 주기 점검이 겹쳐 들어온 상황을 흉내낸다.
    const item = pendingItem('item-1', 0, 'sh_01')
    setupFrom({ director_video_batch_items: [item] })
    let claimAttempts = 0
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'claim_director_video_batch') {
        claimAttempts += 1
        // 두 번째 진입은 이미 살아있는 lease 에 막혀 0 행을 받는다.
        return Promise.resolve({ data: claimAttempts === 1 ? [batchRow()] : [], error: null })
      }
      if (name === 'reserve_director_video_batch_item') return Promise.resolve({ data: [reservedRpcRow()], error: null })
      return Promise.resolve({ data: [], error: null })
    })
    mocks.submitPrepared.mockResolvedValue(okResponse())

    await Promise.all([
      continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' }),
      continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' }),
    ])

    expect(claimAttempts).toBe(2)
    expect(mocks.submitPrepared).toHaveBeenCalledTimes(1)
  })

  it('중단된 일괄에서는 남은 것을 내지 않는다', async () => {
    const item = pendingItem('item-1', 0, 'sh_01')
    setupFrom({ director_video_batch_items: [item] })
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'claim_director_video_batch') {
        return Promise.resolve({
          data: [batchRow({ status: 'cancelled', stop_reason: 'user_cancelled' })],
          error: null,
        })
      }
      return Promise.resolve({ data: [], error: null })
    })

    const result = await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })

    expect(mocks.submitPrepared).not.toHaveBeenCalled()
    expect(result.stopReason).toBe('cancelled')
  })

  it('한 샷의 실패가 다음 샷을 막지 않는다', async () => {
    const itemA = pendingItem('item-1', 0, 'sh_01')
    const itemB = pendingItem('item-2', 1, 'sh_02')
    setupFrom({ director_video_batch_items: [itemA, itemB] })
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'claim_director_video_batch') return Promise.resolve({ data: [batchRow()], error: null })
      if (name === 'reserve_director_video_batch_item') return Promise.resolve({ data: [reservedRpcRow()], error: null })
      return Promise.resolve({ data: [], error: null })
    })
    mocks.submitPrepared
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'gateway timeout' }), { status: 500 }))
      .mockResolvedValueOnce(okResponse())

    await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })

    expect(mocks.submitPrepared).toHaveBeenCalledTimes(2)
    const secondCallPrepared = mocks.submitPrepared.mock.calls[1]![0] as { idempotencyKey: string }
    expect(secondCallPrepared.idempotencyKey).toBe('item-2')
  })

  it('중단을 확인한 뒤에는 남은 샷을 추가로 제출하지 않는다', async () => {
    const current = batchRow()
    setupFrom({ director_video_batches: current, director_video_batch_items: [
      pendingItem('item-1', 0, 'sh_01'), pendingItem('item-2', 1, 'sh_02'),
    ] })
    mocks.rpc.mockResolvedValue({ data: [current], error: null })
    mocks.submitPrepared.mockImplementation(async () => {
      current.status = 'cancelled'
      return okResponse({ jobId: 'job-1', status: 'generating' })
    })
    const result = await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(mocks.submitPrepared).toHaveBeenCalledTimes(1)
    expect(result.stopReason).toBe('cancelled')
  })

  it('잔액이 모자라면 멈추되 이미 예약한 작업의 기록을 잃지 않는다', async () => {
    setupFrom({ director_video_batch_items: [pendingItem('item-1', 0, 'sh_01')] })
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({
      data: [name === 'claim_director_video_batch' ? batchRow() : reservedRpcRow()], error: null,
    }))
    mocks.submitPrepared.mockImplementation(async (_prepared: unknown, options: Required<Pick<PreparedVideoSubmitOptions, 'reserve'>>) => {
      await options.reserve({
        projectId: 'project-1', shotId: 'sh_01', model: 'seedance',
        idempotencyKey: 'item-1', target: {},
      })
      return new Response(JSON.stringify({ error: 'insufficient_takes' }), { status: 402 })
    })
    const result = await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(result.stopReason).toBe('insufficient_takes')
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({ status: 'submitted', job_id: 'job-1' }))
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }))
  })

  it.each(['expired', 'reclaimed', 'cancelled'])(
    '잔액 부족 응답이 늦어져도 멈춘 이유를 남기고 사용자의 중단은 덮지 않는다 (%s)',
    async (condition) => {
      const current = batchRow()
      setupFrom({ director_video_batch_items: [pendingItem('item-1', 0, 'sh_01')] })
      const originalFrom = mocks.from.getMockImplementation()!
      mocks.from.mockImplementation((table: string) => {
        if (table !== 'director_video_batches') return originalFrom(table)
        const matches: Array<() => boolean> = []
        let patch: Record<string, unknown> | undefined
        const result = () => {
          const found = matches.every((match) => match())
          if (found && patch) Object.assign(current, patch)
          return { data: found ? current : null, error: null }
        }
        const q = {
          select: () => q,
          update: (value: Record<string, unknown>) => { patch = value; return q },
          eq: (key: string, value: unknown) => {
            matches.push(() => (current as Record<string, unknown>)[key] === value)
            return q
          },
          gt: (key: string, value: string) => {
            matches.push(() => String((current as Record<string, unknown>)[key]) > value)
            return q
          },
          maybeSingle: () => Promise.resolve(result()),
          then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
        }
        return q
      })
      mocks.rpc.mockResolvedValue({ data: [{ ...current }], error: null })
      mocks.submitPrepared.mockImplementation(async () => {
        if (condition === 'expired') current.lease_expires_at = new Date(0).toISOString()
        if (condition === 'reclaimed') current.lease_token = 'new-worker'
        if (condition === 'cancelled') Object.assign(current, { status: 'cancelled', stop_reason: 'user_cancelled' })
        return Response.json({ error: 'insufficient_takes' }, { status: 402 })
      })
      await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
      expect(mocks.submitPrepared).toHaveBeenCalledTimes(1)
      expect(current).toMatchObject(condition === 'cancelled'
        ? { status: 'cancelled', stop_reason: 'user_cancelled' }
        : { status: 'paused', stop_reason: 'insufficient_takes', lease_token: null })
    },
  )

  it('사용자 전체 동시 한도가 차면 실패로 세지 않고 다음 기회를 기다린다', async () => {
    setupFrom({ director_video_batch_items: [
      pendingItem('item-1', 0, 'sh_01'), pendingItem('item-2', 1, 'sh_02'),
    ] })
    mocks.rpc.mockResolvedValue({ data: [batchRow()], error: null })
    mocks.submitPrepared.mockResolvedValue(new Response(JSON.stringify({ error: 'batch_user_at_capacity' }), { status: 500 }))
    const result = await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(result.stopReason).toBe('at_capacity')
    expect(mocks.submitPrepared).toHaveBeenCalledTimes(1)
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', error: 'batch_user_at_capacity' }))
  })

  it('접수 결과가 불명확한 작업은 실패로 단정하거나 다른 키로 다시 내지 않는다', async () => {
    setupFrom({ director_video_batch_items: [pendingItem('item-1', 0, 'sh_01')] })
    mocks.rpc.mockResolvedValue({ data: [batchRow()], error: null })
    const unresolved = { error: 'submission outcome unknown', jobId: 'job-1', status: 'queued', unresolved: true }
    mocks.submitPrepared.mockResolvedValue(new Response(JSON.stringify(unresolved), { status: 503 }))
    await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(mocks.submitPrepared).toHaveBeenCalledTimes(1)
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({
      status: 'submitted', job_id: 'job-1', submission_response: unresolved,
    }))
    expect(mocks.updates).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('개별 생성과 경쟁해 공통 예약 한도에 막혀도 일괄 항목은 다음 기회를 기다린다', async () => {
    setupFrom({ director_video_batch_items: [
      pendingItem('item-1', 0, 'sh_01'), pendingItem('item-2', 1, 'sh_02'),
    ] })
    mocks.rpc.mockResolvedValue({ data: [batchRow()], error: null })
    mocks.submitPrepared.mockImplementation(async () => Response.json({ error: 'video_user_at_capacity' }, { status: 500 }))
    const result = await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(result.stopReason).toBe('at_capacity')
    expect(mocks.submitPrepared).toHaveBeenCalledTimes(1)
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', error: 'video_user_at_capacity' }))
  })
})

// 2026-09-11 오너 결정 (가): 내 영상 한도(개인 축)에 막힌 건 내 영상이 끝나면 이어가고,
//   모두의 자리(전역 축)가 차서 막힌 건 멈추고 안내한다 — 자동 재시도 없음.
describe('모두의 자리가 찼을 때의 일괄', () => {
  const globalQuota = () => Response.json(
    { error: 'quota exceeded', code: 'quota_exceeded', scope: 'global', category: 'video', queued: 68, limit: 68 },
    { status: 429 },
  )
  const userQuota = () => Response.json(
    { error: 'quota exceeded', code: 'quota_exceeded', scope: 'user', category: 'video', queued: 3, limit: 3 },
    { status: 429 },
  )

  // 왜: 다른 사용자들이 68칸을 다 채운 상황 — 서버가 빈자리를 노리며 계속 두드리지 않는다.
  it('모두의 자리가 차서 거절되면 남은 샷을 보관한 채 묶음을 멈추고 더 내지 않는다', async () => {
    setupFrom({ director_video_batch_items: [
      pendingItem('item-1', 0, 'sh_01'), pendingItem('item-2', 1, 'sh_02'),
    ] })
    mocks.rpc.mockResolvedValue({ data: [batchRow()], error: null })
    mocks.submitPrepared.mockImplementation(async () => globalQuota())
    const result = await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(result.stopReason).toBe('global_at_capacity')
    expect(mocks.submitPrepared).toHaveBeenCalledTimes(1)
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }))
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({
      status: 'paused', stop_reason: 'global_at_capacity', lease_token: null,
    }))
  })

  // 왜: 정상 경로 고정 — 내 영상 3개가 도는 중이라 거절된 건 남이 못 끼어드는 내 자리다(2026-09-09 결정 ① 유지).
  it('내 영상 한도 때문에 거절되면 묶음을 멈추지 않고 내 영상이 끝나면 이어서 낸다', async () => {
    setupFrom({ director_video_batch_items: [
      pendingItem('item-1', 0, 'sh_01'), pendingItem('item-2', 1, 'sh_02'),
    ] })
    mocks.rpc.mockResolvedValue({ data: [batchRow()], error: null })
    mocks.submitPrepared.mockImplementation(async () => userQuota())
    const result = await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(result.stopReason).toBe('at_capacity')
    expect(mocks.updates).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }))
    expect(mocks.updates).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }))
  })

  // 왜: 완료 알림·2분 정기 확인이 멈춘 묶음을 다시 내면 그게 자동 재시도다.
  it('모두의 자리가 차서 멈춘 묶음은 완료 알림이 다시 깨우지 않는다', async () => {
    setupFrom({
      director_video_batches: batchRow({ status: 'paused', stop_reason: 'global_at_capacity', lease_token: null, lease_expires_at: null }),
      director_video_batch_items: [pendingItem('item-1', 0, 'sh_01')],
    })
    // 임대 RPC는 running 묶음만 돌려준다 — 멈춘 묶음은 빈 결과.
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    const result = await continueVideoBatch({ batchId: 'batch-1', projectId: 'project-1' })
    expect(mocks.submitPrepared).not.toHaveBeenCalled()
    expect(result.stopReason).toBe('global_at_capacity')
  })
})
