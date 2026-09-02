import { beforeEach, describe, expect, it, vi } from 'vitest'

// 서버 500 무흔적 해소(#C, 2026-09-02 observability-audit) — onRequestError 가 nodejs 런타임에서만
//   server_errors 에 insert 하고, edge 는 스킵하며, insert 실패는 삼키는지 고정한다.
const mocks = vi.hoisted(() => ({ insert: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => ({ insert: mocks.insert }) },
}))

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
  it('nodejs 런타임에서 server_errors 에 insert 한다', async () => {
    await onRequestError(new Error('boom'), req(), ctx('nodejs'))
    expect(mocks.insert).toHaveBeenCalledWith({
      path: '/api/writer/rough-storyboard',
      method: 'POST',
      message: 'boom',
      stack: expect.any(String),
    })
  })

  it('edge 런타임은 insert 를 스킵한다', async () => {
    await onRequestError(new Error('boom'), req(), ctx('edge'))
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('message/stack 을 각각 500/1000자로 절단한다', async () => {
    const longMessage = 'x'.repeat(600)
    const err = new Error(longMessage)
    err.stack = 'y'.repeat(1500)
    await onRequestError(err, req(), ctx('nodejs'))
    const arg = mocks.insert.mock.calls[0][0] as { message: string; stack: string }
    expect(arg.message.length).toBe(500)
    expect(arg.stack.length).toBe(1000)
  })

  it('Error 가 아닌 값도 문자열화해 기록한다', async () => {
    await onRequestError('plain string error', req(), ctx('nodejs'))
    const arg = mocks.insert.mock.calls[0][0] as { message: string; stack: string | null }
    expect(arg.message).toBe('plain string error')
    expect(arg.stack).toBeNull()
  })

  it('insert 실패는 삼킨다(진단이 제품을 막지 않는다)', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'db down' } })
    await expect(onRequestError(new Error('boom'), req(), ctx('nodejs'))).resolves.toBeUndefined()
  })

  it('supabaseAdmin import 자체가 던져도 삼킨다', async () => {
    mocks.insert.mockRejectedValue(new Error('unexpected'))
    await expect(onRequestError(new Error('boom'), req(), ctx('nodejs'))).resolves.toBeUndefined()
  })
})
