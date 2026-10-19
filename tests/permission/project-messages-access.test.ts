// 프로젝트 채팅 기록 API 는 그 프로젝트 주인만 읽고 남긴다 — 로그인만으로 남의 채팅을 읽거나 쓰던 구멍을 막는다 (2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({ access: vi.fn(), select: vi.fn(), insert: vi.fn() }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: 'someone-else' }) }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: (...args: unknown[]) => {
        mocks.select(...args)
        const q = { eq: () => q, order: () => q, limit: () => q, then: (resolve: (v: unknown) => unknown) => resolve({ data: [{ stage: 'producer', role: 'user', content: '안녕' }], error: null }) }
        return q
      },
      insert: async (row: unknown) => { mocks.insert(row); return { error: null } },
    }),
  },
}))

import { GET, POST } from '@/app/api/project/[id]/messages/route'

const params = { params: Promise.resolve({ id: 'p1' }) }
const denied = () => ({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.access.mockResolvedValue({ ok: true, projectId: 'p1', userId: 'owner', viaShare: false })
})

describe('프로젝트 채팅 기록 접근', () => {
  // 왜: 로그인한 다른 사람이 프로젝트 id 만 알면 그 채팅(이야기 · 산문 수정 요청)을 읽을 수 있었다.
  it('남의 프로젝트 채팅은 읽을 수 없다', async () => {
    mocks.access.mockResolvedValue(denied())

    const response = await GET(new Request('http://localhost/api/project/p1/messages'), params)

    expect(response.status).toBe(403)
    expect(mocks.select).not.toHaveBeenCalled()
  })

  // 왜: 남의 프로젝트에 가짜 채팅을 끼워 넣을 수 있었다(다음 응답 맥락이 오염된다).
  it('남의 프로젝트에 채팅을 남길 수 없다', async () => {
    mocks.access.mockResolvedValue(denied())

    const response = await POST(new Request('http://localhost/api/project/p1/messages', { method: 'POST', body: JSON.stringify({ stage: 'producer', role: 'user', content: '끼워 넣기' }) }), params)

    expect(response.status).toBe(403)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  // 왜: 정상 경로 고정 — 주인은 채팅을 그대로 읽고 남긴다. 남기기는 공유 링크로 열람하는 사람에게 열지 않는다.
  it('내 프로젝트 채팅은 그대로 읽고 남긴다', async () => {
    const read = await GET(new Request('http://localhost/api/project/p1/messages'), params)
    expect(read.status).toBe(200)
    expect((await read.json()).messages).toEqual([{ stage: 'producer', role: 'user', content: '안녕' }])

    const write = await POST(new Request('http://localhost/api/project/p1/messages', { method: 'POST', body: JSON.stringify({ stage: 'producer', role: 'user', content: '안녕' }) }), params)
    expect(write.status).toBe(200)
    expect(mocks.insert).toHaveBeenCalledWith({ project_id: 'p1', stage: 'producer', role: 'user', content: '안녕' })
    expect(mocks.access.mock.calls[0][2]).toEqual({ allowShare: true })
    expect(mocks.access.mock.calls[1][2]).toBeUndefined()
  })
})
