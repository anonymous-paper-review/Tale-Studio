// 로그인한 사용자의 프로젝트 삭제 결과를 알기 쉬운 말로 정확히 알려준다
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

describe('프로젝트 삭제 요청의 결과를 사용자에게 정확히 알린다', () => {
  it('로그인하지 않은 사람이 삭제하면 프로젝트를 지우지 않고 거절한다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    const response = await call()

    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('로그인한 사용자가 삭제하면 해당 프로젝트를 지우고 성공을 알린다', async () => {
    const response = await call()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('delete_project_deep', {
      p_project_id: PROJECT_ID,
      p_user_id: 'user-1',
    })
  })

  it('없는 프로젝트를 삭제하려 하면 찾을 수 없다고 알린다', async () => {
    mocks.rpc.mockResolvedValue({ data: 'not_found', error: null })

    const response = await call()

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' })
  })

  it('권한 없는 프로젝트를 삭제하려 하면 권한 부족이라고 알린다', async () => {
    mocks.rpc.mockResolvedValue({ data: 'forbidden', error: null })

    const response = await call()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('서버에서 삭제하지 못하면 성공으로 알리지 않고 오류를 알린다', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection lost' },
    })

    const response = await call()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'connection lost' })
  })

  it('예상하지 못한 삭제 결과가 오면 성공으로 처리하지 않는다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const response = await call()

    expect(response.status).toBe(500)
  })
})
