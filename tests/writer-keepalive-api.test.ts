// /api/writer/keepalive — 브라우저 전용 자가복구 창구 계약 테스트.
//   /api/writer/step 은 서버-투-서버 시크릿 게이트라 브라우저가 직접 못 부른다(#writer-keepalive-401 사고).
//   이 라우트는 로그인 세션으로 신원을 확인한 뒤에만 triggerWriterStep 을 대신 호출해야 한다.
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  triggerWriterStep: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ triggerWriterStep: mocks.triggerWriterStep }))

import { POST } from '@/app/api/writer/keepalive/route'

function request(body: Record<string, unknown> = { projectId: 'project-1' }) {
  return new NextRequest('http://localhost/api/writer/keepalive', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.triggerWriterStep.mockResolvedValue(undefined)
})

describe('writer keepalive route', () => {
  it('rejects an unauthenticated caller and never triggers a step', async () => {
    mocks.requireProjectAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(mocks.triggerWriterStep).not.toHaveBeenCalled()
  })

  it("rejects a caller who does not own the project and never triggers a step", async () => {
    mocks.requireProjectAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(mocks.triggerWriterStep).not.toHaveBeenCalled()
  })

  it('triggers the writer step for the owning project', async () => {
    mocks.requireProjectAccess.mockResolvedValue({
      ok: true,
      projectId: 'project-1',
      userId: 'user-1',
      viaShare: false,
    })

    const response = await POST(request({ projectId: 'project-1' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.triggerWriterStep).toHaveBeenCalledWith('http://localhost', 'project-1')
  })

  it('rejects a missing projectId with 400 without triggering a step', async () => {
    mocks.requireProjectAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'projectId required' }, { status: 400 }),
    })

    const response = await POST(request({}))

    expect(response.status).toBe(400)
    expect(mocks.triggerWriterStep).not.toHaveBeenCalled()
  })
})
