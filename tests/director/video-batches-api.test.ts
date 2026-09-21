// 일괄 요청은 로그인한 주인의 처음 입력만 저장하고, 중단과 복귀도 서버 기록으로 처리한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), owns: vi.fn(), prepare: vi.fn(), create: vi.fn(),
  get: vi.fn(), list: vi.fn(), cancel: vi.fn(), continue: vi.fn(), after: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/director/video-submit', () => ({ prepareDirectorVideoSubmission: mocks.prepare }))
vi.mock('@/lib/director/batch-store', () => ({
  createVideoBatch: mocks.create,
  getVideoBatchSummary: mocks.get,
  listVideoBatchSummaries: mocks.list,
  cancelVideoBatch: mocks.cancel,
}))
vi.mock('@/lib/director/batch-continue', () => ({ continueVideoBatch: mocks.continue }))
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(),
  after: mocks.after,
}))

import { DELETE, GET, POST } from '@/app/api/director/video-batches/route'

const projectId = '11111111-1111-4111-8111-111111111111'
const batchId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const batch: VideoBatchSummary = {
  id: batchId, projectId, status: 'running', total: 2, started: 0, failedToStart: 0, done: 0,
  failed: 0, pending: 2, active: 0, stopReason: null, jobs: [],
}

function request(items: Array<{ shotId: string; request: Record<string, unknown> }> = [
  { shotId: 'shot-2', request: { prompt: 'Second shot' } },
  { shotId: 'shot-1', request: { prompt: 'First shot' } },
]) {
  return new Request('http://test/api/director/video-batches', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ batchId, projectId, items }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: userId })
  mocks.owns.mockResolvedValue(true)
  mocks.get.mockResolvedValue(null)
  mocks.create.mockResolvedValue(batch)
  mocks.list.mockResolvedValue([batch])
  mocks.cancel.mockResolvedValue({ ...batch, status: 'cancelled' })
  mocks.continue.mockResolvedValue({ submitted: 1 })
  mocks.prepare.mockImplementation(async (req: Request, ownerId: string) => ({
    ownerId, inputSnapshot: await req.json(),
  }))
})

describe('일괄 요청의 주인과 처음 입력', () => {
  it('데모 공유 상태에서는 자료 변경을 막는다', async () => {
    const start = request()
    start.headers.set('cookie', 'demo_share=preview')
    const stop = new Request(
      `http://test/api/director/video-batches?projectId=${projectId}&batchId=${batchId}`,
      { method: 'DELETE', headers: { cookie: 'demo_share=preview' } },
    )
    expect((await POST(start)).status).toBe(403)
    expect((await DELETE(stop)).status).toBe(403)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('처음 선택한 순서와 입력을 저장한 뒤 서버 이어가기를 깨운다', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    const saved = mocks.create.mock.calls[0][0]
    expect(saved).toMatchObject({ id: batchId, projectId, userId })
    expect(saved.items.map((item: { shot_id: string }) => item.shot_id)).toEqual(['shot-2', 'shot-1'])
    expect(saved.items[0].prepared.inputSnapshot.prompt).toBe('Second shot')
    expect(saved.items[0].prepared.inputSnapshot.idempotencyKey).toBe(saved.items[0].id)
    expect(mocks.continue).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.continue).toHaveBeenCalledWith({ batchId, projectId })
  })

  it('다른 주인이나 준비된 입력을 요청 본문에 넣어도 신뢰하지 않는다', async () => {
    const payload = request([{
      shotId: 'shot-1',
      request: {
        prompt: 'Chosen input', projectId: 'foreign-project', userId: 'foreign-user',
        onBehalfOfUserId: 'foreign-user', prepared: { model: 'forged' },
        idempotencyKey: 'forged-key', videoClipId: 'foreign-clip',
        recoveryReceipt: 'forged-receipt',
      },
    }])
    await POST(payload)
    expect(mocks.prepare.mock.calls[0][1]).toBe(userId)
    const saved = mocks.create.mock.calls[0][0].items[0].prepared.inputSnapshot
    expect(saved.projectId).toBe(projectId)
    expect(saved.writerShotId).toBe('shot-1')
    expect(saved.userId).toBeUndefined()
    expect(saved.onBehalfOfUserId).toBeUndefined()
    expect(saved.prepared).toBeUndefined()
    expect(saved.videoClipId).toBeUndefined()
    expect(saved.recoveryReceipt).toBeUndefined()
    expect(saved.idempotencyKey).not.toBe('forged-key')
  })

  it('같은 요청을 다시 보내도 이미 저장한 입력을 바꾸지 않는다', async () => {
    mocks.get.mockResolvedValue(batch)
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ batch })
  })

  it('쓸 그림이 없는 샷은 이유를 알리고 나머지 샷을 요청한다', async () => {
    mocks.prepare.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'missing_storyboard', error: 'Storyboard not ready',
    }), { status: 409 }))
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.create.mock.calls[0][0].items).toHaveLength(1)
    await expect(response.json()).resolves.toMatchObject({
      skipped: [{ shotId: 'shot-2', reason: 'missing_storyboard' }],
    })
  })

  it('로그인하지 않았거나 다른 사람의 프로젝트면 기록과 제출을 막는다', async () => {
    mocks.getUser.mockResolvedValueOnce(null)
    expect((await POST(request())).status).toBe(401)
    mocks.owns.mockResolvedValue(false)
    expect((await POST(request())).status).toBe(403)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })
})

describe('서버에 남기는 중단과 복귀', () => {
  it('입력을 준비하는 중에도 중단을 서버에 남긴다', async () => {
    const response = await DELETE(new Request(
      `http://test/api/director/video-batches?projectId=${projectId}&batchId=${batchId}`,
      { method: 'DELETE' },
    ))
    expect(response.status).toBe(200)
    expect(mocks.cancel).toHaveBeenCalledWith(batchId, projectId, userId)
    expect(mocks.after).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ batch: { status: 'cancelled' } })
  })

  it('복귀하면 서버에 남은 진행 기록을 읽고 새 영상은 제출하지 않는다', async () => {
    const response = await GET(new Request(
      `http://test/api/director/video-batches?projectId=${projectId}`,
    ))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ batches: [batch] })
    expect(mocks.list).toHaveBeenCalledWith(projectId)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })
})
