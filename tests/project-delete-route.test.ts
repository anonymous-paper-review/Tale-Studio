import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// DELETE /api/project/[id] — delete_project_deep RPC 계약 (#project-lifecycle-rpc 2026-09-01)
//   삭제 전체(소유권 확인 + 자식 14테이블 + 본체)가 DB 함수 한 번으로 옮겨갔다.
//   라우트에 남은 책임은 인증과 상태→HTTP 매핑뿐이므로 그 경계를 고정한다.

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}))

import { DELETE } from '@/app/api/project/[id]/route'

const PROJECT_ID = '11111111-2222-3333-4444-555555555555'

function call() {
  return DELETE(
    new NextRequest(`http://localhost/api/project/${PROJECT_ID}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ id: PROJECT_ID }) },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } })
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mocks.rpc.mockResolvedValue({ data: 'ok', error: null })
})

describe('DELETE /api/project/[id] — delete_project_deep contract', () => {
  it('rejects unauthenticated callers before touching the database', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    const response = await call()

    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('deletes through the single RPC with the caller identity', async () => {
    const response = await call()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('delete_project_deep', {
      p_project_id: PROJECT_ID,
      p_user_id: 'user-1',
    })
  })

  it('maps not_found to 404', async () => {
    mocks.rpc.mockResolvedValue({ data: 'not_found', error: null })

    const response = await call()

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' })
  })

  it('maps forbidden to 403', async () => {
    mocks.rpc.mockResolvedValue({ data: 'forbidden', error: null })

    const response = await call()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('surfaces RPC errors as 500 without claiming success', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection lost' },
    })

    const response = await call()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'connection lost' })
  })

  it('fails closed on an unexpected RPC status', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const response = await call()

    expect(response.status).toBe(500)
  })
})
