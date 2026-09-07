import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// 관리자 수동 빌링 라우트 (#payments-phase-2) — 비admin 거부, set_plan 이 plan 갱신 + grant_plan
//   적립 두 동작을 다 하는지, adjust 는 reason 필수임을 고정한다.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { GET, POST } from '@/app/api/admin/billing/route'

const WORKSPACE_ID = '11111111-2222-3333-4444-555555555555'

function query(result: unknown) {
  const value = {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  value.insert.mockReturnValue(value)
  value.update.mockReturnValue(value)
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.maybeSingle.mockResolvedValue(result)
  value.single.mockResolvedValue(result)
  return value
}

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/billing', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function getReq(qs: string) {
  return new NextRequest(`http://localhost/api/admin/billing${qs}`)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('admin billing route — 인증 게이트', () => {
  it('비인증은 401', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'adjust', delta: 5, reason: 'x' }))
    expect(res.status).toBe(401)
  })

  it('비admin 은 403', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'not-admin@x.test' } } })
    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'adjust', delta: 5, reason: 'x' }))
    expect(res.status).toBe(403)
  })

  it('GET 도 비admin 은 403', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'not-admin@x.test' } } })
    const res = await GET(getReq(`?workspaceId=${WORKSPACE_ID}`))
    expect(res.status).toBe(403)
  })
})

describe('admin billing route — set_plan', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@tale.studio' } } })
  })

  it('plan 갱신 + grant_plan 적립을 둘 다 수행한다', async () => {
    const updateCall = query({ error: null })
    const insertCall = query({ data: { id: 'grant-1' }, error: null })
    mocks.from.mockReturnValueOnce(updateCall).mockReturnValueOnce(insertCall)

    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'set_plan', plan: 'p10' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(updateCall.update).toHaveBeenCalledWith({ plan: 'p10' })
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        delta: 150, // p10 includedTakesPerMonth
        kind: 'grant_plan',
      }),
    )
    expect(json.grant).toEqual({ id: 'grant-1' })
  })

  it('free 로 전환하면 grant 를 적립하지 않는다', async () => {
    const updateCall = query({ error: null })
    mocks.from.mockReturnValueOnce(updateCall)

    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'set_plan', plan: 'free' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.grant).toBeNull()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
})

describe('admin billing route — adjust', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@tale.studio' } } })
  })

  it('reason 없으면 400', async () => {
    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'adjust', delta: -5 }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/reason/i)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('reason 있으면 manual_adjust 행을 삽입한다', async () => {
    const insertCall = query({ data: { id: 'adj-1' }, error: null })
    mocks.from.mockReturnValueOnce(insertCall)

    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'adjust', delta: -5, reason: '환불' }))
    expect(res.status).toBe(200)
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WORKSPACE_ID, delta: -5, kind: 'manual_adjust', reason: '환불' }),
    )
  })
})

describe('admin billing route — grant_takes', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@tale.studio' } } })
  })

  it('알 수 없는 kind 는 400', async () => {
    const res = await POST(
      postReq({ workspaceId: WORKSPACE_ID, action: 'grant_takes', amount: 10, kind: 'not_a_kind' }),
    )
    expect(res.status).toBe(400)
  })

  it('유효한 grant 는 200 + grant 행 삽입', async () => {
    const insertCall = query({ data: { id: 'grant-2' }, error: null })
    mocks.from.mockReturnValueOnce(insertCall)

    const res = await POST(
      postReq({ workspaceId: WORKSPACE_ID, action: 'grant_takes', amount: 50, kind: 'grant_bonus', reason: '이벤트' }),
    )
    expect(res.status).toBe(200)
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WORKSPACE_ID, delta: 50, kind: 'grant_bonus' }),
    )
  })
})

describe('admin billing route — GET', () => {
  it('plan/entitlements/takeBalance 를 반환한다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@tale.studio' } } })
    const workspaceLookup = query({ data: { plan: 'p10' }, error: null })
    const balanceLookup = query({ data: [{ delta: 100 }, { delta: -20 }], error: null })
    mocks.from.mockReturnValueOnce(workspaceLookup).mockReturnValueOnce(balanceLookup)

    const res = await GET(getReq(`?workspaceId=${WORKSPACE_ID}`))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.plan).toBe('p10')
    expect(json.takeBalance).toBe(80)
    expect(json.entitlements.includedTakesPerMonth).toBe(150)
  })
})
