// [먼저 하기] 요청(PATCH /api/director/video-batches)은 로그인한 주인의 내 묶음에서만 순서를 바꾸고, 바꾼 뒤의 낼 순서를 돌려준다 (리드 S4-2 7 승인)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), owns: vi.fn(), prepare: vi.fn(), create: vi.fn(),
  get: vi.fn(), list: vi.fn(), cancel: vi.fn(), moveFirst: vi.fn(), continue: vi.fn(), after: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/director/video-submit', () => ({ prepareDirectorVideoSubmission: mocks.prepare }))
vi.mock('@/lib/director/batch-store', () => ({
  createVideoBatch: mocks.create,
  getVideoBatchSummary: mocks.get,
  listVideoBatchSummaries: mocks.list,
  cancelVideoBatch: mocks.cancel,
  moveVideoBatchShotFirst: mocks.moveFirst,
}))
vi.mock('@/lib/director/batch-continue', () => ({ continueVideoBatch: mocks.continue }))
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(),
  after: mocks.after,
}))

import { PATCH } from '@/app/api/director/video-batches/route'

const projectId = '11111111-1111-4111-8111-111111111111'
const batchId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const moved: VideoBatchSummary = {
  id: batchId, projectId, status: 'running', total: 3, started: 1, failedToStart: 0, done: 0,
  failed: 0, pending: 2, active: 1, stopReason: null, jobs: [], pendingShotIds: ['shot-3', 'shot-2'],
}
const request = (body: Record<string, unknown> = { projectId, batchId, shotId: 'shot-3' }, cookie?: string) =>
  new Request('http://test/api/director/video-batches', {
    method: 'PATCH', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: userId })
  mocks.owns.mockResolvedValue(true)
  mocks.moveFirst.mockResolvedValue({ ok: true, batch: moved })
})

describe('같이 정한 것', () => {
  it('[먼저 하기]는 바꾼 뒤의 묶음 기록(아직 안 낸 샷의 낼 순서)을 돌려준다', async () => {
    // 왜: 화면이 "N번째"를 바로 다시 그린다 — 다음 조회를 기다리지 않는다.
    const response = await PATCH(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ batch: moved })
    expect(mocks.moveFirst).toHaveBeenCalledWith({ projectId, batchId, shotId: 'shot-3', userId })
  })
})

describe('혼자 정한 것', () => {
  it('로그인하지 않았으면 401, 내 프로젝트가 아니면 403 으로 거절하고 순서를 바꾸지 않는다', async () => {
    // 왜: 내 묶음만(리드) — 남의 프로젝트 묶음 순서를 바꾸지 못한다.
    mocks.getUser.mockResolvedValueOnce(null)
    expect((await PATCH(request())).status).toBe(401)
    mocks.owns.mockResolvedValueOnce(false)
    expect((await PATCH(request())).status).toBe(403)
    expect(mocks.moveFirst).not.toHaveBeenCalled()
  })

  it('데모 공유 상태에서는 순서를 바꾸지 않는다', async () => {
    // 왜: 다른 쓰기(POST · DELETE)와 같은 막이.
    expect((await PATCH(request({ projectId, batchId, shotId: 'shot-3' }, 'demo_share=preview'))).status).toBe(403)
    expect(mocks.moveFirst).not.toHaveBeenCalled()
  })

  it('잘못된 요청은 400, 없는 · 남이 만든 묶음은 404, 도는 중이 아니거나 이미 낸 샷은 409 로 알린다', async () => {
    // 왜: 화면이 까닭에 따라 단추를 거둔다(멈춘 묶음 · 이미 나간 샷).
    expect((await PATCH(request({ projectId, batchId }))).status).toBe(400)
    expect((await PATCH(request({ projectId: 'not-a-uuid', batchId, shotId: 'shot-3' }))).status).toBe(400)
    mocks.moveFirst.mockResolvedValueOnce({ ok: false, reason: 'not_found' })
    expect((await PATCH(request())).status).toBe(404)
    mocks.moveFirst.mockResolvedValueOnce({ ok: false, reason: 'not_running' })
    expect((await PATCH(request())).status).toBe(409)
    mocks.moveFirst.mockResolvedValueOnce({ ok: false, reason: 'not_pending' })
    expect((await PATCH(request())).status).toBe(409)
  })

  it('[먼저 하기]는 영상을 새로 내지 않는다 — 서버 이어가기를 깨우지 않고 Take 를 예약하지 않는다', async () => {
    // 왜: 순서만 바꾼다(리드). 다음 영상은 지금 도는 영상이 끝나 자리가 나면 서버가 낸다.
    await PATCH(request())
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.continue).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
