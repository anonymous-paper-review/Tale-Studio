// 서버 오류를 운영 기록에 남기되, 기록이 실패해도 사용자의 요청을 막지 않는다 (#C, 2026-09-02 observability-audit)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 서버 500 무흔적 해소(#C, 2026-09-02 observability-audit) — onRequestError 가 nodejs 런타임에서만
//   server_errors 에 insert 하고, edge 는 스킵하며, insert 실패는 삼키는지 고정한다.
const mocks = vi.hoisted(() => ({ insert: vi.fn(), captureRequestError: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => ({ insert: mocks.insert }) },
}))
// Sentry 이중 송신(2026-09-02) — 수집은 best-effort라 목으로 무력화하고 호출 여부만 고정.
vi.mock('@sentry/nextjs', () => ({ captureRequestError: mocks.captureRequestError }))

import { onRequestError } from '@/instrumentation'

function ctx(runtime: 'nodejs' | 'edge' = 'nodejs') {
  return {
    routerKind: 'App Router' as const,
    routePath: '/api/writer/rough-storyboard',
    routeType: 'route' as const,
    runtime,
  }
}

function req() {
  return { path: '/api/writer/rough-storyboard', method: 'POST', headers: {} }
}

beforeEach(() => {
  mocks.insert.mockReset()
  mocks.insert.mockResolvedValue({ error: null })
})

describe('onRequestError', () => {
  it('서버에서 발생한 오류를 운영 기록에 남긴다', async () => {
    await onRequestError(new Error('boom'), req(), ctx('nodejs'))
    expect(mocks.insert).toHaveBeenCalledWith({
      path: '/api/writer/rough-storyboard',
      method: 'POST',
      message: 'boom',
      stack: expect.any(String),
    })
  })

  it('서버 밖에서 처리하는 경우 운영 기록을 남기지 않는다', async () => {
    await onRequestError(new Error('boom'), req(), ctx('edge'))
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('오류 설명과 발생 위치는 정해진 길이까지만 기록한다', async () => {
    const longMessage = 'x'.repeat(600)
    const err = new Error(longMessage)
    err.stack = 'y'.repeat(1500)
    await onRequestError(err, req(), ctx('nodejs'))
    const arg = mocks.insert.mock.calls[0][0] as { message: string; stack: string }
    expect(arg.message.length).toBe(500)
    expect(arg.stack.length).toBe(1000)
  })

  it('오류가 아닌 값도 글자로 바꿔 기록한다', async () => {
    await onRequestError('plain string error', req(), ctx('nodejs'))
    const arg = mocks.insert.mock.calls[0][0] as { message: string; stack: string | null }
    expect(arg.message).toBe('plain string error')
    expect(arg.stack).toBeNull()
  })

  it('오류 기록에 실패해도 실제 요청 처리는 막지 않는다', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'db down' } })
    await expect(onRequestError(new Error('boom'), req(), ctx('nodejs'))).resolves.toBeUndefined()
  })

  it('운영 기록 기능 자체에 문제가 생겨도 실제 요청 처리는 막지 않는다', async () => {
    mocks.insert.mockRejectedValue(new Error('unexpected'))
    await expect(onRequestError(new Error('boom'), req(), ctx('nodejs'))).resolves.toBeUndefined()
  })
})
